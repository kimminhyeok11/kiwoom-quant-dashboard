import { afterEach, describe, expect, it, vi } from "vitest";
import { KiwoomClient } from "./kiwoom/client";
import { appRouter } from "./routers";

function operatorContext() {
  return {
    req: {} as never,
    res: {} as never,
    user: { id: 20, openId: "email-operator", email: "SALAD20C@GMAIL.COM", role: "user" },
  };
}

describe("운영자 거래대금 순위 조회", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    new KiwoomClient({ appKey: "turnover-router-key", appSecret: "turnover-router-secret" }).clearAccessToken();
    delete process.env.KIWOOM_FIXED_IP_REGISTERED;
    delete process.env.KIWOOM_ACCOUNT_NUMBER;
    vi.unstubAllEnvs();
  });

  it("운영자만 OAuth 토큰을 얻은 뒤 ka10032 거래대금 순위를 조회한다", async () => {
    vi.stubEnv("AUTONOMOUS_RESEARCH_EXTERNAL_DATA_ENABLED", "true");
    process.env.KIWOOM_FIXED_IP_REGISTERED = "true";
    process.env.KIWOOM_ACCOUNT_NUMBER = "1234567890";
    process.env.KIWOOM_APP_KEY = "turnover-router-key";
    process.env.KIWOOM_APP_SECRET = "turnover-router-secret";
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({ ok: true, json: async () => ({ return_code: 0, token: "ranking-token", token_type: "bearer", expires_dt: "20991231235959" }) } as Response)
      .mockResolvedValueOnce({ ok: true, headers: new Headers({ "cont-yn": "N" }), json: async () => ({ return_code: 0, trde_prica_upper: [{ stk_cd: "005930", now_rank: "1", stk_nm: "삼성전자", cur_prc: "+71000", pred_pre: "+1000", flu_rt: "+1.43", now_trde_qty: "1200", pred_trde_qty: "900", trde_prica: "85" }] }) } as Response);

    const caller = appRouter.createCaller(operatorContext() as never);
    await expect(caller.rankings.turnover({ market: "001", exchange: "KRX", includeManagedStocks: false })).resolves.toMatchObject({
      items: [expect.objectContaining({ symbol: "005930", turnover: 85_000_000 })],
      continuation: { enabled: false, nextKey: null },
    });
  });
});
