import { describe, expect, it } from "vitest";
import { evaluateOrderRisk, mayTransmitOrder } from "./risk";

const safeSettings = {
  environment: "live" as const,
  maxBuyAmount: 500_000,
  dailyTradeLimit: 3,
  killSwitch: false,
  autoTradeEnabled: true,
  requireConfirmation: true,
};

describe("order safety gate", () => {
  it("allows a verified order that is within all limits", () => {
    const result = evaluateOrderRisk(
      { symbol: "005930", name: "테스트 종목", side: "buy", quantity: 5, price: 70_000 },
      safeSettings,
      2,
      true,
    );
    expect(result).toEqual({ allowed: true, amount: 350_000, reasons: [] });
  });

  it("blocks an order when a hard safety condition is violated", () => {
    const result = evaluateOrderRisk(
      { symbol: "005930", name: "테스트 종목", side: "buy", quantity: 8, price: 70_000 },
      { ...safeSettings, killSwitch: true },
      3,
      false,
    );
    expect(result.allowed).toBe(false);
    expect(result.reasons).toHaveLength(4);
  });

  it("enforces the saved safety profile values before an order intent can proceed", () => {
    const profileRisk = evaluateOrderRisk(
      { symbol: "005930", name: "테스트 종목", side: "buy", quantity: 6, price: 90_000 },
      { ...safeSettings, maxBuyAmount: 400_000, dailyTradeLimit: 2, killSwitch: true },
      2,
      true,
    );
    expect(profileRisk.allowed).toBe(false);
    expect(profileRisk.reasons).toEqual(expect.arrayContaining([
      "주문 금액이 단일 매수 한도를 초과합니다.",
      "일일 거래 횟수 한도에 도달했습니다.",
      "킬 스위치가 활성화되어 있습니다.",
    ]));
  });

  it("never transmits an unconfirmed or already-submitted order", () => {
    expect(mayTransmitOrder({ confirmedAt: null, confirmationNonce: "abc", status: "confirmed" })).toBe(false);
    expect(mayTransmitOrder({ confirmedAt: new Date(), confirmationNonce: "abc", status: "submitting" })).toBe(false);
    expect(mayTransmitOrder({ confirmedAt: new Date(), confirmationNonce: "abc", status: "submitted" })).toBe(false);
    expect(mayTransmitOrder({ confirmedAt: new Date(), confirmationNonce: "abc", status: "confirmed" })).toBe(true);
  });
});
