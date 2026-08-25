import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { evolutionCandidates, evolutionGenerations, evolutionSearches, researchDailyBars, researchDatasets, researchExperiments, strategyPresets, walkForwardRuns } from "../../drizzle/schema";
import type { ConditionExpressionGroup, ConditionRule } from "../../shared/trading";
import { operatorProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { KiwoomClient } from "../kiwoom/client";
import { externalVerificationPausedMessage, isExternalResearchVerificationEnabled } from "../quant/externalVerificationGate";
import { runDailyBacktest } from "../quant/backtest";
import { validateResearchExperimentSpec } from "../quant/researchExperiment";
import { runWalkForward } from "../quant/walkForward";
import { calculateFitness, evolvePopulation, fingerprintResearchGenome, generateUniqueGenomes, manuallyExpandGenome, selectSurvivors, type EvolutionFitnessMetrics, type EvolutionRuleType, type ScoredGenome } from "../quant/evolution";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const universeSchema = z.array(z.object({ symbol: z.string().regex(/^\d{6}$/), name: z.string().min(1).max(120).optional() })).min(1).max(500);
const storedRuleSchema = z.object({ id: z.string(), type: z.enum(["macd_rising", "ma_position", "high_return", "turnover"]), enabled: z.boolean(), weight: z.number(), config: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])) });
const assumptionsSchema = z.object({ entryTiming: z.enum(["next_open", "next_close"]), feeRate: z.number().min(0).max(0.1), slippageBps: z.number().min(0).max(10_000), maxHoldingDays: z.number().int().min(1).max(365), maxConcurrentPositions: z.number().int().min(1).max(500) });
const walkForwardConfigurationSchema = z.object({ experimentId: z.number().int().positive(), trainingDays: z.number().int().min(20).max(10_000), validationDays: z.number().int().min(5).max(10_000), stepDays: z.number().int().min(1).max(10_000) });
const evolutionRuleTypeSchema = z.enum(["macd_rising", "ma_position", "high_return", "turnover", "rsi", "bollinger", "stochastic", "atr_percent", "volume_ratio"]);
const evolutionSearchConfigurationSchema = z.object({
  populationSize: z.number().int().min(10).max(100), minRules: z.number().int().min(1).max(20), maxRules: z.number().int().min(1).max(20), maxDepth: z.number().int().min(1).max(5), allowedRuleTypes: z.array(evolutionRuleTypeSchema).min(1),
  eliteCount: z.number().int().min(1).max(50), crossoverRate: z.number().min(0).max(1), mutationRate: z.number().min(0).max(1), minimumTrades: z.number().int().min(1).max(1_000), maxDrawdownLimit: z.number().min(-100).max(0),
  holdingDays: z.number().int().min(1).max(365), feeRate: z.number().min(0).max(0.1), slippageBps: z.number().min(0).max(10_000), informationCutoffTradingDays: z.number().int().min(1).max(20), entryTiming: z.enum(["next_open", "next_close"]),
});
const manualEvolutionChangeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("rule_numeric"), targetNodeId: z.string().min(1).max(160), key: z.string().min(1).max(80), next: z.number().finite().min(0).max(10_000_000) }),
  z.object({ kind: z.literal("group_logic"), targetNodeId: z.string().min(1).max(160), next: z.enum(["AND", "OR", "NOT"]) }),
]);

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "리서치 데이터베이스 연결을 사용할 수 없습니다." });
  return db;
}

export const researchRouter = router({
  listDatasets: operatorProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    return db.select().from(researchDatasets).where(eq(researchDatasets.userId, ctx.user.id)).orderBy(desc(researchDatasets.createdAt));
  }),

  createDataset: operatorProcedure.input(z.object({
    name: z.string().trim().min(2).max(160), versionKey: z.string().trim().min(3).max(80), universe: universeSchema,
    startDate: dateSchema, endDate: dateSchema, adjustmentBasis: z.enum(["adjusted", "unadjusted", "unknown"]).default("unknown"),
  })).mutation(async ({ ctx, input }) => {
    if (input.startDate > input.endDate) throw new TRPCError({ code: "BAD_REQUEST", message: "데이터셋 시작일은 종료일보다 늦을 수 없습니다." });
    const db = await requireDb();
    const [created] = await db.insert(researchDatasets).values({
      userId: ctx.user.id, name: input.name, versionKey: input.versionKey, universeJson: input.universe,
      startDate: input.startDate, endDate: input.endDate, adjustmentBasis: input.adjustmentBasis, qualityStatus: "draft",
    }).returning();
    return { id: created.id, qualityStatus: "draft" as const };
  }),

  collectDataset: operatorProcedure.input(z.object({ datasetId: z.number().int().positive(), maxPagesPerSymbol: z.number().int().min(1).max(10).default(10) })).mutation(async ({ ctx, input }) => {
    if (!isExternalResearchVerificationEnabled()) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: `${externalVerificationPausedMessage}: 사용자가 요청하면 읽기 전용 리서치 데이터셋 수집을 진행합니다.` });
    }
    const db = await requireDb();
    const dataset = (await db.select().from(researchDatasets).where(and(eq(researchDatasets.id, input.datasetId), eq(researchDatasets.userId, ctx.user.id))).limit(1))[0];
    if (!dataset) throw new TRPCError({ code: "NOT_FOUND", message: "수집할 리서치 데이터셋을 찾을 수 없습니다." });
    if (dataset.qualityStatus !== "draft") throw new TRPCError({ code: "CONFLICT", message: "초안 데이터셋만 최초 수집할 수 있습니다. 기존 원본을 바꾸려면 새 버전을 만드세요." });
    if (dataset.adjustmentBasis === "unknown") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "실주가 데이터셋 수집 전 가격 조정 기준을 adjusted 또는 unadjusted로 확정하세요." });
    const universe = universeSchema.parse(dataset.universeJson);
    await db.update(researchDatasets).set({ qualityStatus: "collecting", qualityReportJson: { state: "collecting", requestedSymbols: universe.map(item => item.symbol) } }).where(eq(researchDatasets.id, dataset.id));
    try {
      const client = new KiwoomClient();
      const token = await client.getAccessToken();
      const collected: Array<{ symbol: string; bars: number }> = [];
      for (const item of universe) {
        const bars = (await client.getDailyBars(token.token, { symbol: item.symbol, maxPages: input.maxPagesPerSymbol, adjustedPrice: dataset.adjustmentBasis === "adjusted" ? "1" : "0" })).filter(bar => bar.date >= dataset.startDate && bar.date <= dataset.endDate);
        if (!bars.length) throw new Error(`${item.symbol}의 데이터셋 기간 일봉이 없습니다.`);
        await db.insert(researchDailyBars).values(bars.map(bar => ({ datasetId: dataset.id, symbol: item.symbol, date: bar.date, open: Math.round(bar.open), high: Math.round(bar.high), low: Math.round(bar.low), close: Math.round(bar.close), volume: String(Math.round(bar.volume)), turnover: String(Math.round(bar.turnover)), source: "kiwoom_ka10081" })));
        collected.push({ symbol: item.symbol, bars: bars.length });
      }
      const barCount = collected.reduce((sum, item) => sum + item.bars, 0);
      await db.update(researchDatasets).set({ qualityStatus: "ready", barCount, sourceCapturedAt: new Date(), readyAt: new Date(), qualityReportJson: { state: "ready", source: "kiwoom_ka10081", adjustmentBasis: dataset.adjustmentBasis, symbols: collected, barCount } }).where(eq(researchDatasets.id, dataset.id));
      return { datasetId: dataset.id, status: "ready" as const, barCount, collected };
    } catch (error) {
      const message = error instanceof Error ? error.message : "실데이터 수집에 실패했습니다.";
      await db.update(researchDatasets).set({ qualityStatus: "error", qualityReportJson: { state: "error", error: message } }).where(eq(researchDatasets.id, dataset.id));
      throw new TRPCError({ code: "BAD_GATEWAY", message: `리서치 데이터셋 수집 실패: ${message}` });
    }
  }),

  listEvolutionSearches: operatorProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    return db.select().from(evolutionSearches).where(eq(evolutionSearches.userId, ctx.user.id)).orderBy(desc(evolutionSearches.createdAt));
  }),

  listEvolutionGenerations: operatorProcedure.input(z.object({ searchId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    const db = await requireDb();
    const search = (await db.select().from(evolutionSearches).where(and(eq(evolutionSearches.id, input.searchId), eq(evolutionSearches.userId, ctx.user.id))).limit(1))[0];
    if (!search) throw new TRPCError({ code: "NOT_FOUND", message: "진화형 탐색 기록을 찾을 수 없습니다." });
    return db.select().from(evolutionGenerations).where(eq(evolutionGenerations.searchId, search.id)).orderBy(asc(evolutionGenerations.generationNumber));
  }),

  listEvolutionCandidates: operatorProcedure.input(z.object({ searchId: z.number().int().positive(), generationId: z.number().int().positive().optional() })).query(async ({ ctx, input }) => {
    const db = await requireDb();
    const search = (await db.select().from(evolutionSearches).where(and(eq(evolutionSearches.id, input.searchId), eq(evolutionSearches.userId, ctx.user.id))).limit(1))[0];
    if (!search) throw new TRPCError({ code: "NOT_FOUND", message: "진화형 탐색 기록을 찾을 수 없습니다." });
    return db.select().from(evolutionCandidates).where(input.generationId ? and(eq(evolutionCandidates.searchId, search.id), eq(evolutionCandidates.generationId, input.generationId)) : eq(evolutionCandidates.searchId, search.id)).orderBy(desc(evolutionCandidates.fitnessScore), desc(evolutionCandidates.createdAt));
  }),

  listEvolutionGenerationSummaries: operatorProcedure.input(z.object({ searchId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    const db = await requireDb();
    const search = (await db.select().from(evolutionSearches).where(and(eq(evolutionSearches.id, input.searchId), eq(evolutionSearches.userId, ctx.user.id))).limit(1))[0];
    if (!search) throw new TRPCError({ code: "NOT_FOUND", message: "진화형 탐색 기록을 찾을 수 없습니다." });
    const [generations, candidates] = await Promise.all([
      db.select().from(evolutionGenerations).where(eq(evolutionGenerations.searchId, search.id)).orderBy(asc(evolutionGenerations.generationNumber)),
      db.select().from(evolutionCandidates).where(eq(evolutionCandidates.searchId, search.id)).orderBy(desc(evolutionCandidates.fitnessScore)),
    ]);
    const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
    return generations.map(generation => {
      const generationCandidates = candidates.filter(candidate => candidate.generationId === generation.id);
      const evaluated = generationCandidates.filter(candidate => Boolean((candidate.inSampleMetricsJson as { metrics?: unknown } | null)?.metrics));
      const survivors = generationCandidates.filter(candidate => candidate.status === "survived");
      const inSampleReturns = evaluated.flatMap(candidate => { const value = (candidate.inSampleMetricsJson as { metrics?: { totalReturn?: number } } | null)?.metrics?.totalReturn; return typeof value === "number" ? [value] : []; });
      const outOfSampleReturns = generationCandidates.flatMap(candidate => { const value = (candidate.outOfSampleMetricsJson as { metrics?: { totalReturn?: number } } | null)?.metrics?.totalReturn; return typeof value === "number" ? [value] : []; });
      const walkForwardReturns = generationCandidates.flatMap(candidate => { const value = (candidate.walkForwardMetricsJson as { result?: { totalReturn?: number } } | null)?.result?.totalReturn; return typeof value === "number" ? [value] : []; });
      const ranked = [...evaluated].sort((left, right) => Number(right.fitnessScore ?? -Infinity) - Number(left.fitnessScore ?? -Infinity));
      return {
        generationId: generation.id,
        generationNumber: generation.generationNumber,
        populationSize: generation.populationSize,
        uniqueCandidateCount: generation.uniqueCandidateCount,
        status: generation.status,
        evaluatedCandidateCount: evaluated.length,
        survivorCandidateCount: survivors.length,
        survivalRate: evaluated.length ? survivors.length / evaluated.length : null,
        averageInSampleReturn: mean(inSampleReturns),
        averageOutOfSampleReturn: mean(outOfSampleReturns),
        averageWalkForwardReturn: mean(walkForwardReturns),
        bestCandidate: ranked[0] ? { id: ranked[0].id, fingerprint: ranked[0].fingerprint, fitnessScore: ranked[0].fitnessScore, inSampleMetricsJson: ranked[0].inSampleMetricsJson, outOfSampleMetricsJson: ranked[0].outOfSampleMetricsJson } : null,
      };
    });
  }),

  createEvolutionSearch: operatorProcedure.input(z.object({
    datasetId: z.number().int().positive(), name: z.string().trim().min(2).max(160), randomSeed: z.number().int().min(1).max(2_147_483_647), configuration: evolutionSearchConfigurationSchema,
  })).mutation(async ({ ctx, input }) => {
    if (input.configuration.maxRules < input.configuration.minRules) throw new TRPCError({ code: "BAD_REQUEST", message: "최대 규칙 수는 최소 규칙 수보다 작을 수 없습니다." });
    if (input.configuration.eliteCount > input.configuration.populationSize) throw new TRPCError({ code: "BAD_REQUEST", message: "엘리트 보존 수는 후보 수를 넘을 수 없습니다." });
    const db = await requireDb();
    const dataset = (await db.select().from(researchDatasets).where(and(eq(researchDatasets.id, input.datasetId), eq(researchDatasets.userId, ctx.user.id))).limit(1))[0];
    if (!dataset || dataset.qualityStatus !== "ready") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "진화형 탐색은 ready 상태의 고정 실제 데이터셋에서만 시작할 수 있습니다." });
    const genomes = generateUniqueGenomes({ seed: input.randomSeed, populationSize: input.configuration.populationSize, minRules: input.configuration.minRules, maxRules: input.configuration.maxRules, maxDepth: input.configuration.maxDepth, allowedRuleTypes: input.configuration.allowedRuleTypes as EvolutionRuleType[] });
    const [search] = await db.insert(evolutionSearches).values({ userId: ctx.user.id, datasetId: dataset.id, name: input.name, randomSeed: input.randomSeed, configurationJson: input.configuration, status: "queued" }).returning();
    const [generation] = await db.insert(evolutionGenerations).values({ searchId: search.id, generationNumber: 0, populationSize: genomes.length, uniqueCandidateCount: genomes.length, status: "queued" }).returning();
    await db.insert(evolutionCandidates).values(genomes.map(genome => ({ searchId: search.id, generationId: generation.id, fingerprint: fingerprintResearchGenome({ ...genome, datasetVersionKey: dataset.versionKey, assumptions: input.configuration }), rootGenomeJson: genome.root, minimumScore: genome.minimumScore, origin: "seed" as const, status: "created" as const })));
    return { searchId: search.id, generationId: generation.id, uniqueCandidateCount: genomes.length, status: "queued" as const };
  }),

  evaluateEvolutionCandidate: operatorProcedure.input(z.object({ candidateId: z.number().int().positive(), symbol: z.string().regex(/^\d{6}$/) })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const candidate = (await db.select().from(evolutionCandidates).where(eq(evolutionCandidates.id, input.candidateId)).limit(1))[0];
    if (!candidate) throw new TRPCError({ code: "NOT_FOUND", message: "평가할 유전자 후보를 찾을 수 없습니다." });
    const search = (await db.select().from(evolutionSearches).where(and(eq(evolutionSearches.id, candidate.searchId), eq(evolutionSearches.userId, ctx.user.id))).limit(1))[0];
    if (!search) throw new TRPCError({ code: "FORBIDDEN", message: "해당 유전자 후보에 접근할 수 없습니다." });
    const dataset = (await db.select().from(researchDatasets).where(and(eq(researchDatasets.id, search.datasetId), eq(researchDatasets.userId, ctx.user.id))).limit(1))[0];
    if (!dataset || dataset.qualityStatus !== "ready") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "ready 상태의 고정 실제 데이터셋에서만 유전자를 평가할 수 있습니다." });
    const configuration = evolutionSearchConfigurationSchema.parse(search.configurationJson);
    const bars = await db.select().from(researchDailyBars).where(and(eq(researchDailyBars.datasetId, dataset.id), eq(researchDailyBars.symbol, input.symbol))).orderBy(asc(researchDailyBars.date));
    if (bars.length < 60) throw new TRPCError({ code: "BAD_REQUEST", message: "선택 종목의 고정 일봉이 60개 미만입니다." });
    const result = runDailyBacktest({ bars: bars.map(bar => ({ date: bar.date, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: Number(bar.volume), turnover: Number(bar.turnover) })), expression: candidate.rootGenomeJson as unknown as ConditionExpressionGroup, minScore: candidate.minimumScore, holdingDays: configuration.holdingDays, feeRate: configuration.feeRate + configuration.slippageBps / 10_000, entryDelayDays: configuration.informationCutoffTradingDays, entryTiming: configuration.entryTiming === "next_open" ? "open" : "close" });
    const metrics = { totalReturn: result.totalReturn, maxDrawdown: result.maxDrawdown, tradeCount: result.tradeCount, winRate: result.winRate };
    const fitnessScore = calculateFitness(metrics, { minimumTrades: configuration.minimumTrades, maxDrawdownLimit: configuration.maxDrawdownLimit });
    const inSampleMetricsJson = { datasetId: dataset.id, datasetVersionKey: dataset.versionKey, symbol: input.symbol, informationCutoffTradingDays: configuration.informationCutoffTradingDays, assumptions: { holdingDays: configuration.holdingDays, feeRate: configuration.feeRate, slippageBps: configuration.slippageBps, entryTiming: configuration.entryTiming }, result, metrics };
    await db.update(evolutionCandidates).set({ status: "evaluated", inSampleMetricsJson, fitnessScore: String(fitnessScore), evaluatedAt: new Date() }).where(eq(evolutionCandidates.id, candidate.id));
    return { candidateId: candidate.id, datasetVersionKey: dataset.versionKey, symbol: input.symbol, metrics, fitnessScore };
  }),

  validateEvolutionCandidate: operatorProcedure.input(z.object({ candidateId: z.number().int().positive(), symbol: z.string().regex(/^\d{6}$/), validationStartDate: dateSchema })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const candidate = (await db.select().from(evolutionCandidates).where(eq(evolutionCandidates.id, input.candidateId)).limit(1))[0];
    if (!candidate) throw new TRPCError({ code: "NOT_FOUND", message: "검증할 유전자 후보를 찾을 수 없습니다." });
    const search = (await db.select().from(evolutionSearches).where(and(eq(evolutionSearches.id, candidate.searchId), eq(evolutionSearches.userId, ctx.user.id))).limit(1))[0];
    if (!search) throw new TRPCError({ code: "FORBIDDEN", message: "해당 유전자 후보에 접근할 수 없습니다." });
    const dataset = (await db.select().from(researchDatasets).where(and(eq(researchDatasets.id, search.datasetId), eq(researchDatasets.userId, ctx.user.id))).limit(1))[0];
    if (!dataset || dataset.qualityStatus !== "ready") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "ready 실제 데이터셋에서만 독립 검증을 실행할 수 있습니다." });
    const rows = await db.select().from(researchDailyBars).where(and(eq(researchDailyBars.datasetId, dataset.id), eq(researchDailyBars.symbol, input.symbol))).orderBy(asc(researchDailyBars.date));
    const validationStartIndex = rows.findIndex(row => row.date >= input.validationStartDate);
    if (validationStartIndex < 60) throw new TRPCError({ code: "BAD_REQUEST", message: "독립 검증 시작일 이전에 지표 계산용 일봉 60개 이상이 필요합니다." });
    const configuration = evolutionSearchConfigurationSchema.parse(search.configurationJson);
    const bars = rows.map(row => ({ date: row.date, open: row.open, high: row.high, low: row.low, close: row.close, volume: Number(row.volume), turnover: Number(row.turnover) }));
    const result = runDailyBacktest({ bars, expression: candidate.rootGenomeJson as unknown as import("../../shared/trading").ConditionExpressionGroup, minScore: candidate.minimumScore, holdingDays: configuration.holdingDays, feeRate: configuration.feeRate + configuration.slippageBps / 10_000, entryDelayDays: configuration.informationCutoffTradingDays, entryTiming: configuration.entryTiming === "next_open" ? "open" : "close", evaluationStartIndex: validationStartIndex });
    const metrics: EvolutionFitnessMetrics = { totalReturn: result.totalReturn, maxDrawdown: result.maxDrawdown, tradeCount: result.tradeCount, winRate: result.winRate };
    const outOfSampleMetricsJson = { datasetVersionKey: dataset.versionKey, symbol: input.symbol, validationStartDate: input.validationStartDate, validationStartIndex, assumptions: { feeRate: configuration.feeRate, slippageBps: configuration.slippageBps, informationCutoffTradingDays: configuration.informationCutoffTradingDays, entryTiming: configuration.entryTiming, holdingDays: configuration.holdingDays }, metrics, result };
    await db.update(evolutionCandidates).set({ outOfSampleMetricsJson }).where(eq(evolutionCandidates.id, candidate.id));
    return { candidateId: candidate.id, datasetVersionKey: dataset.versionKey, symbol: input.symbol, validationStartDate: input.validationStartDate, metrics };
  }),

  runEvolutionCandidateWalkForward: operatorProcedure.input(z.object({ candidateId: z.number().int().positive(), symbol: z.string().regex(/^\d{6}$/), trainingDays: z.number().int().min(60).max(10_000), validationDays: z.number().int().min(5).max(10_000), stepDays: z.number().int().min(1).max(10_000) })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const candidate = (await db.select().from(evolutionCandidates).where(eq(evolutionCandidates.id, input.candidateId)).limit(1))[0];
    if (!candidate) throw new TRPCError({ code: "NOT_FOUND", message: "워크포워드할 유전자 후보를 찾을 수 없습니다." });
    if (candidate.status !== "survived") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "워크포워드는 선발된 생존 유전자에서만 실행할 수 있습니다." });
    const search = (await db.select().from(evolutionSearches).where(and(eq(evolutionSearches.id, candidate.searchId), eq(evolutionSearches.userId, ctx.user.id))).limit(1))[0];
    if (!search) throw new TRPCError({ code: "FORBIDDEN", message: "해당 유전자 후보에 접근할 수 없습니다." });
    const dataset = (await db.select().from(researchDatasets).where(and(eq(researchDatasets.id, search.datasetId), eq(researchDatasets.userId, ctx.user.id))).limit(1))[0];
    if (!dataset || dataset.qualityStatus !== "ready") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "ready 실제 데이터셋의 생존 유전자만 워크포워드할 수 있습니다." });
    const configuration = evolutionSearchConfigurationSchema.parse(search.configurationJson);
    const rows = await db.select().from(researchDailyBars).where(and(eq(researchDailyBars.datasetId, dataset.id), eq(researchDailyBars.symbol, input.symbol))).orderBy(asc(researchDailyBars.date));
    const result = runWalkForward({ bars: rows.map(row => ({ date: row.date, open: row.open, high: row.high, low: row.low, close: row.close, volume: Number(row.volume), turnover: Number(row.turnover) })), expression: candidate.rootGenomeJson as unknown as ConditionExpressionGroup, configuration: { trainingDays: input.trainingDays, validationDays: input.validationDays, stepDays: input.stepDays, minScore: candidate.minimumScore, holdingDays: configuration.holdingDays, feeRate: configuration.feeRate + configuration.slippageBps / 10_000, entryDelayDays: configuration.informationCutoffTradingDays, entryTiming: configuration.entryTiming === "next_open" ? "open" : "close" } });
    const walkForwardMetricsJson = { datasetVersionKey: dataset.versionKey, symbol: input.symbol, configuration: { trainingDays: input.trainingDays, validationDays: input.validationDays, stepDays: input.stepDays, informationCutoffTradingDays: configuration.informationCutoffTradingDays, entryTiming: configuration.entryTiming, holdingDays: configuration.holdingDays, feeRate: configuration.feeRate, slippageBps: configuration.slippageBps }, result };
    await db.update(evolutionCandidates).set({ walkForwardMetricsJson }).where(eq(evolutionCandidates.id, candidate.id));
    return { candidateId: candidate.id, datasetVersionKey: dataset.versionKey, symbol: input.symbol, result };
  }),

  manuallyExpandEvolutionCandidate: operatorProcedure.input(z.object({ candidateId: z.number().int().positive(), change: manualEvolutionChangeSchema })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const parent = (await db.select().from(evolutionCandidates).where(eq(evolutionCandidates.id, input.candidateId)).limit(1))[0];
    if (!parent) throw new TRPCError({ code: "NOT_FOUND", message: "확장할 부모 유전자를 찾을 수 없습니다." });
    if (parent.status !== "survived") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "확장 실험은 선발된 생존 유전자에서만 시작할 수 있습니다." });
    const search = (await db.select().from(evolutionSearches).where(and(eq(evolutionSearches.id, parent.searchId), eq(evolutionSearches.userId, ctx.user.id))).limit(1))[0];
    if (!search) throw new TRPCError({ code: "FORBIDDEN", message: "해당 유전자 후보에 접근할 수 없습니다." });
    const dataset = (await db.select().from(researchDatasets).where(and(eq(researchDatasets.id, search.datasetId), eq(researchDatasets.userId, ctx.user.id))).limit(1))[0];
    if (!dataset || dataset.qualityStatus !== "ready") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "ready 실제 데이터셋의 생존 유전자만 확장할 수 있습니다." });
    const configuration = evolutionSearchConfigurationSchema.parse(search.configurationJson);
    const derived = manuallyExpandGenome({ candidateId: parent.id, root: parent.rootGenomeJson as unknown as import("../quant/evolution").EvolutionGroup, minimumScore: parent.minimumScore }, input.change);
    const fingerprint = fingerprintResearchGenome({ root: derived.root, minimumScore: derived.minimumScore, datasetVersionKey: dataset.versionKey, assumptions: configuration });
    const existing = (await db.select().from(evolutionCandidates).where(and(eq(evolutionCandidates.searchId, search.id), eq(evolutionCandidates.fingerprint, fingerprint))).limit(1))[0];
    if (existing) throw new TRPCError({ code: "CONFLICT", message: "같은 연구 가정을 가진 중복 유전자가 이미 존재합니다." });
    const latestGeneration = (await db.select().from(evolutionGenerations).where(eq(evolutionGenerations.searchId, search.id)).orderBy(desc(evolutionGenerations.generationNumber)).limit(1))[0];
    const generationNumber = (latestGeneration?.generationNumber ?? -1) + 1;
    const [generation] = await db.insert(evolutionGenerations).values({ searchId: search.id, generationNumber, populationSize: 1, uniqueCandidateCount: 1, survivorCount: 1, status: "completed", selectionSummaryJson: { type: "manual_expand", parentCandidateId: parent.id, mutation: derived.mutation } }).returning();
    const [candidate] = await db.insert(evolutionCandidates).values({ searchId: search.id, generationId: generation.id, fingerprint, rootGenomeJson: derived.root, minimumScore: derived.minimumScore, origin: "manual_expand", parentCandidateIdsJson: [parent.id], mutationJson: derived.mutation, status: "created" }).returning();
    return { candidateId: candidate.id, generationId: generation.id, generationNumber, parentCandidateId: parent.id, fingerprint, mutation: derived.mutation, rootGenomeJson: derived.root };
  }),

  advanceEvolutionGeneration: operatorProcedure.input(z.object({ searchId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const search = (await db.select().from(evolutionSearches).where(and(eq(evolutionSearches.id, input.searchId), eq(evolutionSearches.userId, ctx.user.id))).limit(1))[0];
    if (!search) throw new TRPCError({ code: "NOT_FOUND", message: "진화형 탐색 기록을 찾을 수 없습니다." });
    const configuration = evolutionSearchConfigurationSchema.parse(search.configurationJson);
    const dataset = (await db.select().from(researchDatasets).where(and(eq(researchDatasets.id, search.datasetId), eq(researchDatasets.userId, ctx.user.id))).limit(1))[0];
    if (!dataset) throw new TRPCError({ code: "NOT_FOUND", message: "진화형 탐색 데이터셋을 찾을 수 없습니다." });
    const currentGeneration = (await db.select().from(evolutionGenerations).where(eq(evolutionGenerations.searchId, search.id)).orderBy(desc(evolutionGenerations.generationNumber)).limit(1))[0];
    if (!currentGeneration) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "이전 세대가 없는 탐색은 다음 세대를 만들 수 없습니다." });
    const candidates = await db.select().from(evolutionCandidates).where(eq(evolutionCandidates.generationId, currentGeneration.id)).orderBy(desc(evolutionCandidates.fitnessScore));
    const scored: ScoredGenome[] = candidates.flatMap(candidate => {
      const metrics = (candidate.inSampleMetricsJson as { metrics?: EvolutionFitnessMetrics } | null)?.metrics;
      if (candidate.status !== "evaluated" || !metrics) return [];
      return [{ candidateId: candidate.id, root: candidate.rootGenomeJson as unknown as import("../quant/evolution").EvolutionGroup, minimumScore: candidate.minimumScore, fingerprint: candidate.fingerprint, metrics, fitnessScore: Number(candidate.fitnessScore ?? calculateFitness(metrics, { minimumTrades: configuration.minimumTrades, maxDrawdownLimit: configuration.maxDrawdownLimit })) }];
    });
    if (scored.length < configuration.eliteCount) throw new TRPCError({ code: "PRECONDITION_FAILED", message: `다음 세대에는 평가 완료 후보가 최소 ${configuration.eliteCount}개 필요합니다.` });
    const survivors = selectSurvivors(scored, configuration.eliteCount);
    const nextGenerationNumber = currentGeneration.generationNumber + 1;
    const next = evolvePopulation({ survivors, populationSize: configuration.populationSize, seed: search.randomSeed + nextGenerationNumber, crossoverRate: configuration.crossoverRate, bounds: { minRules: configuration.minRules, maxRules: configuration.maxRules }, preserveElites: false });
    const [generation] = await db.insert(evolutionGenerations).values({ searchId: search.id, generationNumber: nextGenerationNumber, populationSize: next.length, uniqueCandidateCount: next.length, survivorCount: survivors.length, status: "queued", selectionSummaryJson: { evaluatedCount: scored.length, survivorCandidateIds: survivors.map(item => item.candidateId), fitnessScores: survivors.map(item => item.fitnessScore) } }).returning();
    await Promise.all(candidates.map(candidate => db.update(evolutionCandidates).set({ status: survivors.some(survivor => survivor.candidateId === candidate.id) ? "survived" : candidate.status === "evaluated" ? "rejected" : candidate.status }).where(eq(evolutionCandidates.id, candidate.id))));
    await db.insert(evolutionCandidates).values(next.map(genome => ({ searchId: search.id, generationId: generation.id, fingerprint: fingerprintResearchGenome({ ...genome, datasetVersionKey: dataset.versionKey, assumptions: configuration }), rootGenomeJson: genome.root, minimumScore: genome.minimumScore, origin: genome.origin, parentCandidateIdsJson: genome.parentCandidateIds, mutationJson: genome.mutation ?? null, status: "created" as const })));
    return { searchId: search.id, generationId: generation.id, generationNumber: nextGenerationNumber, uniqueCandidateCount: next.length, survivorCandidateIds: survivors.map(item => item.candidateId) };
  }),

  listExperiments: operatorProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    return db.select().from(researchExperiments).where(eq(researchExperiments.userId, ctx.user.id)).orderBy(desc(researchExperiments.createdAt));
  }),

  createExperiment: operatorProcedure.input(z.object({
    datasetId: z.number().int().positive(), presetId: z.number().int().positive(), name: z.string().trim().min(2).max(160),
    datasetVersionKey: z.string().trim().min(3).max(80), strategyVersionLabel: z.string().trim().min(2).max(160), informationCutoffTradingDays: z.number().int().min(1).max(20),
    training: z.object({ startDate: dateSchema, endDate: dateSchema }).optional(), validation: z.object({ startDate: dateSchema, endDate: dateSchema }).optional(),
    assumptions: assumptionsSchema,
  })).mutation(async ({ ctx, input }) => {
    const spec = validateResearchExperimentSpec({ datasetVersionKey: input.datasetVersionKey, strategyVersionLabel: input.strategyVersionLabel, informationCutoffTradingDays: input.informationCutoffTradingDays, training: input.training, validation: input.validation, assumptions: input.assumptions });
    const db = await requireDb();
    const dataset = (await db.select().from(researchDatasets).where(and(eq(researchDatasets.id, input.datasetId), eq(researchDatasets.userId, ctx.user.id))).limit(1))[0];
    if (!dataset) throw new TRPCError({ code: "NOT_FOUND", message: "리서치 데이터셋을 찾을 수 없습니다." });
    if (dataset.versionKey !== spec.datasetVersionKey) throw new TRPCError({ code: "BAD_REQUEST", message: "선택한 데이터셋과 실험 데이터셋 버전이 일치하지 않습니다." });
    const preset = (await db.select().from(strategyPresets).where(and(eq(strategyPresets.id, input.presetId), eq(strategyPresets.userId, ctx.user.id))).limit(1))[0];
    if (!preset) throw new TRPCError({ code: "NOT_FOUND", message: "리서치 조건식을 찾을 수 없습니다." });
    const [created] = await db.insert(researchExperiments).values({
      userId: ctx.user.id, datasetId: dataset.id, presetId: preset.id, name: input.name, randomSeed: 0, configurationJson: {}, strategySnapshotJson: { presetId: preset.id, name: preset.name, rulesJson: preset.rulesJson, scoringJson: preset.scoringJson, strategyVersionLabel: spec.strategyVersionLabel },
      assumptionsJson: spec.assumptions, informationCutoffTradingDays: spec.informationCutoffTradingDays, trainingStartDate: spec.training?.startDate, trainingEndDate: spec.training?.endDate, validationStartDate: spec.validation?.startDate, validationEndDate: spec.validation?.endDate, status: "draft",
    }).returning();
    return { id: created.id, status: "draft" as const };
  }),

  runExperiment: operatorProcedure.input(z.object({ experimentId: z.number().int().positive(), symbol: z.string().regex(/^\d{6}$/), initialCapital: z.number().int().positive().default(10_000_000), minScore: z.number().min(0).max(100).default(70) })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const experiment = (await db.select().from(researchExperiments).where(and(eq(researchExperiments.id, input.experimentId), eq(researchExperiments.userId, ctx.user.id))).limit(1))[0];
    if (!experiment) throw new TRPCError({ code: "NOT_FOUND", message: "실행할 리서치 실험을 찾을 수 없습니다." });
    const dataset = (await db.select().from(researchDatasets).where(and(eq(researchDatasets.id, experiment.datasetId), eq(researchDatasets.userId, ctx.user.id))).limit(1))[0];
    if (!dataset || dataset.qualityStatus !== "ready") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "원본 일봉이 고정·검증된 ready 데이터셋에서만 실험을 실행할 수 있습니다." });
    const allBars = await db.select().from(researchDailyBars).where(and(eq(researchDailyBars.datasetId, dataset.id), eq(researchDailyBars.symbol, input.symbol))).orderBy(asc(researchDailyBars.date));
    const periodBars = experiment.validationStartDate && experiment.validationEndDate ? allBars.filter(bar => bar.date >= experiment.validationStartDate! && bar.date <= experiment.validationEndDate!) : allBars;
    if (periodBars.length < 60) throw new TRPCError({ code: "BAD_REQUEST", message: "선택 종목의 고정 일봉이 실험 기간에 60개 미만입니다." });
    const snapshot = experiment.strategySnapshotJson as { rulesJson?: unknown };
    const rules = z.array(storedRuleSchema).parse(snapshot.rulesJson) as ConditionRule[];
    const assumptions = assumptionsSchema.parse(experiment.assumptionsJson);
    const result = runDailyBacktest({ bars: periodBars.map(bar => ({ date: bar.date, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: Number(bar.volume), turnover: Number(bar.turnover) })), rules, minScore: input.minScore, holdingDays: assumptions.maxHoldingDays, feeRate: assumptions.feeRate + assumptions.slippageBps / 10_000, entryDelayDays: experiment.informationCutoffTradingDays, entryTiming: assumptions.entryTiming === "next_open" ? "open" : "close" });
    const resultsJson = { datasetId: dataset.id, datasetVersionKey: dataset.versionKey, symbol: input.symbol, initialCapital: input.initialCapital, minScore: input.minScore, informationCutoffTradingDays: experiment.informationCutoffTradingDays, periodScope: experiment.validationStartDate ? "validation" : "dataset", assumptions, result };
    await db.update(researchExperiments).set({ status: "completed", resultsJson, completedAt: new Date() }).where(eq(researchExperiments.id, experiment.id));
    return { experimentId: experiment.id, datasetVersionKey: dataset.versionKey, symbol: input.symbol, result };
  }),

  createWalkForwardRun: operatorProcedure.input(z.object({
    experimentId: z.number().int().positive(), trainingDays: z.number().int().min(20).max(10_000), validationDays: z.number().int().min(5).max(10_000), stepDays: z.number().int().min(1).max(10_000),
  })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const experiment = (await db.select().from(researchExperiments).where(and(eq(researchExperiments.id, input.experimentId), eq(researchExperiments.userId, ctx.user.id))).limit(1))[0];
    if (!experiment) throw new TRPCError({ code: "NOT_FOUND", message: "워크포워드 대상 실험을 찾을 수 없습니다." });
    const [created] = await db.insert(walkForwardRuns).values({ userId: ctx.user.id, experimentId: experiment.id, configurationJson: input, status: "queued" }).returning();
    return { id: created.id, status: "queued" as const };
  }),

  listWalkForwardRuns: operatorProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    return db.select().from(walkForwardRuns).where(eq(walkForwardRuns.userId, ctx.user.id)).orderBy(desc(walkForwardRuns.createdAt));
  }),

  runWalkForward: operatorProcedure.input(z.object({ walkForwardRunId: z.number().int().positive(), symbol: z.string().regex(/^\d{6}$/), minScore: z.number().min(0).max(100).default(70) })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const run = (await db.select().from(walkForwardRuns).where(and(eq(walkForwardRuns.id, input.walkForwardRunId), eq(walkForwardRuns.userId, ctx.user.id))).limit(1))[0];
    if (!run) throw new TRPCError({ code: "NOT_FOUND", message: "워크포워드 실행 기록을 찾을 수 없습니다." });
    const experiment = (await db.select().from(researchExperiments).where(and(eq(researchExperiments.id, run.experimentId), eq(researchExperiments.userId, ctx.user.id))).limit(1))[0];
    if (!experiment) throw new TRPCError({ code: "NOT_FOUND", message: "워크포워드에 연결된 실험을 찾을 수 없습니다." });
    const dataset = (await db.select().from(researchDatasets).where(and(eq(researchDatasets.id, experiment.datasetId), eq(researchDatasets.userId, ctx.user.id))).limit(1))[0];
    if (!dataset || dataset.qualityStatus !== "ready") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "ready 상태의 고정 데이터셋에서만 워크포워드를 실행할 수 있습니다." });
    const configuration = walkForwardConfigurationSchema.parse(run.configurationJson);
    const allBars = await db.select().from(researchDailyBars).where(and(eq(researchDailyBars.datasetId, dataset.id), eq(researchDailyBars.symbol, input.symbol))).orderBy(asc(researchDailyBars.date));
    const snapshot = experiment.strategySnapshotJson as { rulesJson?: unknown }; const rules = z.array(storedRuleSchema).parse(snapshot.rulesJson) as ConditionRule[]; const assumptions = assumptionsSchema.parse(experiment.assumptionsJson);
    await db.update(walkForwardRuns).set({ status: "running" }).where(eq(walkForwardRuns.id, run.id));
    try {
      const result = runWalkForward({ bars: allBars.map(bar => ({ date: bar.date, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: Number(bar.volume), turnover: Number(bar.turnover) })), rules, configuration: { ...configuration, minScore: input.minScore, holdingDays: assumptions.maxHoldingDays, feeRate: assumptions.feeRate + assumptions.slippageBps / 10_000, entryDelayDays: experiment.informationCutoffTradingDays, entryTiming: assumptions.entryTiming === "next_open" ? "open" : "close" } });
      const resultsJson = { datasetId: dataset.id, datasetVersionKey: dataset.versionKey, symbol: input.symbol, informationCutoffTradingDays: experiment.informationCutoffTradingDays, assumptions, configuration, result };
      await db.update(walkForwardRuns).set({ status: "completed", resultsJson, completedAt: new Date() }).where(eq(walkForwardRuns.id, run.id));
      return { walkForwardRunId: run.id, datasetVersionKey: dataset.versionKey, symbol: input.symbol, result };
    } catch (error) {
      const message = error instanceof Error ? error.message : "워크포워드 실행에 실패했습니다.";
      await db.update(walkForwardRuns).set({ status: "failed", resultsJson: { error: message } }).where(eq(walkForwardRuns.id, run.id));
      throw new TRPCError({ code: "BAD_REQUEST", message });
    }
  }),
});
