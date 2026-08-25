import { describe, expect, it } from "vitest";
import { defaultAutoTradePolicy, normalizeAutoTradePolicy } from "./autoTradePolicy";

describe("automatic live-trading policy", () => {
  it("keeps capital and risk parameters as explicit execution-time values", () => {
    expect(defaultAutoTradePolicy).toMatchObject({ totalCapital: 10_000_000, maxConcurrentPositions: 5, stopLossPercent: 2, takeProfitPercent: 3, dailyLossLimitPercent: 3 });
    expect(normalizeAutoTradePolicy({ totalCapital: 12_345_678.9, maxConcurrentPositions: 4.9, stopLossPercent: 1.23456, takeProfitPercent: 2.34567, dailyLossLimitPercent: 4.56789 }))
      .toEqual({ totalCapital: 12_345_678, maxConcurrentPositions: 4, stopLossPercent: 1.2346, takeProfitPercent: 2.3457, dailyLossLimitPercent: 4.5679 });
  });
});
