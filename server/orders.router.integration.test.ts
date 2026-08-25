import { beforeEach, describe, expect, it, vi } from "vitest";

import { afterEach } from "vitest";

const state = vi.hoisted(() => ({
  selectResults: [] as any[],
  affectedRows: [] as number[],
  updates: [] as any[],
  inserts: [] as any[],
  submissions: [] as any[],
  tokenError: null as Error | null,
}));

vi.mock("./db", () => ({
  getDb: vi.fn(async () => ({
    select: () => {
      const result = state.selectResults.shift() ?? [];
      const query = { limit: async () => result, then: (resolve: (value: any) => any, reject?: (reason: any) => any) => Promise.resolve(result).then(resolve, reject) };
      return { from: () => ({ where: () => query, orderBy: async () => result }) };
    },
    update: () => ({ set: (values: any) => ({ where: async () => { state.updates.push(values); return [{ affectedRows: state.affectedRows.shift() ?? 1 }]; } }) }),
    insert: () => ({ values: async (values: any) => { state.inserts.push(values); } }),
  })),
}));

vi.mock("./kiwoom/client", () => ({
  KiwoomClient: class {
    assertOrderMayBeSubmitted(input: any) {
      if (!input.confirmationNonce || input.status !== "confirmed") throw new Error("필수 최종 확인이 완료되지 않았거나 이미 전송된 주문입니다.");
      if (input.settings.killSwitch) throw new Error("킬 스위치가 활성화되어 있습니다.");
      if (!input.settings.autoTradeEnabled) throw new Error("자동매매가 비활성화되어 있습니다.");
      if (input.candidate.quantity * input.candidate.price > input.settings.maxBuyAmount) throw new Error("주문 금액이 단일 매수 한도를 초과합니다.");
      if (input.confirmedOrderCountToday >= input.settings.dailyTradeLimit) throw new Error("일일 거래 횟수 한도에 도달했습니다.");
    }
    getAccessToken = async () => {
      if (state.tokenError) throw state.tokenError;
      return { token: "token" };
    };
    submitLiveBuyOrder = async (_token: string, input: any) => { state.submissions.push(input); return { orderNumber: "K-100", exchange: "KRX" }; };
  },
}));

import { assertResearchObservationForOrder, ordersRouter } from "./routers/orders";

const profile = { userId: 1, environment: "live", maxBuyAmount: 1_000_000, dailyTradeLimit: 3, killSwitch: false, autoTradeEnabled: true, requireConfirmation: true };
const confirmedIntent = { id: 41, userId: 1, symbol: "005930", name: "삼성전자", side: "buy", quantity: 2, price: 100_000, orderType: "limit", status: "confirmed", confirmedAt: new Date(), confirmationNonce: "nonce" };
const caller = () => ordersRouter.createCaller({ user: { id: 1, openId: "operator", role: "admin" } as any, req: {} as any, res: {} as any });

describe("orders 라우터 안전 전송", () => {
  beforeEach(() => { vi.stubEnv("AUTONOMOUS_RESEARCH_EXTERNAL_DATA_ENABLED", "true"); state.selectResults = []; state.affectedRows = []; state.updates = []; state.inserts = []; state.submissions = []; state.tokenError = null; });
  afterEach(() => { vi.unstubAllEnvs(); });

  it("확인 대기 주문에만 확인 토큰을 발급한다", async () => {
    state.selectResults = [[{ ...confirmedIntent, status: "pending_confirmation", confirmationNonce: null, confirmedAt: null }]];
    const result = await caller().confirm({ id: 41, acknowledged: true });
    expect(result).toMatchObject({ id: 41, status: "confirmed" });
    expect(result.confirmationNonce).toMatch(/^[0-9a-f-]{36}$/);
    expect(state.updates).toEqual([expect.objectContaining({ status: "confirmed", confirmationNonce: result.confirmationNonce })]);
  });

  it("운영자 소유 주문 의도에 연결된 실제 전송·체결 기록만 조회한다", async () => {
    state.selectResults = [[confirmedIntent], [{ id: 9, orderIntentId: 41, brokerOrderId: "K-100", executionStatus: "submitted", filledQuantity: 0, filledPrice: null, executedAt: new Date() }]];
    const executions = await caller().listExecutions();
    expect(executions).toEqual([expect.objectContaining({ id: 9, symbol: "005930", name: "삼성전자", side: "buy", quantity: 2, intentStatus: "confirmed" })]);
  });

  it("최종 확인 토큰·안전 설정을 통과한 주문만 submitting 선점 뒤 전송한다", async () => {
    state.selectResults = [[confirmedIntent], [profile], [confirmedIntent]];
    state.affectedRows = [1, 1];
    const result = await caller().transmit({ id: 41 });
    expect(result).toEqual({ id: 41, status: "submitted", brokerOrderId: "K-100" });
    expect(state.updates).toEqual([expect.objectContaining({ status: "submitting" }), expect.objectContaining({ status: "submitted", brokerOrderId: "K-100" })]);
    expect(state.submissions).toEqual([expect.objectContaining({ symbol: "005930", quantity: 2, price: 100_000 })]);
  });

  it("확인 토큰이 없으면 브로커 전송 전 단계에서 차단한다", async () => {
    state.selectResults = [[{ ...confirmedIntent, confirmationNonce: null }], [profile], [{ ...confirmedIntent, confirmationNonce: null }]];
    await expect(caller().transmit({ id: 41 })).rejects.toMatchObject({ message: "필수 최종 확인이 완료되지 않았거나 이미 전송된 주문입니다." });
    expect(state.updates).toEqual([]);
    expect(state.submissions).toEqual([]);
  });

  it("킬 스위치·단일 매수 금액 상한·일일 거래 한도 초과 주문을 전송 전 단계에서 각각 차단한다", async () => {
    state.selectResults = [[confirmedIntent], [{ ...profile, killSwitch: true }], [confirmedIntent]];
    await expect(caller().transmit({ id: 41 })).rejects.toMatchObject({ message: "킬 스위치가 활성화되어 있습니다." });
    state.selectResults = [[confirmedIntent], [{ ...profile, maxBuyAmount: 150_000 }], [confirmedIntent]];
    await expect(caller().transmit({ id: 41 })).rejects.toMatchObject({ message: "주문 금액이 단일 매수 한도를 초과합니다." });
    state.selectResults = [[confirmedIntent], [{ ...profile, dailyTradeLimit: 1 }], [confirmedIntent, { ...confirmedIntent, id: 42, status: "submitted" }]];
    await expect(caller().transmit({ id: 41 })).rejects.toMatchObject({ message: "일일 거래 횟수 한도에 도달했습니다." });
    expect(state.updates).toEqual([]);
    expect(state.submissions).toEqual([]);
  });

  it("confirmed 상태 원자 선점이 실패하면 재전송을 충돌로 차단한다", async () => {
    state.selectResults = [[confirmedIntent], [profile], [confirmedIntent]];
    state.affectedRows = [0];
    await expect(caller().transmit({ id: 41 })).rejects.toMatchObject({ code: "CONFLICT", message: "이 주문은 이미 전송 처리 중이거나 처리되었습니다." });
    expect(state.submissions).toEqual([]);
  });

  it("OAuth 읽기 전용 오류 뒤에는 주문 API를 호출하지 않고 주문을 rejected로 기록한다", async () => {
    state.selectResults = [[confirmedIntent], [profile], [confirmedIntent]];
    state.affectedRows = [1, 1];
    state.tokenError = new Error("인증에 실패했습니다[8050:지정단말기 인증에 실패했습니다]");

    await expect(caller().transmit({ id: 41 })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: expect.stringContaining("8050"),
    });
    expect(state.submissions).toEqual([]);
    expect(state.updates).toEqual([
      expect.objectContaining({ status: "submitting" }),
      expect.objectContaining({ status: "rejected", riskReasonsJson: [expect.stringContaining("8050")] }),
    ]);
    expect(state.inserts).toEqual([expect.objectContaining({ executionStatus: "rejected" })]);
  });
});

describe("연구 후보 주문 초안 원본 경계", () => {
  it("키움 실제 관찰과 후보 연결이 없는 데이터에서는 주문 초안을 만들 수 없다", () => {
    expect(() => assertResearchObservationForOrder({ candidateId: null, source: "kiwoom_ka10032" })).toThrow("키움 실제 가격 관찰");
    expect(() => assertResearchObservationForOrder({ candidateId: 12, source: "generated_market" })).toThrow("키움 실제 가격 관찰");
    expect(() => assertResearchObservationForOrder({ candidateId: 12, source: "kiwoom_ka10032" })).not.toThrow();
    expect(() => assertResearchObservationForOrder({ candidateId: 12, source: "kiwoom_ka10032_entry" })).not.toThrow();
  });
});
