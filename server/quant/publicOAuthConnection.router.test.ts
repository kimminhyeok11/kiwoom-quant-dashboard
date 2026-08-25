import { describe, expect, it, vi } from "vitest";

const { check } = vi.hoisted(() => ({
  check: vi.fn().mockResolvedValue({ status: "waiting", checkedAt: "2026-08-15T04:00:00.000Z", expiresAt: null, message: "지정 단말 인증을 기다리고 있습니다.", reused: false }),
}));

vi.mock("../kiwoom/publicConnectionCheck", () => ({ publicOAuthConnectionCheck: { check } }));

import { quantRouter } from "../routers/quant";

describe("quant.verifyOAuthConnection 연결 확인 권한", () => {
  it("익명 요청은 서버 측 OAuth 확인을 시작할 수 없다", async () => {
    const caller = quantRouter.createCaller({ user: null, req: {} as any, res: {} as any });

    await expect(caller.verifyOAuthConnection()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(check).not.toHaveBeenCalled();
  });

  it("운영자만 서버 측 OAuth 확인 결과를 받을 수 있다", async () => {
    const caller = quantRouter.createCaller({ user: { id: 1, openId: "operator", role: "admin" }, req: {} as any, res: {} as any });

    await expect(caller.verifyOAuthConnection()).resolves.toEqual({
      status: "waiting",
      checkedAt: "2026-08-15T04:00:00.000Z",
      expiresAt: null,
      message: "지정 단말 인증을 기다리고 있습니다.",
      reused: false,
    });
    expect(check).toHaveBeenCalledTimes(1);
  });
});
