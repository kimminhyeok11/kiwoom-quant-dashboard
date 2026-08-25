import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  inserted: [] as unknown[],
  bars: Array.from({ length: 70 }, (_, index) => {
    const close = 10_000 + index * 25;
    return { date: `2026-03-${String((index % 28) + 1).padStart(2, "0")}`, open: close - 20, high: close + 50, low: close - 50, close, volume: 100_000, turnover: 55_000_000_000 };
  }),
}));

vi.mock("../db", () => ({
  getDb: vi.fn(async () => ({
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ id: 9, userId: 1, rulesJson: [{ id: "ma", type: "ma_position", enabled: true, weight: 50, config: { periods: "5,21,60" } }] }] }) }) }),
    insert: () => ({ values: (values: unknown) => { state.inserted.push(values); return { onDuplicateKeyUpdate: async () => undefined }; } }),
  })),
}));

vi.mock("./localSnapshotBars", () => ({
  getLatestLocalSnapshotBars: vi.fn(async () => ({ bars: state.bars, datasetId: 77, versionKey: "local-ka10081:2026-08-18:adjusted:fixture" })),
}));

vi.mock("./externalVerificationGate", () => ({
  isExternalResearchVerificationEnabled: () => false,
  externalVerificationPausedMessage: "외부 검증 보류",
}));

vi.mock("../kiwoom/client", () => ({
  KiwoomClient: class { getAccessToken = async () => { throw new Error("불변 스냅샷이 있으면 외부 호출을 해서는 안 됩니다."); }; },
}));

import { refreshLiveRanking } from "./liveRanking";

describe("불변 실제 일봉 스냅샷 랭킹 재사용", () => {
  it("외부 검증이 비활성이어도 최신 실제 스냅샷으로 저장형 랭킹을 갱신한다", async () => {
    state.inserted.length = 0;
    const result = await refreshLiveRanking({ userId: 1, presetId: 9, universe: [{ symbol: "005930", name: "삼성전자" }], maxPagesPerSymbol: 3, runKey: "snapshot-ranking-1" });

    expect(result).toMatchObject({ source: "ka10081_local_snapshot", snapshotDatasetIds: [77], collectedSymbols: ["005930"], failedSymbols: [] });
    expect(result.ranked).toHaveLength(1);
    expect(state.inserted).toHaveLength(1);
  });
});
