import { describe, expect, it } from "vitest";
import { presentOAuthConnection } from "./oauthConnectionPresentation";

describe("presentOAuthConnection", () => {
  it("확인 전에는 사용자가 직접 실행할 수 있는 연결 확인을 안내한다", () => {
    expect(presentOAuthConnection()).toMatchObject({
      tone: "waiting",
      title: "키움 연결 확인",
      detail: expect.stringContaining("원하는 때"),
    });
  });

  it("성공 시 토큰 값 없이 연결 완료와 만료 예정만 표시한다", () => {
    const view = presentOAuthConnection({ status: "connected", checkedAt: "2026-08-15T04:00:00.000Z", expiresAt: "20260815070000", message: "서버에서 키움 OAuth 접근 토큰을 확인했습니다.", reused: false });

    expect(view).toEqual({
      tone: "connected",
      title: "키움 연결 완료",
      detail: "서버에서 키움 OAuth 접근 토큰을 확인했습니다.",
      timestamp: "토큰 만료 예정 20260815070000",
    });
    expect(JSON.stringify(view)).not.toContain("secret");
  });

  it("8050 확인 결과는 현재 배포 서버 재검증임을 밝히고 최근 확인 재사용 여부를 함께 표시한다", () => {
    const view = presentOAuthConnection({ status: "waiting", checkedAt: "2026-08-15T04:00:00.000Z", expiresAt: null, message: "키움 응답 8050: 지정 단말 인증이 필요합니다.", reused: true, reason: "fixed_ip_required" });

    expect(view).toMatchObject({ tone: "waiting", title: "현재 배포 서버 재검증 · 키움 지정 단말 등록 필요", timestamp: "최근 확인 결과를 재사용했습니다." });
  });
});
