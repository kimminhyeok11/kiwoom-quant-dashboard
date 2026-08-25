import { describe, expect, it, vi } from "vitest";

import { researchDailyBars, researchDatasets, strategyPresets } from "../../drizzle/schema";

const state = vi.hoisted(() => ({
  preset: {
    id: 21,
    userId: 1,
    name: "저장된 OR 비교 전략",
    rulesJson: [
      { id: "high", type: "high_return", enabled: true, weight: 30, config: { days: 11, minPercent: 20, comparator: "초과", unit: "%" } },
      { id: "turnover", type: "turnover", enabled: true, weight: 25, config: { days: 5, threshold: 50_000_000, comparator: "이상", unit: "원" } },
    ],
    scoringJson: {
      id: "root", logic: "OR", enabled: true, children: [
        { id: "high", type: "high_return", enabled: true, weight: 30, config: { days: 11, minPercent: 20, comparator: "초과", unit: "%" } },
        { id: "turnover", type: "turnover", enabled: true, weight: 25, config: { days: 5, threshold: 50_000_000, comparator: "이상", unit: "원" } },
      ],
    },
  },
  bars: Array.from({ length: 60 }, (_, index) => ({ date: `2026${String(index + 1).padStart(4, "0")}`, open: 100, high: 110, low: 100, close: 105, volume: 1_000, turnover: 100_000_000 })),
  useLocalSnapshot: false,
  dataset: { id: 77, versionKey: "local-ka10081:2026-08-18:adjusted:fixture", qualityStatus: "ready" },
}));

vi.mock("../db", () => ({
  getDb: vi.fn(async () => ({
    select: () => ({ from: (table: unknown) => ({ where: () => {
      const result = table === strategyPresets ? [state.preset] : table === researchDatasets ? (state.useLocalSnapshot ? [state.dataset] : []) : table === researchDailyBars ? (state.useLocalSnapshot ? state.bars : []) : [];
      return table === researchDatasets ? { orderBy: () => ({ limit: async () => result }), limit: async () => result } : { orderBy: async () => result, limit: async () => result };
    } }) }),
  })),
}));

vi.mock("../kiwoom/client", () => ({
  KiwoomClient: class {
    getAccessToken = async () => ({ token: "test-token" });
    getDailyBars = async () => state.bars;
    getStatus = () => ({ mayTransmitOrders: false });
  },
}));

import { quantRouter } from "../routers/quant";

describe("quant.evaluatePreset 저장 프리셋 재평가", () => {
  it("상세 조회에 저장된 OR 논리식과 초과·이상 비교 연산자를 실제 평가 결과에 적용한다", async () => {
    vi.stubEnv("AUTONOMOUS_RESEARCH_EXTERNAL_DATA_ENABLED", "true");
    try {
      const caller = quantRouter.createCaller({ user: { id: 1, openId: "operator", role: "admin" } as any, req: {} as any, res: {} as any });
      const response = await caller.evaluatePreset({ presetId: 21, symbol: "005930", maxPages: 3 });

      expect(response.preset).toMatchObject({ id: 21, rulesJson: state.preset.rulesJson, scoringJson: state.preset.scoringJson });
      expect(response.result).toMatchObject({ eligible: true, score: 25, evaluations: [{ ruleId: "high", matched: false, comparator: "초과" }, { ruleId: "turnover", matched: true, comparator: "이상" }] });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("저장된 프리셋의 비정상 unit도 서버 재평가에서 지표별 허용 단위로 정규화한다", async () => {
    vi.stubEnv("AUTONOMOUS_RESEARCH_EXTERNAL_DATA_ENABLED", "true");
    try {
      state.preset = {
        ...state.preset,
        rulesJson: [{ id: "high-unit", type: "high_return", enabled: true, weight: 30, config: { days: 11, minPercent: 5, unit: "원" } }],
        scoringJson: { id: "root", logic: "AND", enabled: true, children: [{ id: "high-unit", type: "high_return", enabled: true, weight: 30, config: { days: 11, minPercent: 5, unit: "원" } }] },
      };
      const caller = quantRouter.createCaller({ user: { id: 1, openId: "operator", role: "admin" } as any, req: {} as any, res: {} as any });
      const response = await caller.evaluatePreset({ presetId: 21, symbol: "005930", maxPages: 3 });

      expect(response.result).toMatchObject({ eligible: true, score: 30 });
      expect(response.result.evaluations[0]).toMatchObject({ ruleId: "high-unit", detail: expect.stringContaining("%") });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("최신 불변 실제 일봉 스냅샷이 있으면 외부 호출 없이 해당 원본으로 평가한다", async () => {
    state.useLocalSnapshot = true;
    vi.stubEnv("AUTONOMOUS_RESEARCH_EXTERNAL_DATA_ENABLED", "false");
    try {
      const caller = quantRouter.createCaller({ user: { id: 1, openId: "operator", role: "admin" } as any, req: {} as any, res: {} as any });
      const response = await caller.evaluatePreset({ presetId: 21, symbol: "005930", maxPages: 3 });

      expect(response).toMatchObject({ source: `ka10081_local_snapshot:${state.dataset.versionKey}`, datasetId: 77, datasetVersionKey: state.dataset.versionKey, barCount: 60 });
    } finally {
      state.useLocalSnapshot = false;
      vi.unstubAllEnvs();
    }
  });

  it("차트용 일봉 조회도 최신 불변 스냅샷을 우선 반환한다", async () => {
    state.useLocalSnapshot = true;
    vi.stubEnv("AUTONOMOUS_RESEARCH_EXTERNAL_DATA_ENABLED", "false");
    try {
      const caller = quantRouter.createCaller({ user: { id: 1, openId: "operator", role: "admin" } as any, req: {} as any, res: {} as any });
      const response = await caller.dailyBars({ symbol: "005930", maxPages: 3 });

      expect(response).toMatchObject({ symbol: "005930", source: `ka10081_local_snapshot:${state.dataset.versionKey}`, datasetId: 77, datasetVersionKey: state.dataset.versionKey });
      expect(response.bars).toHaveLength(60);
    } finally {
      state.useLocalSnapshot = false;
      vi.unstubAllEnvs();
    }
  });
});
