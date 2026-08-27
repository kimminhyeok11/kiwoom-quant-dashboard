import { describe, it, expect } from "vitest";
import { evaluateOrderRisk, mayTransmitOrder } from "./risk";
import type { OrderCandidate, TradingSafetySettings } from "../../shared/trading";

function makeCandidate(overrides: Partial<OrderCandidate> = {}): OrderCandidate {
  return {
    symbol: "005930",
    name: "삼성전자",
    side: "buy",
    quantity: 10,
    price: 70000,
    ...overrides,
  };
}

function makeSettings(overrides: Partial<TradingSafetySettings> = {}): TradingSafetySettings {
  return {
    environment: "mock",
    maxBuyAmount: 1_000_000,
    dailyTradeLimit: 3,
    killSwitch: false,
    autoTradeEnabled: true,
    requireConfirmation: true,
    ...overrides,
  };
}

describe("evaluateOrderRisk", () => {
  it("모든 조건 충족 시 주문 허용", () => {
    const result = evaluateOrderRisk(makeCandidate(), makeSettings(), 0, true);
    expect(result.allowed).toBe(true);
    expect(result.reasons).toHaveLength(0);
    expect(result.amount).toBe(700_000);
  });

  it("API 연결 미완료 시 차단", () => {
    const result = evaluateOrderRisk(makeCandidate(), makeSettings(), 0, false);
    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain("키움 API 연결과 계좌 검증이 완료되지 않았습니다.");
  });

  it("킬스위치 활성 시 차단", () => {
    const result = evaluateOrderRisk(
      makeCandidate(),
      makeSettings({ killSwitch: true }),
      0,
      true,
    );
    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain("킬 스위치가 활성화되어 있습니다.");
  });

  it("자동매매 비활성 시 차단", () => {
    const result = evaluateOrderRisk(
      makeCandidate(),
      makeSettings({ autoTradeEnabled: false }),
      0,
      true,
    );
    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain("자동매매가 비활성화되어 있습니다.");
  });

  it("매수 금액이 단일 한도 초과 시 차단", () => {
    const result = evaluateOrderRisk(
      makeCandidate({ quantity: 20, price: 70000 }), // 1,400,000원
      makeSettings({ maxBuyAmount: 1_000_000 }),
      0,
      true,
    );
    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain("주문 금액이 단일 매수 한도를 초과합니다.");
    expect(result.amount).toBe(1_400_000);
  });

  it("매도 주문은 금액 한도 검사를 하지 않음", () => {
    const result = evaluateOrderRisk(
      makeCandidate({ side: "sell", quantity: 100, price: 70000 }), // 7,000,000원
      makeSettings({ maxBuyAmount: 1_000_000 }),
      0,
      true,
    );
    expect(result.allowed).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  it("일일 거래 한도 도달 시 차단", () => {
    const result = evaluateOrderRisk(
      makeCandidate(),
      makeSettings({ dailyTradeLimit: 3 }),
      3, // 이미 3회 거래
      true,
    );
    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain("일일 거래 횟수 한도에 도달했습니다.");
  });

  it("일일 거래 한도 미달 시 허용", () => {
    const result = evaluateOrderRisk(
      makeCandidate(),
      makeSettings({ dailyTradeLimit: 3 }),
      2,
      true,
    );
    expect(result.allowed).toBe(true);
  });

  it("requireConfirmation=false이면 차단", () => {
    const result = evaluateOrderRisk(
      makeCandidate(),
      makeSettings({ requireConfirmation: false }),
      0,
      true,
    );
    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain("주문 전 확인 단계는 항상 필수입니다.");
  });

  it("여러 조건 동시 위반 시 모든 사유 누적", () => {
    const result = evaluateOrderRisk(
      makeCandidate({ quantity: 20, price: 70000 }),
      makeSettings({ killSwitch: true, autoTradeEnabled: false, dailyTradeLimit: 1 }),
      2,
      false,
    );
    expect(result.allowed).toBe(false);
    expect(result.reasons.length).toBeGreaterThanOrEqual(4);
  });

  it("amount는 항상 quantity * price", () => {
    const result = evaluateOrderRisk(makeCandidate({ quantity: 5, price: 50000 }), makeSettings(), 0, true);
    expect(result.amount).toBe(250_000);
  });
});

describe("mayTransmitOrder", () => {
  it("confirmed 상태 + confirmedAt + nonce가 있으면 전송 가능", () => {
    expect(mayTransmitOrder({
      confirmedAt: new Date(),
      confirmationNonce: "abc123",
      status: "confirmed",
    })).toBe(true);
  });

  it("status가 confirmed가 아니면 전송 불가", () => {
    expect(mayTransmitOrder({
      confirmedAt: new Date(),
      confirmationNonce: "abc123",
      status: "pending_confirmation",
    })).toBe(false);
  });

  it("confirmedAt이 null이면 전송 불가", () => {
    expect(mayTransmitOrder({
      confirmedAt: null,
      confirmationNonce: "abc123",
      status: "confirmed",
    })).toBe(false);
  });

  it("confirmationNonce가 null이면 전송 불가", () => {
    expect(mayTransmitOrder({
      confirmedAt: new Date(),
      confirmationNonce: null,
      status: "confirmed",
    })).toBe(false);
  });
});
