import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../_core/context";

vi.mock("../db", () => ({ getDb: vi.fn() }));

import { getDb } from "../db";
import { appRouter } from "../routers";

function query<T>(data: T) {
  const chain = { from: () => chain, where: () => chain, orderBy: () => chain, limit: async () => data };
  return chain;
}

function publicContext(): TrpcContext {
  return { user: null, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
}

describe("minuteResearch.publicDashboard 저장 연구 성공 응답", () => {
  it("저장된 1분봉 스윕·통과 조건식·종목 증거를 실제 tRPC 공개 조회로 반환한다", async () => {
    const program = { id: 7, userId: 1, name: "fixture", status: "active", cronExpression: "0 30 7 * * 1-5", scheduleCronTaskUid: "task", configurationJson: {}, lastSweepId: 11, lastError: null, createdAt: new Date(), updatedAt: new Date() };
    const sweep = { id: 11, programId: 7, runKey: "fixture", tradingDatesJson: ["2026-08-18"], datasetFingerprint: "f", configurationJson: {}, status: "completed", generatedCount: 2, evaluatedCount: 2, promotedCount: 1, rejectedCount: 1, summaryJson: {}, lastError: null, startedAt: new Date(), completedAt: new Date(), createdAt: new Date(), updatedAt: new Date() };
    const promoted = { id: 31, sweepId: 11, strategyFingerprint: "strategy-a", fingerprint: "candidate-a", rootGenomeJson: { logic: "AND", children: [] }, minimumScore: 70, status: "promoted", fitnessScore: "15.2", tradeCount: 32, winRate: "62", netReturnPercent: "3.1", expectancyPercent: "0.18", maxDrawdownPercent: "-1.5", validationTradeCount: 12, validationReturnPercent: "1.2", validationExpectancyPercent: "0.1", validationMaxDrawdownPercent: "-0.8", inSampleMetricsJson: {}, outOfSampleMetricsJson: {}, qualificationJson: { reasons: [] }, createdAt: new Date() };
    const rejected = { ...promoted, id: 32, fingerprint: "candidate-b", status: "rejected", validationReturnPercent: "-0.5", qualificationJson: { reasons: ["독립 검증 기대값이 0 이하입니다."] } };
    const symbolMetric = { id: 71, sweepId: 11, candidateId: 31, tradingDate: "2026-08-18", symbol: "005930", regime: "trend_up", tradeCount: 4, winRate: "75", netReturnPercent: "1.4", expectancyPercent: "0.35", maxDrawdownPercent: "-0.3", metricsJson: {}, createdAt: new Date() };
    const selectRows = [[program], [program], [sweep], [promoted, rejected], [promoted, rejected], [symbolMetric]];
    const db = { select: vi.fn(() => query(selectRows.shift() ?? [])), selectDistinct: vi.fn(() => query([{ tradingDate: "2026-08-18" }])) };
    vi.mocked(getDb).mockResolvedValue(db as never);

    const result = await appRouter.createCaller(publicContext()).minuteResearch.publicDashboard();

    expect(result.distribution?.candidateCount).toBe(2);
    expect(result.cumulative).toEqual([expect.objectContaining({ strategyFingerprint: "strategy-a" })]);
    expect(result.symbolPerformance).toEqual([expect.objectContaining({ symbol: "005930", tradeCount: 4 })]);
    expect(result.failureReasons).toEqual([{ reason: "독립 검증 기대값이 0 이하입니다.", count: 1 }]);
  });
});
