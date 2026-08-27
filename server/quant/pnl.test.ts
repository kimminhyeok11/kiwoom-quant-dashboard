import { describe, it, expect } from "vitest";
import { computeAvgBuyPriceBySymbol, computeRealizedPnl, computeRealizedPnlFromOrders } from "./pnl";
import type { OrderForPnl } from "./pnl";

describe("computeAvgBuyPriceBySymbol", () => {
  it("종목별 가중평균 매수가를 계산", () => {
    const buys: OrderForPnl[] = [
      { symbol: "005930", side: "buy", price: 70000, quantity: 10 },
      { symbol: "005930", side: "buy", price: 72000, quantity: 5 },
      { symbol: "000660", side: "buy", price: 130000, quantity: 3 },
    ];
    const result = computeAvgBuyPriceBySymbol(buys);

    // 005930: (70000*10 + 72000*5) / 15 = 1060000 / 15 = 70666.67 → 반올림 70667
    expect(result.get("005930")).toBe(Math.round((70000 * 10 + 72000 * 5) / 15));
    // 000660: 130000 (단일 매수)
    expect(result.get("000660")).toBe(130000);
  });

  it("빈 배열이면 빈 Map 반환", () => {
    const result = computeAvgBuyPriceBySymbol([]);
    expect(result.size).toBe(0);
  });

  it("수량 0인 매수는 평균에 포함되지 않음 (totalQty=0이면 set 안함)", () => {
    const buys: OrderForPnl[] = [
      { symbol: "005930", side: "buy", price: 70000, quantity: 0 },
    ];
    const result = computeAvgBuyPriceBySymbol(buys);
    expect(result.has("005930")).toBe(false);
  });
});

describe("computeRealizedPnl", () => {
  it("매도가 - 평균매수가 × 수량 합산", () => {
    const avgBuy = new Map([["005930", 70000]]);
    const sells: OrderForPnl[] = [
      { symbol: "005930", side: "sell", price: 73000, quantity: 10 },
    ];
    // (73000 - 70000) * 10 = 30000
    expect(computeRealizedPnl(sells, avgBuy)).toBe(30000);
  });

  it("손실인 경우 음수 반환", () => {
    const avgBuy = new Map([["005930", 70000]]);
    const sells: OrderForPnl[] = [
      { symbol: "005930", side: "sell", price: 68000, quantity: 5 },
    ];
    // (68000 - 70000) * 5 = -10000
    expect(computeRealizedPnl(sells, avgBuy)).toBe(-10000);
  });

  it("평균매수가 없는 종목은 매도가를 사용 (PnL=0)", () => {
    const avgBuy = new Map<string, number>(); // 비어있음
    const sells: OrderForPnl[] = [
      { symbol: "005930", side: "sell", price: 70000, quantity: 10 },
    ];
    expect(computeRealizedPnl(sells, avgBuy)).toBe(0);
  });

  it("여러 종목 동시 계산", () => {
    const avgBuy = new Map([
      ["005930", 70000],
      ["000660", 130000],
    ]);
    const sells: OrderForPnl[] = [
      { symbol: "005930", side: "sell", price: 72000, quantity: 10 }, // +20000
      { symbol: "000660", side: "sell", price: 125000, quantity: 2 }, // -10000
    ];
    expect(computeRealizedPnl(sells, avgBuy)).toBe(10000);
  });

  it("빈 매도 목록이면 0 반환", () => {
    const avgBuy = new Map([["005930", 70000]]);
    expect(computeRealizedPnl([], avgBuy)).toBe(0);
  });
});

describe("computeRealizedPnlFromOrders", () => {
  it("매도 + 매수 이력으로 실현손익 한번에 계산", () => {
    const sells: OrderForPnl[] = [
      { symbol: "005930", side: "sell", price: 75000, quantity: 10 },
    ];
    const buys: OrderForPnl[] = [
      { symbol: "005930", side: "buy", price: 70000, quantity: 10 },
      { symbol: "005930", side: "buy", price: 72000, quantity: 5 },
    ];
    // avgBuy = (70000*10 + 72000*5) / 15 = 70667 (반올림)
    // PnL = (75000 - 70667) * 10 = 43330
    const avgBuy = Math.round((70000 * 10 + 72000 * 5) / 15);
    expect(computeRealizedPnlFromOrders(sells, buys)).toBe((75000 - avgBuy) * 10);
  });

  it("매도 없으면 0 반환", () => {
    const buys: OrderForPnl[] = [
      { symbol: "005930", side: "buy", price: 70000, quantity: 10 },
    ];
    expect(computeRealizedPnlFromOrders([], buys)).toBe(0);
  });

  it("매수 이력 없는 종목의 매도는 PnL=0", () => {
    const sells: OrderForPnl[] = [
      { symbol: "999999", side: "sell", price: 50000, quantity: 5 },
    ];
    expect(computeRealizedPnlFromOrders(sells, [])).toBe(0);
  });
});
