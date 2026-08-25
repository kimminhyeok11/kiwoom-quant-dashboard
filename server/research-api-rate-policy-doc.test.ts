import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const policy = readFileSync(resolve(process.cwd(), "docs/research-api-rate-policy.md"), "utf8");

describe("실제 데이터 연구 API 호출·토큰 정책 문서", () => {
  it("키움 공식 조회 한도·OAuth 응답·연구 전용 제외 범위·8050 보류 경계를 보존한다", () => {
    expect(policy).toContain("초당 5회");
    expect(policy).toContain("/oauth2/token");
    expect(policy).toContain("expires_dt");
    expect(policy).toContain("주문, 계좌, 체결, 실시간 감시, HTS 후보 수집은 이 정책의 적용 대상이 아니다.");
    expect(policy).toContain("8050 지정단말 인증 실패");
    expect(policy).toContain("https://openapi.kiwoom.com/intro?dummyVal=0");
  });
});
