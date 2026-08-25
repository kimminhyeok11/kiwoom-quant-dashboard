import type { ConditionExpressionGroup, ConditionRule } from "../../shared/trading";
import type { DailyBar } from "./conditions";
import { runDailyBacktest, type BacktestResult } from "./backtest";

export type WalkForwardConfiguration = {
  trainingDays: number;
  validationDays: number;
  stepDays: number;
  minScore: number;
  holdingDays: number;
  feeRate: number;
  entryDelayDays: number;
  entryTiming: "open" | "close";
};

export type WalkForwardFold = {
  fold: number;
  trainingStartDate: string;
  trainingEndDate: string;
  validationStartDate: string;
  validationEndDate: string;
  result: BacktestResult;
};

export function runWalkForward(input: { bars: DailyBar[]; rules?: ConditionRule[]; expression?: ConditionExpressionGroup; configuration: WalkForwardConfiguration }) {
  const { bars, rules, expression, configuration } = input;
  if (!rules && !expression) throw new Error("워크포워드에는 조건 규칙 또는 논리 표현식이 필요합니다.");
  const minimum = configuration.trainingDays + configuration.validationDays;
  if (bars.length < minimum) throw new Error(`워크포워드에는 최소 ${minimum}개의 고정 일봉이 필요합니다.`);
  const folds: WalkForwardFold[] = [];
  for (let start = 0; start + minimum <= bars.length; start += configuration.stepDays) {
    const trainingEnd = start + configuration.trainingDays;
    const validationEnd = trainingEnd + configuration.validationDays;
    const contextBars = bars.slice(start, validationEnd);
    const result = runDailyBacktest({ bars: contextBars, rules, expression, minScore: configuration.minScore, holdingDays: configuration.holdingDays, feeRate: configuration.feeRate, entryDelayDays: configuration.entryDelayDays, entryTiming: configuration.entryTiming, evaluationStartIndex: configuration.trainingDays });
    folds.push({ fold: folds.length + 1, trainingStartDate: bars[start]!.date, trainingEndDate: bars[trainingEnd - 1]!.date, validationStartDate: bars[trainingEnd]!.date, validationEndDate: bars[validationEnd - 1]!.date, result });
  }
  const compound = folds.reduce((equity, fold) => equity * (1 + fold.result.totalReturn / 100), 1);
  const trades = folds.reduce((sum, fold) => sum + fold.result.tradeCount, 0);
  const winners = folds.reduce((sum, fold) => sum + fold.result.trades.filter(trade => trade.returnPercent > 0).length, 0);
  return { foldCount: folds.length, totalReturn: (compound - 1) * 100, winRate: trades ? winners / trades * 100 : 0, tradeCount: trades, worstFoldDrawdown: Math.min(...folds.map(fold => fold.result.maxDrawdown)), folds };
}
