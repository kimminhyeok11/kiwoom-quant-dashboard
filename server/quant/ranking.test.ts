import { describe, expect, it } from "vitest";
import type { ConditionRule } from "../../shared/trading";
import { rankCandidates } from "./ranking";

const bars = (increment: number) => Array.from({ length: 70 }, (_, index) => {
  const close = 10_000 + index * increment;
  return { date: `2026-03-${String((index % 28) + 1).padStart(2, "0")}`, open: close - 20, high: close + 50, low: close - 50, close, volume: 100_000, turnover: 55_000_000_000 };
});
const rules: ConditionRule[] = [{ id: "ma", type: "ma_position", enabled: true, weight: 50, config: { periods: "5,21,60" } }];

describe("candidate ranking", () => {
  it("orders matching candidates by score then daily change rate", () => {
    const ranked = rankCandidates(rules, [{ symbol: "A", name: "느린 상승", bars: bars(20) }, { symbol: "B", name: "빠른 상승", bars: bars(100) }]);
    expect(ranked.map(item => item.symbol)).toEqual(["B", "A"]);
    expect(ranked[0]).toMatchObject({ rank: 1, score: 50, matchedRuleIds: ["ma"] });
  });
});
