import type { TrpcContext } from "../_core/context";
import { describe, expect, it } from "vitest";
import { appRouter } from "../routers";

function anonymousContext(): TrpcContext {
  return { user: null, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
}

describe("프로필 아바타 접근 경계", () => {
  it("프로필 조회와 아바타 변경은 로그인 사용자만 실행할 수 있다", async () => {
    const caller = appRouter.createCaller(anonymousContext());

    await expect(caller.profile.me()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.profile.updateAvatar({ avatarId: "dragon" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
