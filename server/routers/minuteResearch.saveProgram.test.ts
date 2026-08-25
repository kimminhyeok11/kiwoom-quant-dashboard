import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../_core/context";

const dbMock = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
}));
const heartbeatMock = vi.hoisted(() => ({
  createHeartbeatJob: vi.fn(),
  updateHeartbeatJob: vi.fn(),
  deleteHeartbeatJob: vi.fn(),
}));

vi.mock("../db", () => ({ getDb: vi.fn(async () => dbMock) }));
vi.mock("../_core/heartbeat", () => heartbeatMock);

import { appRouter } from "../routers";

function createContext(role: "admin" | "user"): TrpcContext {
  return {
    user: {
      id: 17,
      openId: `program-${role}`,
      name: "프로그램 테스트",
      email: "program@example.com",
      loginMethod: "manus",
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: { cookie: "" } } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("minuteResearch.saveProgram 권한 및 저장", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.select.mockReturnValue({ from: () => ({ where: () => ({ limit: async () => [] }) }) });
    dbMock.insert.mockReturnValue({ values: () => ({ $returningId: async () => [{ id: 73 }] }) });
    heartbeatMock.createHeartbeatJob.mockResolvedValue({ taskUid: "minute-task-73", nextExecutionAt: null });
  });

  it("관리자는 일별 연구 프로그램을 저장하고 예약 작업 ID를 받는다", async () => {
    const caller = appRouter.createCaller(createContext("admin"));
    const session = await caller.auth.me();
    const result = await caller.minuteResearch.saveProgram({
      name: "1분봉 일별 검증",
      cronExpression: "0 30 7 * * 1-5",
      enabled: true,
    });

    expect(session).toMatchObject({ role: "admin", isOperator: true, operatorReason: "admin_role" });
    expect(result).toEqual({ programId: 73, taskUid: "minute-task-73", nextExecutionAt: null });
    expect(heartbeatMock.createHeartbeatJob).toHaveBeenCalledTimes(1);
  });

  it("일반 사용자는 프로그램 저장 전에 운영자 권한 거부를 받는다", async () => {
    await expect(appRouter.createCaller(createContext("user")).minuteResearch.saveProgram({
      name: "1분봉 일별 검증",
      cronExpression: "0 30 7 * * 1-5",
      enabled: true,
    })).rejects.toMatchObject({ code: "FORBIDDEN", message: "운영자 권한이 필요합니다." });
    expect(heartbeatMock.createHeartbeatJob).not.toHaveBeenCalled();
  });
});
