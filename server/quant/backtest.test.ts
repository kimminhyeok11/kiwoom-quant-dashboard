import { describe, expect, it } from "vitest";
import type { ConditionRule } from "../../shared/trading";
import { runDailyBacktest } from "./backtest";

const bars = Array.from({ length: 75 }, (_, index) => {
  const close = 10_000 + index * 100;
  return { date: `2026-02-${String((index % 28) + 1).padStart(2, "0")}`, open: close - 20, high: close + 60, low: close - 40, close, volume: 100_000, turnover: 60_000_000_000 };
});
const rule: ConditionRule = { id: "ma", type: "ma_position", enabled: true, weight: 100, config: { periods: "5,21,60" } };

describe("daily bar backtest", () => {
  it("creates closed trades and calculates positive return in an upward series", () => {
    const result = runDailyBacktest({ bars, rules: [rule], minScore: 100, holdingDays: 3, feeRate: 0.001 });
    expect(result.tradeCount).toBeGreaterThan(0);
    expect(result.totalReturn).toBeGreaterThan(0);
    expect(result.winRate).toBe(100);
    expect(result.trades[0]?.exitDate).toBeTruthy();
  });

  it("preserves the legacy same-bar close entry when no research cutoff is specified", () => {
    const immediateRule: ConditionRule = { id: "turnover", type: "turnover", enabled: true, weight: 100, config: { days: 1, threshold: 1 } };
    const result = runDailyBacktest({ bars, rules: [immediateRule], minScore: 100, holdingDays: 1 });
    expect(result.trades[0]).toMatchObject({ entryDate: bars[0]?.date, entryPrice: bars[0]?.close });
  });

  it("records a delayed signal at the following bar open to prevent same-bar look-ahead", () => {
    const immediateRule: ConditionRule = { id: "turnover", type: "turnover", enabled: true, weight: 100, config: { days: 1, threshold: 1 } };
    const result = runDailyBacktest({ bars, rules: [immediateRule], minScore: 100, holdingDays: 1, entryDelayDays: 1, entryTiming: "open" });
    expect(result.trades[0]).toMatchObject({ entryDate: bars[1]?.date, entryPrice: bars[1]?.open, exitDate: bars[2]?.date });
  });
});
