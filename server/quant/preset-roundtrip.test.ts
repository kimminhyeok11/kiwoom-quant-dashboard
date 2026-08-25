import { describe, expect, it } from "vitest";
import { evaluateExpression, type DailyBar } from "./conditions";

const bars: DailyBar[] = Array.from({ length: 65 }, (_, index) => ({
  date: `202601${String(index + 1).padStart(2, "0")}`,
  open: 100,
  high: 110,
  low: 100,
  close: 105,
  volume: 1_000,
  turnover: 100_000_000,
}));

describe("저장된 조건식 재평가", () => {
  it("직렬화·복원된 논리 그룹과 비교 연산자가 같은 평가 결과를 만든다", () => {
    const expression = {
      id: "root",
      logic: "OR" as const,
      enabled: true,
      children: [
        { id: "high", type: "high_return" as const, enabled: true, weight: 30, config: { days: 11, minPercent: 20, comparator: "초과", unit: "%" } },
        { id: "turnover", type: "turnover" as const, enabled: true, weight: 25, config: { days: 5, threshold: 50_000_000, comparator: "이상", unit: "원" } },
      ],
    };
    const restored = JSON.parse(JSON.stringify(expression));

    expect(evaluateExpression(restored, bars)).toEqual(evaluateExpression(expression, bars));
    expect(evaluateExpression(restored, bars)).toMatchObject({ eligible: true, score: 25, evaluations: [{ ruleId: "high", matched: false }, { ruleId: "turnover", matched: true }] });
  });
});
