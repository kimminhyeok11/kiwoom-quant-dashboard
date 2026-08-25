import type { OrderCandidate, RiskGateResult, TradingSafetySettings } from "../../shared/trading";

export function evaluateOrderRisk(
  candidate: OrderCandidate,
  settings: TradingSafetySettings,
  confirmedOrderCountToday: number,
  connectionReady: boolean,
): RiskGateResult {
  const amount = candidate.quantity * candidate.price;
  const reasons: string[] = [];

  if (!connectionReady) reasons.push("키움 API 연결과 계좌 검증이 완료되지 않았습니다.");
  if (settings.killSwitch) reasons.push("킬 스위치가 활성화되어 있습니다.");
  if (!settings.autoTradeEnabled) reasons.push("자동매매가 비활성화되어 있습니다.");
  if (candidate.side === "buy" && amount > settings.maxBuyAmount) {
    reasons.push("주문 금액이 단일 매수 한도를 초과합니다.");
  }
  if (confirmedOrderCountToday >= settings.dailyTradeLimit) {
    reasons.push("일일 거래 횟수 한도에 도달했습니다.");
  }
  if (!settings.requireConfirmation) {
    reasons.push("주문 전 확인 단계는 항상 필수입니다.");
  }

  return { allowed: reasons.length === 0, amount, reasons };
}

export function mayTransmitOrder(input: {
  confirmedAt: Date | null;
  confirmationNonce: string | null;
  status: "pending_confirmation" | "confirmed" | "submitting" | "submitted" | "filled" | "blocked";
}): boolean {
  return Boolean(input.confirmedAt && input.confirmationNonce && input.status === "confirmed");
}
