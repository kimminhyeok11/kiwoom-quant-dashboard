export const DAY_TRADE_TOTAL_CAPITAL = 10_000_000;
export const DAY_TRADE_FEE_RATE = 0.003;

export type DayTradePositionInput = { id: string; entryPrice: number; currentPrice?: number };
export type DayTradePositionLedger<T extends DayTradePositionInput> = T & { allocation: number; quantity: number; buyAmount: number; buyFee: number; cashReserve: number; evaluationPrice: number; estimatedExitFee: number; netValue: number; netPnl: number; netReturnPercent: number; hasLivePrice: boolean };

export function calculateDayTradePortfolio<T extends DayTradePositionInput>(positions: T[], totalCapital = DAY_TRADE_TOTAL_CAPITAL, feeRate = DAY_TRADE_FEE_RATE) {
  const eligible = positions.filter(position => Number.isFinite(position.entryPrice) && position.entryPrice > 0);
  const allocation = eligible.length ? Math.floor(totalCapital / eligible.length) : 0;
  const ledgers: Array<DayTradePositionLedger<T>> = eligible.map(position => {
    const quantity = Math.floor(allocation / (position.entryPrice * (1 + feeRate)));
    const buyAmount = quantity * position.entryPrice;
    const buyFee = Math.round(buyAmount * feeRate);
    const cashReserve = allocation - buyAmount - buyFee;
    const hasLivePrice = Number.isFinite(position.currentPrice) && (position.currentPrice ?? 0) > 0;
    const evaluationPrice = hasLivePrice ? Math.round(position.currentPrice!) : position.entryPrice;
    const estimatedExitFee = Math.round(evaluationPrice * quantity * feeRate);
    const netValue = cashReserve + evaluationPrice * quantity - estimatedExitFee;
    const netPnl = netValue - allocation;
    return { ...position, allocation, quantity, buyAmount, buyFee, cashReserve, evaluationPrice, estimatedExitFee, netValue, netPnl, netReturnPercent: allocation ? netPnl / allocation * 100 : 0, hasLivePrice };
  });
  const unallocatedCash = totalCapital - allocation * eligible.length;
  const netValue = unallocatedCash + ledgers.reduce((sum, position) => sum + position.netValue, 0);
  return { totalCapital, feeRate, allocationPerPosition: allocation, unallocatedCash, positions: ledgers, netValue, netPnl: netValue - totalCapital, netReturnPercent: totalCapital ? (netValue - totalCapital) / totalCapital * 100 : 0 };
}
