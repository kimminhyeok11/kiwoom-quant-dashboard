import { describe, expect, it } from "vitest";
import type { ConditionRule } from "../../shared/trading";
import { runWalkForward } from "./walkForward";

const bars = Array.from({ length: 90 }, (_, index) => {
  const close = 10_000 + index * 100;
  return { date: `2026-03-${String((index % 28) + 1).padStart(2, "0")}`, open: close - 20, high: close + 50, low: close - 40, close, volume: 100_000, turnover: 60_000_000_000 };
});
const rule: ConditionRule = { id: "turnover", type: "turnover", enabled: true, weight: 100, config: { days: 1, threshold: 1 } };

describe("워크포워드 분석", () => {
  it("각 폴드에서 학습 구간 뒤의 검증 구간만 거래 평가에 사용한다", () => {
    const result = runWalkForward({ bars, rules: [rule], configuration: { trainingDays: 30, validationDays: 20, stepDays: 20, minScore: 100, holdingDays: 2, feeRate: 0.00015, entryDelayDays: 1, entryTiming: "open" } });
    expect(result.foldCount).toBe(3);
    expect(result.folds[0]).toMatchObject({ trainingStartDate: bars[0]?.date, trainingEndDate: bars[29]?.date, validationStartDate: bars[30]?.date, validationEndDate: bars[49]?.date });
    expect(result.folds[0]?.result.trades[0]?.entryDate).toBe(bars[31]?.date);
    expect(result.tradeCount).toBeGreaterThan(0);
  });
});
