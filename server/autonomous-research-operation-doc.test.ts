import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const document = readFileSync(resolve(process.cwd(), "docs/autonomous-research-operation.md"), "utf8");

describe("무설정 장중 자동 리서치 운영 설계", () => {
  it("사용자 입력 제거, 실제 데이터만 사용, 멱등 실행과 주문 배제를 보존한다", () => {
    expect(document).toContain("사용자는 조건식");
    expect(document).toContain("중복 없는 유전자");
    expect(document).toContain("runKey");
    expect(document).toContain("waiting_for_data");
    expect(document).toContain("주문 API는 이 자동 리서치 경로에서 호출하지 않는다");
  });
});
