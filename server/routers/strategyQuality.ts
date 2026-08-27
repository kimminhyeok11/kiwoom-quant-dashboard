/**
 * 전략 품질 등급 + 과거 시뮬레이션 (Walk-Forward 검증)
 *
 * - 수집된 전체 일봉 데이터를 시간순으로 분할
 * - 매일 "그날까지의 데이터로 조건 판단 → 다음날 시가 매수 → 보유 → 청산" 시뮬레이션
 * - 결과 기반 A~D 등급 자동 분류
 */

import { z } from "zod";
import { and, asc, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { publicProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { localResearchDailyBars, strategyPresets } from "../../drizzle/schema";
import { runDailyBacktest, type BacktestResult } from "../quant/backtest";
import type { ConditionExpressionGroup, ConditionRule } from "../../shared/trading";
import type { DailyBar } from "../quant/conditions";

// ─── 전략 품질 등급 기준 ──────────────────────────────────────────────────────

type QualityGrade = "A" | "B" | "C" | "D";

interface GradeResult {
  grade: QualityGrade;
  label: string;
  description: string;
  scores: {
    returnScore: number;    // 수익률 점수 (0~25)
    winRateScore: number;   // 승률 점수 (0~25)
    drawdownScore: number;  // 낙폭 점수 (0~25)
    consistencyScore: number; // 일관성 점수 (0~25)
  };
  totalScore: number; // 0~100
}

function gradeStrategy(result: BacktestResult, tradeCountMin = 5): GradeResult {
  // 거래 건수 부족 시 D
  if (result.tradeCount < tradeCountMin) {
    return {
      grade: "D", label: "데이터 부족", description: "거래 건수가 너무 적어 신뢰할 수 없습니다.",
      scores: { returnScore: 0, winRateScore: 0, drawdownScore: 0, consistencyScore: 0 }, totalScore: 0,
    };
  }

  // 수익률 점수 (0~25): 0% 이하 = 0, 10% 이상 = 25
  const returnScore = Math.min(25, Math.max(0, result.totalReturn * 2.5));

  // 승률 점수 (0~25): 40% 이하 = 0, 65% 이상 = 25
  const winRateScore = Math.min(25, Math.max(0, (result.winRate - 40) * 1));

  // 낙폭 점수 (0~25): MDD가 작을수록 좋음. 0% = 25, -20% 이하 = 0
  const drawdownScore = Math.min(25, Math.max(0, 25 + result.maxDrawdown * 1.25));

  // 일관성 점수 (0~25): 손절 비율이 낮을수록 좋음
  const totalExits = (result.stopLossCount || 0) + (result.takeProfitCount || 0) + (result.timeExitCount || 0);
  const stopLossRatio = totalExits > 0 ? (result.stopLossCount || 0) / totalExits : 0;
  const tpRatio = totalExits > 0 ? (result.takeProfitCount || 0) / totalExits : 0;
  // 익절 비율 높을수록 좋고, 손절 비율 낮을수록 좋음
  const consistencyScore = Math.min(25, Math.max(0, tpRatio * 30 + (1 - stopLossRatio) * 10));

  const totalScore = Math.round(returnScore + winRateScore + drawdownScore + consistencyScore);

  let grade: QualityGrade;
  let label: string;
  let description: string;

  if (totalScore >= 70) {
    grade = "A"; label = "우수"; description = "높은 수익률과 안정적인 리스크 관리. 실전 배포 추천.";
  } else if (totalScore >= 50) {
    grade = "B"; label = "양호"; description = "괜찮은 성과이나 개선 여지 있음. 소규모 테스트 후 배포 고려.";
  } else if (totalScore >= 30) {
    grade = "C"; label = "보통"; description = "수익이 불안정하거나 낙폭이 큼. 파라미터 조정 필요.";
  } else {
    grade = "D"; label = "부적합"; description = "실전 투입 시 손실 가능성 높음. 폐기 또는 대폭 수정 필요.";
  }

  return { grade, label, description, scores: { returnScore: Math.round(returnScore), winRateScore: Math.round(winRateScore), drawdownScore: Math.round(drawdownScore), consistencyScore: Math.round(consistencyScore) }, totalScore };
}

// ─── Walk-Forward 시뮬레이션 ──────────────────────────────────────────────────

interface WalkForwardWindow {
  trainStart: string;
  trainEnd: string;
  testStart: string;
  testEnd: string;
  trainResult: { totalReturn: number; winRate: number; tradeCount: number };
  testResult: { totalReturn: number; winRate: number; tradeCount: number; maxDrawdown: number };
  overfitRatio: number; // test/train 수익률 비율 (1에 가까울수록 좋음)
}

// ─── 라우터 ───────────────────────────────────────────────────────────────────

export const strategyQualityRouter = router({
  /**
   * 단일 전략 품질 평가 — 저장된 프리셋의 전체 데이터 백테스트 + 등급 산출
   */
  evaluate: publicProcedure
    .input(z.object({
      presetId: z.number().int().positive(),
      holdingDays: z.number().int().min(1).max(60).default(5),
      stopLossPercent: z.number().min(0).max(20).default(3),
      takeProfitPercent: z.number().min(0).max(50).default(5),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 불가" });

      const [preset] = await db.select().from(strategyPresets).where(eq(strategyPresets.id, input.presetId)).limit(1);
      if (!preset) throw new TRPCError({ code: "NOT_FOUND", message: "프리셋을 찾을 수 없습니다." });

      // 모든 종목의 일봉 로드
      const allSymbols = await db.selectDistinct({ symbol: localResearchDailyBars.symbol })
        .from(localResearchDailyBars)
        .where(eq(localResearchDailyBars.adjustmentBasis, "adjusted"))
        .limit(50);

      if (!allSymbols.length) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "수집된 일봉 데이터가 없습니다." });

      const symbolResults: Array<{ symbol: string; result: BacktestResult; grade: GradeResult }> = [];

      for (const { symbol } of allSymbols.slice(0, 10)) { // 최대 10종목
        const rows = await db.select({
          date: localResearchDailyBars.date, open: localResearchDailyBars.open, high: localResearchDailyBars.high,
          low: localResearchDailyBars.low, close: localResearchDailyBars.close,
          volume: localResearchDailyBars.volume, turnover: localResearchDailyBars.turnover,
        }).from(localResearchDailyBars)
          .where(and(eq(localResearchDailyBars.symbol, symbol), eq(localResearchDailyBars.adjustmentBasis, "adjusted")))
          .orderBy(asc(localResearchDailyBars.date)).limit(600);

        if (rows.length < 60) continue;

        const bars: DailyBar[] = rows.map(r => ({
          date: r.date, open: r.open, high: r.high, low: r.low, close: r.close,
          volume: Number(r.volume), turnover: Number(r.turnover),
        }));

        const rules = preset.rulesJson as ConditionRule[];
        const expression = preset.scoringJson && typeof preset.scoringJson === "object" && "fingerprint" in (preset.scoringJson as Record<string, unknown>)
          ? undefined // expression 기반 프리셋
          : undefined;

        const result = runDailyBacktest({
          bars, rules, minScore: 50, holdingDays: input.holdingDays,
          feeRate: 0.0011, entryDelayDays: 1, entryTiming: "open",
          maxOpenGapPercent: 3, stopLossPercent: input.stopLossPercent, takeProfitPercent: input.takeProfitPercent,
        });

        const grade = gradeStrategy(result);
        symbolResults.push({ symbol, result, grade });
      }

      if (!symbolResults.length) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "백테스트 가능한 종목이 없습니다 (최소 60봉 필요)." });

      // 종합 등급
      const avgReturn = symbolResults.reduce((s, r) => s + r.result.totalReturn, 0) / symbolResults.length;
      const avgWinRate = symbolResults.reduce((s, r) => s + r.result.winRate, 0) / symbolResults.length;
      const totalTrades = symbolResults.reduce((s, r) => s + r.result.tradeCount, 0);
      const worstDrawdown = Math.min(...symbolResults.map(r => r.result.maxDrawdown));

      const combinedResult: BacktestResult = {
        totalReturn: avgReturn, winRate: avgWinRate, tradeCount: totalTrades, maxDrawdown: worstDrawdown,
        trades: [], stopLossCount: symbolResults.reduce((s, r) => s + r.result.stopLossCount, 0),
        takeProfitCount: symbolResults.reduce((s, r) => s + r.result.takeProfitCount, 0),
        timeExitCount: symbolResults.reduce((s, r) => s + r.result.timeExitCount, 0),
        avgHoldingDays: symbolResults.reduce((s, r) => s + r.result.avgHoldingDays, 0) / symbolResults.length,
      };

      const overallGrade = gradeStrategy(combinedResult);

      return {
        presetId: preset.id,
        presetName: preset.name,
        overallGrade,
        symbolCount: symbolResults.length,
        avgReturn: Number(avgReturn.toFixed(2)),
        avgWinRate: Number(avgWinRate.toFixed(1)),
        totalTrades,
        worstDrawdown: Number(worstDrawdown.toFixed(2)),
        stopLossCount: combinedResult.stopLossCount,
        takeProfitCount: combinedResult.takeProfitCount,
        timeExitCount: combinedResult.timeExitCount,
        avgHoldingDays: Number(combinedResult.avgHoldingDays.toFixed(1)),
        symbolResults: symbolResults.map(sr => ({
          symbol: sr.symbol,
          grade: sr.grade.grade,
          totalReturn: Number(sr.result.totalReturn.toFixed(2)),
          winRate: Number(sr.result.winRate.toFixed(1)),
          tradeCount: sr.result.tradeCount,
          maxDrawdown: Number(sr.result.maxDrawdown.toFixed(2)),
        })),
      };
    }),

  /**
   * Walk-Forward 시뮬레이션 — 전체 데이터를 시간 분할하여 과적합 검증
   */
  walkForward: publicProcedure
    .input(z.object({
      presetId: z.number().int().positive(),
      /** 학습 윈도우 크기 (봉 수) */
      trainSize: z.number().int().min(60).max(400).default(200),
      /** 테스트 윈도우 크기 (봉 수) */
      testSize: z.number().int().min(20).max(100).default(50),
      holdingDays: z.number().int().min(1).max(60).default(5),
      stopLossPercent: z.number().min(0).max(20).default(3),
      takeProfitPercent: z.number().min(0).max(50).default(5),
      /** 테스트 종목 (없으면 랜덤 1종목) */
      symbol: z.string().regex(/^\d{6}$/).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 불가" });

      const [preset] = await db.select().from(strategyPresets).where(eq(strategyPresets.id, input.presetId)).limit(1);
      if (!preset) throw new TRPCError({ code: "NOT_FOUND", message: "프리셋을 찾을 수 없습니다." });

      // 종목 선택
      let targetSymbol = input.symbol;
      if (!targetSymbol) {
        const [first] = await db.selectDistinct({ symbol: localResearchDailyBars.symbol })
          .from(localResearchDailyBars)
          .where(eq(localResearchDailyBars.adjustmentBasis, "adjusted"))
          .limit(1);
        if (!first) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "일봉 데이터가 없습니다." });
        targetSymbol = first.symbol;
      }

      const rows = await db.select({
        date: localResearchDailyBars.date, open: localResearchDailyBars.open, high: localResearchDailyBars.high,
        low: localResearchDailyBars.low, close: localResearchDailyBars.close,
        volume: localResearchDailyBars.volume, turnover: localResearchDailyBars.turnover,
      }).from(localResearchDailyBars)
        .where(and(eq(localResearchDailyBars.symbol, targetSymbol), eq(localResearchDailyBars.adjustmentBasis, "adjusted")))
        .orderBy(asc(localResearchDailyBars.date)).limit(600);

      if (rows.length < input.trainSize + input.testSize) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: `${targetSymbol}의 데이터가 부족합니다 (${rows.length}봉, 최소 ${input.trainSize + input.testSize}봉 필요).` });
      }

      const bars: DailyBar[] = rows.map(r => ({
        date: r.date, open: r.open, high: r.high, low: r.low, close: r.close,
        volume: Number(r.volume), turnover: Number(r.turnover),
      }));

      const rules = preset.rulesJson as ConditionRule[];
      const windows: WalkForwardWindow[] = [];

      // 슬라이딩 윈도우로 Walk-Forward 실행
      for (let start = 0; start + input.trainSize + input.testSize <= bars.length; start += input.testSize) {
        const trainBars = bars.slice(start, start + input.trainSize);
        const testBars = bars.slice(start + input.trainSize, start + input.trainSize + input.testSize);
        const fullTestBars = bars.slice(start, start + input.trainSize + input.testSize);

        // Train: 학습 구간 백테스트
        const trainResult = runDailyBacktest({
          bars: trainBars, rules, minScore: 50, holdingDays: input.holdingDays,
          feeRate: 0.0011, entryDelayDays: 1, entryTiming: "open",
          maxOpenGapPercent: 3, stopLossPercent: input.stopLossPercent, takeProfitPercent: input.takeProfitPercent,
        });

        // Test: 독립 검증 구간 (학습 데이터 포함하여 조건 평가 가능하도록)
        const testResult = runDailyBacktest({
          bars: fullTestBars, rules, minScore: 50, holdingDays: input.holdingDays,
          feeRate: 0.0011, entryDelayDays: 1, entryTiming: "open",
          maxOpenGapPercent: 3, stopLossPercent: input.stopLossPercent, takeProfitPercent: input.takeProfitPercent,
          evaluationStartIndex: input.trainSize, // 테스트 구간부터만 진입 허용
        });

        const overfitRatio = trainResult.totalReturn !== 0
          ? testResult.totalReturn / trainResult.totalReturn
          : testResult.totalReturn >= 0 ? 1 : 0;

        windows.push({
          trainStart: trainBars[0].date,
          trainEnd: trainBars[trainBars.length - 1].date,
          testStart: testBars[0].date,
          testEnd: testBars[testBars.length - 1].date,
          trainResult: { totalReturn: Number(trainResult.totalReturn.toFixed(2)), winRate: Number(trainResult.winRate.toFixed(1)), tradeCount: trainResult.tradeCount },
          testResult: { totalReturn: Number(testResult.totalReturn.toFixed(2)), winRate: Number(testResult.winRate.toFixed(1)), tradeCount: testResult.tradeCount, maxDrawdown: Number(testResult.maxDrawdown.toFixed(2)) },
          overfitRatio: Number(overfitRatio.toFixed(2)),
        });
      }

      // 종합 평가
      const avgTrainReturn = windows.reduce((s, w) => s + w.trainResult.totalReturn, 0) / windows.length;
      const avgTestReturn = windows.reduce((s, w) => s + w.testResult.totalReturn, 0) / windows.length;
      const avgOverfit = windows.reduce((s, w) => s + w.overfitRatio, 0) / windows.length;
      const positiveWindows = windows.filter(w => w.testResult.totalReturn > 0).length;

      let verdict: string;
      if (avgTestReturn > 0 && avgOverfit >= 0.5 && positiveWindows >= windows.length * 0.6) {
        verdict = "실전 투입 가능 — 독립 검증 구간에서도 안정적 수익";
      } else if (avgTestReturn > 0 && positiveWindows >= windows.length * 0.4) {
        verdict = "조건부 투입 — 일부 구간에서 수익이나 일관성 부족";
      } else if (avgTrainReturn > 0 && avgTestReturn <= 0) {
        verdict = "과적합 의심 — 학습 구간은 수익이나 독립 검증에서 손실";
      } else {
        verdict = "투입 부적합 — 학습/검증 모두 기대 이하";
      }

      return {
        symbol: targetSymbol,
        presetName: preset.name,
        windowCount: windows.length,
        trainSize: input.trainSize,
        testSize: input.testSize,
        avgTrainReturn: Number(avgTrainReturn.toFixed(2)),
        avgTestReturn: Number(avgTestReturn.toFixed(2)),
        avgOverfitRatio: Number(avgOverfit.toFixed(2)),
        positiveWindowRatio: Number((positiveWindows / windows.length).toFixed(2)),
        verdict,
        windows,
      };
    }),
});
