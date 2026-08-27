/**
 * 분봉 백테스트 라우터 (데이트레이딩/스윙)
 *
 * 1분봉 원본 → N분봉(3/5/10/15/30/60분) 변환 → 조건식 백테스트
 * - 특정 날짜 시뮬레이션 ("오늘 돌렸다면?")
 * - 다중 날짜 백테스트 (기간 지정)
 * - 랜덤 조건식 생성 + 분봉 백테스트
 */

import { z } from "zod";
import { and, asc, desc, eq, gte, lte, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { publicProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { intradayMinuteBars, localResearchDailyBars } from "../../drizzle/schema";
import { runIntradayBacktest, type IntradayBacktestResult } from "../quant/backtest";
import { generateUniqueGenomes, type EvolutionGenerationSpec } from "../quant/evolution";
import type { ConditionExpressionGroup, ConditionRule } from "../../shared/trading";
import type { DailyBar } from "../quant/conditions";

const ALL_RULE_TYPES: ConditionRule["type"][] = [
  "macd_rising", "ma_position", "high_return", "turnover",
  "rsi", "bollinger", "stochastic", "atr_percent",
  "volume_ratio", "close_change", "gap_percent", "intrabar_position",
];

export const intradayBacktestRouter = router({
  /**
   * 사용 가능한 분봉 데이터 목록 (날짜별 종목)
   */
  availableDates: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 불가" });

    const dates = await db
      .selectDistinct({ tradingDate: intradayMinuteBars.tradingDate, symbol: intradayMinuteBars.symbol })
      .from(intradayMinuteBars)
      .orderBy(desc(intradayMinuteBars.tradingDate))
      .limit(200);

    // Group by date
    const byDate: Record<string, string[]> = {};
    for (const row of dates) {
      if (!byDate[row.tradingDate]) byDate[row.tradingDate] = [];
      byDate[row.tradingDate].push(row.symbol);
    }

    return Object.entries(byDate)
      .map(([date, symbols]) => ({ date, symbols, symbolCount: symbols.length }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }),

  /**
   * 원클릭 분봉 백테스트: 랜덤 조건식 × 분봉 데이터
   */
  run: publicProcedure
    .input(z.object({
      /** 조건식 수 */
      count: z.number().int().min(1).max(50).default(10),
      /** 분봉 타임프레임 (분 단위) */
      intervalMinutes: z.enum(["1", "3", "5", "10", "15", "30", "60"]).default("5"),
      /** 보유 봉 수 */
      holdingBars: z.number().int().min(1).max(120).default(6),
      /** 수수료율 */
      feeRate: z.number().min(0).max(0.01).default(0.0003),
      /** 슬리피지 */
      slippageBps: z.number().min(0).max(100).default(10),
      /** 최소 점수 */
      minScore: z.number().min(0).max(100).default(50),
      /** 규칙 수 범위 */
      minRules: z.number().int().min(2).max(10).default(3),
      maxRules: z.number().int().min(3).max(12).default(6),
      /** 특정 날짜만 (없으면 전체) */
      tradingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      /** 당일 청산 */
      forceDayClose: z.boolean().default(true),
      /** 청산 전략 */
      exitStrategy: z.object({
        mode: z.enum(["time", "fixed", "trailing"]),
        stopLossPercent: z.number().optional(),
        takeProfitPercent: z.number().optional(),
        trailingStopPercent: z.number().optional(),
      }).optional(),
    }).optional())
    .mutation(async ({ input }) => {
      const count = input?.count ?? 10;
      const intervalMinutes = parseInt(input?.intervalMinutes ?? "5");
      const holdingBars = input?.holdingBars ?? 6;
      const feeRate = (input?.feeRate ?? 0.0003) + (input?.slippageBps ?? 10) / 10000;
      const minScore = input?.minScore ?? 50;
      const forceDayClose = input?.forceDayClose ?? true;

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 불가" });

      // 분봉 데이터 로드
      let minuteQuery = db.select({
        tradingDate: intradayMinuteBars.tradingDate,
        symbol: intradayMinuteBars.symbol,
        minuteAt: intradayMinuteBars.minuteAt,
        open: intradayMinuteBars.open,
        high: intradayMinuteBars.high,
        low: intradayMinuteBars.low,
        close: intradayMinuteBars.close,
        volume: intradayMinuteBars.volume,
      }).from(intradayMinuteBars);

      // 날짜 필터
      if (input?.tradingDate) {
        minuteQuery = minuteQuery.where(eq(intradayMinuteBars.tradingDate, input.tradingDate)) as typeof minuteQuery;
      }

      const rawBars = await minuteQuery.orderBy(asc(intradayMinuteBars.minuteAt)).limit(50_000);

      if (!rawBars.length) {
        // Fallback: 일봉 데이터를 가상 분봉으로 변환 (일봉 내 등분)
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "분봉 데이터가 없습니다. 장 시간에 `node collector.mjs --mode=minute`를 실행하거나, 분봉 백필을 요청하세요.",
        });
      }

      // 종목별로 그룹화
      const barsBySymbol: Record<string, DailyBar[]> = {};
      for (const row of rawBars) {
        if (!barsBySymbol[row.symbol]) barsBySymbol[row.symbol] = [];
        barsBySymbol[row.symbol].push({
          date: row.minuteAt.toISOString(),
          open: row.open,
          high: row.high,
          low: row.low,
          close: row.close,
          volume: Number(row.volume),
          turnover: Number(row.volume) * row.close, // 근사치
        });
      }

      const symbols = Object.keys(barsBySymbol);
      if (!symbols.length) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "분봉 데이터가 있는 종목이 없습니다." });
      }

      // 일봉 데이터 로드 (상위 시간축 컨텍스트)
      const dailyBarsBySymbol: Record<string, DailyBar[]> = {};
      for (const symbol of symbols) {
        const rows = await db.select({
          date: localResearchDailyBars.date,
          open: localResearchDailyBars.open,
          high: localResearchDailyBars.high,
          low: localResearchDailyBars.low,
          close: localResearchDailyBars.close,
          volume: localResearchDailyBars.volume,
          turnover: localResearchDailyBars.turnover,
        }).from(localResearchDailyBars)
          .where(and(eq(localResearchDailyBars.symbol, symbol), eq(localResearchDailyBars.adjustmentBasis, "adjusted")))
          .orderBy(asc(localResearchDailyBars.date))
          .limit(120);

        dailyBarsBySymbol[symbol] = rows.map(r => ({ ...r, volume: Number(r.volume), turnover: Number(r.turnover) }));
      }

      // 랜덤 조건식 생성
      const spec: EvolutionGenerationSpec = {
        seed: Date.now(),
        populationSize: count,
        minRules: input?.minRules ?? 3,
        maxRules: input?.maxRules ?? 6,
        maxDepth: 2,
        allowedRuleTypes: ALL_RULE_TYPES,
        requireUniqueRuleTypes: true,
      };
      const genomes = generateUniqueGenomes(spec);

      // 각 조건식으로 멀티 심볼 백테스트
      type SymbolResult = { symbol: string; result: IntradayBacktestResult };
      const results: Array<{
        genome: typeof genomes[0];
        symbolResults: SymbolResult[];
        avgReturn: number;
        avgWinRate: number;
        totalTrades: number;
        worstDrawdown: number;
        avgHoldingMinutes: number;
        fitnessScore: number;
      }> = [];

      for (const genome of genomes) {
        const symbolResults: SymbolResult[] = [];

        for (const symbol of symbols.slice(0, 5)) { // Max 5 symbols per backtest
          const result = runIntradayBacktest({
            minuteBars: barsBySymbol[symbol],
            intervalMinutes,
            expression: genome.root as unknown as ConditionExpressionGroup,
            minScore,
            holdingBars,
            feeRate,
            entryTiming: "close",
            allowOvernight: !forceDayClose,
            dailyBars: dailyBarsBySymbol[symbol] ?? [],
            exitStrategy: input?.exitStrategy,
          });
          symbolResults.push({ symbol, result });
        }

        const totalTrades = symbolResults.reduce((s, r) => s + r.result.tradeCount, 0);
        const avgReturn = symbolResults.length
          ? symbolResults.reduce((s, r) => s + r.result.totalReturn, 0) / symbolResults.length
          : 0;
        const avgWinRate = symbolResults.length
          ? symbolResults.reduce((s, r) => s + r.result.winRate, 0) / symbolResults.length
          : 0;
        const worstDrawdown = Math.min(...symbolResults.map(r => r.result.maxDrawdown), 0);
        const avgHolding = symbolResults.length
          ? symbolResults.reduce((s, r) => s + r.result.avgHoldingMinutes, 0) / symbolResults.length
          : 0;

        // Fitness: return weight 40% + winRate weight 30% + trade freq 20% + low MDD 10%
        const fitnessScore = avgReturn * 0.4 + avgWinRate * 0.3 + Math.min(totalTrades, 50) * 0.2 + (100 + worstDrawdown) * 0.1 - 50;

        results.push({ genome, symbolResults, avgReturn, avgWinRate, totalTrades, worstDrawdown, avgHoldingMinutes: avgHolding, fitnessScore });
      }

      // Sort by fitness
      results.sort((a, b) => b.fitnessScore - a.fitnessScore);

      return {
        timestamp: new Date().toISOString(),
        config: { count, intervalMinutes, holdingBars, feeRate, minScore, forceDayClose },
        symbols: symbols.slice(0, 5),
        tradingDates: Array.from(new Set(rawBars.map(b => b.tradingDate))).sort(),
        totalMinuteBars: rawBars.length,
        results: results.map((r, rank) => ({
          rank: rank + 1,
          fingerprint: r.genome.fingerprint,
          root: r.genome.root,
          minimumScore: r.genome.minimumScore,
          averageReturn: Number(r.avgReturn.toFixed(2)),
          averageWinRate: Number(r.avgWinRate.toFixed(1)),
          totalTrades: r.totalTrades,
          worstDrawdown: Number(r.worstDrawdown.toFixed(1)),
          avgHoldingMinutes: Number(r.avgHoldingMinutes.toFixed(0)),
          fitnessScore: Number(r.fitnessScore.toFixed(2)),
          symbolResults: r.symbolResults.map(sr => ({
            symbol: sr.symbol,
            totalReturn: Number(sr.result.totalReturn.toFixed(2)),
            winRate: Number(sr.result.winRate.toFixed(1)),
            tradeCount: sr.result.tradeCount,
            maxDrawdown: Number(sr.result.maxDrawdown.toFixed(1)),
            avgHoldingMinutes: Number(sr.result.avgHoldingMinutes.toFixed(0)),
            trades: sr.result.trades.slice(-20).map(t => ({
              entryTime: t.entryTime,
              exitTime: t.exitTime,
              entryPrice: t.entryPrice,
              exitPrice: t.exitPrice,
              returnPercent: Number(t.returnPercent.toFixed(2)),
              holdingMinutes: t.holdingMinutes,
            })),
            byDate: sr.result.byDate,
          })),
        })),
      };
    }),

  /**
   * 특정 조건식으로 특정 날짜 시뮬레이션 ("오늘 돌렸다면?")
   */
  simulateDay: publicProcedure
    .input(z.object({
      /** 조건식 root */
      expression: z.any(),
      minimumScore: z.number().default(50),
      /** 시뮬레이션할 날짜 */
      tradingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      /** 종목 (없으면 전체) */
      symbols: z.array(z.string().regex(/^\d{6}$/)).optional(),
      /** 타임프레임 */
      intervalMinutes: z.number().int().min(1).max(60).default(5),
      /** 보유 봉 수 */
      holdingBars: z.number().int().min(1).max(120).default(6),
      /** 수수료 */
      feeRate: z.number().default(0.0003),
      slippageBps: z.number().default(10),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 불가" });

      const feeRate = input.feeRate + input.slippageBps / 10000;

      // 해당 날짜의 분봉 로드
      const whereCondition = input.symbols?.length
        ? and(eq(intradayMinuteBars.tradingDate, input.tradingDate), inArray(intradayMinuteBars.symbol, input.symbols))
        : eq(intradayMinuteBars.tradingDate, input.tradingDate);

      const rawBars = await db.select({
        symbol: intradayMinuteBars.symbol,
        minuteAt: intradayMinuteBars.minuteAt,
        open: intradayMinuteBars.open,
        high: intradayMinuteBars.high,
        low: intradayMinuteBars.low,
        close: intradayMinuteBars.close,
        volume: intradayMinuteBars.volume,
      }).from(intradayMinuteBars)
        .where(whereCondition)
        .orderBy(asc(intradayMinuteBars.minuteAt))
        .limit(20_000);

      if (!rawBars.length) {
        throw new TRPCError({ code: "NOT_FOUND", message: `${input.tradingDate}의 분봉 데이터가 없습니다.` });
      }

      // 종목별 분리
      const barsBySymbol: Record<string, DailyBar[]> = {};
      for (const row of rawBars) {
        if (!barsBySymbol[row.symbol]) barsBySymbol[row.symbol] = [];
        barsBySymbol[row.symbol].push({
          date: row.minuteAt.toISOString(),
          open: row.open, high: row.high, low: row.low, close: row.close,
          volume: Number(row.volume), turnover: Number(row.volume) * row.close,
        });
      }

      const symbols = Object.keys(barsBySymbol);
      const results: Array<{ symbol: string; result: IntradayBacktestResult }> = [];

      for (const symbol of symbols) {
        // 일봉 context
        const dailyRows = await db.select({
          date: localResearchDailyBars.date, open: localResearchDailyBars.open,
          high: localResearchDailyBars.high, low: localResearchDailyBars.low,
          close: localResearchDailyBars.close, volume: localResearchDailyBars.volume,
          turnover: localResearchDailyBars.turnover,
        }).from(localResearchDailyBars)
          .where(and(eq(localResearchDailyBars.symbol, symbol), eq(localResearchDailyBars.adjustmentBasis, "adjusted")))
          .orderBy(asc(localResearchDailyBars.date)).limit(60);

        const dailyBars = dailyRows.map(r => ({ ...r, volume: Number(r.volume), turnover: Number(r.turnover) }));

        const result = runIntradayBacktest({
          minuteBars: barsBySymbol[symbol],
          intervalMinutes: input.intervalMinutes,
          expression: input.expression as ConditionExpressionGroup,
          minScore: input.minimumScore,
          holdingBars: input.holdingBars,
          feeRate,
          entryTiming: "close",
          allowOvernight: false,
          dailyBars,
        });

        results.push({ symbol, result });
      }

      const totalTrades = results.reduce((s, r) => s + r.result.tradeCount, 0);
      const totalReturn = results.length ? results.reduce((s, r) => s + r.result.totalReturn, 0) / results.length : 0;
      const avgWinRate = results.length ? results.reduce((s, r) => s + r.result.winRate, 0) / results.length : 0;

      return {
        tradingDate: input.tradingDate,
        intervalMinutes: input.intervalMinutes,
        holdingBars: input.holdingBars,
        symbols,
        totalTrades,
        averageReturn: Number(totalReturn.toFixed(2)),
        averageWinRate: Number(avgWinRate.toFixed(1)),
        symbolResults: results.map(r => ({
          symbol: r.symbol,
          ...r.result,
          trades: r.result.trades.map(t => ({
            entryTime: t.entryTime,
            exitTime: t.exitTime,
            entryPrice: t.entryPrice,
            exitPrice: t.exitPrice,
            returnPercent: Number(t.returnPercent.toFixed(2)),
            holdingMinutes: t.holdingMinutes,
          })),
        })),
      };
    }),
});
