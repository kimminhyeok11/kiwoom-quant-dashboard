import { describe, expect, it } from "vitest";
import { KiwoomApiError, KiwoomClient } from "./client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const safeSettings = {
  environment: "live" as const,
  maxBuyAmount: 500_000,
  dailyTradeLimit: 3,
  killSwitch: false,
  autoTradeEnabled: true,
  requireConfirmation: true,
};

describe("Kiwoom live gateway safety", () => {
  beforeEach(() => {
    process.env.KIWOOM_API_MODE = "live";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.KIWOOM_API_MODE;
    delete process.env.KIWOOM_FIXED_IP_REGISTERED;
    delete process.env.KIWOOM_ACCOUNT_NUMBER;
    delete process.env.KIWOOM_ORDER_TRANSMISSION_ENABLED;
  });

  it("selects the operating endpoint by default", () => {
    const client = new KiwoomClient({ appKey: "key", appSecret: "secret" });
    expect(client.getStatus().mode).toBe("live");
  });

  it("exposes credential availability without returning any server-side key or account value", () => {
    process.env.KIWOOM_ACCOUNT_NUMBER = "1234567890";
    const client = new KiwoomClient({ appKey: "private-app-key", appSecret: "private-app-secret" });
    expect(client.getStatus()).toEqual(expect.objectContaining({ hasCredentials: true }));
    expect(JSON.stringify(client.getStatus())).not.toContain("private-app-key");
    expect(JSON.stringify(client.getStatus())).not.toContain("private-app-secret");
    expect(JSON.stringify(client.getStatus())).not.toContain("1234567890");
  });

  it("blocks every live order before fixed-IP registration and transmission approval", () => {
    const client = new KiwoomClient({ appKey: "key", appSecret: "secret" });
    expect(() => client.assertOrderMayBeSubmitted({
      candidate: { symbol: "005930", name: "테스트", side: "buy", quantity: 2, price: 100_000 },
      settings: safeSettings,
      confirmedOrderCountToday: 0,
      confirmedAt: new Date(),
      confirmationNonce: "confirm-1",
      status: "confirmed",
    })).toThrow(KiwoomApiError);
  });

  it("requires fixed IP registration before issuing a live token", async () => {
    const client = new KiwoomClient({ appKey: "key", appSecret: "secret" });
    await expect(client.issueAccessToken()).rejects.toMatchObject({ code: "FIXED_IP_REQUIRED" });
  });

  it("blocks live account evaluation before any broker request while fixed-IP verification is pending", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const client = new KiwoomClient({ appKey: "key", appSecret: "secret" });
    await expect(client.getAccountEvaluation("access-token")).rejects.toMatchObject({ code: "FIXED_IP_REQUIRED" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("reuses a valid OAuth token instead of issuing one for every API operation", async () => {
    process.env.KIWOOM_FIXED_IP_REGISTERED = "true";
    process.env.KIWOOM_ACCOUNT_NUMBER = "1234567890";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ token: "cached-token", token_type: "bearer", expires_dt: "20991231235959", return_code: 0 }),
    } as Response);
    const client = new KiwoomClient({ appKey: "cache-test-key", appSecret: "cache-test-secret" });

    await expect(client.getAccessToken()).resolves.toMatchObject({ token: "cached-token" });
    await expect(client.getAccessToken()).resolves.toMatchObject({ token: "cached-token" });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(client.getAccessTokenStatus()).toMatchObject({ state: "cached", expiresAt: "20991231235959", error: null });
  });

  it("does not reuse a token that is already within the pre-expiry refresh window", async () => {
    process.env.KIWOOM_FIXED_IP_REGISTERED = "true";
    process.env.KIWOOM_ACCOUNT_NUMBER = "1234567890";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ token: "short-lived-token", token_type: "bearer", expires_dt: "20200101000000", return_code: 0 }),
    } as Response);
    const client = new KiwoomClient({ appKey: "refresh-test-key", appSecret: "refresh-test-secret" });

    await client.getAccessToken();
    await client.getAccessToken();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("reports a not-issued OAuth state before any token request", () => {
    const client = new KiwoomClient({ appKey: "no-token-status-key", appSecret: "secret" });
    expect(client.getAccessTokenStatus()).toEqual({ state: "not_issued", expiresAt: null, error: null });
  });

  it("records a 8050 OAuth failure and never calls an order endpoint", async () => {
    process.env.KIWOOM_FIXED_IP_REGISTERED = "true";
    process.env.KIWOOM_ACCOUNT_NUMBER = "1234567890";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ return_code: 3, return_msg: "인증에 실패했습니다[8050:지정단말기 인증에 실패했습니다]" }),
    } as Response);
    const client = new KiwoomClient({ appKey: "oauth-8050-key", appSecret: "secret" });

    await expect(client.getAccessToken()).rejects.toMatchObject({
      code: 3,
      message: expect.stringContaining("8050"),
    });
    expect(client.getAccessTokenStatus()).toEqual({
      state: "error",
      expiresAt: null,
      error: expect.stringContaining("8050"),
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith("https://api.kiwoom.com/oauth2/token", expect.any(Object));
  });

  it("requests and normalizes ka10081 daily bars through the chart REST endpoint", async () => {
    process.env.KIWOOM_FIXED_IP_REGISTERED = "true";
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        return_code: 0,
        cont_yn: "N",
        stk_dt_pole_chart_qry: [
          { dt: "20260812", cur_prc: "+71,000", open_pric: "70,000", high_pric: "72,000", low_pric: "69,500", trde_qty: "1,200", trde_prica: "85" },
          { dt: "20260811", cur_prc: "70,000", open_pric: "69,000", high_pric: "71,000", low_pric: "68,500", trde_qty: "900", trde_prica: "63" },
        ],
      }),
    } as Response);
    const client = new KiwoomClient({ appKey: "daily-bars-key", appSecret: "secret" });

    await expect(client.getDailyBars("access-token", { symbol: "005930", baseDate: "20260812" })).resolves.toEqual([
      { date: "20260811", open: 69_000, high: 71_000, low: 68_500, close: 70_000, volume: 900, turnover: 63_000_000 },
      { date: "20260812", open: 70_000, high: 72_000, low: 69_500, close: 71_000, volume: 1_200, turnover: 85_000_000 },
    ]);
    expect(globalThis.fetch).toHaveBeenCalledWith("https://api.kiwoom.com/api/dostk/chart", expect.objectContaining({
      headers: expect.objectContaining({ "api-id": "ka10081", "cont-yn": "N" }),
    }));
  });

  it("requests and normalizes ka10080 five-minute bars through the read-only chart endpoint", async () => {
    process.env.KIWOOM_FIXED_IP_REGISTERED = "true";
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        return_code: 0,
        cont_yn: "N",
        stk_min_pole_chart_qry: [
          { cntr_tm: "20260812100500", cur_prc: "71,200", open_pric: "71,000", high_pric: "71,300", low_pric: "70,900", trde_qty: "1,500" },
          { cntr_tm: "20260812100000", cur_prc: "71,000", open_pric: "70,800", high_pric: "71,100", low_pric: "70,700", trde_qty: "1,200" },
        ],
      }),
    } as Response);
    const client = new KiwoomClient({ appKey: "five-minute-bars-key", appSecret: "secret" });

    await expect(client.getFiveMinuteBars("access-token", { symbol: "005930", baseDate: "20260812" })).resolves.toEqual([
      { minuteAt: new Date("2026-08-12T01:00:00.000Z"), open: 70_800, high: 71_100, low: 70_700, close: 71_000, volume: 1_200 },
      { minuteAt: new Date("2026-08-12T01:05:00.000Z"), open: 71_000, high: 71_300, low: 70_900, close: 71_200, volume: 1_500 },
    ]);
    expect(globalThis.fetch).toHaveBeenCalledWith("https://api.kiwoom.com/api/dostk/chart", expect.objectContaining({
      headers: expect.objectContaining({ "api-id": "ka10080", "cont-yn": "N" }),
      body: JSON.stringify({ stk_cd: "005930", tic_scope: "5", upd_stkpc_tp: "1", base_dt: "20260812" }),
    }));
  });

  it("retries only a transient daily-bar read failure and keeps the same normalized result contract", async () => {
    process.env.KIWOOM_FIXED_IP_REGISTERED = "true";
    const retryDelay = vi.fn(async () => undefined);
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({ return_code: 503, return_msg: "temporary" }) } as Response)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ return_code: 0, cont_yn: "N", stk_dt_pole_chart_qry: [{ dt: "20260812", cur_prc: "71000", open_pric: "70000", high_pric: "72000", low_pric: "69500", trde_qty: "1200", trde_prica: "85" }] }) } as Response);
    const client = new KiwoomClient({ appKey: "retry-read-key", appSecret: "secret", readRetryDelay: retryDelay });

    await expect(client.getDailyBars("access-token", { symbol: "005930", baseDate: "20260812" })).resolves.toHaveLength(1);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(retryDelay).toHaveBeenCalledWith(200);
  });

  it("uses official ka10032 headers and normalizes turnover ranking units", async () => {
    process.env.KIWOOM_FIXED_IP_REGISTERED = "true";
    const headers = new Headers({ "cont-yn": "Y", "next-key": "next-1" });
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      headers,
      json: async () => ({ return_code: 0, trde_prica_upper: [{ stk_cd: "005930", now_rank: "1", pred_rank: "2", stk_nm: "삼성전자", cur_prc: "+71,000", pred_pre: "+1,000", flu_rt: "+1.43", now_trde_qty: "1,200", pred_trde_qty: "900", trde_prica: "85" }] }),
    } as Response);
    const client = new KiwoomClient({ appKey: "ranking-key", appSecret: "secret" });

    await expect(client.getTurnoverRankings("access-token", { market: "001", exchange: "INTEGRATED" })).resolves.toEqual({
      items: [{ symbol: "005930", rank: 1, previousRank: 2, name: "삼성전자", price: 71_000, change: 1_000, changeRate: 1.43, volume: 1_200, previousVolume: 900, turnover: 85_000_000 }],
      continuation: { enabled: true, nextKey: "next-1" },
    });
    expect(globalThis.fetch).toHaveBeenCalledWith("https://api.kiwoom.com/api/dostk/rkinfo", expect.objectContaining({
      headers: expect.objectContaining({ "api-id": "ka10032", "cont-yn": "N", "next-key": "" }),
      body: JSON.stringify({ mrkt_tp: "001", mang_stk_incls: "0", stex_tp: "3" }),
    }));
  });

  it("uses explicit TR headers and normalizes order, execution, and account-evaluation responses", async () => {
    process.env.KIWOOM_FIXED_IP_REGISTERED = "true";
    process.env.KIWOOM_ORDER_TRANSMISSION_ENABLED = "true";
    process.env.KIWOOM_ACCOUNT_NUMBER = "1234567890";
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({ ok: true, json: async () => ({ return_code: 0, ord_no: "ORD-1", dmst_stex_tp: "KRX" }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ return_code: 0, acnt_ord_cntr_prps_dtl: [{ ord_no: "ORD-1", stk_cd: "005930", stk_nm: "삼성전자", ord_qty: "2", ord_uv: "70000", cntr_qty: "1", cntr_uv: "70100", ord_remnq: "1", ord_tm: "101500" }] }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ return_code: 0, tot_pur_amt: "140000", tot_evlt_amt: "142000", tot_evlt_pl: "2000", tot_prft_rt: "1.43", prsm_dpst_aset_amt: "500000", acnt_evlt_remn_indv_tot: [{ stk_cd: "005930", stk_nm: "삼성전자", rmnd_qty: "2", trde_able_qty: "2", pur_pric: "70000", cur_prc: "71000", evltv_prft: "2000", prft_rt: "1.43" }] }) } as Response);
    const client = new KiwoomClient({ appKey: "adapter-key", appSecret: "adapter-secret" });

    await expect(client.submitLiveBuyOrder("access-token", { symbol: "005930", quantity: 2, price: 70_000, exchange: "KRX", tradeType: "0" })).resolves.toEqual({ orderNumber: "ORD-1", exchange: "KRX" });
    await expect(client.listOrderExecutions("access-token", { queryType: "1", side: "0", exchange: "KRX" })).resolves.toEqual([expect.objectContaining({ orderNumber: "ORD-1", filledQuantity: 1, remainingQuantity: 1 })]);
    await expect(client.getAccountEvaluation("access-token")).resolves.toMatchObject({ totalProfitLoss: 2_000, positions: [expect.objectContaining({ symbol: "005930", currentPrice: 71_000 })] });
    expect(fetchSpy.mock.calls.map(call => (call[1] as RequestInit).headers)).toEqual(expect.arrayContaining([
      expect.objectContaining({ "api-id": "kt10000" }),
      expect.objectContaining({ "api-id": "kt00007" }),
      expect.objectContaining({ "api-id": "kt00018" }),
    ]));
  });

  it("never reaches the broker order endpoint before explicit transmission approval", async () => {
    const client = new KiwoomClient({ appKey: "key", appSecret: "secret" });
    await expect(client.submitLiveBuyOrder("test-token", {
      symbol: "005930", quantity: 1, price: 100_000, exchange: "KRX", tradeType: "0",
    })).rejects.toMatchObject({ code: "ORDER_TRANSMISSION_DISABLED" });
  });
});
