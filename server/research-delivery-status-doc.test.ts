import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const document = readFileSync(resolve(process.cwd(), "docs/research-delivery-status.md"), "utf8");

describe("조건식 리서치 제공 상태 문서", () => {
  it("구현 완료 연구 기능과 외부 지정 단말 검증 보류를 명확히 분리한다", () => {
    expect(document).toContain("10~20개 규칙 유전자");
    expect(document).toContain("SHA-256 지문");
    expect(document).toContain("독립 OOS·워크포워드");
    expect(document).toContain("고정 공인 출발지 IP");
    expect(document).toContain("휴대폰 IP");
    expect(document).toContain("8050");
    expect(document).toContain("무설정 장중 자동 리서치");
    expect(document).toContain("게시 후 별도 운영 절차");
  });
});
