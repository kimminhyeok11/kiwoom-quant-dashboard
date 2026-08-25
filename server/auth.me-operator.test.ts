import { describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { getOperatorReason } from "./auth/operator";
import { appRouter } from "./routers";

function createContext(role: "admin" | "user"): TrpcContext {
  return {
    user: {
      id: 1,
      openId: `operator-${role}`,
      name: "권한 테스트",
      email: "operator@example.com",
      loginMethod: "manus",
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("auth.me 운영자 판정", () => {
  it("관리자 역할은 로그인 세션 응답에서 운영자로 명시된다", async () => {
    const result = await appRouter.createCaller(createContext("admin")).auth.me();
    expect(result).toMatchObject({ role: "admin", isOperator: true, operatorReason: "admin_role" });
  });

  it("일반 사용자 역할은 운영자로 표시되지 않는다", async () => {
    const result = await appRouter.createCaller(createContext("user")).auth.me();
    expect(result).toMatchObject({ role: "user", isOperator: false, operatorReason: null });
  });

  it("실제 세션 openId를 소유자 설정과 직접 대조해 소유자 근거를 남긴다", () => {
    const previousOwnerOpenId = process.env.OWNER_OPEN_ID;
    process.env.OWNER_OPEN_ID = "owner-session-open-id";
    try {
      expect(getOperatorReason({ openId: "owner-session-open-id", email: "other@example.com", role: "user" })).toBe("owner_open_id");
      expect(getOperatorReason({ openId: "different-session-open-id", email: "other@example.com", role: "user" })).toBeNull();
    } finally {
      if (previousOwnerOpenId === undefined) delete process.env.OWNER_OPEN_ID;
      else process.env.OWNER_OPEN_ID = previousOwnerOpenId;
    }
  });

  it("관리자 역할은 일별 연구와 실제 관찰 조회의 운영자 절차를 통과한다", async () => {
    const caller = appRouter.createCaller(createContext("admin"));

    const dashboard = await caller.minuteResearch.dashboard();
    const observations = await caller.paperPortfolio.latestActualObservations({ limit: 30 });

    expect(dashboard).toHaveProperty("program");
    expect(Array.isArray(observations)).toBe(true);
  }, 10_000);

  it("일반 사용자 역할은 일별 연구와 실제 관찰 조회에서 운영자 권한 거부를 받는다", async () => {
    const caller = appRouter.createCaller(createContext("user"));

    await expect(caller.minuteResearch.dashboard()).rejects.toMatchObject({ code: "FORBIDDEN", message: "운영자 권한이 필요합니다." });
    await expect(caller.paperPortfolio.latestActualObservations({ limit: 30 })).rejects.toMatchObject({ code: "FORBIDDEN", message: "운영자 권한이 필요합니다." });
  });
});
