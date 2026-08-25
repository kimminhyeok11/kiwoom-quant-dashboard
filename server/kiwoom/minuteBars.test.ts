import { describe, expect, it } from "vitest";
import { normalizeKiwoomMinuteBars, parseKiwoomMinuteTimestamp } from "./minuteBars";

describe("키움 ka10080 1분봉 정규화", () => {
  it("KST 체결시각·음수 표기 가격을 UTC 1분봉 OHLCV로 정규화하고 시간순으로 정렬한다", () => {
    const bars = normalizeKiwoomMinuteBars([
      { cntr_tm: "20260818090200", cur_prc: "-70,100", open_pric: "70,200", high_pric: "70,300", low_pric: "-70,000", trde_qty: "1,200" },
      { cntr_tm: "20260818090100", cur_prc: "+70,200", open_pric: "70,000", high_pric: "70,250", low_pric: "69,950", trde_qty: "900" },
    ]);
    expect(bars).toEqual([
      { minuteAt: new Date("2026-08-18T00:01:00.000Z"), open: 70_000, high: 70_250, low: 69_950, close: 70_200, volume: 900 },
      { minuteAt: new Date("2026-08-18T00:02:00.000Z"), open: 70_200, high: 70_300, low: 70_000, close: 70_100, volume: 1_200 },
    ]);
  });

  it("유효하지 않은 체결 시각은 제외한다", () => {
    expect(parseKiwoomMinuteTimestamp("202608180901")).toBeNull();
    expect(normalizeKiwoomMinuteBars([{ cntr_tm: "invalid", cur_prc: "70000", open_pric: "70000", high_pric: "70000", low_pric: "70000", trde_qty: "1" }])).toEqual([]);
  });
});
