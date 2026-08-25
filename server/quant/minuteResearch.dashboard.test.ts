import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({ getDb: vi.fn() }));

import { getDb } from "../db";
import { getMinuteResearchDashboard } from "./minuteResearch";

const query = <T>(data: T) => {
  const chain = {
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: async () => data,
  };
  return chain;
};

describe("저장된 1분봉 연구 대시보드 성공 경로", () => {
  beforeEach(() => vi.clearAllMocks());

  it("저장된 스윕·통과 조건식·종목별 증거를 누적 성과와 시장 국면 분석으로 반환한다", async () => {
    const program = { id: 7, userId: 1, name: "fixture", status: "active", cronExpression: "0 30 7 * * 1-5", scheduleCronTaskUid: "task", configurationJson: {}, lastSweepId: 11, lastError: null, createdAt: new Date(), updatedAt: new Date() };
    const sweep = { id: 11, programId: 7, runKey: "fixture", tradingDatesJson: ["2026-08-18"], datasetFingerprint: "f", configurationJson: {}, status: "completed", generatedCount: 2, evaluatedCount: 2, promotedCount: 1, rejectedCount: 1, summaryJson: {}, lastError: null, startedAt: new Date(), completedAt: new Date(), createdAt: new Date(), updatedAt: new Date() };
    const promoted = { id: 31, sweepId: 11, strategyFingerprint: "strategy-a", fingerprint: "candidate-a", rootGenomeJson: { logic: "AND", children: [] }, minimumScore: 70, status: "promoted", fitnessScore: "15.2", tradeCount: 32, winRate: "62", netReturnPercent: "3.1", expectancyPercent: "0.18", maxDrawdownPercent: "-1.5", validationTradeCount: 12, validationReturnPercent: "1.2", validationExpectancyPercent: "0.1", validationMaxDrawdownPercent: "-0.8", inSampleMetricsJson: {}, outOfSampleMetricsJson: {}, qualificationJson: { reasons: [] }, createdAt: new Date() };
    const rejected = { ...promoted, id: 32, fingerprint: "candidate-b", status: "rejected", validationReturnPercent: "-0.5", qualificationJson: { reasons: ["독립 검증 기대값이 0 이하입니다."] } };
    const symbolMetric = { id: 71, sweepId: 11, candidateId: 31, tradingDate: "2026-08-18", symbol: "005930", regime: "trend_up", tradeCount: 4, winRate: "75", netReturnPercent: "1.4", expectancyPercent: "0.35", maxDrawdownPercent: "-0.3", metricsJson: {}, createdAt: new Date() };
    const selectRows = [[program], [sweep], [promoted, rejected], [promoted, rejected], [symbolMetric]];
    const db = {
      select: vi.fn(() => query(selectRows.shift() ?? [])),
      selectDistinct: vi.fn(() => query([{ tradingDate: "2026-08-18" }])),
    };
    vi.mocked(getDb).mockResolvedValue(db as never);

    const result = await getMinuteResearchDashboard(1);

    expect(result.distribution?.candidateCount).toBe(2);
    expect(result.failureReasons).toEqual([{ reason: "독립 검증 기대값이 0 이하입니다.", count: 1 }]);
    expect(result.regimePerformance.find(item => item.regime === "trend_up")).toMatchObject({ observationCount: 1, tradeCount: 4, averageReturnPercent: 1.4 });
    expect(result.symbolPerformance).toEqual([expect.objectContaining({ symbol: "005930", observationCount: 1, averageReturnPercent: 1.4 })]);
    expect(result.cumulative).toEqual([expect.objectContaining({ strategyFingerprint: "strategy-a", verifiedSweepCount: 1, totalValidationTrades: 12 })]);
  });
});
