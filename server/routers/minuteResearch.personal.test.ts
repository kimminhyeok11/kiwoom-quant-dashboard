import type { TrpcContext } from "../_core/context";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
}));
const heartbeatMock = vi.hoisted(() => ({
  createHeartbeatJob: vi.fn(),
  updateHeartbeatJob: vi.fn(),
  deleteHeartbeatJob: vi.fn(),
}));
const minuteResearchMock = vi.hoisted(() => ({
  DEFAULT_MINUTE_RESEARCH_CONFIGURATION: {
    combinationsPerSweep: 3_000, maxUniverseSymbols: 20, lookbackTradingDays: 20, validationTradingDays: 5,
    minimumTrades: 24, minimumValidationTrades: 8, maxDrawdownPercent: -4, stopLossPercent: 1.5,
    takeProfitPercent: 3, maxHoldingBars: 45, feeRate: 0.0003, slippageBps: 8, explorationMode: "survivor_core",
  },
  getMinuteResearchDashboard: vi.fn(),
  getPublicMinuteResearchDashboard: vi.fn(),
  runMinuteResearchSweep: vi.fn(),
}));

vi.mock("../db", () => ({ getDb: vi.fn(async () => dbMock) }));
vi.mock("../_core/heartbeat", () => heartbeatMock);
vi.mock("../quant/minuteResearch", () => minuteResearchMock);

import { appRouter } from "../routers";

function createUserContext(): TrpcContext {
  return {
    user: { id: 44, openId: "personal-arena-user", name: "개인 트레이너", email: "player@example.com", loginMethod: "manus", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: { protocol: "https", headers: { cookie: "" } } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("minuteResearch 개인 아레나", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.select.mockReturnValue({ from: () => ({ where: () => ({ limit: async () => [] }) }) });
    dbMock.insert.mockReturnValue({ values: () => ({ $returningId: async () => [{ id: 91 }] }) });
    dbMock.update.mockReturnValue({ set: () => ({ where: async () => undefined }) });
    minuteResearchMock.getMinuteResearchDashboard.mockResolvedValue({ program: null, sweeps: [], promoted: [] });
    minuteResearchMock.runMinuteResearchSweep.mockResolvedValue({ status: "completed", programId: 91, sweepId: 501, generatedCount: 3_000, promotedCount: 4 });
  });

  it("일반 로그인 사용자는 운영자 권한 없이 본인 개인 아레나를 만들고 수동 연구를 실행한다", async () => {
    const caller = appRouter.createCaller(createUserContext());

    const result = await caller.minuteResearch.runPersonal();

    expect(result).toMatchObject({ status: "completed", programId: 91, generatedCount: 3_000 });
    expect(dbMock.insert).toHaveBeenCalledTimes(1);
    expect(minuteResearchMock.runMinuteResearchSweep).toHaveBeenCalledWith(91);
  });

  it("개인 아레나는 예약 작업을 만들거나 키움 주문·계좌 절차에 접근하지 않는다", async () => {
    await appRouter.createCaller(createUserContext()).minuteResearch.runPersonal();

    expect(heartbeatMock.createHeartbeatJob).not.toHaveBeenCalled();
    expect(heartbeatMock.updateHeartbeatJob).not.toHaveBeenCalled();
    expect(heartbeatMock.deleteHeartbeatJob).not.toHaveBeenCalled();
  });

  it("개인 대시보드는 로그인한 트레이너의 사용자 ID로만 조회한다", async () => {
    const result = await appRouter.createCaller(createUserContext()).minuteResearch.personalDashboard();

    expect(minuteResearchMock.getMinuteResearchDashboard).toHaveBeenCalledWith(44);
    expect(result).toMatchObject({ program: null, sweeps: [] });
  });

  it("비로그인 요청은 개인 아레나 실행 전에 거부한다", async () => {
    const anonymousContext = { ...createUserContext(), user: null } as TrpcContext;

    await expect(appRouter.createCaller(anonymousContext).minuteResearch.runPersonal()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(minuteResearchMock.runMinuteResearchSweep).not.toHaveBeenCalled();
  });
});
