import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({
  upsertUser: vi.fn(),
  getUserByOpenId: vi.fn(),
}));

vi.mock("../db", () => dbMock);

import { refreshAuthenticatedUser } from "./sdk";

describe("인증 사용자 역할 새로고침", () => {
  beforeEach(() => vi.clearAllMocks());

  it("기존 세션 사용자도 upsert 뒤 최신 관리자 역할을 다시 읽는다", async () => {
    const staleUser = {
      id: 1,
      openId: "owner-open-id",
      name: "소유자",
      email: "owner@example.com",
      loginMethod: "manus",
      role: "user" as const,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    };
    const refreshedUser = { ...staleUser, role: "admin" as const };
    dbMock.getUserByOpenId.mockResolvedValue(refreshedUser);

    const result = await refreshAuthenticatedUser(staleUser, new Date("2026-08-20T00:00:00.000Z"));

    expect(dbMock.upsertUser).toHaveBeenCalledWith({ openId: "owner-open-id", lastSignedIn: new Date("2026-08-20T00:00:00.000Z") });
    expect(result.role).toBe("admin");
  });
});
