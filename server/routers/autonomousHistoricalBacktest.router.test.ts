import { describe, expect, it, vi } from "vitest";

const { run } = vi.hoisted(() => ({
  run: vi.fn().mockResolvedValue({ status: "waiting", runId: 42, message: "지정 단말 인증을 기다리고 있습니다.", reused: false }),
}));

vi.mock("../quant/publicHistoricalBacktest", () => ({ publicHistoricalBacktest: { run } }));

import { autonomousResearchRouter } from "./autonomousResearch";

describe("autonomousResearch.runHistoricalBacktest", () => {
  it("익명 요청은 외부 API와 DB를 사용하는 백테스트를 시작할 수 없다", async () => {
    const caller = autonomousResearchRouter.createCaller({ user: null, req: {} as any, res: {} as any });

    await expect(caller.runHistoricalBacktest()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(run).not.toHaveBeenCalled();
  });

  it("운영자만 백테스트를 시작할 수 있다", async () => {
    const caller = autonomousResearchRouter.createCaller({ user: { id: 1, openId: "operator", role: "admin" }, req: {} as any, res: {} as any });

    await expect(caller.runHistoricalBacktest()).resolves.toEqual({ status: "waiting", runId: 42, message: "지정 단말 인증을 기다리고 있습니다.", reused: false });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("익명 요청은 수집 요청·주문 운영 상태·장중 기록 동기화를 실행할 수 없다", async () => {
    const caller = autonomousResearchRouter.createCaller({ user: null, req: {} as any, res: {} as any });

    await expect(caller.requestMinuteCollection()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.mockOrderOperationStatus()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.syncDayTradeHistory({ runId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
