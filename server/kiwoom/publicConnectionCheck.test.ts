import { describe, expect, it, vi } from "vitest";
import { KiwoomApiError } from "./client";
import { PublicOAuthConnectionChecker } from "./publicConnectionCheck";

describe("PublicOAuthConnectionChecker", () => {
  it("서버 측 토큰 발급 성공 결과만 공개하고 토큰 값은 반환하지 않는다", async () => {
    const issue = vi.fn().mockResolvedValue({ token: "secret-token", tokenType: "bearer", expiresAt: "20260815070000" });
    const checker = new PublicOAuthConnectionChecker({ createClient: () => ({ getAccessToken: issue }), now: () => Date.UTC(2026, 7, 15, 4, 0, 0) });

    await expect(checker.check()).resolves.toEqual({
      status: "connected",
      checkedAt: "2026-08-15T04:00:00.000Z",
      expiresAt: "20260815070000",
      message: "서버에서 키움 OAuth 연결을 확인했습니다. 필요할 때 이 버튼으로 다시 확인할 수 있습니다.",
      reused: false,
    });
    expect(issue).toHaveBeenCalledTimes(1);
  });

  it("8050 지정 단말 오류는 안전한 연결 대기 메시지로 정규화한다", async () => {
    const checker = new PublicOAuthConnectionChecker({
      createClient: () => ({ getAccessToken: vi.fn().mockRejectedValue(new KiwoomApiError("인증에 실패했습니다[8050:지정단말기 인증에 실패했습니다]", 3)) }),
      now: () => Date.UTC(2026, 7, 15, 4, 0, 0),
    });

    await expect(checker.check()).resolves.toMatchObject({
      status: "waiting",
      expiresAt: null,
      reason: "fixed_ip_required",
      message: expect.stringContaining("지정 단말 인증"),
    });
  });

  it("짧은 간격의 반복 확인은 이전 결과를 재사용해 OAuth 요청을 중복하지 않는다", async () => {
    let now = 1_000;
    const issue = vi.fn().mockResolvedValue({ token: "secret-token", tokenType: "bearer", expiresAt: "20260815070000" });
    const checker = new PublicOAuthConnectionChecker({ createClient: () => ({ getAccessToken: issue }), now: () => now, cooldownMs: 60_000 });

    const first = await checker.check();
    now += 10_000;
    const second = await checker.check();

    expect(issue).toHaveBeenCalledTimes(1);
    expect(first.reused).toBe(false);
    expect(second).toEqual({ ...first, reused: true });
  });

  it("직접 누른 연결 확인은 전역 자동 실행 보류 설정과 무관하게 토큰 발급만 읽기 전용으로 요청한다", async () => {
    const issue = vi.fn().mockResolvedValue({ token: "secret-token", tokenType: "bearer", expiresAt: "20260815070000" });
    const checker = new PublicOAuthConnectionChecker({ createClient: () => ({ getAccessToken: issue }) });

    await expect(checker.check()).resolves.toMatchObject({ status: "connected" });
    expect(issue).toHaveBeenCalledTimes(1);
  });
});
