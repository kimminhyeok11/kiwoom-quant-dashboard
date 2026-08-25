import { describe, expect, it } from "vitest";
import { resolveDashboardAccess } from "../client/src/lib/accessPolicy";

describe("대시보드 접근 가드", () => {
  it("익명 방문자는 운영자 화면이 아닌 공개 대시보드로 안내한다", () => {
    expect(resolveDashboardAccess(false, false)).toBe("public");
  });

  it("일반 로그인 사용자는 공개 대시보드에 유지한다", () => {
    expect(resolveDashboardAccess(true, false)).toBe("public");
  });

  it("인증된 운영자만 실거래 대시보드로 진입한다", () => {
    expect(resolveDashboardAccess(true, true)).toBe("operator");
  });
});
