import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { KiwoomClient } from "./kiwoom/client";

const anonymousContext = {
  req: {} as never,
  res: {} as never,
  user: null,
};

describe("공개 대시보드 접근 정책", () => {
  it("로그인 없이 브로커 연결 상태를 조회할 수 있다", async () => {
    const caller = appRouter.createCaller(anonymousContext as never);
    await expect(caller.quant.brokerStatus()).resolves.toEqual(expect.objectContaining({
      hasCredentials: expect.any(Boolean),
      fixedIpRegistered: expect.any(Boolean),
      oauth: expect.any(Object),
    }));
  });

  it("지정 단말 등록 플래그를 OAuth 접근 성공으로 해석하지 않는다", async () => {
    new KiwoomClient().clearAccessToken();
    const caller = appRouter.createCaller(anonymousContext as never);
    await expect(caller.quant.brokerStatus()).resolves.toMatchObject({
      fixedIpRegistered: process.env.KIWOOM_FIXED_IP_REGISTERED === "true",
      oauth: { state: "not_issued", expiresAt: null, error: null },
    });
  });

  it("로그인 없이 운영자 권한이 부여되지 않는다", async () => {
    const caller = appRouter.createCaller(anonymousContext as never);
    await expect(caller.auth.operator()).resolves.toBe(false);
  });

  it("로그인 없이 모든 운영자 전용 데이터 API가 차단된다", async () => {
    const caller = appRouter.createCaller(anonymousContext as never);
    await expect(caller.account.listPositions()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.orders.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.tradingProfile.get()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.presets.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.backtests.list()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(caller.quant.dailyBars({ symbol: "005930", maxPages: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.rankings.turnover({})).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.rankings.refresh({ presetId: 1, universe: [{ symbol: "005930" }] })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.rankingRefresh.get()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.rankingRefresh.save({ presetId: 1, universe: [{ symbol: "005930" }], maxPagesPerSymbol: 3, cron: "0 */15 * * * *", enabled: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.presets.detail({ id: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.quant.evaluatePreset({ presetId: 1, symbol: "005930", maxPages: 3 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
