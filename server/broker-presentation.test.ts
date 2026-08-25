import { describe, expect, it } from "vitest";
import { presentKiwoomAccess, presentOAuthStatus } from "../client/src/lib/brokerPresentation";

describe("키움 연결 상태 표시", () => {
  it("OAuth 상태를 운영 문구로 매핑한다", () => {
    expect(presentOAuthStatus({ state: "not_issued", expiresAt: null, error: null }).label).toBe("미발급");
    expect(presentOAuthStatus({ state: "cached", expiresAt: "20991231235959", error: null }).label).toBe("캐시됨");
    expect(presentOAuthStatus({ state: "expiring", expiresAt: "20260812090000", error: null }).label).toBe("만료 임박");
    expect(presentOAuthStatus({ state: "error", expiresAt: null, error: "접근 거부" }).detail).toBe("접근 거부");
  });

  it("지정 단말 등록 상태와 실제 OAuth 접근 성공을 구분해 설명한다", () => {
    expect(presentKiwoomAccess(false).detail).toContain("키움 REST API에서만 관리");
    expect(presentKiwoomAccess(true).label).toBe("지정 단말 등록 상태");
    expect(presentKiwoomAccess(true).detail).toContain("OAuth 토큰 발급이 성공해야 확인");
  });
});
