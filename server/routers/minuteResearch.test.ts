import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../_core/context";

const { getPublicMinuteResearchDashboard } = vi.hoisted(() => ({
  getPublicMinuteResearchDashboard: vi.fn().mockResolvedValue({ program: null, sweeps: [], promoted: [], cumulative: [], commonRuleTypes: [], distribution: null, failureReasons: [], regimePerformance: [], symbolPerformance: [], dataCoverage: null }),
}));

vi.mock("../quant/minuteResearch", () => ({
  DEFAULT_MINUTE_RESEARCH_CONFIGURATION: { combinationsPerSweep: 100, maxUniverseSymbols: 4, lookbackTradingDays: 5, validationTradingDays: 2, minimumTrades: 1, minimumValidationTrades: 1, maxDrawdownPercent: -10, stopLossPercent: 1, takeProfitPercent: 2, maxHoldingBars: 10, feeRate: 0.0003, slippageBps: 8, explorationMode: "survivor_core" },
  getMinuteResearchDashboard: vi.fn(),
  getPublicMinuteResearchDashboard,
  enqueueMinuteResearchSweep: vi.fn(),
  runMinuteResearchSweep: vi.fn(),
}));

import { appRouter } from "../routers";

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("minuteResearch.publicDashboard", () => {
  it("공개 대시보드의 빈 분석 구조를 시간 제한 없이 반환한다", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.minuteResearch.publicDashboard();

    expect(Array.isArray(result.sweeps)).toBe(true);
    expect(Array.isArray(result.promoted)).toBe(true);
    expect(Array.isArray(result.cumulative)).toBe(true);
    expect(Array.isArray(result.failureReasons)).toBe(true);
    expect(Array.isArray(result.regimePerformance)).toBe(true);
    expect(result).toHaveProperty("distribution");
    expect(result).toHaveProperty("dataCoverage");
    expect(getPublicMinuteResearchDashboard).toHaveBeenCalledTimes(1);
  });
});
