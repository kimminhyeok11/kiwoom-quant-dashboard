/**
 * 실현 손익(PnL) 계산 공통 유틸
 *
 * mockTrading 라우터에서 반복되던 "매도 종목의 실현 손익 계산" 로직을 추출.
 * 종목별 가중평균 매수가를 구한 후, 매도 건별 손익을 합산합니다.
 */

/** 주문 데이터에서 PnL 계산에 필요한 최소 필드 */
export interface OrderForPnl {
  symbol: string;
  side: string;
  price: number;
  quantity: number;
}

/**
 * 종목별 가중평균 매수가 계산
 */
export function computeAvgBuyPriceBySymbol(buyOrders: OrderForPnl[]): Map<string, number> {
  const grouped = new Map<string, OrderForPnl[]>();
  for (const b of buyOrders) {
    const list = grouped.get(b.symbol) ?? [];
    list.push(b);
    grouped.set(b.symbol, list);
  }

  const result = new Map<string, number>();
  for (const [symbol, buys] of Array.from(grouped.entries())) {
    const totalCost = buys.reduce((s: number, b: OrderForPnl) => s + b.price * b.quantity, 0);
    const totalQty = buys.reduce((s: number, b: OrderForPnl) => s + b.quantity, 0);
    if (totalQty > 0) {
      result.set(symbol, Math.round(totalCost / totalQty));
    }
  }
  return result;
}

/**
 * 매도 주문 목록과 종목별 평균매수가를 사용하여 실현 손익 합산
 *
 * @param sellOrders 매도 주문 목록
 * @param avgBuyBySymbol 종목별 가중평균 매수가 (없으면 매도가를 대입 → PnL=0)
 * @returns 실현 손익 합계 (양수=수익, 음수=손실)
 */
export function computeRealizedPnl(
  sellOrders: OrderForPnl[],
  avgBuyBySymbol: Map<string, number>,
): number {
  let pnl = 0;
  for (const sell of sellOrders) {
    const avgBuy = avgBuyBySymbol.get(sell.symbol) ?? sell.price;
    pnl += (sell.price - avgBuy) * sell.quantity;
  }
  return pnl;
}

/**
 * 매도 주문 + 매수 이력으로부터 실현 손익을 한번에 계산하는 편의 함수.
 * DB에서 조회한 결과를 바로 넣으면 됩니다.
 *
 * @param sellOrders 오늘(또는 기간 내) 매도 주문
 * @param buyHistory 해당 종목들의 과거 매수 체결 기록
 * @returns 실현 손익 합계
 */
export function computeRealizedPnlFromOrders(
  sellOrders: OrderForPnl[],
  buyHistory: OrderForPnl[],
): number {
  if (sellOrders.length === 0) return 0;
  const avgBuyBySymbol = computeAvgBuyPriceBySymbol(buyHistory);
  return computeRealizedPnl(sellOrders, avgBuyBySymbol);
}
