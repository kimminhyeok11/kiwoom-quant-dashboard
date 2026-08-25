import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";

function contextFor(email: string | null) {
  return {
    req: {} as never,
    res: {} as never,
    user: email ? { id: 20, openId: "email-operator", email, role: "user" } : null,
  };
}

describe("이메일 기반 운영자 권한", () => {
  it("SALAD20C@GMAIL.COM OAuth 이메일은 대소문자와 무관하게 운영자로 판정한다", async () => {
    const caller = appRouter.createCaller(contextFor("SALAD20C@GMAIL.COM") as never);
    await expect(caller.auth.operator()).resolves.toBe(true);
    await expect(caller.quant.oauthStatus()).resolves.toMatchObject({ state: expect.any(String) });
  });

  it("다른 로그인 이메일은 운영자 전용 조회를 실행할 수 없다", async () => {
    const caller = appRouter.createCaller(contextFor("member@example.com") as never);
    await expect(caller.auth.operator()).resolves.toBe(false);
    await expect(caller.quant.oauthStatus()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
