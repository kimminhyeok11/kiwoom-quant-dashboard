import { and, desc, eq, inArray, like, sql } from "drizzle-orm";
import { z } from "zod";
import { autoTradePolicies, autonomousResearchBars, autonomousResearchCandidates, autonomousResearchObservations, autonomousResearchRuns, autonomousResearchTasks, dayTradeExperimentPositions, dayTradeExperiments, intradayMinuteBars, localMinuteCollectionRequests, orderExecutions, orderIntents, tradingProfiles } from "../../drizzle/schema";
import type { ConditionExpressionGroup } from "../../shared/trading";
import { getDb } from "../db";
import { operatorProcedure, protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { publicHistoricalBacktest } from "../quant/publicHistoricalBacktest";
import { buildHistoricalResearchInsights } from "../quant/historicalResearchInsights";
import { evaluateAutonomousCandidate } from "../quant/autonomousPipeline";
import { AUTONOMOUS_RESEARCH_POLICY } from "../quant/autonomousResearch";
import { evaluateExpression } from "../quant/conditions";
import { getLatestResearchCommitteeReport, runResearchCommittee } from "../quant/researchCommittee";
import { getLatestResearchGovernanceCycle } from "../quant/researchGovernance";
import { getAutonomousOperationsStatus } from "../quant/autonomousOperations";
import { getDayTradeHistory, syncDayTradeExperimentForRun } from "../quant/dayTradeHistory";
import { getLatestMinuteValidationHistory } from "../quant/minuteValidationHistory";
import { getKrxSymbolName } from "../../shared/krxSymbolNames";

async function getLatestHistoricalRunId() {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select({ id: autonomousResearchRuns.id }).from(autonomousResearchRuns).where(and(eq(autonomousResearchRuns.dataStatus, "ready"), like(autonomousResearchRuns.runKey, "%:historical%"))).orderBy(desc(autonomousResearchRuns.updatedAt)).limit(1);
  return rows[0]?.id ?? null;
}

function toPublicCandidateSummary<T extends { simulationJson: unknown }>(candidate: T) {
  const { simulationJson: _simulationJson, ...summary } = candidate;
  return { ...summary, simulationJson: null };
}

export function auditState(run: typeof autonomousResearchRuns.$inferSelect, evidence: { dailyBarRows: number; candidateRows: number; completedTaskCount: number }) {
  const isVerified = run.phase === "completed" && run.dataStatus === "ready" && evidence.dailyBarRows > 0 && evidence.candidateRows > 0;
  if (isVerified) return { code: "verified_completed" as const, label: "실제 원본 검증 완료", detail: "저장된 원본 행과 조건식 결과가 모두 확인되었습니다." };
  if (run.phase === "failed" || run.dataStatus === "error" || run.dataStatus === "waiting" || run.phase === "waiting_for_data") return { code: "blocked" as const, label: "실행 불가 또는 대기", detail: run.lastError ?? "실제 원본 또는 인증 확인이 필요합니다." };
  const ageMs = Date.now() - run.updatedAt.getTime();
  if (ageMs > 10 * 60 * 1000) return { code: "stale" as const, label: "진행 주장 확인 불가", detail: "최근 갱신 기록이 없어 실제로 실행 중인지 확인할 수 없습니다." };
  if (evidence.completedTaskCount > 0 || evidence.dailyBarRows > 0 || evidence.candidateRows > 0) return { code: "active_evidence" as const, label: "실행 증거 수집 중", detail: "최근 작업 또는 원본·후보 기록이 갱신되고 있습니다." };
  return { code: "requested" as const, label: "실행 요청만 기록됨", detail: "원본 수집·조건식 평가 결과가 아직 기록되지 않았습니다." };
}

function auditSourceLabel(run: typeof autonomousResearchRuns.$inferSelect) {
  const summary = run.summaryJson as { source?: string; mode?: string } | null;
  if (summary?.source === "kiwoom_ka10081_local_snapshot" || summary?.mode === "historical_backtest_local_snapshot") return "지정 단말이 동기화한 키움 ka10081 일봉 스냅샷";
  if (summary?.source === "kiwoom_ka10081") return "배포 서버가 수집한 키움 ka10081 일봉";
  if (summary?.mode === "historical_backtest_reuse") return "기존 저장 일봉을 재사용한 연구 요청";
  return "원본 출처가 아직 확정되지 않았습니다.";
}

export function auditUniverse(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  const result: string[] = [];
  for (const item of value) {
    if (typeof item === "string" && item) result.push(item);
    if (item && typeof item === "object") {
      const record = item as { symbol?: unknown; name?: unknown };
      if (typeof record.symbol === "string" && record.symbol) result.push(typeof record.name === "string" && record.name ? `${record.symbol} · ${record.name}` : record.symbol);
    }
  }
  return result.slice(0, 24);
}

export const autonomousResearchRouter = router({
  latest: publicProcedure.input(z.object({ includeSimulation: z.boolean().optional() }).optional()).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return { run: null, tasks: [], observations: [], candidates: [], historical: { run: null, candidates: [] } };
    const [runs, historicalRows] = await Promise.all([
      db.select().from(autonomousResearchRuns).orderBy(desc(autonomousResearchRuns.updatedAt)).limit(24),
      db.select().from(autonomousResearchRuns).where(and(eq(autonomousResearchRuns.dataStatus, "ready"), like(autonomousResearchRuns.runKey, "%:historical%"))).orderBy(desc(autonomousResearchRuns.updatedAt)).limit(1),
    ]);
    const run = runs.find(item => !item.runKey.includes(":historical")) ?? null;
    const historicalRun = historicalRows[0] ?? null;
    if (!run) {
      const historicalCandidates = historicalRun ? await db.select().from(autonomousResearchCandidates).where(eq(autonomousResearchCandidates.runId, historicalRun.id)).orderBy(desc(autonomousResearchCandidates.fitnessScore)).limit(20) : [];
      return { run: null, tasks: [], observations: [], candidates: [], historical: { run: historicalRun, candidates: input?.includeSimulation ? historicalCandidates : historicalCandidates.map(toPublicCandidateSummary) } };
    }
    const [tasks, observations, candidates] = await Promise.all([
      db.select().from(autonomousResearchTasks).where(eq(autonomousResearchTasks.runId, run.id)).orderBy(desc(autonomousResearchTasks.startedAt)).limit(12),
      db.select().from(autonomousResearchObservations).where(eq(autonomousResearchObservations.runId, run.id)).orderBy(desc(autonomousResearchObservations.capturedAt)).limit(40),
      db.select().from(autonomousResearchCandidates).where(eq(autonomousResearchCandidates.runId, run.id)).orderBy(desc(autonomousResearchCandidates.fitnessScore), desc(autonomousResearchCandidates.updatedAt)).limit(20),
    ]);
    const historicalCandidates = historicalRun ? await db.select().from(autonomousResearchCandidates).where(eq(autonomousResearchCandidates.runId, historicalRun.id)).orderBy(desc(autonomousResearchCandidates.fitnessScore)).limit(20) : [];
    return { run, tasks, observations, candidates: input?.includeSimulation ? candidates : candidates.map(toPublicCandidateSummary), historical: { run: historicalRun, candidates: input?.includeSimulation ? historicalCandidates : historicalCandidates.map(toPublicCandidateSummary) } };
  }),

  auditTrail: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { generatedAt: new Date(), lastRequested: null, lastVerified: null, runs: [], minuteEvidence: null, readOnlyBoundary: "데이터 수집·조건식 연구만 표시하며 주문·계좌 조회·주문 전송은 이 경로에서 수행하지 않습니다." };
    const runs = await db.select().from(autonomousResearchRuns).orderBy(desc(autonomousResearchRuns.updatedAt)).limit(16);
    const runIds = runs.map(run => run.id);
    const [tasks, dailyEvidence, candidateEvidence, minuteRows] = await Promise.all([
      runIds.length ? db.select().from(autonomousResearchTasks).where(inArray(autonomousResearchTasks.runId, runIds)).orderBy(desc(autonomousResearchTasks.startedAt)).limit(80) : Promise.resolve([]),
      runIds.length ? db.select({ runId: autonomousResearchBars.runId, dailyBarRows: sql<number>`COUNT(*)`, dailySymbolCount: sql<number>`COUNT(DISTINCT ${autonomousResearchBars.symbol})`, firstDailyDate: sql<string | null>`MIN(${autonomousResearchBars.date})`, lastDailyDate: sql<string | null>`MAX(${autonomousResearchBars.date})`, lastDailyCapturedAt: sql<Date | null>`MAX(${autonomousResearchBars.capturedAt})` }).from(autonomousResearchBars).where(inArray(autonomousResearchBars.runId, runIds)).groupBy(autonomousResearchBars.runId) : Promise.resolve([]),
      runIds.length ? db.select({ runId: autonomousResearchCandidates.runId, candidateRows: sql<number>`COUNT(*)`, survivedRows: sql<number>`SUM(CASE WHEN ${autonomousResearchCandidates.status} = 'survived' THEN 1 ELSE 0 END)`, rejectedRows: sql<number>`SUM(CASE WHEN ${autonomousResearchCandidates.status} = 'rejected' THEN 1 ELSE 0 END)`, lastCandidateUpdatedAt: sql<Date | null>`MAX(${autonomousResearchCandidates.updatedAt})` }).from(autonomousResearchCandidates).where(inArray(autonomousResearchCandidates.runId, runIds)).groupBy(autonomousResearchCandidates.runId) : Promise.resolve([]),
      db.select({ minuteBarRows: sql<number>`COUNT(*)`, minuteTradingDateCount: sql<number>`COUNT(DISTINCT ${intradayMinuteBars.tradingDate})`, minuteSymbolCount: sql<number>`COUNT(DISTINCT ${intradayMinuteBars.symbol})`, firstMinuteAt: sql<Date | null>`MIN(${intradayMinuteBars.minuteAt})`, lastMinuteAt: sql<Date | null>`MAX(${intradayMinuteBars.minuteAt})`, lastMinuteCapturedAt: sql<Date | null>`MAX(${intradayMinuteBars.capturedAt})` }).from(intradayMinuteBars),
    ]);
    const dailyByRun = new Map(dailyEvidence.map(item => [item.runId, { dailyBarRows: Number(item.dailyBarRows), dailySymbolCount: Number(item.dailySymbolCount), firstDailyDate: item.firstDailyDate, lastDailyDate: item.lastDailyDate, lastDailyCapturedAt: item.lastDailyCapturedAt }]));
    const candidatesByRun = new Map(candidateEvidence.map(item => [item.runId, { candidateRows: Number(item.candidateRows), survivedRows: Number(item.survivedRows ?? 0), rejectedRows: Number(item.rejectedRows ?? 0), lastCandidateUpdatedAt: item.lastCandidateUpdatedAt }]));
    const tasksByRun = new Map<number, typeof tasks>();
    for (const task of tasks) tasksByRun.set(task.runId, [...(tasksByRun.get(task.runId) ?? []), task]);
    const auditRuns = runs.map(run => {
      const daily = dailyByRun.get(run.id) ?? { dailyBarRows: 0, dailySymbolCount: 0, firstDailyDate: null, lastDailyDate: null, lastDailyCapturedAt: null };
      const candidates = candidatesByRun.get(run.id) ?? { candidateRows: 0, survivedRows: 0, rejectedRows: 0, lastCandidateUpdatedAt: null };
      const runTasks = tasksByRun.get(run.id) ?? [];
      const completedTaskCount = runTasks.filter(task => task.status === "completed").length;
      const state = auditState(run, { dailyBarRows: daily.dailyBarRows, candidateRows: candidates.candidateRows, completedTaskCount });
      return { runId: run.id, runKey: run.runKey, tradingDate: run.tradingDate, phase: run.phase, dataStatus: run.dataStatus, policyVersion: run.policyVersion, startedAt: run.startedAt, updatedAt: run.updatedAt, completedAt: run.completedAt, lastObservedAt: run.lastObservedAt, lastError: run.lastError, sourceLabel: auditSourceLabel(run), universe: auditUniverse(run.universeJson), state, daily, candidates, tasks: runTasks.map(task => ({ id: task.id, phase: task.phase, status: task.status, startedAt: task.startedAt, completedAt: task.completedAt, lastError: task.lastError })), orderTransmission: "이 연구 실행 경로에서는 주문 API를 호출하지 않습니다." };
    });
    return { generatedAt: new Date(), lastRequested: auditRuns[0] ?? null, lastVerified: auditRuns.find(run => run.state.code === "verified_completed") ?? null, runs: auditRuns, minuteEvidence: { minuteBarRows: Number(minuteRows[0]?.minuteBarRows ?? 0), minuteTradingDateCount: Number(minuteRows[0]?.minuteTradingDateCount ?? 0), minuteSymbolCount: Number(minuteRows[0]?.minuteSymbolCount ?? 0), firstMinuteAt: minuteRows[0]?.firstMinuteAt ?? null, lastMinuteAt: minuteRows[0]?.lastMinuteAt ?? null, lastMinuteCapturedAt: minuteRows[0]?.lastMinuteCapturedAt ?? null, source: "kiwoom_ka10080" as const }, readOnlyBoundary: "데이터 수집·조건식 연구만 표시하며 주문·계좌 조회·주문 전송은 이 경로에서 수행하지 않습니다." };
  }),

  runHistoricalBacktest: operatorProcedure.mutation(async () => publicHistoricalBacktest.run()),

  reuseHistoricalDataset: operatorProcedure.mutation(async () => publicHistoricalBacktest.reuseStoredDataset()),

  historicalResearchInsights: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return null;
    const runs = await db.select().from(autonomousResearchRuns).orderBy(desc(autonomousResearchRuns.updatedAt)).limit(40);
    const run = runs.find(item => item.dataStatus === "ready" && item.runKey.includes(":historical"));
    if (!run) return null;
    const summary = run.summaryJson as { dataset?: { sourceRunId?: number }; assumptions?: { feeRate?: number; slippageBps?: number; informationCutoffTradingDays?: number } } | null;
    const sourceRunId = summary?.dataset?.sourceRunId ?? run.id;
    const [candidates, rows] = await Promise.all([
      db.select().from(autonomousResearchCandidates).where(eq(autonomousResearchCandidates.runId, run.id)).orderBy(desc(autonomousResearchCandidates.fitnessScore)).limit(20),
      db.select().from(autonomousResearchBars).where(eq(autonomousResearchBars.runId, sourceRunId)).orderBy(autonomousResearchBars.symbol, autonomousResearchBars.date),
    ]);
    const barsBySymbol = rows.reduce<Record<string, Array<{ date: string; open: number; high: number; low: number; close: number; volume: number; turnover: number }>>>((result, row) => {
      (result[row.symbol] ??= []).push({ date: row.date, open: Number(row.open), high: Number(row.high), low: Number(row.low), close: Number(row.close), volume: Number(row.volume), turnover: Number(row.turnover) });
      return result;
    }, {});
    const insights = buildHistoricalResearchInsights({
      candidates: candidates.filter(candidate => candidate.status === "survived"),
      barsBySymbol,
      feeRate: (summary?.assumptions?.feeRate ?? AUTONOMOUS_RESEARCH_POLICY.feeRate) + (summary?.assumptions?.slippageBps ?? AUTONOMOUS_RESEARCH_POLICY.slippageBps) / 10_000,
      entryDelayDays: summary?.assumptions?.informationCutoffTradingDays ?? AUTONOMOUS_RESEARCH_POLICY.informationCutoffTradingDays,
    });
    return { runId: run.id, sourceRunId, barCount: rows.length, ...insights };
  }),

  researchCommitteeReport: publicProcedure.query(async () => {
    const runId = await getLatestHistoricalRunId();
    if (!runId) return null;
    return getLatestResearchCommitteeReport(runId);
  }),

  runResearchCommittee: operatorProcedure.mutation(async () => {
    const runId = await getLatestHistoricalRunId();
    if (!runId) throw new Error("완료된 실제 일봉 과거 연구가 없어 위원회 검토를 실행할 수 없습니다.");
    return runResearchCommittee(runId);
  }),

  researchGovernanceCycle: publicProcedure.query(async () => getLatestResearchGovernanceCycle()),

  autonomousOperationsStatus: publicProcedure.query(async () => getAutonomousOperationsStatus()),

  dayTradeHistory: publicProcedure.query(async () => getDayTradeHistory()),

  minuteValidationHistory: publicProcedure.query(async () => getLatestMinuteValidationHistory()),

  minuteCollectionStatus: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return null;
    return (await db.select().from(localMinuteCollectionRequests).orderBy(desc(localMinuteCollectionRequests.updatedAt)).limit(1))[0] ?? null;
  }),

  minuteBackfillStatus: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return null;
    const year = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric" }).format(new Date());
    const [summary] = await db.select({
      symbolCount: sql<number>`COUNT(DISTINCT ${intradayMinuteBars.symbol})`,
      tradingDateCount: sql<number>`COUNT(DISTINCT ${intradayMinuteBars.tradingDate})`,
      barCount: sql<number>`COUNT(*)`,
      firstTradingDate: sql<string | null>`MIN(${intradayMinuteBars.tradingDate})`,
      lastTradingDate: sql<string | null>`MAX(${intradayMinuteBars.tradingDate})`,
      lastCapturedAt: sql<Date | null>`MAX(${intradayMinuteBars.capturedAt})`,
    }).from(intradayMinuteBars).where(sql`${intradayMinuteBars.tradingDate} LIKE ${`${year}-%`}`);
    return { year: Number(year), symbolCount: Number(summary?.symbolCount ?? 0), tradingDateCount: Number(summary?.tradingDateCount ?? 0), barCount: Number(summary?.barCount ?? 0), firstTradingDate: summary?.firstTradingDate ?? null, lastTradingDate: summary?.lastTradingDate ?? null, lastCapturedAt: summary?.lastCapturedAt ?? null, source: "kiwoom_ka10080" as const };
  }),

  mockOrderOperationStatus: operatorProcedure.query(async () => {
    const db = await getDb();
    if (!db) return null;
    const tradingDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
    const [policy, experiment] = await Promise.all([
      db.select().from(autoTradePolicies).where(eq(autoTradePolicies.status, "active")).orderBy(desc(autoTradePolicies.updatedAt)).limit(1).then(rows => rows[0] ?? null),
      db.select().from(dayTradeExperiments).where(eq(dayTradeExperiments.tradingDate, tradingDate)).orderBy(desc(dayTradeExperiments.updatedAt)).limit(1).then(rows => rows[0] ?? null),
    ]);
    const [profile, positions, recentExecutions] = await Promise.all([
      policy ? db.select().from(tradingProfiles).where(eq(tradingProfiles.userId, policy.userId)).limit(1).then(rows => rows[0] ?? null) : Promise.resolve(null),
      experiment ? db.select().from(dayTradeExperimentPositions).where(eq(dayTradeExperimentPositions.experimentId, experiment.id)).orderBy(desc(dayTradeExperimentPositions.signalCount), dayTradeExperimentPositions.symbol) : Promise.resolve([]),
      policy ? db.select({
        orderIntentId: orderIntents.id,
        symbol: orderIntents.symbol,
        name: orderIntents.name,
        side: orderIntents.side,
        orderStatus: orderIntents.status,
        quantity: orderIntents.quantity,
        price: orderIntents.price,
        createdAt: orderIntents.createdAt,
        brokerOrderId: orderIntents.brokerOrderId,
        executionStatus: orderExecutions.executionStatus,
        filledQuantity: orderExecutions.filledQuantity,
        filledPrice: orderExecutions.filledPrice,
        executedAt: orderExecutions.executedAt,
      }).from(orderIntents).leftJoin(orderExecutions, eq(orderExecutions.orderIntentId, orderIntents.id)).where(and(
        eq(orderIntents.userId, policy.userId),
        eq(orderIntents.autoPolicyId, policy.id),
        eq(orderIntents.executionOrigin, "local_node"),
        like(orderIntents.dedupeKey, `auto:${tradingDate}:%`),
      )).orderBy(desc(orderExecutions.executedAt), desc(orderIntents.updatedAt)).limit(30) : Promise.resolve([]),
    ]);
    const enabled = Boolean(policy && profile?.autoTradeEnabled && !profile.killSwitch);
    const status = !policy ? "waiting_for_policy" : !profile ? "waiting_for_profile" : profile.killSwitch ? "kill_switch" : !profile.autoTradeEnabled ? "automatic_execution_paused" : !experiment ? "waiting_for_intraday_experiment" : experiment.status === "closed" ? "market_closed" : positions.length ? "ready" : "waiting_for_signals";
    const maxPositions = policy?.maxConcurrentPositions ?? 0;
    return {
      tradingDate,
      status,
      executionMode: "mock" as const,
      localExecutor: "KiwoomAutomaticOrderExecutor",
      policy: policy ? { id: policy.id, version: policy.version, totalCapital: policy.totalCapital, maxConcurrentPositions: policy.maxConcurrentPositions, stopLossPercent: Number(policy.stopLossPercent), takeProfitPercent: Number(policy.takeProfitPercent), dailyLossLimitPercent: Number(policy.dailyLossLimitPercent), enabled } : null,
      experiment: experiment ? { id: experiment.id, status: experiment.status, signalCount: experiment.signalCount, selectedPositionCount: experiment.selectedPositionCount, totalCapital: experiment.totalCapital, netPnl: Number(experiment.netPnl), netReturnPercent: Number(experiment.netReturnPercent), closedAt: experiment.closedAt, updatedAt: experiment.updatedAt } : null,
      selectedOrders: experiment?.status === "tracking" ? positions.slice(0, maxPositions).map(position => ({ symbol: position.symbol, name: position.name, candidateId: position.candidateId, candidateFingerprint: position.candidateFingerprint, signalCount: position.signalCount, referencePrice: position.lastPrice ?? position.entryPrice, dedupeKey: policy ? `auto:${tradingDate}:${policy.version}:${position.candidateId}:${position.symbol}:buy` : null })) : [],
      recentExecutions: recentExecutions.map(item => ({ ...item, executionStatus: item.executionStatus ?? item.orderStatus, filledPrice: item.filledPrice ?? null, executedAt: item.executedAt ?? item.createdAt })),
    };
  }),

  requestMinuteCollection: protectedProcedure.mutation(async () => {
    const db = await getDb();
    if (!db) throw new Error("연구 데이터베이스를 사용할 수 없습니다.");
    const now = new Date();
    const tradingDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(now);
    const [existing] = await db.select().from(localMinuteCollectionRequests).where(and(eq(localMinuteCollectionRequests.tradingDate, tradingDate), inArray(localMinuteCollectionRequests.status, ["queued", "running"]))).orderBy(desc(localMinuteCollectionRequests.updatedAt)).limit(1);
    if (existing) return { request: existing, reusedPendingRequest: true };
    const requestKey = `manual:${tradingDate}:${now.getTime()}`;
    const [inserted] = await db.insert(localMinuteCollectionRequests).values({ tradingDate, requestKey, source: "public_intraday_monitor" }).returning();
    const request = (await db.select().from(localMinuteCollectionRequests).where(eq(localMinuteCollectionRequests.id, inserted.id)).limit(1))[0]!;
    return { request, reusedPendingRequest: false };
  }),

  syncDayTradeHistory: operatorProcedure.input(z.object({ runId: z.number().int().positive() })).mutation(async ({ input }) => syncDayTradeExperimentForRun(input.runId)),

  dayTradePositionDetail: publicProcedure.input(z.object({ candidateId: z.number().int().positive(), symbol: z.string().regex(/^\d{6}$/) })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return null;
    const position = (await db.select().from(dayTradeExperimentPositions).where(and(eq(dayTradeExperimentPositions.candidateId, input.candidateId), eq(dayTradeExperimentPositions.symbol, input.symbol))).orderBy(desc(dayTradeExperimentPositions.updatedAt)).limit(1))[0];
    if (!position) return null;
    const [candidate, experiment] = await Promise.all([
      db.select().from(autonomousResearchCandidates).where(eq(autonomousResearchCandidates.id, position.candidateId)).limit(1),
      db.select().from(dayTradeExperiments).where(eq(dayTradeExperiments.id, position.experimentId)).limit(1),
    ]);
    if (!candidate[0] || !experiment[0]) return null;
    const bars = await db.select({ minuteAt: intradayMinuteBars.minuteAt, open: intradayMinuteBars.open, high: intradayMinuteBars.high, low: intradayMinuteBars.low, close: intradayMinuteBars.close, volume: intradayMinuteBars.volume }).from(intradayMinuteBars).where(and(eq(intradayMinuteBars.symbol, position.symbol), eq(intradayMinuteBars.tradingDate, experiment[0].tradingDate))).orderBy(intradayMinuteBars.minuteAt);
    return {
      position: { ...position, name: getKrxSymbolName(position.symbol, position.name) },
      candidate: { id: candidate[0].id, fingerprint: candidate[0].fingerprint, rootGenomeJson: candidate[0].rootGenomeJson, minimumScore: candidate[0].minimumScore, fitnessScore: candidate[0].fitnessScore },
      experiment: { id: experiment[0].id, tradingDate: experiment[0].tradingDate, status: experiment[0].status },
      bars: bars.map(bar => ({ ...bar, open: Number(bar.open), high: Number(bar.high), low: Number(bar.low), close: Number(bar.close), volume: Number(bar.volume) })),
      source: "kiwoom_ka10080" as const,
    };
  }),

  historicalCandidateDetail: publicProcedure.input(z.object({ candidateId: z.number().int().positive() })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return null;
    const candidate = (await db.select().from(autonomousResearchCandidates).where(eq(autonomousResearchCandidates.id, input.candidateId)).limit(1))[0];
    if (!candidate) return null;
    const run = (await db.select().from(autonomousResearchRuns).where(eq(autonomousResearchRuns.id, candidate.runId)).limit(1))[0];
    if (!run || !run.runKey.includes(":historical")) return null;
    const summary = run.summaryJson as { dataset?: { sourceRunId?: number }; assumptions?: { holdingDays?: number } } | null;
    const sourceRunId = summary?.dataset?.sourceRunId ?? run.id;
    const rows = await db.select().from(autonomousResearchBars).where(eq(autonomousResearchBars.runId, sourceRunId)).orderBy(autonomousResearchBars.symbol, autonomousResearchBars.date);
    const barsBySymbol = rows.reduce<Record<string, Array<{ date: string; open: number; high: number; low: number; close: number; volume: number; turnover: number }>>>((result, row) => {
      (result[row.symbol] ??= []).push({ date: row.date, open: Number(row.open), high: Number(row.high), low: Number(row.low), close: Number(row.close), volume: Number(row.volume), turnover: Number(row.turnover) });
      return result;
    }, {});
    const evaluation = evaluateAutonomousCandidate({ root: candidate.rootGenomeJson, minimumScore: candidate.minimumScore, barsBySymbol });
    const universe = ((run.universeJson as Array<{ symbol: string; name?: string }> | null) ?? []).reduce<Record<string, string>>((result, item) => ({ ...result, [item.symbol]: item.name ?? item.symbol }), {});
    const trades = evaluation.results.flatMap(item => item.result.trades.map(trade => ({ symbol: item.symbol, name: universe[item.symbol] ?? item.symbol, ...trade }))).sort((left, right) => right.returnPercent - left.returnPercent || left.entryDate.localeCompare(right.entryDate));
    const focusTrade = trades[0] ?? null;
    const focusBars = focusTrade ? (barsBySymbol[focusTrade.symbol] ?? []) : [];
    const entryIndex = focusTrade ? focusBars.findIndex(bar => bar.date === focusTrade.entryDate) : -1;
    const entryEvidence = entryIndex > 0 ? evaluateExpression(candidate.rootGenomeJson as ConditionExpressionGroup, focusBars.slice(0, entryIndex)) : null;
    const profitableTrades = trades.filter(trade => trade.returnPercent > 0);
    const losingTrades = trades.filter(trade => trade.returnPercent <= 0);
    return {
      candidate,
      run,
      dataset: { sourceRunId, barCount: rows.length, symbolCount: Object.keys(barsBySymbol).length, reuseState: sourceRunId === run.id ? "원본" : "저장 데이터 재사용" },
      metrics: { ...evaluation.metrics, profitableTradeRatio: trades.length ? profitableTrades.length / trades.length * 100 : 0, averageProfit: profitableTrades.length ? profitableTrades.reduce((sum, trade) => sum + trade.returnPercent, 0) / profitableTrades.length : 0, averageLoss: losingTrades.length ? losingTrades.reduce((sum, trade) => sum + trade.returnPercent, 0) / losingTrades.length : 0, fixedHoldingDays: summary?.assumptions?.holdingDays ?? AUTONOMOUS_RESEARCH_POLICY.holdingDays },
      trades: trades.slice(0, 40),
      focus: focusTrade ? { trade: focusTrade, bars: focusBars.slice(Math.max(0, entryIndex - 35), Math.min(focusBars.length, entryIndex + 50)), entryEvidence: entryEvidence?.evaluations ?? [], exitExplanation: `진입 뒤 ${summary?.assumptions?.holdingDays ?? AUTONOMOUS_RESEARCH_POLICY.holdingDays}거래일 보유 후 종가에 청산하는 고정 보유 규칙입니다.` } : null,
    };
  }),
});
