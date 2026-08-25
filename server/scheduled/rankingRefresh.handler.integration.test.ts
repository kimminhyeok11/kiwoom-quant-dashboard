import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ profile: null as any, updates: [] as any[], refresh: vi.fn(), auth: vi.fn() }));

vi.mock("../db", () => ({
  getDb: vi.fn(async () => ({
    select: () => ({ from: () => ({ where: () => ({ limit: async () => state.profile ? [state.profile] : [] }) }) }),
    update: () => ({ set: (values: any) => { state.updates.push(values); return { where: async () => undefined }; } }),
  })),
}));
vi.mock("../_core/sdk", () => ({ sdk: { authenticateRequest: (...args: unknown[]) => state.auth(...args) } }));
vi.mock("../kiwoom/client", () => ({ KiwoomClient: class { getStatus() { return { fixedIpRegistered: true, hasCredentials: true }; } } }));
vi.mock("../quant/liveRanking", () => ({ refreshLiveRanking: (...args: unknown[]) => state.refresh(...args) }));

import { rankingRefreshHandler } from "./rankingRefresh";

function response() {
  const res: any = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
}

describe("예약 랭킹 갱신 핸들러", () => {
  beforeEach(() => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-08-12T00:15:30.000Z"));
    state.updates = []; state.refresh.mockReset(); state.auth.mockReset(); state.auth.mockResolvedValue({ isCron: true, taskUid: "task-ranking-1" });
  });

  it("동일 taskUid·runKey 재시도는 수집을 다시 실행하지 않는다", async () => {
    state.profile = { id: 1, userId: 1, presetId: 7, universeJson: [{ symbol: "005930" }], maxPagesPerSymbol: 3, lastRunKey: "task-ranking-1:2026-08-12T00:15", status: "ready" };
    const res = response();
    await rankingRefreshHandler({ originalUrl: "/api/scheduled/ranking-refresh" } as any, res);
    expect(state.refresh).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true, skipped: "already-completed" }));
  });

  it("수집 실패 시 error 상태와 오류 메시지를 저장하고 5xx로 반환한다", async () => {
    state.profile = { id: 1, userId: 1, presetId: 7, universeJson: [{ symbol: "005930" }], maxPagesPerSymbol: 3, lastRunKey: null, status: "idle" };
    state.refresh.mockRejectedValue(new Error("broker-unavailable"));
    const res = response();
    await rankingRefreshHandler({ originalUrl: "/api/scheduled/ranking-refresh" } as any, res);
    expect(state.updates).toContainEqual(expect.objectContaining({ status: "running" }));
    expect(state.updates).toContainEqual(expect.objectContaining({ status: "error", lastError: "broker-unavailable" }));
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
