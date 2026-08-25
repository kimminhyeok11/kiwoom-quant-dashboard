import { describe, expect, it } from "vitest";
import type { DailyBar } from "./conditions";
import { createFiveMinuteContextProvider } from "./backtest";

const fiveMinuteBars: DailyBar[] = Array.from({ length: 14 }, (_, index) => ({
  date: `2026-02-${index < 12 ? "03" : "04"}T${String(9 + Math.floor((index % 12) / 12)).padStart(2, "0")}:${String((index % 12) * 5).padStart(2, "0")}:00.000Z`,
  open: 10_000 + index,
  high: 10_010 + index,
  low: 9_990 + index,
  close: 10_005 + index,
  volume: 100 + index,
  turnover: 1_000_000 + index,
}));

const dailyBars: DailyBar[] = [
  { date: "2026-02-02", open: 9_900, high: 10_000, low: 9_800, close: 9_950, volume: 1_000, turnover: 9_950_000 },
  { date: "2026-02-03", open: 10_000, high: 99_999, low: 9_990, close: 99_000, volume: 9_999, turnover: 999_000_000 },
  { date: "2026-02-04", open: 10_100, high: 88_888, low: 10_050, close: 88_000, volume: 8_888, turnover: 888_000_000 },
];

describe("5분봉 다중 시간축 맥락", () => {
  it("신호 시점에 완료된 10분·60분봉과 전 거래일 일봉만 전달한다", () => {
    const contextAt = createFiveMinuteContextProvider(fiveMinuteBars, dailyBars);
    const firstDayBeforeTenMinuteClose = contextAt(0, fiveMinuteBars.slice(0, 1));
    const firstDayAfterTenMinuteClose = contextAt(1, fiveMinuteBars.slice(0, 2));
    const firstDayAfterSixtyMinuteClose = contextAt(11, fiveMinuteBars.slice(0, 12));
    const secondDay = contextAt(12, fiveMinuteBars.slice(0, 13));

    expect(firstDayBeforeTenMinuteClose.timeframeBars?.ten_minute).toHaveLength(0);
    expect(firstDayAfterTenMinuteClose.timeframeBars?.ten_minute).toHaveLength(1);
    expect(firstDayAfterSixtyMinuteClose.timeframeBars?.sixty_minute).toHaveLength(1);
    expect(firstDayAfterTenMinuteClose.timeframeBars?.daily?.map(bar => bar.date)).toEqual(["2026-02-02"]);
    expect(secondDay.timeframeBars?.daily?.map(bar => bar.date)).toEqual(["2026-02-02", "2026-02-03"]);
    expect(firstDayAfterTenMinuteClose.timeframeBars?.daily?.some(bar => bar.high === 99_999)).toBe(false);
  });
});
