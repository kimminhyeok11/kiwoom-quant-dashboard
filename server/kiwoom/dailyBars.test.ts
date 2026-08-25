import { describe, expect, it } from "vitest";
import { normalizeKiwoomDailyBars } from "./dailyBars";

describe("normalizeKiwoomDailyBars", () => {
  it("converts official ka10081 fields to ascending DailyBar data and normalizes turnover to won", () => {
    const bars = normalizeKiwoomDailyBars([
      { dt: "20260812", cur_prc: "+71,000", open_pric: "70,000", high_pric: "72,000", low_pric: "69,500", trde_qty: "1,200", trde_prica: "85" },
      { dt: "20260811", cur_prc: "69,800", open_pric: "68,800", high_pric: "70,100", low_pric: "68,500", trde_qty: "900", trde_prica: "63" },
    ]);
    expect(bars).toEqual([
      { date: "20260811", open: 68800, high: 70100, low: 68500, close: 69800, volume: 900, turnover: 63000000 },
      { date: "20260812", open: 70000, high: 72000, low: 69500, close: 71000, volume: 1200, turnover: 85000000 },
    ]);
  });
});
