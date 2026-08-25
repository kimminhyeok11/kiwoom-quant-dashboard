import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const document = readFileSync(resolve(process.cwd(), "docs/kiwoom-integration-boundaries.md"), "utf8");

describe("키움 읽기 전용 어댑터 경계 문서", () => {
  it("제한적 읽기 재시도·8050 중단·주문 비재시도와 실제 데이터 원본 분리를 보존한다", () => {
    expect(document).toContain("최대 3회");
    expect(document).toContain("HTTP 408·429·5xx");
    expect(document).toContain("8050");
    expect(document).toContain("주문·계좌 변경성 요청");
    expect(document).toContain("과거 백테스트 원본으로 혼합");
  });
});
