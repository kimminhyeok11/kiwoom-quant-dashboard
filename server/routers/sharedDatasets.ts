import { randomInt } from "node:crypto";
import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { kiwoomTerminalConnectionChecks, researchDailyBars, researchDatasets, researchFiveMinuteBars, sharedDatasetBacktests, sharedDatasetCollectionRequests, strategyPresets } from "../../drizzle/schema";
import type { ConditionRule } from "../../shared/trading";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { createFiveMinuteContextProvider, runDailyBacktest } from "../quant/backtest";

const symbolSchema = z.object({ symbol: z.string().regex(/^\d{6}$/), name: z.string().min(1).max(120) });
const rulesSchema = z.array(z.object({ id: z.string(), type: z.string(), enabled: z.boolean(), weight: z.number(), config: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])) }));
const collectionSchema = z.object({
  symbolCount: z.number().int().min(4).max(20).default(10),
  sampleDays: z.number().int().min(5).max(60).default(15),
  randomSeed: z.number().int().min(1).max(2_147_483_647).optional(),
});
const PUBLIC_DATASET_PAGE_SIZE = 6;

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "공용 연구 데이터베이스를 사용할 수 없습니다." });
  return db;
}

async function requireConnectedKiwoomTerminal(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, userId: number) {
  const latest = (await db.select().from(kiwoomTerminalConnectionChecks).where(eq(kiwoomTerminalConnectionChecks.userId, userId)).orderBy(desc(kiwoomTerminalConnectionChecks.checkedAt)).limit(1))[0];
  if (!latest || latest.status !== "connected") {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "공용 데이터 수집 전 현재 컴퓨터에서 check-kiwoom-rest-connection.cmd를 실행해 키움 REST 단말 인증을 완료하세요." });
  }
  return latest;
}

export const sharedDatasetsRouter = router({
  listPublic: publicProcedure.input(z.object({ page: z.number().int().min(1).max(10_000).optional() }).optional()).query(async ({ input }) => {
    const db = await requireDb();
    const page = input?.page ?? 1;
    const publicReady = and(eq(researchDatasets.visibility, "shared_public"), eq(researchDatasets.qualityStatus, "ready"));
    const [totalRow] = await db.select({ total: count() }).from(researchDatasets).where(publicReady);
    const totalCount = Number(totalRow?.total ?? 0);
    const totalPages = Math.max(1, Math.ceil(totalCount / PUBLIC_DATASET_PAGE_SIZE));
    const safePage = Math.min(page, totalPages);
    const items = await db.select({
      id: researchDatasets.id, name: researchDatasets.name, source: researchDatasets.source, versionKey: researchDatasets.versionKey,
      universeJson: researchDatasets.universeJson, startDate: researchDatasets.startDate, endDate: researchDatasets.endDate,
      barCount: researchDatasets.barCount, minuteBarCount: researchDatasets.minuteBarCount, adjustmentBasis: researchDatasets.adjustmentBasis,
      randomSeed: researchDatasets.randomSeed, sourceFingerprint: researchDatasets.sourceFingerprint,
      sourceCapturedAt: researchDatasets.sourceCapturedAt, readyAt: researchDatasets.readyAt,
    }).from(researchDatasets).where(publicReady).orderBy(desc(researchDatasets.readyAt)).limit(PUBLIC_DATASET_PAGE_SIZE).offset((safePage - 1) * PUBLIC_DATASET_PAGE_SIZE);
    return { items, page: safePage, pageSize: PUBLIC_DATASET_PAGE_SIZE, totalCount, totalPages };
  }),

  vaultSummary: publicProcedure.query(async () => {
    const db = await requireDb();
    const ready = and(eq(researchDatasets.visibility, "shared_public"), eq(researchDatasets.qualityStatus, "ready"));
    const [summary] = await db.select({
      datasetCount: count(),
      dailyBarCount: sql<number>`coalesce(sum(${researchDatasets.barCount}), 0)`,
      fiveMinuteBarCount: sql<number>`coalesce(sum(${researchDatasets.minuteBarCount}), 0)`,
      oldestReadyAt: sql<Date | null>`min(${researchDatasets.readyAt})`,
      newestReadyAt: sql<Date | null>`max(${researchDatasets.readyAt})`,
    }).from(researchDatasets).where(ready);
    return {
      datasetCount: Number(summary?.datasetCount ?? 0),
      dailyBarCount: Number(summary?.dailyBarCount ?? 0),
      fiveMinuteBarCount: Number(summary?.fiveMinuteBarCount ?? 0),
      oldestReadyAt: summary?.oldestReadyAt ?? null,
      newestReadyAt: summary?.newestReadyAt ?? null,
      retention: "완료된 공용 원본은 버전 키·원본 지문과 함께 보관하며, 같은 원본은 중복 적재하지 않고 재사용합니다.",
    };
  }),

  collectRandomShared: protectedProcedure.input(collectionSchema).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    await requireConnectedKiwoomTerminal(db, ctx.user.id);
    const activeRequest = (await db.select().from(sharedDatasetCollectionRequests).where(and(eq(sharedDatasetCollectionRequests.requestedByUserId, ctx.user.id), inArray(sharedDatasetCollectionRequests.status, ["queued", "running"]))).orderBy(desc(sharedDatasetCollectionRequests.requestedAt)).limit(1))[0];
    if (activeRequest) return { status: activeRequest.status, requestId: activeRequest.id, datasetId: activeRequest.datasetId, randomSeed: activeRequest.randomSeed, reusedRequest: true };
    const seed = input.randomSeed ?? randomInt(1, 2_147_483_647);
    const requestFingerprint = `shared-local:${ctx.user.id}:${seed}:${input.symbolCount}:${input.sampleDays}`;
    const existing = (await db.select().from(sharedDatasetCollectionRequests).where(eq(sharedDatasetCollectionRequests.requestFingerprint, requestFingerprint)).limit(1))[0];
    if (existing) return { status: existing.status, requestId: existing.id, datasetId: existing.datasetId, randomSeed: existing.randomSeed, reusedRequest: true };
    const [created] = await db.insert(sharedDatasetCollectionRequests).values({ requestedByUserId: ctx.user.id, randomSeed: seed, symbolCount: input.symbolCount, sampleDays: input.sampleDays, requestFingerprint, status: "queued" }).returning();
    return { status: "queued" as const, requestId: created.id, datasetId: null, randomSeed: seed, reusedRequest: false };
  }),

  resumeCollection: protectedProcedure.input(z.object({ requestId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    await requireConnectedKiwoomTerminal(db, ctx.user.id);
    const request = (await db.select().from(sharedDatasetCollectionRequests).where(and(eq(sharedDatasetCollectionRequests.id, input.requestId), eq(sharedDatasetCollectionRequests.requestedByUserId, ctx.user.id))).limit(1))[0];
    if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "내 수집 요청을 찾을 수 없습니다." });
    if (!["failed", "cancelled"].includes(request.status)) throw new TRPCError({ code: "BAD_REQUEST", message: "중단되었거나 실패한 수집 요청만 다시 이어갈 수 있습니다." });
    const active = (await db.select().from(sharedDatasetCollectionRequests).where(and(eq(sharedDatasetCollectionRequests.requestedByUserId, ctx.user.id), inArray(sharedDatasetCollectionRequests.status, ["queued", "running"]))).orderBy(desc(sharedDatasetCollectionRequests.requestedAt)).limit(1))[0];
    if (active) return { status: active.status, requestId: active.id, reusedActiveRequest: true };
    await db.update(sharedDatasetCollectionRequests).set({ status: "queued", startedAt: null, lastError: null, completedAt: null, progressJson: { stage: "resume_queued", message: "이전 수집 지점부터 다시 이어갈 준비가 되었습니다.", updatedAt: new Date().toISOString() }, resumeCount: sql`${sharedDatasetCollectionRequests.resumeCount} + 1` }).where(eq(sharedDatasetCollectionRequests.id, request.id));
    return { status: "queued" as const, requestId: request.id, reusedActiveRequest: false };
  }),

  listMyCollectionRequests: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    return db.select().from(sharedDatasetCollectionRequests).where(eq(sharedDatasetCollectionRequests.requestedByUserId, ctx.user.id)).orderBy(desc(sharedDatasetCollectionRequests.requestedAt)).limit(50);
  }),

  runBacktest: protectedProcedure.input(z.object({ datasetId: z.number().int().positive(), presetId: z.number().int().positive(), timeframe: z.enum(["daily", "five_minute"]), symbol: z.string().regex(/^\d{6}$/), minScore: z.number().min(0).max(100).default(70), holdingBars: z.number().int().min(1).max(120).default(5), feeRate: z.number().min(0).max(0.1).default(0.0003), slippageBps: z.number().min(0).max(10_000).default(8) })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const dataset = (await db.select().from(researchDatasets).where(and(eq(researchDatasets.id, input.datasetId), eq(researchDatasets.visibility, "shared_public"), eq(researchDatasets.qualityStatus, "ready"))).limit(1))[0];
    if (!dataset) throw new TRPCError({ code: "NOT_FOUND", message: "공용으로 준비된 데이터셋을 찾을 수 없습니다." });
    const preset = (await db.select().from(strategyPresets).where(and(eq(strategyPresets.id, input.presetId), eq(strategyPresets.userId, ctx.user.id))).limit(1))[0];
    if (!preset) throw new TRPCError({ code: "NOT_FOUND", message: "내 조건식 카드만 공용 데이터셋에서 백테스트할 수 있습니다." });
    const rows = input.timeframe === "daily"
      ? await db.select().from(researchDailyBars).where(and(eq(researchDailyBars.datasetId, dataset.id), eq(researchDailyBars.symbol, input.symbol))).orderBy(asc(researchDailyBars.date))
      : await db.select().from(researchFiveMinuteBars).where(and(eq(researchFiveMinuteBars.datasetId, dataset.id), eq(researchFiveMinuteBars.symbol, input.symbol))).orderBy(asc(researchFiveMinuteBars.intervalAt));
    const dailyContextRows = input.timeframe === "five_minute"
      ? await db.select().from(researchDailyBars).where(and(eq(researchDailyBars.datasetId, dataset.id), eq(researchDailyBars.symbol, input.symbol))).orderBy(asc(researchDailyBars.date))
      : [];
    const bars = input.timeframe === "daily"
      ? (rows as Array<typeof researchDailyBars.$inferSelect>).map(row => ({ date: row.date, open: row.open, high: row.high, low: row.low, close: row.close, volume: Number(row.volume), turnover: Number(row.turnover) }))
      : (rows as Array<typeof researchFiveMinuteBars.$inferSelect>).map(row => ({ date: row.intervalAt.toISOString(), open: row.open, high: row.high, low: row.low, close: row.close, volume: Number(row.volume), turnover: Number(row.close) * Number(row.volume) }));
    if (bars.length < 60) throw new TRPCError({ code: "PRECONDITION_FAILED", message: `${input.timeframe === "daily" ? "일봉" : "5분봉"} 백테스트에는 최소 60개의 고정 원본 봉이 필요합니다.` });
    const dailyContextBars = (dailyContextRows as Array<typeof researchDailyBars.$inferSelect>).map(row => ({ date: row.date, open: row.open, high: row.high, low: row.low, close: row.close, volume: Number(row.volume), turnover: Number(row.turnover) }));
    const conditionContextAtIndex = input.timeframe === "five_minute" ? createFiveMinuteContextProvider(bars, dailyContextBars) : undefined;
    const assumptions = { timeframe: input.timeframe, minScore: input.minScore, holdingBars: input.holdingBars, feeRate: input.feeRate, slippageBps: input.slippageBps, informationCutoffBars: 1, datasetVersionKey: dataset.versionKey, sourceFingerprint: dataset.sourceFingerprint };
    const result = runDailyBacktest({ bars, rules: rulesSchema.parse(preset.rulesJson) as ConditionRule[], minScore: input.minScore, holdingDays: input.holdingBars, feeRate: input.feeRate + input.slippageBps / 10_000, entryDelayDays: 1, entryTiming: "open", conditionContextAtIndex });
    const [stored] = await db.insert(sharedDatasetBacktests).values({ userId: ctx.user.id, datasetId: dataset.id, presetId: preset.id, timeframe: input.timeframe, symbol: input.symbol, assumptionsJson: assumptions, resultsJson: result }).returning();
    return { backtestId: stored.id, datasetId: dataset.id, datasetVersionKey: dataset.versionKey, sourceFingerprint: dataset.sourceFingerprint, symbol: input.symbol, timeframe: input.timeframe, assumptions, result };
  }),

  runMultiDatasetBacktest: protectedProcedure.input(z.object({ datasetIds: z.array(z.number().int().positive()).min(2).max(12), presetId: z.number().int().positive(), timeframe: z.enum(["daily", "five_minute"]), minScore: z.number().min(0).max(100).default(70), holdingBars: z.number().int().min(1).max(120).default(5), feeRate: z.number().min(0).max(0.1).default(0.0003), slippageBps: z.number().min(0).max(10_000).default(8) })).mutation(async ({ ctx, input }) => {
    const ids = Array.from(new Set(input.datasetIds));
    if (ids.length !== input.datasetIds.length) throw new TRPCError({ code: "BAD_REQUEST", message: "비교할 데이터셋은 중복 없이 선택하세요." });
    const db = await requireDb();
    const preset = (await db.select().from(strategyPresets).where(and(eq(strategyPresets.id, input.presetId), eq(strategyPresets.userId, ctx.user.id))).limit(1))[0];
    if (!preset) throw new TRPCError({ code: "NOT_FOUND", message: "내 조건식 카드만 여러 공용 데이터셋에서 비교할 수 있습니다." });
    const datasets = await db.select().from(researchDatasets).where(and(inArray(researchDatasets.id, ids), eq(researchDatasets.visibility, "shared_public"), eq(researchDatasets.qualityStatus, "ready")));
    if (datasets.length !== ids.length) throw new TRPCError({ code: "NOT_FOUND", message: "선택한 공용 데이터셋 중 준비되지 않았거나 접근할 수 없는 항목이 있습니다." });
    const rules = rulesSchema.parse(preset.rulesJson) as ConditionRule[];
    const summaries = [] as Array<{ datasetId: number; datasetName: string; datasetVersionKey: string; sourceFingerprint: string | null; timeframe: "daily" | "five_minute"; evaluatedSymbolCount: number; skippedSymbols: string[]; averageReturn: number | null; averageWinRate: number | null; totalTradeCount: number; worstDrawdown: number | null; strategySnapshot: { name: string; rulesJson: ConditionRule[]; scoringJson: unknown }; symbolResults: Array<{ symbol: string; totalReturn: number; winRate: number; tradeCount: number; maxDrawdown: number; tradeSamples: Array<{ entryDate: string; exitDate: string; entryPrice: number; exitPrice: number; returnPercent: number }> }> }>;
    for (const dataset of datasets.sort((left, right) => ids.indexOf(left.id) - ids.indexOf(right.id))) {
      const universe = Array.isArray(dataset.universeJson) ? dataset.universeJson.flatMap(item => item && typeof item === "object" && typeof (item as { symbol?: unknown }).symbol === "string" ? [String((item as { symbol: string }).symbol)] : []) : [];
      const symbolResults: Array<{ symbol: string; totalReturn: number; winRate: number; tradeCount: number; maxDrawdown: number; tradeSamples: Array<{ entryDate: string; exitDate: string; entryPrice: number; exitPrice: number; returnPercent: number }> }> = [];
      const skippedSymbols: string[] = [];
      for (const symbol of universe) {
        const rows = input.timeframe === "daily"
          ? await db.select().from(researchDailyBars).where(and(eq(researchDailyBars.datasetId, dataset.id), eq(researchDailyBars.symbol, symbol))).orderBy(asc(researchDailyBars.date))
          : await db.select().from(researchFiveMinuteBars).where(and(eq(researchFiveMinuteBars.datasetId, dataset.id), eq(researchFiveMinuteBars.symbol, symbol))).orderBy(asc(researchFiveMinuteBars.intervalAt));
        const dailyContextRows = input.timeframe === "five_minute"
          ? await db.select().from(researchDailyBars).where(and(eq(researchDailyBars.datasetId, dataset.id), eq(researchDailyBars.symbol, symbol))).orderBy(asc(researchDailyBars.date))
          : [];
        const bars = input.timeframe === "daily"
          ? (rows as Array<typeof researchDailyBars.$inferSelect>).map(row => ({ date: row.date, open: row.open, high: row.high, low: row.low, close: row.close, volume: Number(row.volume), turnover: Number(row.turnover) }))
          : (rows as Array<typeof researchFiveMinuteBars.$inferSelect>).map(row => ({ date: row.intervalAt.toISOString(), open: row.open, high: row.high, low: row.low, close: row.close, volume: Number(row.volume), turnover: Number(row.close) * Number(row.volume) }));
        if (bars.length < 60) { skippedSymbols.push(symbol); continue; }
        const dailyContextBars = (dailyContextRows as Array<typeof researchDailyBars.$inferSelect>).map(row => ({ date: row.date, open: row.open, high: row.high, low: row.low, close: row.close, volume: Number(row.volume), turnover: Number(row.turnover) }));
        const conditionContextAtIndex = input.timeframe === "five_minute" ? createFiveMinuteContextProvider(bars, dailyContextBars) : undefined;
        const result = runDailyBacktest({ bars, rules, minScore: input.minScore, holdingDays: input.holdingBars, feeRate: input.feeRate + input.slippageBps / 10_000, entryDelayDays: 1, entryTiming: "open", conditionContextAtIndex });
        symbolResults.push({ symbol, totalReturn: result.totalReturn, winRate: result.winRate, tradeCount: result.tradeCount, maxDrawdown: result.maxDrawdown, tradeSamples: result.trades.slice(-5) });
      }
      const evaluatedSymbolCount = symbolResults.length;
      const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
      const summary = { datasetId: dataset.id, datasetName: dataset.name, datasetVersionKey: dataset.versionKey, sourceFingerprint: dataset.sourceFingerprint, timeframe: input.timeframe, evaluatedSymbolCount, skippedSymbols, averageReturn: average(symbolResults.map(item => item.totalReturn)), averageWinRate: average(symbolResults.map(item => item.winRate)), totalTradeCount: symbolResults.reduce((sum, item) => sum + item.tradeCount, 0), worstDrawdown: symbolResults.length ? Math.min(...symbolResults.map(item => item.maxDrawdown)) : null, strategySnapshot: { name: preset.name, rulesJson: rules, scoringJson: preset.scoringJson ?? null }, symbolResults };
      const assumptions = { comparison: "multi_shared_dataset", timeframe: input.timeframe, minScore: input.minScore, holdingBars: input.holdingBars, feeRate: input.feeRate, slippageBps: input.slippageBps, informationCutoffBars: 1, datasetVersionKey: dataset.versionKey, sourceFingerprint: dataset.sourceFingerprint };
      await db.insert(sharedDatasetBacktests).values({ userId: ctx.user.id, datasetId: dataset.id, presetId: preset.id, timeframe: input.timeframe, symbol: "__MULTI_DATASET__", assumptionsJson: assumptions, resultsJson: summary });
      summaries.push(summary);
    }
    const ranked = [...summaries].sort((left, right) => (right.averageReturn ?? -Infinity) - (left.averageReturn ?? -Infinity));
    return { presetId: preset.id, presetName: preset.name, timeframe: input.timeframe, assumptions: { minScore: input.minScore, holdingBars: input.holdingBars, feeRate: input.feeRate, slippageBps: input.slippageBps, informationCutoffBars: 1 }, ranked, totalDatasetCount: ranked.length };
  }),

  listMyBacktests: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    return db.select().from(sharedDatasetBacktests).where(eq(sharedDatasetBacktests.userId, ctx.user.id)).orderBy(desc(sharedDatasetBacktests.createdAt)).limit(30);
  }),
});
