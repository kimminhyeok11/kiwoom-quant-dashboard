import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";

describe("방문 기기 IP 공개 조회", () => {
  it("현재 요청의 방문 IP만 정규화해 반환하고 사용자·주문 데이터는 포함하지 않는다", async () => {
    const caller = appRouter.createCaller({
      req: { ip: "::ffff:203.0.113.7", socket: { remoteAddress: "10.0.0.8" } } as any,
      res: {} as any,
      user: null,
    });
    await expect(caller.network.visitorIp()).resolves.toEqual({ ip: "203.0.113.7", scope: "current_request" });
  });

  it("프록시가 방문 기기 IP를 전달하지 않고 내부 루프백만 보이면 IP를 추정·표시하지 않는다", async () => {
    const caller = appRouter.createCaller({
      req: { ip: "127.0.0.1", headers: {}, socket: { remoteAddress: "::1" } } as any,
      res: {} as any,
      user: null,
    });
    await expect(caller.network.visitorIp()).resolves.toEqual({ ip: null, scope: "current_request" });
  });
});
