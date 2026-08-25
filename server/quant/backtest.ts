import type { ConditionExpressionGroup, ConditionRule } from "../../shared/trading";
import { evaluateExpression, evaluateStrategy, type ConditionEvaluationContext, type DailyBar } from "./conditions";

export type BacktestTrade = {
  entryDate: string;
  exitDate: string;
  entryPrice: number;
  exitPrice: number;
  returnPercent: number;
};

export type BacktestResult = {
  totalReturn: number;
  winRate: number;
  tradeCount: number;
  maxDrawdown: number;
  trades: BacktestTrade[];
};

function tradingDate(value: string) {
  return value.slice(0, 10);
}

function aggregateCompletedBars(bars: DailyBar[], barsPerInterval: number) {
  const aggregated: Array<{ bar: DailyBar; completedAtIndex: number }> = [];
  let currentDate = "";
  let bucket: DailyBar[] = [];
  bars.forEach((bar, index) => {
    const date = tradingDate(bar.date);
    if (date !== currentDate) { currentDate = date; bucket = []; }
    bucket.push(bar);
    if (bucket.length === barsPerInterval) {
      aggregated.push({ bar: { date: bar.date, open: bucket[0]!.open, high: Math.max(...bucket.map(item => item.high)), low: Math.min(...bucket.map(item => item.low)), close: bar.close, volume: bucket.reduce((sum, item) => sum + item.volume, 0), turnover: bucket.reduce((sum, item) => sum + item.turnover, 0) }, completedAtIndex: index });
      bucket = [];
    }
  });
  return aggregated;
}

/**
 * 5분봉 시점마다 이미 끝난 상위 시간축만 노출한다. 당일 일봉의 종가·고가는
 * 평가 시점에 확정되지 않으므로 daily에는 전 거래일까지의 원본만 포함한다.
 */
export function createFiveMinuteContextProvider(activeBars: DailyBar[], dailyBars: DailyBar[]) {
  const tenMinute = aggregateCompletedBars(activeBars, 2);
  const sixtyMinute = aggregateCompletedBars(activeBars, 12);
  const completedCountAt = (items: Array<{ completedAtIndex: number }>, index: number) => {
    let low = 0; let high = items.length;
    while (low < high) { const middle = Math.floor((low + high) / 2); if (items[middle]!.completedAtIndex <= index) low = middle + 1; else high = middle; }
    return low;
  };
  return (index: number, history: DailyBar[]): ConditionEvaluationContext => {
    const date = tradingDate(activeBars[index]!.date);
    return {
      activeBars: history,
      timeframeBars: {
        active: history,
        five_minute: history,
        ten_minute: tenMinute.slice(0, completedCountAt(tenMinute, index)).map(item => item.bar),
        sixty_minute: sixtyMinute.slice(0, completedCountAt(sixtyMinute, index)).map(item => item.bar),
        daily: dailyBars.filter(bar => tradingDate(bar.date) < date),
      },
    };
  };
}

export function runDailyBacktest(input: {
  bars: DailyBar[];
  rules?: ConditionRule[];
  expression?: ConditionExpressionGroup;
  minScore: number;
  holdingDays: number;
  feeRate?: number;
  entryDelayDays?: number;
  entryTiming?: "open" | "close";
  evaluationStartIndex?: number;
  conditionContextAtIndex?: (index: number, activeHistory: DailyBar[]) => ConditionEvaluationContext;
}): BacktestResult {
  const feeRate = input.feeRate ?? 0;
  const entryDelayDays = input.entryDelayDays ?? 0;
  const entryTiming = input.entryTiming ?? "close";
  const evaluationStartIndex = input.evaluationStartIndex ?? 0;
  const trades: BacktestTrade[] = [];
  let position: { entryIndex: number; entryPrice: number; entryDate: string } | null = null;
  let pendingEntryIndex: number | null = null;
  let equity = 1;
  let highWaterMark = 1;
  let maxDrawdown = 0;

  for (let index = 0; index < input.bars.length; index += 1) {
    const bar = input.bars[index];
    if (index < evaluationStartIndex) continue;
    if (position && index - position.entryIndex >= input.holdingDays) {
      const grossReturn = (bar.close - position.entryPrice) / position.entryPrice;
      const netReturn = grossReturn - feeRate * 2;
      equity *= 1 + netReturn;
      highWaterMark = Math.max(highWaterMark, equity);
      maxDrawdown = Math.min(maxDrawdown, (equity - highWaterMark) / highWaterMark);
      trades.push({ entryDate: position.entryDate, exitDate: bar.date, entryPrice: position.entryPrice, exitPrice: bar.close, returnPercent: netReturn * 100 });
      position = null;
    }
    if (!position && pendingEntryIndex !== null && index >= pendingEntryIndex) {
      position = { entryIndex: index, entryPrice: entryTiming === "open" ? bar.open : bar.close, entryDate: bar.date };
      pendingEntryIndex = null;
    }
    if (!position && pendingEntryIndex === null) {
      const history = input.bars.slice(0, index + 1);
      const conditionInput = input.conditionContextAtIndex?.(index, history) ?? history;
      const signal = input.expression ? evaluateExpression(input.expression, conditionInput) : evaluateStrategy(input.rules ?? [], conditionInput);
      if (signal.score >= input.minScore) {
        if (entryDelayDays === 0) position = { entryIndex: index, entryPrice: bar.close, entryDate: bar.date };
        else pendingEntryIndex = index + entryDelayDays;
      }
    }
  }

  const wins = trades.filter(trade => trade.returnPercent > 0).length;
  return {
    totalReturn: (equity - 1) * 100,
    winRate: trades.length ? (wins / trades.length) * 100 : 0,
    tradeCount: trades.length,
    maxDrawdown: maxDrawdown * 100,
    trades,
  };
}
