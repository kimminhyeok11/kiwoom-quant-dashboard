import { describe, expect, it } from "vitest";
import { calculateDayTradePortfolio, DAY_TRADE_FEE_RATE, DAY_TRADE_TOTAL_CAPITAL } from "./dayTradePortfolio";

describe("calculateDayTradePortfolio", () => {
  it("전체 1,000만 원을 실제 모의 진입 종목에 균등 배분하고 매수 수수료를 반영해 수량을 산정한다", () => {
    const result = calculateDayTradePortfolio([{ id: "A", entryPrice: 10_000 }, { id: "B", entryPrice: 20_000 }]);
    expect(result.totalCapital).toBe(DAY_TRADE_TOTAL_CAPITAL);
    expect(result.allocationPerPosition).toBe(5_000_000);
    expect(result.positions[0]).toMatchObject({ quantity: 498, buyAmount: 4_980_000, buyFee: 14_940 });
    expect(result.positions[0].buyAmount + result.positions[0].buyFee).toBeLessThanOrEqual(result.positions[0].allocation);
  });

  it("현재가와 예상 매도 수수료를 함께 반영해 보유 포지션의 순손익과 순수익률을 계산한다", () => {
    const result = calculateDayTradePortfolio([{ id: "A", entryPrice: 10_000, currentPrice: 11_000 }]);
    const position = result.positions[0];
    expect(position.estimatedExitFee).toBe(Math.round(position.evaluationPrice * position.quantity * DAY_TRADE_FEE_RATE));
    expect(position.netPnl).toBeGreaterThan(0);
    expect(position.netReturnPercent).toBeGreaterThan(0);
    expect(result.netValue).toBe(result.totalCapital + result.netPnl);
  });
});
