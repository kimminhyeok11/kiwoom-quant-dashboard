import { describe, expect, it } from "vitest";
import { TokenRequestPacer } from "./rateLimiter";

describe("토큰별 국내주식 조회 요청 조절기", () => {
  it("같은 토큰의 요청은 최소 200ms 간격으로 예약한다", async () => {
    let current = 0; const delays: number[] = [];
    const pacer = new TokenRequestPacer(200, () => current, async milliseconds => { delays.push(milliseconds); current += milliseconds; });
    await pacer.wait("live:token-a"); await pacer.wait("live:token-a"); await pacer.wait("live:token-a");
    expect(delays).toEqual([200, 200]);
  });

  it("서로 다른 토큰은 독립적으로 첫 요청을 시작할 수 있다", async () => {
    const delays: number[] = [];
    const pacer = new TokenRequestPacer(200, () => 0, async milliseconds => { delays.push(milliseconds); });
    await pacer.wait("live:token-a"); await pacer.wait("live:token-b");
    expect(delays).toEqual([]);
  });
});
