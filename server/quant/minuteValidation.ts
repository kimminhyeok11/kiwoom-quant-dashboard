import type { ConditionExpressionGroup, ConditionRule } from "../../shared/trading";
import type { IntradayMinuteBar } from "../kiwoom/minuteBars";
import { evaluateExpression, type DailyBar } from "./conditions";

export type MinuteValidationPolicy = {
  stopLossPercent: number;
  takeProfitPercent: number;
  maxHoldingBars: number;
  feeRate: number;
  slippageBps: number;
  quantity: number;
};

export type MinuteValidationTrade = {
  signalAt: Date;
  entryAt: Date;
  entryPrice: number;
  exitAt: Date;
  exitPrice: number;
  exitReason: "take_profit" | "stop_loss" | "same_bar_stop_priority" | "time_exit";
  buyFee: number;
  sellFee: number;
  netPnl: number;
  netReturnPercent: number;
};

function toConditionBars(bars: IntradayMinuteBar[]): DailyBar[] {
  return bars.map(bar => ({ date: bar.minuteAt.toISOString(), open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume, turnover: Math.round(bar.close * bar.volume) }));
}

function requirePositiveInteger(value: number, fallback: number) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

export function evaluateMinuteExpression(input: {
  expression: ConditionRule | ConditionExpressionGroup;
  bars: IntradayMinuteBar[];
  minimumScore?: number;
  policy?: Partial<MinuteValidationPolicy>;
}) {
  const policy: MinuteValidationPolicy = {
    stopLossPercent: input.policy?.stopLossPercent ?? 2,
    takeProfitPercent: input.policy?.takeProfitPercent ?? 4,
    maxHoldingBars: requirePositiveInteger(input.policy?.maxHoldingBars ?? 30, 30),
    feeRate: input.policy?.feeRate ?? 0.003,
    slippageBps: Math.max(0, input.policy?.slippageBps ?? 0),
    quantity: requirePositiveInteger(input.policy?.quantity ?? 1, 1),
  };
  const bars = [...input.bars].sort((left, right) => left.minuteAt.getTime() - right.minuteAt.getTime());
  const conditionBars = toConditionBars(bars);
  const trades: MinuteValidationTrade[] = [];
  let nextSignalIndex = 0;

  for (let signalIndex = 0; signalIndex < bars.length - 1; signalIndex += 1) {
    if (signalIndex < nextSignalIndex) continue;
    const evaluation = evaluateExpression(input.expression, conditionBars.slice(0, signalIndex + 1));
    if (!evaluation.eligible || evaluation.score < (input.minimumScore ?? 0)) continue;
    const signalBar = bars[signalIndex]!;
    const entryBar = bars[signalIndex + 1]!;
    const entryPrice = entryBar.open * (1 + policy.slippageBps / 10_000);
    const stopPrice = entryPrice * (1 - policy.stopLossPercent / 100);
    const targetPrice = entryPrice * (1 + policy.takeProfitPercent / 100);
    let exitAt = entryBar.minuteAt;
    let exitPrice = entryBar.close;
    let exitReason: MinuteValidationTrade["exitReason"] = "time_exit";
    let exitIndex = Math.min(bars.length - 1, signalIndex + 1 + policy.maxHoldingBars);

    for (let index = signalIndex + 1; index <= exitIndex; index += 1) {
      const bar = bars[index]!;
      const hitStop = bar.low <= stopPrice;
      const hitTarget = bar.high >= targetPrice;
      if (hitStop || hitTarget) {
        exitAt = bar.minuteAt;
        exitPrice = hitStop ? stopPrice : targetPrice;
        exitReason = hitStop && hitTarget ? "same_bar_stop_priority" : hitStop ? "stop_loss" : "take_profit";
        exitIndex = index;
        break;
      }
      if (index === exitIndex) {
        exitAt = bar.minuteAt;
        exitPrice = bar.close;
      }
    }
    exitPrice *= 1 - policy.slippageBps / 10_000;
    const buyFee = Math.round(entryPrice * policy.quantity * policy.feeRate);
    const sellFee = Math.round(exitPrice * policy.quantity * policy.feeRate);
    const netPnl = Math.round((exitPrice - entryPrice) * policy.quantity - buyFee - sellFee);
    const invested = entryPrice * policy.quantity + buyFee;
    trades.push({ signalAt: signalBar.minuteAt, entryAt: entryBar.minuteAt, entryPrice, exitAt, exitPrice, exitReason, buyFee, sellFee, netPnl, netReturnPercent: invested ? netPnl / invested * 100 : 0 });
    nextSignalIndex = exitIndex + 1;
  }
  const netPnl = trades.reduce((total, trade) => total + trade.netPnl, 0);
  return { trades, netPnl, tradeCount: trades.length, winRate: trades.length ? trades.filter(trade => trade.netPnl > 0).length / trades.length * 100 : 0, turnoverBasis: "derived_close_x_volume" as const };
}
