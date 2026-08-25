import { describe, expect, it } from "vitest";
import { KiwoomClient } from "./client";

describe("KIWOOM_ORDER_TRANSMISSION_ENABLED", () => {
  it("모의투자 환경에서는 주문 전송 설정과 무관하게 실전 주문 전송을 활성화하지 않는다", () => {
    const status = new KiwoomClient().getStatus();
    expect(status).toMatchObject({ mode: "mock", hasCredentials: true, mayTransmitOrders: false });
  });
});
