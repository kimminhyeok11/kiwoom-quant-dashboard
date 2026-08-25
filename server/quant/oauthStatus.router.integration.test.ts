import { describe, expect, it, vi } from "vitest";

vi.mock("../kiwoom/client", () => ({
  KiwoomClient: class {
    getAccessTokenStatus = () => ({ state: "expiring", expiresAt: "20260812113000", error: null });
  },
}));

import { quantRouter } from "../routers/quant";

describe("quant.oauthStatus 운영자 보호 API", () => {
  it("운영자는 토큰 상태·만료 시각을 조회한다", async () => {
    const caller = quantRouter.createCaller({ user: { id: 1, openId: "operator", role: "admin" } as any, req: {} as any, res: {} as any });
    await expect(caller.oauthStatus()).resolves.toEqual({ state: "expiring", expiresAt: "20260812113000", error: null });
  });

  it("일반 로그인 사용자는 토큰 상태 API에 접근할 수 없다", async () => {
    const caller = quantRouter.createCaller({ user: { id: 2, openId: "member", role: "user" } as any, req: {} as any, res: {} as any });
    await expect(caller.oauthStatus()).rejects.toMatchObject({ code: "FORBIDDEN", message: "운영자 권한이 필요합니다." });
  });
});
