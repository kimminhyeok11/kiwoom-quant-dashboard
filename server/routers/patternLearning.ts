/**
 * 패턴 학습 라우터
 *
 * 차트 데이터에서 최적 매수점을 역추적하여 공통 조건 패턴을 자동 도출
 */

import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { publicProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { localResearchDailyBars } from "../../drizzle/schema";
import { learnPatternsFromBars, walkForwardValidation } from "../quant/patternLearning";
import type { DailyBar } from "../quant/conditions";

export const patternLearningRouter = router({
  /**
   * 패턴 학습 실행:
   * 선택한 종목의 일봉 데이터에서 최적 매수점 공통 패턴을 찾기
   */
  learn: publicProcedure
    .input(z.object({
      /** 학습할 종목 (빈 배열이면 랜덤 5종목) */
      symbols: z.array(z.string().regex(/^\d{6}$/)).max(10).optional(),
      /** 보유 기간 (봉 수) */
      holdingBars: z.number().int().min(1).max(60).default(5),
      /** 상위 몇 %를 "좋은 진입점"으로 볼 것인가 */
      topPercentile: z.number().min(5).max(50).default(20),
      /** 수수료율 */
      feeRate: z.number().min(0).max(0.01).default(0.001),
    }).optional())
    .mutation(async ({ input }) => {
      const holdingBars = input?.holdingBars ?? 5;
      const topPercentile = input?.topPercentile ?? 20;
      const feeRate = input?.feeRate ?? 0.001;

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 불가" });

      // 종목 선택
      let targetSymbols = input?.symbols ?? [];
      if (!targetSymbols.length) {
        const allSymbols = await db
          .selectDistinct({ symbol: localResearchDailyBars.symbol })
          .from(localResearchDailyBars)
          .where(eq(localResearchDailyBars.adjustmentBasis, "adjusted"))
          .limit(50);
        const shuffled = allSymbols.sort(() => Math.random() - 0.5);
        targetSymbols = shuffled.slice(0, 5).map(s => s.symbol);
      }

      if (!targetSymbols.length) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "학습할 일봉 데이터가 없습니다." });
      }

      // 전 종목 데이터 합쳐서 학습
      const allBars: DailyBar[] = [];
      const symbolBarCounts: Record<string, number> = {};

      for (const symbol of targetSymbols) {
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
          .limit(600);

        const bars: DailyBar[] = rows.map(r => ({ ...r, volume: Number(r.volume), turnover: Number(r.turnover) }));
        if (bars.length >= 100) {
          allBars.push(...bars);
          symbolBarCounts[symbol] = bars.length;
        }
      }

      if (allBars.length < 200) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "학습에 최소 200봉 이상의 데이터가 필요합니다." });
      }

      // 종목별로 개별 학습 후 결과 통합
      const symbolResults: Array<{ symbol: string; barCount: number; result: ReturnType<typeof learnPatternsFromBars> }> = [];

      for (const symbol of targetSymbols) {
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
          .limit(600);

        const bars: DailyBar[] = rows.map(r => ({ ...r, volume: Number(r.volume), turnover: Number(r.turnover) }));
        if (bars.length < 100) continue;

        const result = learnPatternsFromBars({ bars, holdingBars, topPercentile, feeRate });
        symbolResults.push({ symbol, barCount: bars.length, result });
      }

      // 종합 분석: 여러 종목에서 공통으로 나오는 피쳐 중요도
      const combinedImportance = new Map<string, { total: number; count: number; direction: "high" | "low"; label: string }>();
      for (const sr of symbolResults) {
        for (const fi of sr.result.featureImportance) {
          const existing = combinedImportance.get(fi.feature) || { total: 0, count: 0, direction: fi.direction, label: fi.label };
          existing.total += fi.importance;
          existing.count++;
          combinedImportance.set(fi.feature, existing);
        }
      }

      const globalFeatureImportance = Array.from(combinedImportance.entries())
        .map(([feature, stat]) => ({ feature, label: stat.label, importance: stat.total / stat.count, direction: stat.direction, appearsIn: stat.count }))
        .sort((a, b) => b.importance - a.importance);

      // 최고 성과 패턴 (여러 종목 백테스트 평균)
      const bestPatterns = symbolResults
        .flatMap(sr => sr.result.backtestResults.map(br => ({
          ...br,
          symbol: sr.symbol,
          pattern: sr.result.patterns.find(p => p.name === br.patternName),
        })))
        .filter(br => br.result.tradeCount >= 3)
        .sort((a, b) => b.result.winRate - a.result.winRate || (b.result.totalReturn - a.result.totalReturn));

      return {
        config: { holdingBars, topPercentile, feeRate, symbols: targetSymbols },
        totalBars: Object.values(symbolBarCounts).reduce((s, c) => s + c, 0),
        symbolResults: symbolResults.map(sr => ({
          symbol: sr.symbol,
          barCount: sr.barCount,
          topEntryCount: sr.result.topEntryCount,
          avgTopReturn: Number(sr.result.avgTopReturn.toFixed(2)),
          patternCount: sr.result.patterns.length,
          bestBacktest: sr.result.backtestResults[0] ? {
            name: sr.result.backtestResults[0].patternName,
            totalReturn: Number(sr.result.backtestResults[0].result.totalReturn.toFixed(2)),
            winRate: Number(sr.result.backtestResults[0].result.winRate.toFixed(1)),
            tradeCount: sr.result.backtestResults[0].result.tradeCount,
          } : null,
        })),
        globalFeatureImportance: globalFeatureImportance.slice(0, 10),
        bestPatterns: bestPatterns.slice(0, 10).map(bp => ({
          symbol: bp.symbol,
          patternName: bp.patternName,
          expression: bp.pattern?.expression,
          conditions: bp.pattern?.conditions,
          totalReturn: Number(bp.result.totalReturn.toFixed(2)),
          winRate: Number(bp.result.winRate.toFixed(1)),
          tradeCount: bp.result.tradeCount,
          maxDrawdown: Number(bp.result.maxDrawdown.toFixed(1)),
          trades: bp.result.trades.slice(-10),
        })),
      };
    }),

  /**
   * Walk-Forward 검증:
   * 학습 기간에서 패턴을 찾고, 검증 기간에서 실전 성과를 측정
   */
  walkForward: publicProcedure
    .input(z.object({
      symbols: z.array(z.string().regex(/^\d{6}$/)).min(1).max(10).optional(),
      holdingBars: z.number().int().min(1).max(60).default(5),
      trainRatio: z.number().min(0.5).max(0.9).default(0.7),
      topPercentile: z.number().min(5).max(50).default(15),
      feeRate: z.number().min(0).max(0.01).default(0.001),
    }).optional())
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 불가" });

      const holdingBars = input?.holdingBars ?? 5;
      const trainRatio = input?.trainRatio ?? 0.7;

      // 종목 선택
      let targetSymbols = input?.symbols ?? [];
      if (!targetSymbols.length) {
        const allSymbols = await db
          .selectDistinct({ symbol: localResearchDailyBars.symbol })
          .from(localResearchDailyBars)
          .where(eq(localResearchDailyBars.adjustmentBasis, "adjusted"))
          .limit(50);
        targetSymbols = allSymbols.sort(() => Math.random() - 0.5).slice(0, 5).map(s => s.symbol);
      }

      // 종목별 Walk-Forward 실행
      const results: Array<{ symbol: string; barCount: number; result: ReturnType<typeof walkForwardValidation> }> = [];

      for (const symbol of targetSymbols) {
        const rows = await db.select({
          date: localResearchDailyBars.date,
          open: localResearchDailyBars.open, high: localResearchDailyBars.high,
          low: localResearchDailyBars.low, close: localResearchDailyBars.close,
          volume: localResearchDailyBars.volume, turnover: localResearchDailyBars.turnover,
        }).from(localResearchDailyBars)
          .where(and(eq(localResearchDailyBars.symbol, symbol), eq(localResearchDailyBars.adjustmentBasis, "adjusted")))
          .orderBy(asc(localResearchDailyBars.date))
          .limit(1800);

        const bars: DailyBar[] = rows.map(r => ({ ...r, volume: Number(r.volume), turnover: Number(r.turnover) }));
        if (bars.length < 200) continue;

        const result = walkForwardValidation({
          bars,
          config: { trainRatio, holdingBars, topPercentile: input?.topPercentile ?? 15, feeRate: input?.feeRate ?? 0.001 },
        });
        results.push({ symbol, barCount: bars.length, result });
      }

      // 종합
      const avgRobustness = results.length
        ? results.reduce((s, r) => s + r.result.robustness, 0) / results.length
        : 0;

      const allOutOfSample = results.flatMap(r => r.result.outOfSample.map(os => ({ ...os, symbol: r.symbol })));
      const outOfSampleProfitable = allOutOfSample.filter(os => os.totalReturn > 0);

      return {
        config: { holdingBars, trainRatio, symbols: targetSymbols },
        symbolResults: results.map(r => ({
          symbol: r.symbol,
          barCount: r.barCount,
          trainPeriod: r.result.trainPeriod,
          testPeriod: r.result.testPeriod,
          robustness: Number(r.result.robustness.toFixed(1)),
          inSampleTopReturn: Number(r.result.inSample.topEntryAvgReturn.toFixed(2)),
          outOfSample: r.result.outOfSample.map(os => ({
            ...os,
            totalReturn: Number(os.totalReturn.toFixed(2)),
            winRate: Number(os.winRate.toFixed(1)),
            maxDrawdown: Number(os.maxDrawdown.toFixed(1)),
          })),
          topFeatures: r.result.inSample.featureImportance.slice(0, 5).map(f => ({ label: f.label, importance: Number(f.importance.toFixed(3)), direction: f.direction })),
        })),
        summary: {
          avgRobustness: Number(avgRobustness.toFixed(1)),
          totalOutOfSampleTests: allOutOfSample.length,
          profitableInTest: outOfSampleProfitable.length,
          avgTestReturn: allOutOfSample.length ? Number((allOutOfSample.reduce((s, os) => s + os.totalReturn, 0) / allOutOfSample.length).toFixed(2)) : 0,
          avgTestWinRate: allOutOfSample.length ? Number((allOutOfSample.reduce((s, os) => s + os.winRate, 0) / allOutOfSample.length).toFixed(1)) : 0,
          verdict: avgRobustness >= 50 ? "reliable" as const : avgRobustness >= 20 ? "moderate" as const : "overfitted" as const,
        },
      };
    }),
});
