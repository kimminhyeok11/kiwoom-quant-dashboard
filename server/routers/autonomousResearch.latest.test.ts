import { describe, expect, it, vi } from "vitest";
import { autonomousResearchCandidates, autonomousResearchObservations, autonomousResearchRuns, autonomousResearchTasks } from "../../drizzle/schema";

const { getDb } = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("../db", () => ({ getDb }));
vi.mock("../quant/publicHistoricalBacktest", () => ({ publicHistoricalBacktest: { run: vi.fn(), reuseStoredDataset: vi.fn() } }));

import { autonomousResearchRouter } from "./autonomousResearch";

function readyRun(id: number, runKey: string) {
  return { id, runKey, tradingDate: "2026-08-14", policyVersion: "autonomous-v1", phase: "completed", dataStatus: "ready", summaryJson: {}, universeJson: [], updatedAt: new Date(), lastObservedAt: null, lastError: null } as any;
}

describe("autonomousResearch.latest", () => {
  it("최근 자동 실행 목록에 과거 실행이 없더라도 별도 조회한 완료 과거 백테스트를 반환한다", async () => {
    const intradayRun = readyRun(1, "autonomous-v1:2026-08-15");
    const historicalRun = readyRun(22, "autonomous-v1:2026-08-14:historical");
    const candidate = { id: 101, runId: intradayRun.id, fingerprint: "a".repeat(64), rootGenomeJson: { id: "g1" }, minimumScore: 80, generationNumber: 0, status: "survived", inSampleMetricsJson: { metrics: { totalReturn: 10 } }, outOfSampleMetricsJson: { metrics: { totalReturn: 5 } }, walkForwardMetricsJson: { metrics: { totalReturn: 3 } }, simulationJson: { entries: Array.from({ length: 100 }, (_, index) => ({ index })) }, fitnessScore: "12.0", createdAt: new Date(), evaluatedAt: new Date(), updatedAt: new Date() } as any;
    const db = {
      select: () => {
        const state: { table?: unknown; filtered: boolean } = { filtered: false };
        const query = {
          from(table: unknown) { state.table = table; return query; },
          where() { state.filtered = true; return query; },
          orderBy() { return query; },
          limit: async () => {
            if (state.table === autonomousResearchRuns) return state.filtered ? [historicalRun] : [intradayRun];
            if (state.table === autonomousResearchTasks || state.table === autonomousResearchObservations) return [];
            if (state.table === autonomousResearchCandidates) return [candidate];
            return [];
          },
        };
        return query;
      },
    };
    getDb.mockResolvedValue(db);
    const caller = autonomousResearchRouter.createCaller({ user: null, req: {} as any, res: {} as any });

    const result = await caller.latest();

    expect(result.run?.id).toBe(intradayRun.id);
    expect(result.historical.run?.id).toBe(historicalRun.id);
    expect(result.candidates[0]).toMatchObject({ id: candidate.id, fingerprint: candidate.fingerprint, rootGenomeJson: candidate.rootGenomeJson });
    expect(result.candidates[0]).toHaveProperty("simulationJson", null);
    expect(result.historical.candidates[0]).toHaveProperty("simulationJson", null);

    const detailed = await caller.latest({ includeSimulation: true });
    expect(detailed.candidates[0]).toHaveProperty("simulationJson", candidate.simulationJson);
  });
});
