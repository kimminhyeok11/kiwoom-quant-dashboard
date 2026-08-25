export type AutoTradePolicyValues = {
  totalCapital: number;
  maxConcurrentPositions: number;
  stopLossPercent: number;
  takeProfitPercent: number;
  dailyLossLimitPercent: number;
};

export const defaultAutoTradePolicy: AutoTradePolicyValues = {
  totalCapital: 10_000_000,
  maxConcurrentPositions: 5,
  stopLossPercent: 2,
  takeProfitPercent: 3,
  dailyLossLimitPercent: 3,
};

export function normalizeAutoTradePolicy(input: AutoTradePolicyValues): AutoTradePolicyValues {
  return {
    totalCapital: Math.floor(input.totalCapital),
    maxConcurrentPositions: Math.floor(input.maxConcurrentPositions),
    stopLossPercent: Number(input.stopLossPercent.toFixed(4)),
    takeProfitPercent: Number(input.takeProfitPercent.toFixed(4)),
    dailyLossLimitPercent: Number(input.dailyLossLimitPercent.toFixed(4)),
  };
}
