import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ selectResults: [] as any[], inserts: [] as any[] }));

vi.mock("./db", () => ({
  getDb: vi.fn(async () => ({
    select: () => {
      const result = state.selectResults.shift() ?? [];
      const query = { limit: async () => result, then: (resolve: (value: any) => any, reject?: (reason: any) => any) => Promise.resolve(result).then(resolve, reject) };
      return { from: () => ({ where: () => ({ orderBy: () => query, ...query }) }) };
    },
    insert: () => ({ values: (values: any) => { state.inserts.push(values); return { $returningId: async () => [{ id: 77 }] }; } }),
  })),
}));

import { backtestsRouter } from "./routers/backtests";

const bars = Array.from({ length: 80 }, (_, index) => ({
  date: `2026${String(index + 1).padStart(4, "0")}`,
  open: 100 + index,
  high: 110 + index,
  low: 95 + index,
  close: 105 + index,
  volume: 1_000 + index,
  turnover: 100_000_000,
}));
const storedPreset = { id: 12, userId: 1, name: "백테스트 전략", rulesJson: [{ id: "high", type: "high_return", enabled: true, weight: 100, config: { days: 11, minPercent: 5, comparator: "이상", unit: "%" } }] };
const caller = () => backtestsRouter.createCaller({ user: { id: 1, openId: "operator", role: "admin" } as any, req: {} as any, res: {} as any });

describe("backtests 라우터 저장 실행", () => {
  beforeEach(() => { state.selectResults = []; state.inserts = []; });

  it("운영자 소유 프리셋을 로드해 실제 일봉 결과와 지표를 저장한다", async () => {
    state.selectResults = [[storedPreset]];
    const response = await caller().run({ presetId: 12, bars, initialCapital: 10_000_000, minScore: 70, holdingDays: 5, feeRate: 0.00015 });

    expect(response.id).toBe(77);
    expect(response.result).toEqual(expect.objectContaining({ tradeCount: expect.any(Number), totalReturn: expect.any(Number), winRate: expect.any(Number), maxDrawdown: expect.any(Number) }));
    expect(state.inserts).toEqual([expect.objectContaining({ userId: 1, presetId: 12, status: "completed", startDate: bars[0].date, endDate: bars.at(-1)?.date, initialCapital: 10_000_000, resultsJson: response.result })]);
  });

  it("소유 프리셋을 찾지 못하면 결과를 저장하지 않고 NOT_FOUND를 반환한다", async () => {
    state.selectResults = [[]];
    await expect(caller().run({ presetId: 12, bars, initialCapital: 10_000_000, minScore: 70, holdingDays: 5, feeRate: 0 })).rejects.toMatchObject({ code: "NOT_FOUND", message: "백테스트할 프리셋을 찾을 수 없습니다." });
    expect(state.inserts).toEqual([]);
  });

  it("저장된 규칙 형식이 유효하지 않으면 실행·결과 저장 전에 입력 검증 오류로 중단한다", async () => {
    state.selectResults = [[{ ...storedPreset, rulesJson: [{ id: "bad", type: "unsupported", enabled: true, weight: 10, config: {} }] }]];
    await expect(caller().run({ presetId: 12, bars, initialCapital: 10_000_000, minScore: 70, holdingDays: 5, feeRate: 0 })).rejects.toBeTruthy();
    expect(state.inserts).toEqual([]);
  });
});
