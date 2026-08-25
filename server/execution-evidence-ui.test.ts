import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "client/src/pages/PublicDashboard.tsx"), "utf8");

describe("실행 증거 감사 화면", () => {
  it("OAuth 문구와 실제 일봉·조건식 결과를 분리하고 감사 API를 사용한다", () => {
    expect(source).toContain("auditTrail");
    expect(source).toContain("EXECUTION EVIDENCE LEDGER");
    expect(source).toContain("실행 증거");
    expect(source).toContain("실제 일봉 원본");
    expect(source).toContain("대상:");
    expect(source).toContain("주문 전송");
    expect(source).toContain("실행 요청 전송 중");
  });
});
