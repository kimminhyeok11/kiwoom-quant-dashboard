import { describe, expect, it } from "vitest";
import { humanRule } from "./rulePresentation";

describe("humanRule", () => {
  it("거래대금 조건의 실제 기간·금액·단위·비교 연산을 정확히 표시한다", () => {
    expect(humanRule({ type: "turnover", config: { days: 40, threshold: 500, unit: "억원", comparator: "이상" } })).toBe("최근 40일 내 최대 거래대금이 500억 원 이상 (≥)");
  });

  it("원 단위 거래대금은 원 금액과 억 원 환산값을 함께 표시한다", () => {
    expect(humanRule({ type: "turnover", config: { days: 5, threshold: 50_000_000_000, unit: "원", comparator: "미만" } })).toBe("최근 5일 내 최대 거래대금이 50,000,000,000원 (500억 원) 미만 (<)");
  });
});
