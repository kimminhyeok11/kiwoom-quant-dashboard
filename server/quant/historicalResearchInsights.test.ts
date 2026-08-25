import { describe, expect, it } from "vitest";
import { buildHistoricalResearchInsights, OFFLINE_EXIT_POLICIES } from "./historicalResearchInsights";

const bars = Array.from({ length: 85 }, (_, index) => ({ date: `2026${String(Math.floor(index / 20) + 1).padStart(2, "0")}${String(index % 20 + 1).padStart(2, "0")}`, open: 100 + index, high: 103 + index, low: 98 + index, close: 101 + index, volume: 1000 + index * 10, turnover: 1_000_000_000 + index }));
const rsiRule = (id: string) => ({ id, type: "rsi" as const, enabled: true, weight: 10, config: { period: 2, threshold: 0, comparator: "이상" } });

describe("buildHistoricalResearchInsights", () => {
  it("상위 후보의 공통 규칙과 저장 일봉만 사용한 청산 규칙 비교를 계산한다", () => {
    const result = buildHistoricalResearchInsights({ candidates: [
      { id: 1, rootGenomeJson: { id: "root-1", logic: "AND", enabled: true, children: [rsiRule("r1")] }, minimumScore: 1, fitnessScore: "10" },
      { id: 2, rootGenomeJson: { id: "root-2", logic: "AND", enabled: true, children: [rsiRule("r2")] }, minimumScore: 1, fitnessScore: "9" },
    ], barsBySymbol: { "000001": bars }, feeRate: 0.00015, entryDelayDays: 1 });

    expect(result.candidateCount).toBe(2);
    expect(result.commonRules).toContainEqual(expect.objectContaining({ type: "rsi", candidateCount: 2, candidateRate: 100 }));
    expect(result.exitPolicies).toHaveLength(OFFLINE_EXIT_POLICIES.length);
    expect(result.exitPolicies.every(policy => policy.metrics.tradeCount > 0)).toBe(true);
    expect(result.exitPolicies.every(policy => policy.regimeMetrics.length === 3)).toBe(true);
    expect(result.exitPolicies[0]?.metrics).toEqual(expect.objectContaining({ profitFactor: expect.any(Number), expectancy: expect.any(Number), averageHoldingDays: expect.any(Number) }));
    expect(result.researchQuality.checklist.map(item => item.id)).toEqual(expect.arrayContaining(["oos", "walk_forward", "survivorship", "execution"]));
    expect(result.methodology.regimeDefinition).toContain("20거래일");
    expect(result.methodology.offline).toBe(true);
  });
});
