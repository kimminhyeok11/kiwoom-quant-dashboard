/**
 * 원클릭 백테스트 라우터
 * 
 * 버튼 한 번으로:
 * 1. 랜덤 조건식 생성 (유전자 알고리즘 기반)
 * 2. 누적 데이터에서 랜덤 종목/기간 선택
 * 3. 백테스트 실행 → 수익률/승률/MDD 결과
 * 4. 좋은 결과 채택 → 저장
 * 5. 채택한 조건식 육성 (변형 반복 검증)
 */

import { z } from "zod";
import { and, asc, desc, eq, gte, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { localResearchDailyBars, intradayMinuteBars, strategyPresets } from "../../drizzle/schema";
import { generateUniqueGenomes, mutateGenome, type EvolutionGenerationSpec, type ScoredGenome } from "../quant/evolution";
import { runDailyBacktest, type BacktestResult } from "../quant/backtest";
import type { ConditionExpressionGroup, ConditionRule } from "../../shared/trading";
import { evaluateExpression } from "../quant/conditions";
import type { DailyBar } from "../quant/conditions";

/** 일봉 → 주봉/월봉 변환 */
function aggregateDailyBars(bars: DailyBar[], timeframe: "daily" | "weekly" | "monthly"): DailyBar[] {
  if (timeframe === "daily") return bars;
  const grouped = new Map<string, DailyBar>();
  for (const bar of bars) {
    const d = new Date(bar.date);
    let key: string;
    if (timeframe === "weekly") {
      // ISO week: Monday start
      const dayOfWeek = d.getDay() || 7;
      const monday = new Date(d);
      monday.setDate(d.getDate() - dayOfWeek + 1);
      key = monday.toISOString().slice(0, 10);
    } else {
      // Monthly: first of month
      key = bar.date.slice(0, 7) + "-01";
    }
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, { ...bar, date: key });
    } else {
      existing.high = Math.max(existing.high, bar.high);
      existing.low = Math.min(existing.low, bar.low);
      existing.close = bar.close;
      existing.volume += bar.volume;
      existing.turnover += bar.turnover;
    }
  }
  return Array.from(grouped.values()).sort((a, b) => a.date.localeCompare(b.date));
}

const ALL_RULE_TYPES: ConditionRule["type"][] = [
  "macd_rising", "ma_position", "high_return", "turnover",
  "rsi", "bollinger", "stochastic", "atr_percent",
  "volume_ratio", "close_change", "gap_percent", "intrabar_position",
];

export const oneClickBacktestRouter = router({
  /**
   * 원클릭 실행: 랜덤 조건식 생성 → 랜덤 종목/기간 → 백테스트 → 결과 반환
   */
  run: publicProcedure
    .input(z.object({
      /** 생성할 조건식 수 (기본 10) */
      count: z.number().int().min(1).max(50).default(10),
      /** 규칙 수 범위 */
      minRules: z.number().int().min(2).max(10).default(3),
      maxRules: z.number().int().min(3).max(12).default(6),
      /** 보유 기간 (일) */
      holdingDays: z.number().int().min(1).max(60).default(5),
      /** 수수료율 */
      feeRate: z.number().min(0).max(0.01).default(0.0003),
      /** 슬리피지 */
      slippageBps: z.number().min(0).max(100).default(8),
      /** 최소 점수 */
      minScore: z.number().min(0).max(100).default(50),
      /** 타임프레임 */
      timeframe: z.enum(["daily", "weekly", "monthly"]).default("daily"),
      /** 손절 비율 (%) */
      stopLossPercent: z.number().min(0).max(20).default(3),
      /** 익절 비율 (%) */
      takeProfitPercent: z.number().min(0).max(50).default(5),
    }).optional())
    .mutation(async ({ input }) => {
      const count = input?.count ?? 10;
      const minRules = input?.minRules ?? 3;
      const maxRules = input?.maxRules ?? 6;
      const holdingDays = input?.holdingDays ?? 5;
      const feeRate = (input?.feeRate ?? 0.0003) + (input?.slippageBps ?? 8) / 10000;
      const minScore = input?.minScore ?? 50;
      const stopLossPercent = input?.stopLossPercent ?? 3;
      const takeProfitPercent = input?.takeProfitPercent ?? 5;

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 불가" });

      // 1. 랜덤 종목 선택 (저장된 일봉이 있는 종목들 중)
      const allSymbols = await db
        .selectDistinct({ symbol: localResearchDailyBars.symbol })
        .from(localResearchDailyBars)
        .where(eq(localResearchDailyBars.adjustmentBasis, "adjusted"))
        .limit(100);

      if (!allSymbols.length) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "백테스트할 일봉 데이터가 없습니다. 로컬 수집기로 데이터를 먼저 수집하세요.",
        });
      }

      // 랜덤으로 최대 5종목 선택
      const seed = Date.now();
      const shuffled = allSymbols.sort(() => Math.random() - 0.5);
      const selectedSymbols = shuffled.slice(0, Math.min(5, shuffled.length));

      // 2. 선택된 종목의 일봉 로드
      const barsBySymbol: Record<string, DailyBar[]> = {};
      for (const { symbol } of selectedSymbols) {
        const rows = await db
          .select({
            date: localResearchDailyBars.date,
            open: localResearchDailyBars.open,
            high: localResearchDailyBars.high,
            low: localResearchDailyBars.low,
            close: localResearchDailyBars.close,
            volume: localResearchDailyBars.volume,
            turnover: localResearchDailyBars.turnover,
          })
          .from(localResearchDailyBars)
          .where(and(
            eq(localResearchDailyBars.symbol, symbol),
            eq(localResearchDailyBars.adjustmentBasis, "adjusted"),
          ))
          .orderBy(asc(localResearchDailyBars.date))
          .limit(600);

        if (rows.length >= 60) {
          barsBySymbol[symbol] = rows.map(r => ({
            date: r.date,
            open: r.open,
            high: r.high,
            low: r.low,
            close: r.close,
            volume: Number(r.volume),
            turnover: Number(r.turnover),
          }));
        }
      }

      const eligibleSymbols = Object.keys(barsBySymbol);
      if (!eligibleSymbols.length) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "60개 이상의 일봉이 있는 종목이 없습니다. 데이터를 더 수집하세요.",
        });
      }

      // 타임프레임 변환 (주봉/월봉)
      const timeframe = input?.timeframe ?? "daily";
      const minBarsRequired = timeframe === "monthly" ? 12 : timeframe === "weekly" ? 20 : 60;
      const convertedBarsBySymbol: Record<string, DailyBar[]> = {};
      for (const symbol of eligibleSymbols) {
        const converted = aggregateDailyBars(barsBySymbol[symbol], timeframe);
        if (converted.length >= minBarsRequired) {
          convertedBarsBySymbol[symbol] = converted;
        }
      }
      const finalSymbols = Object.keys(convertedBarsBySymbol);
      if (!finalSymbols.length) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `${timeframe === "weekly" ? "주봉" : timeframe === "monthly" ? "월봉" : "일봉"} 기준 충분한 데이터가 있는 종목이 없습니다.`,
        });
      }

      // 3. 랜덤 조건식 생성
      const spec: EvolutionGenerationSpec = {
        seed,
        populationSize: count,
        minRules,
        maxRules,
        maxDepth: 2,
        allowedRuleTypes: ALL_RULE_TYPES,
        requireUniqueRuleTypes: true,
      };
      const genomes = generateUniqueGenomes(spec);

      // 4. 각 조건식으로 멀티 심볼 백테스트
      const results: Array<{
        genome: typeof genomes[0];
        symbolResults: Array<{
          symbol: string;
          result: BacktestResult;
        }>;
        averageReturn: number;
        averageWinRate: number;
        totalTrades: number;
        worstDrawdown: number;
        fitnessScore: number;
      }> = [];

      for (const genome of genomes) {
        const symbolResults: Array<{ symbol: string; result: BacktestResult }> = [];

        for (const symbol of finalSymbols) {
          const bars = convertedBarsBySymbol[symbol];
          // 랜덤 기간 선택
          const minBars = minBarsRequired;
          const maxStart = Math.max(0, bars.length - minBars);
          const startIndex = Math.floor(Math.random() * maxStart);
          const slicedBars = bars.slice(startIndex);

          const result = runDailyBacktest({
            bars: slicedBars,
            expression: genome.root as unknown as ConditionExpressionGroup,
            minScore,
            holdingDays,
            feeRate,
            entryDelayDays: 1,
            entryTiming: "open",
            maxOpenGapPercent: 3,
            stopLossPercent,
            takeProfitPercent,
          });

          symbolResults.push({ symbol, result });
        }

        const returns = symbolResults.map(r => r.result.totalReturn);
        const winRates = symbolResults.map(r => r.result.winRate);
        const avgReturn = returns.reduce((s, v) => s + v, 0) / returns.length;
        const avgWinRate = winRates.reduce((s, v) => s + v, 0) / winRates.length;
        const totalTrades = symbolResults.reduce((s, r) => s + r.result.tradeCount, 0);
        const worstDrawdown = Math.min(...symbolResults.map(r => r.result.maxDrawdown));

        // 적합도 점수
        const tradePenalty = Math.max(0, 5 - totalTrades) * 10;
        const fitnessScore = avgReturn + avgWinRate * 0.05 - Math.abs(worstDrawdown) * 0.3 - tradePenalty;

        results.push({
          genome,
          symbolResults,
          averageReturn: avgReturn,
          averageWinRate: avgWinRate,
          totalTrades,
          worstDrawdown,
          fitnessScore,
        });
      }

      // 5. 적합도 순 정렬
      results.sort((a, b) => b.fitnessScore - a.fitnessScore);

      return {
        timestamp: new Date().toISOString(),
        config: { count, minRules, maxRules, holdingDays, feeRate, minScore, stopLossPercent, takeProfitPercent },
        symbols: finalSymbols,
        reproducibility: {
          seed,
          engineVersion: "1.0",
          datasetSymbols: finalSymbols,
          datasetBarCounts: Object.fromEntries(finalSymbols.map(s => [s, convertedBarsBySymbol[s].length])),
          timeframe,
        },
        results: results.map((r, rank) => ({
          rank: rank + 1,
          fingerprint: r.genome.fingerprint,
          root: r.genome.root,
          minimumScore: r.genome.minimumScore,
          averageReturn: Number(r.averageReturn.toFixed(2)),
          averageWinRate: Number(r.averageWinRate.toFixed(1)),
          totalTrades: r.totalTrades,
          worstDrawdown: Number(r.worstDrawdown.toFixed(2)),
          fitnessScore: Number(r.fitnessScore.toFixed(3)),
          robustnessScore: Number((
            (r.averageWinRate >= 50 ? 20 : r.averageWinRate * 0.4) +
            (r.totalTrades >= 10 ? 15 : r.totalTrades * 1.5) +
            (Math.abs(r.worstDrawdown) <= 10 ? 20 : Math.max(0, 20 - Math.abs(r.worstDrawdown))) +
            (r.averageReturn > 0 ? Math.min(25, r.averageReturn * 2) : 0) +
            (r.fitnessScore > 0 ? Math.min(20, r.fitnessScore * 2) : 0)
          ).toFixed(1)),
          symbolResults: r.symbolResults.map(sr => ({
            symbol: sr.symbol,
            totalReturn: Number(sr.result.totalReturn.toFixed(2)),
            winRate: Number(sr.result.winRate.toFixed(1)),
            tradeCount: sr.result.tradeCount,
            maxDrawdown: Number(sr.result.maxDrawdown.toFixed(2)),
            stopLossCount: sr.result.stopLossCount,
            takeProfitCount: sr.result.takeProfitCount,
            timeExitCount: sr.result.timeExitCount,
            avgHoldingDays: Number(sr.result.avgHoldingDays.toFixed(1)),
            trades: sr.result.trades.slice(-10), // 최근 10건만
            equityCurve: sr.result.trades.reduce<Array<{ date: string; equity: number }>>((curve, t, i) => {
              const prevEquity = i === 0 ? 100 : curve[i - 1].equity;
              curve.push({ date: t.exitDate, equity: Number((prevEquity * (1 + t.returnPercent / 100)).toFixed(2)) });
              return curve;
            }, []),
          })),
        })),
      };
    }),

  /**
   * 조건식 채택: 좋은 결과의 조건식을 저장
   */
  adopt: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(100),
      root: z.any(), // EvolutionGroup JSON
      minimumScore: z.number().int().min(1).max(100),
      fingerprint: z.string().min(1),
      backtestSummary: z.object({
        averageReturn: z.number(),
        averageWinRate: z.number(),
        totalTrades: z.number(),
        worstDrawdown: z.number(),
        fitnessScore: z.number(),
      }),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 불가" });

      // 조건식을 strategyPresets에 저장
      const rulesJson = extractRulesFromRoot(input.root);
      const [saved] = await db.insert(strategyPresets).values({
        userId: ctx.user.id,
        name: input.name,
        rulesJson,
        scoringJson: { minimumScore: input.minimumScore, fingerprint: input.fingerprint, adoptedAt: new Date().toISOString(), backtestSummary: input.backtestSummary },
      }).returning();

      return { presetId: saved.id, name: saved.name, fingerprint: input.fingerprint };
    }),

  /**
   * 조건식 육성: 채택된 조건식의 파라미터를 변형해서 재검증
   */
  evolve: publicProcedure
    .input(z.object({
      /** 부모 조건식의 root genome */
      parentRoot: z.any(),
      parentMinimumScore: z.number().int().min(1).max(100),
      /** 변형 수 */
      mutationCount: z.number().int().min(1).max(20).default(8),
      /** 백테스트 설정 */
      holdingDays: z.number().int().min(1).max(60).default(5),
      feeRate: z.number().min(0).max(0.01).default(0.0003),
      slippageBps: z.number().min(0).max(100).default(8),
      minScore: z.number().min(0).max(100).default(50),
      stopLossPercent: z.number().min(0).max(20).default(3),
      takeProfitPercent: z.number().min(0).max(50).default(5),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 불가" });

      const feeRate = input.feeRate + input.slippageBps / 10000;

      // 종목 데이터 로드
      const allSymbols = await db
        .selectDistinct({ symbol: localResearchDailyBars.symbol })
        .from(localResearchDailyBars)
        .where(eq(localResearchDailyBars.adjustmentBasis, "adjusted"))
        .limit(100);

      const shuffled = allSymbols.sort(() => Math.random() - 0.5).slice(0, 5);
      const barsBySymbol: Record<string, DailyBar[]> = {};
      for (const { symbol } of shuffled) {
        const rows = await db
          .select({
            date: localResearchDailyBars.date, open: localResearchDailyBars.open,
            high: localResearchDailyBars.high, low: localResearchDailyBars.low,
            close: localResearchDailyBars.close, volume: localResearchDailyBars.volume,
            turnover: localResearchDailyBars.turnover,
          })
          .from(localResearchDailyBars)
          .where(and(eq(localResearchDailyBars.symbol, symbol), eq(localResearchDailyBars.adjustmentBasis, "adjusted")))
          .orderBy(asc(localResearchDailyBars.date)).limit(600);
        if (rows.length >= 60) {
          barsBySymbol[symbol] = rows.map(r => ({ ...r, volume: Number(r.volume), turnover: Number(r.turnover) }));
        }
      }

      const eligibleSymbols = Object.keys(barsBySymbol);
      if (!eligibleSymbols.length) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "백테스트할 데이터가 부족합니다." });
      }

      // 부모를 ScoredGenome 형태로 만들기
      const { fingerprintGenome } = await import("../quant/evolution");
      const parentFingerprint = fingerprintGenome(input.parentRoot, input.parentMinimumScore);
      const parent: ScoredGenome = {
        root: input.parentRoot,
        minimumScore: input.parentMinimumScore,
        fingerprint: parentFingerprint,
        candidateId: 0,
        metrics: { totalReturn: 0, maxDrawdown: 0, tradeCount: 0, winRate: 0 },
        fitnessScore: 0,
      };

      // 변형 생성
      const seed = Date.now();
      const mutations: Array<{ genome: ReturnType<typeof mutateGenome>; symbolResults: Array<{ symbol: string; result: BacktestResult }>; fitnessScore: number; averageReturn: number; averageWinRate: number; totalTrades: number; worstDrawdown: number }> = [];

      for (let i = 0; i < input.mutationCount; i++) {
        const mutated = mutateGenome(parent, () => Math.random(), i);

        const symbolResults: Array<{ symbol: string; result: BacktestResult }> = [];
        for (const symbol of eligibleSymbols) {
          const bars = barsBySymbol[symbol];
          const result = runDailyBacktest({
            bars,
            expression: mutated.root as unknown as ConditionExpressionGroup,
            minScore: input.minScore,
            holdingDays: input.holdingDays,
            feeRate,
            entryDelayDays: 1,
            entryTiming: "open",
            maxOpenGapPercent: 3,
            stopLossPercent: input.stopLossPercent,
            takeProfitPercent: input.takeProfitPercent,
          });
          symbolResults.push({ symbol, result });
        }

        const returns = symbolResults.map(r => r.result.totalReturn);
        const avgReturn = returns.reduce((s, v) => s + v, 0) / returns.length;
        const avgWinRate = symbolResults.reduce((s, r) => s + r.result.winRate, 0) / symbolResults.length;
        const totalTrades = symbolResults.reduce((s, r) => s + r.result.tradeCount, 0);
        const worstDrawdown = Math.min(...symbolResults.map(r => r.result.maxDrawdown));
        const fitnessScore = avgReturn + avgWinRate * 0.05 - Math.abs(worstDrawdown) * 0.3;

        mutations.push({ genome: mutated, symbolResults, fitnessScore, averageReturn: avgReturn, averageWinRate: avgWinRate, totalTrades, worstDrawdown });
      }

      // 부모도 같은 종목/기간으로 테스트
      const parentResults: Array<{ symbol: string; result: BacktestResult }> = [];
      for (const symbol of eligibleSymbols) {
        const bars = barsBySymbol[symbol];
        const result = runDailyBacktest({ bars, expression: input.parentRoot as unknown as ConditionExpressionGroup, minScore: input.minScore, holdingDays: input.holdingDays, feeRate, entryDelayDays: 1, entryTiming: "open", maxOpenGapPercent: 3, stopLossPercent: input.stopLossPercent, takeProfitPercent: input.takeProfitPercent });
        parentResults.push({ symbol, result });
      }
      const parentAvgReturn = parentResults.reduce((s, r) => s + r.result.totalReturn, 0) / parentResults.length;
      const parentFitness = parentAvgReturn + parentResults.reduce((s, r) => s + r.result.winRate, 0) / parentResults.length * 0.05 - Math.abs(Math.min(...parentResults.map(r => r.result.maxDrawdown))) * 0.3;

      mutations.sort((a, b) => b.fitnessScore - a.fitnessScore);

      return {
        parentPerformance: {
          fingerprint: parentFingerprint,
          averageReturn: Number(parentAvgReturn.toFixed(2)),
          fitnessScore: Number(parentFitness.toFixed(3)),
        },
        symbols: eligibleSymbols,
        mutations: mutations.map((m, rank) => ({
          rank: rank + 1,
          fingerprint: m.genome.fingerprint,
          root: m.genome.root,
          minimumScore: m.genome.minimumScore,
          origin: m.genome.origin,
          mutation: m.genome.mutation,
          averageReturn: Number(m.averageReturn.toFixed(2)),
          averageWinRate: Number(m.averageWinRate.toFixed(1)),
          totalTrades: m.totalTrades,
          worstDrawdown: Number(m.worstDrawdown.toFixed(2)),
          fitnessScore: Number(m.fitnessScore.toFixed(3)),
          improvement: Number((m.fitnessScore - parentFitness).toFixed(3)),
        })),
      };
    }),

  /**
   * 채택된 조건식 목록 조회
   */
  adopted: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 불가" });

    const { users } = await import("../../drizzle/schema");
    const [admin] = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin")).limit(1);
    if (!admin) return [];

    const presets = await db
      .select()
      .from(strategyPresets)
      .where(eq(strategyPresets.userId, admin.id))
      .orderBy(desc(strategyPresets.createdAt))
      .limit(50);

    return presets.map(p => ({
      id: p.id,
      name: p.name,
      rulesJson: p.rulesJson,
      scoringJson: p.scoringJson,
      createdAt: p.createdAt,
    }));
  }),

  /**
   * 랜덤 기간 검증: 동일 전략을 N회 랜덤 기간으로 반복 백테스트
   * 과최적화 방지를 위한 핵심 검증
   */
  randomValidation: publicProcedure
    .input(z.object({
      root: z.unknown(),
      minimumScore: z.number().int().min(0).max(200),
      iterations: z.number().int().min(10).max(500).default(50),
      holdingDays: z.number().int().min(1).max(60).default(5),
      stopLossPercent: z.number().min(0).max(20).default(3),
      takeProfitPercent: z.number().min(0).max(50).default(5),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 불가" });

      const feeRate = 0.0003 + 8 / 10000; // 수수료 + 슬리피지

      // 종목 로드
      const allSymbols = await db.selectDistinct({ symbol: localResearchDailyBars.symbol })
        .from(localResearchDailyBars).where(eq(localResearchDailyBars.adjustmentBasis, "adjusted")).limit(50);
      if (!allSymbols.length) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "일봉 데이터가 없습니다." });

      const barsBySymbol: Record<string, DailyBar[]> = {};
      for (const { symbol } of allSymbols.slice(0, 10)) {
        const rows = await db.select({ date: localResearchDailyBars.date, open: localResearchDailyBars.open, high: localResearchDailyBars.high, low: localResearchDailyBars.low, close: localResearchDailyBars.close, volume: localResearchDailyBars.volume, turnover: localResearchDailyBars.turnover })
          .from(localResearchDailyBars).where(and(eq(localResearchDailyBars.symbol, symbol), eq(localResearchDailyBars.adjustmentBasis, "adjusted")))
          .orderBy(asc(localResearchDailyBars.date)).limit(600);
        if (rows.length >= 60) barsBySymbol[symbol] = rows.map(r => ({ date: r.date, open: r.open, high: r.high, low: r.low, close: r.close, volume: Number(r.volume), turnover: Number(r.turnover) }));
      }

      const symbols = Object.keys(barsBySymbol);
      if (!symbols.length) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "60봉 이상 데이터가 있는 종목이 없습니다." });

      // N회 랜덤 기간 백테스트
      const iterationResults: Array<{ iteration: number; avgReturn: number; winRate: number; tradeCount: number; maxDrawdown: number }> = [];

      for (let i = 0; i < input.iterations; i++) {
        const symbol = symbols[i % symbols.length];
        const bars = barsBySymbol[symbol];
        const minBars = 60;
        const maxStart = Math.max(0, bars.length - minBars);
        const startIndex = Math.floor(Math.random() * maxStart);
        const endIndex = Math.min(bars.length, startIndex + minBars + Math.floor(Math.random() * (bars.length - startIndex - minBars)));
        const slicedBars = bars.slice(startIndex, endIndex);

        if (slicedBars.length < 30) continue;

        const result = runDailyBacktest({
          bars: slicedBars,
          expression: input.root as ConditionExpressionGroup,
          minScore: input.minimumScore,
          holdingDays: input.holdingDays,
          feeRate,
          entryDelayDays: 1,
          entryTiming: "open",
          maxOpenGapPercent: 3,
          stopLossPercent: input.stopLossPercent,
          takeProfitPercent: input.takeProfitPercent,
        });

        iterationResults.push({
          iteration: i + 1,
          avgReturn: Number(result.totalReturn.toFixed(2)),
          winRate: Number(result.winRate.toFixed(1)),
          tradeCount: result.tradeCount,
          maxDrawdown: Number(result.maxDrawdown.toFixed(2)),
        });
      }

      // 통계 계산
      const returns = iterationResults.map(r => r.avgReturn);
      const drawdowns = iterationResults.map(r => r.maxDrawdown);
      const winRates = iterationResults.map(r => r.winRate);
      const trades = iterationResults.map(r => r.tradeCount);

      const mean = (arr: number[]) => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
      const sorted = [...returns].sort((a, b) => a - b);
      const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
      const stdDev = Math.sqrt(mean(returns.map(r => (r - mean(returns)) ** 2)));
      const positiveRate = returns.filter(r => r > 0).length / Math.max(1, returns.length) * 100;

      return {
        iterations: iterationResults.length,
        symbols: symbols.length,
        statistics: {
          meanReturn: Number(mean(returns).toFixed(2)),
          medianReturn: Number(median.toFixed(2)),
          stdDevReturn: Number(stdDev.toFixed(2)),
          bestReturn: Number(Math.max(...returns).toFixed(2)),
          worstReturn: Number(Math.min(...returns).toFixed(2)),
          positiveRate: Number(positiveRate.toFixed(1)),
          meanWinRate: Number(mean(winRates).toFixed(1)),
          meanDrawdown: Number(mean(drawdowns).toFixed(2)),
          worstDrawdown: Number(Math.min(...drawdowns).toFixed(2)),
          meanTrades: Number(mean(trades).toFixed(1)),
          totalTrades: trades.reduce((s, v) => s + v, 0),
        },
        distribution: {
          returns: iterationResults.map(r => r.avgReturn),
          drawdowns: iterationResults.map(r => r.maxDrawdown),
        },
      };
    }),

  /**
   * 데이터 품질 검사 — OHLC 논리 오류, 누락, 비정상 데이터 탐지
   */
  dataQuality: publicProcedure
    .input(z.object({ symbol: z.string().regex(/^\d{6}$/) }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 불가" });

      const conditions = [eq(localResearchDailyBars.adjustmentBasis, "adjusted")];
      if (input?.symbol) conditions.push(eq(localResearchDailyBars.symbol, input.symbol));

      const rows = await db.select({
        symbol: localResearchDailyBars.symbol,
        date: localResearchDailyBars.date,
        open: localResearchDailyBars.open,
        high: localResearchDailyBars.high,
        low: localResearchDailyBars.low,
        close: localResearchDailyBars.close,
        volume: localResearchDailyBars.volume,
      }).from(localResearchDailyBars).where(and(...conditions)).orderBy(asc(localResearchDailyBars.date)).limit(5000);

      const issues: Array<{ symbol: string; date: string; type: string; detail: string }> = [];
      let totalBars = rows.length;
      let checkedSymbols = 0;

      const bySymbol = new Map<string, typeof rows>();
      for (const r of rows) { const list = bySymbol.get(r.symbol) ?? []; list.push(r); bySymbol.set(r.symbol, list); }

      for (const [symbol, bars] of Array.from(bySymbol.entries())) {
        checkedSymbols++;
        for (let i = 0; i < bars.length; i++) {
          const b = bars[i];
          // OHLC 논리 검사
          if (b.high < b.low) issues.push({ symbol, date: b.date, type: "OHLC_LOGIC", detail: `고가(${b.high}) < 저가(${b.low})` });
          if (b.close > b.high || b.close < b.low) issues.push({ symbol, date: b.date, type: "CLOSE_RANGE", detail: `종가(${b.close})가 고저 범위 밖` });
          if (b.open > b.high || b.open < b.low) issues.push({ symbol, date: b.date, type: "OPEN_RANGE", detail: `시가(${b.open})가 고저 범위 밖` });
          if (b.open <= 0 || b.close <= 0) issues.push({ symbol, date: b.date, type: "ZERO_PRICE", detail: `가격 0 이하` });
          if (Number(b.volume) < 0) issues.push({ symbol, date: b.date, type: "NEGATIVE_VOLUME", detail: `거래량 음수` });
          // 비정상 가격 변동 (전일 대비 ±50%)
          if (i > 0) {
            const prevClose = bars[i - 1].close;
            if (prevClose > 0) {
              const change = Math.abs((b.open - prevClose) / prevClose);
              if (change > 0.5) issues.push({ symbol, date: b.date, type: "EXTREME_GAP", detail: `전일 대비 ${(change * 100).toFixed(1)}% 갭` });
            }
          }
        }
      }

      return {
        totalBars,
        checkedSymbols,
        issueCount: issues.length,
        status: issues.length === 0 ? "clean" : issues.length < 5 ? "warning" : "critical",
        issues: issues.slice(0, 50),
      };
    }),

  /**
   * Monte Carlo 시뮬레이션 — 거래 순서 재배열로 MDD/파산 확률 분석
   */
  monteCarloValidation: publicProcedure
    .input(z.object({
      root: z.unknown(),
      minimumScore: z.number().int().min(0).max(200),
      simulations: z.number().int().min(100).max(2000).default(500),
      holdingDays: z.number().int().min(1).max(60).default(5),
      stopLossPercent: z.number().min(0).max(20).default(3),
      takeProfitPercent: z.number().min(0).max(50).default(5),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 불가" });

      const feeRate = 0.0003 + 8 / 10000;

      // 먼저 원본 백테스트로 거래 목록 확보
      const allSymbols = await db.selectDistinct({ symbol: localResearchDailyBars.symbol })
        .from(localResearchDailyBars).where(eq(localResearchDailyBars.adjustmentBasis, "adjusted")).limit(20);

      const allTrades: Array<{ returnPercent: number }> = [];
      for (const { symbol } of allSymbols.slice(0, 5)) {
        const rows = await db.select({ date: localResearchDailyBars.date, open: localResearchDailyBars.open, high: localResearchDailyBars.high, low: localResearchDailyBars.low, close: localResearchDailyBars.close, volume: localResearchDailyBars.volume, turnover: localResearchDailyBars.turnover })
          .from(localResearchDailyBars).where(and(eq(localResearchDailyBars.symbol, symbol), eq(localResearchDailyBars.adjustmentBasis, "adjusted")))
          .orderBy(asc(localResearchDailyBars.date)).limit(600);
        if (rows.length < 60) continue;
        const bars: DailyBar[] = rows.map(r => ({ date: r.date, open: r.open, high: r.high, low: r.low, close: r.close, volume: Number(r.volume), turnover: Number(r.turnover) }));
        const result = runDailyBacktest({ bars, expression: input.root as ConditionExpressionGroup, minScore: input.minimumScore, holdingDays: input.holdingDays, feeRate, entryDelayDays: 1, entryTiming: "open", maxOpenGapPercent: 3, stopLossPercent: input.stopLossPercent, takeProfitPercent: input.takeProfitPercent });
        for (const t of result.trades) allTrades.push({ returnPercent: t.returnPercent });
      }

      if (allTrades.length < 5) throw new TRPCError({ code: "PRECONDITION_FAILED", message: `Monte Carlo에 필요한 거래가 부족합니다 (${allTrades.length}건). 최소 5건 이상 필요.` });

      // Monte Carlo: 거래 순서를 셔플하여 N회 시뮬레이션
      const simResults: Array<{ finalEquity: number; maxDrawdown: number }> = [];

      for (let sim = 0; sim < input.simulations; sim++) {
        // Fisher-Yates shuffle
        const shuffled = [...allTrades];
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }

        let equity = 100;
        let peak = 100;
        let maxDD = 0;
        for (const t of shuffled) {
          equity *= (1 + t.returnPercent / 100);
          peak = Math.max(peak, equity);
          const dd = (equity - peak) / peak * 100;
          maxDD = Math.min(maxDD, dd);
        }
        simResults.push({ finalEquity: equity, maxDrawdown: maxDD });
      }

      const equities = simResults.map(r => r.finalEquity);
      const drawdowns = simResults.map(r => r.maxDrawdown);
      const sorted = [...equities].sort((a, b) => a - b);

      const mean = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length;
      const bankruptRate = equities.filter(e => e < 50).length / equities.length * 100; // 50% 이상 손실 = 파산

      return {
        originalTrades: allTrades.length,
        simulations: input.simulations,
        statistics: {
          meanFinalEquity: Number(mean(equities).toFixed(2)),
          medianFinalEquity: Number(sorted[Math.floor(sorted.length / 2)].toFixed(2)),
          percentile5: Number(sorted[Math.floor(sorted.length * 0.05)].toFixed(2)),
          percentile95: Number(sorted[Math.floor(sorted.length * 0.95)].toFixed(2)),
          bankruptRate: Number(bankruptRate.toFixed(1)),
          meanMaxDrawdown: Number(mean(drawdowns).toFixed(2)),
          worstMaxDrawdown: Number(Math.min(...drawdowns).toFixed(2)),
        },
        distribution: {
          equities: equities.slice(0, 100).map(e => Number(e.toFixed(1))), // 차트용 100개 샘플
          drawdowns: drawdowns.slice(0, 100).map(d => Number(d.toFixed(1))),
        },
      };
    }),

  /**
   * 전략 상태 변경 (CANDIDATE → TESTING → SURVIVOR → REJECTED → RETIRED)
   */
  updateStrategyStatus: protectedProcedure
    .input(z.object({
      presetId: z.number().int().positive(),
      status: z.enum(["candidate", "testing", "survivor", "rejected", "retired"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 불가" });

      const [preset] = await db.select().from(strategyPresets).where(and(eq(strategyPresets.id, input.presetId), eq(strategyPresets.userId, ctx.user.id))).limit(1);
      if (!preset) throw new TRPCError({ code: "NOT_FOUND", message: "전략을 찾을 수 없습니다." });

      // scoringJson에 lifecycle status 저장
      const currentScoring = (preset.scoringJson ?? {}) as Record<string, unknown>;
      const updatedScoring = { ...currentScoring, lifecycleStatus: input.status, lifecycleUpdatedAt: new Date().toISOString() };
      await db.update(strategyPresets).set({ scoringJson: updatedScoring }).where(eq(strategyPresets.id, input.presetId));

      const labels: Record<string, string> = { candidate: "후보", testing: "검증 중", survivor: "생존", rejected: "탈락", retired: "은퇴" };
      return { id: input.presetId, status: input.status, message: `전략이 "${labels[input.status]}" 상태로 변경되었습니다.` };
    }),
});

/** genome root에서 flat rules 추출 */
function extractRulesFromRoot(root: unknown): unknown[] {
  if (!root || typeof root !== "object") return [];
  const node = root as { children?: unknown[]; type?: string };
  if (node.type && !node.children) return [node]; // leaf rule
  if (Array.isArray(node.children)) {
    return node.children.flatMap(child => extractRulesFromRoot(child));
  }
  return [];
}
