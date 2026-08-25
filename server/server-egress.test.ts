import { afterEach, describe, expect, it } from "vitest";
import { clearServerEgressIdentityCache, resolveServerEgressIdentity } from "./_core/serverEgress";

describe("서버 egress IP 확인", () => {
  afterEach(() => clearServerEgressIdentityCache());

  it("서버가 조회한 IP만 반환하고 호출 간에는 캐시한다", async () => {
    let requests = 0;
    const fetcher = async () => {
      requests += 1;
      return { ok: true, text: async () => "203.0.113.42\n" };
    };
    const now = new Date("2026-08-15T00:00:00.000Z");
    await expect(resolveServerEgressIdentity({ fetcher, now })).resolves.toMatchObject({ ip: "203.0.113.42", cacheStatus: "fresh" });
    await expect(resolveServerEgressIdentity({ fetcher, now: new Date("2026-08-15T00:04:00.000Z") })).resolves.toMatchObject({ ip: "203.0.113.42" });
    expect(requests).toBe(2);
  });

  it("서버 외부 조회에 실패하면 방문 기기 IP로 대체하지 않는다", async () => {
    await expect(resolveServerEgressIdentity({ fetcher: async () => { throw new Error("offline"); } })).resolves.toMatchObject({ ip: null, cacheStatus: "unavailable" });
  });

  it("서로 다른 egress 응답이 나오면 키움 등록값을 제공하지 않는다", async () => {
    let index = 0;
    const fetcher = async () => ({ ok: true, text: async () => ["198.51.100.11", "198.51.100.12"][index++]! });
    await expect(resolveServerEgressIdentity({ fetcher })).resolves.toMatchObject({ ip: null, cacheStatus: "mismatch" });
  });
});
