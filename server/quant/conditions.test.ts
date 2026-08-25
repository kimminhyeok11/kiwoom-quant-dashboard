import { describe, expect, it } from "vitest";
import type { ConditionRule } from "../../shared/trading";
import { atrPercent, bollingerBands, evaluateExpression, evaluateStrategy, highReturnPercent, isAboveMovingAverages, isMacdRising, isNewHigh, relativeStrengthIndex, stochasticK, volumeRatio } from "./conditions";

const bars = Array.from({ length: 80 }, (_, index) => {
  const close = 10_000 + index * 120 + (index % 5) * 9;
  return { date: `2026-01-${String((index % 28) + 1).padStart(2, "0")}`, open: close - 30, high: close + 70, low: close - 90, close, volume: 100_000 + index * 100, turnover: index === 78 ? 65_000_000_000 : 10_000_000_000 };
});

const rules: ConditionRule[] = [
  { id: "macd", type: "macd_rising", enabled: true, weight: 30, config: { lookback: 3 } },
  { id: "ma", type: "ma_position", enabled: true, weight: 25, config: { periods: "5,21,60" } },
  { id: "return", type: "high_return", enabled: true, weight: 20, config: { days: 11, minPercent: 5 } },
  { id: "turnover", type: "turnover", enabled: true, weight: 25, config: { days: 5, threshold: 50_000_000_000 } },
];

describe("condition engine", () => {
  it("evaluates the requested four technical condition families", () => {
    expect(isMacdRising(bars, 3)).toBe(true);
    expect(isAboveMovingAverages(bars, [5, 21, 60])).toBe(true);
    expect(highReturnPercent(bars, 11)).toBeGreaterThan(5);
  });

  it("adds only matched rule weights to a strategy score", () => {
    const result = evaluateStrategy(rules, bars);
    expect(result.matchedCount).toBe(4);
    expect(result.score).toBe(100);
  });

  it("applies a detailed comparator and reports actual-versus-expected evidence", () => {
    const result = evaluateStrategy([{ id: "turnover-below", type: "turnover", enabled: true, weight: 20, config: { days: 5, threshold: 70_000_000_000, comparator: "미만" } }], bars);
    expect(result).toMatchObject({ score: 20, matchedCount: 1 });
    expect(result.evaluations[0]).toMatchObject({ actual: 65_000_000_000, expected: 70_000_000_000, comparator: "미만", matched: true });
  });

  it("applies AND, OR, and NOT logic to the eligibility of a condition expression", () => {
    const result = evaluateStrategy([
      { id: "return", type: "high_return", enabled: true, weight: 20, config: { days: 11, minPercent: 5, logic: "AND" } },
      { id: "too-high-turnover", type: "turnover", enabled: true, weight: 20, config: { days: 5, threshold: 70_000_000_000, logic: "AND" } },
    ], bars);
    expect(result).toMatchObject({ eligible: false, score: 0, matchedCount: 1 });
    const withOr = evaluateStrategy([{ id: "return", type: "high_return", enabled: true, weight: 20, config: { days: 11, minPercent: 5 } }, { id: "alternate", type: "turnover", enabled: true, weight: 20, config: { days: 5, threshold: 70_000_000_000, logic: "OR" } }], bars);
    expect(withOr).toMatchObject({ eligible: true, score: 20 });
  });

  it("evaluates detailed MACD and moving-average comparator settings", () => {
    const result = evaluateStrategy([
      { id: "macd", type: "macd_rising", enabled: true, weight: 20, config: { lookback: 3, comparator: "이상" } },
      { id: "ma", type: "ma_position", enabled: true, weight: 20, config: { periods: "5,21,60", comparator: "이상", logic: "AND" } },
    ], bars);
    expect(result).toMatchObject({ eligible: true, score: 40, matchedCount: 2 });
    expect(result.evaluations[1]).toMatchObject({ comparator: "이상", actual: expect.any(Number), expected: expect.any(Number) });
  });

  it("applies a saved moving-average period and normalizes turnover thresholds expressed in 억원", () => {
    const result = evaluateStrategy([
      { id: "ma-21", type: "ma_position", enabled: true, weight: 30, config: { periods: "21", comparator: "이상", unit: "원" } },
      { id: "turnover-eok", type: "turnover", enabled: true, weight: 25, config: { days: 5, threshold: 500, comparator: "이상", unit: "억원", logic: "AND" } },
    ], bars);
    expect(result).toMatchObject({ eligible: true, score: 55, matchedCount: 2 });
    expect(result.evaluations).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: "ma-21", detail: expect.stringContaining("21일선") }),
      expect.objectContaining({ ruleId: "turnover-eok", expected: 50_000_000_000, matched: true }),
    ]));
  });

  it("normalizes unsupported crossing comparators on threshold rules to an explicit threshold comparison", () => {
    const result = evaluateStrategy([
      { id: "high-normalized", type: "high_return", enabled: true, weight: 20, config: { days: 11, minPercent: 5, comparator: "상향돌파", unit: "%" } },
      { id: "turnover-normalized", type: "turnover", enabled: true, weight: 20, config: { days: 5, threshold: 500, comparator: "하향돌파", unit: "억원", logic: "AND" } },
    ], bars);
    expect(result).toMatchObject({ eligible: true, score: 40 });
    expect(result.evaluations).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: "high-normalized", comparator: "이상", matched: true }),
      expect.objectContaining({ ruleId: "turnover-normalized", comparator: "이상", expected: 50_000_000_000, matched: true }),
    ]));
  });

  it("종가 변동률·시가 갭·봉 내부 종가 위치 규칙을 실제 OHLCV에서 평가한다", () => {
    const result = evaluateStrategy([
      { id: "close-change", type: "close_change", enabled: true, weight: 10, config: { days: 1, threshold: -100, comparator: "이상" } },
      { id: "gap", type: "gap_percent", enabled: true, weight: 10, config: { threshold: -100, comparator: "이상", logic: "AND" } },
      { id: "position", type: "intrabar_position", enabled: true, weight: 10, config: { threshold: 0, comparator: "이상", logic: "AND" } },
    ], bars);

    expect(result).toMatchObject({ eligible: true, score: 30, matchedCount: 3 });
  });

  it("normalizes unsupported units per indicator family before evaluating and explains the effective unit", () => {
    const result = evaluateStrategy([
      { id: "macd-unit", type: "macd_rising", enabled: true, weight: 10, config: { lookback: 3, unit: "억원" } },
      { id: "ma-unit", type: "ma_position", enabled: true, weight: 10, config: { periods: "21", unit: "%", logic: "AND" } },
      { id: "high-unit", type: "high_return", enabled: true, weight: 10, config: { days: 11, minPercent: 5, unit: "원", logic: "AND" } },
      { id: "turnover-unit", type: "turnover", enabled: true, weight: 10, config: { days: 5, threshold: 50_000_000_000, unit: "달러", logic: "AND" } },
    ], bars);
    expect(result).toMatchObject({ eligible: true, score: 40 });
    expect(result.evaluations).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: "macd-unit", detail: expect.stringContaining("지수") }),
      expect.objectContaining({ ruleId: "ma-unit", detail: expect.stringContaining("원") }),
      expect.objectContaining({ ruleId: "high-unit", detail: expect.stringContaining("%") }),
      expect.objectContaining({ ruleId: "turnover-unit", expected: 50_000_000_000 }),
    ]));
  });

  it("evaluates nested AND, OR, and NOT groups recursively", () => {
    const expression = {
      id: "root", logic: "AND" as const, enabled: true, children: [
        { id: "return", type: "high_return" as const, enabled: true, weight: 20, config: { days: 11, minPercent: 5 } },
        { id: "not-expensive-turnover", logic: "NOT" as const, enabled: true, children: [{ id: "turnover", type: "turnover" as const, enabled: true, weight: 20, config: { days: 5, threshold: 70_000_000_000 } }] },
      ],
    };
    const result = evaluateExpression(expression, bars);
    expect(result).toMatchObject({ eligible: true, score: 20 });
    expect(result.evaluations).toHaveLength(2);
  });

  it("evaluates RSI, Bollinger, stochastic, ATR, and volume-ratio genes from daily bars", () => {
    expect(relativeStrengthIndex(bars, 14)).toBeGreaterThan(50);
    expect(bollingerBands(bars, 20, 2)?.upper).toBeGreaterThan(bollingerBands(bars, 20, 2)?.middle ?? 0);
    expect(stochasticK(bars, 14)).toBeGreaterThan(50);
    expect(atrPercent(bars, 14)).toBeGreaterThan(0);
    expect(volumeRatio(bars, 20)).toBeGreaterThan(1);
    const result = evaluateStrategy([
      { id: "rsi", type: "rsi", enabled: true, weight: 10, config: { period: 14, threshold: 50, comparator: "이상" } },
      { id: "bollinger", type: "bollinger", enabled: true, weight: 10, config: { period: 20, deviation: 2, band: "middle", comparator: "이상", logic: "AND" } },
      { id: "stochastic", type: "stochastic", enabled: true, weight: 10, config: { period: 14, threshold: 50, comparator: "이상", logic: "AND" } },
      { id: "atr", type: "atr_percent", enabled: true, weight: 10, config: { period: 14, threshold: 0, comparator: "초과", logic: "AND" } },
      { id: "volume", type: "volume_ratio", enabled: true, weight: 10, config: { period: 20, threshold: 1, comparator: "초과", logic: "AND" } },
    ], bars);
    expect(result).toMatchObject({ eligible: true, score: 50, matchedCount: 5 });
    expect(result.evaluations.map(item => item.ruleId)).toEqual(["rsi", "bollinger", "stochastic", "atr", "volume"]);
  });

  it("제공 조건식에서 직접 변환한 신고가·MACD 기준선·볼린저 상향돌파를 실제 봉으로 평가한다", () => {
    expect(isNewHigh(bars, 5)).toBe(true);
    const result = evaluateStrategy([
      { id: "new-high", type: "new_high", enabled: true, weight: 10, config: { period: 5 } },
      { id: "macd-level", type: "macd_level", enabled: true, weight: 10, config: { threshold: -1_000_000, comparator: "이상", logic: "AND" } },
      { id: "bollinger-cross", type: "bollinger", enabled: true, weight: 10, config: { period: 20, deviation: 2, band: "upper", comparator: "상향돌파", lookback: 80, logic: "AND" } },
    ], bars);
    expect(result.evaluations).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: "new-high", matched: true, comparator: "신고가" }),
      expect.objectContaining({ ruleId: "macd-level", matched: true, actual: expect.any(Number), expected: -1_000_000 }),
      expect.objectContaining({ ruleId: "bollinger-cross", matched: expect.any(Boolean), comparator: "상향돌파" }),
    ]));
  });

  it("복합 HTS 카드의 시간축별 반복 거래대금·거래량·양봉·가격 범위를 같은 시점 원본에서 평가한다", () => {
    const result = evaluateStrategy([
      { id: "daily-macd", type: "macd_level", enabled: true, weight: 20, config: { timeframe: "daily", threshold: -1_000_000, comparator: "이상" } },
      { id: "five-minute-turnover", type: "turnover_count", enabled: true, weight: 20, config: { timeframe: "five_minute", days: 5, threshold: 50_000_000_000, count: 1, comparator: "이상", logic: "AND" } },
      { id: "five-minute-volume-repeat", type: "volume_ratio_count", enabled: true, weight: 20, config: { timeframe: "five_minute", days: 3, threshold: 0.9, count: 2, comparator: "이상", logic: "AND" } },
      { id: "daily-bullish", type: "bullish_candle_count", enabled: true, weight: 20, config: { timeframe: "daily", days: 3, count: 3, comparator: "이상", logic: "AND" } },
      { id: "daily-price-range", type: "price_range", enabled: true, weight: 20, config: { timeframe: "daily", minPrice: 2_000, maxPrice: 200_000, logic: "AND" } },
    ], { activeBars: bars.slice(-5), timeframeBars: { daily: bars, five_minute: bars } });

    expect(result).toMatchObject({ eligible: true, score: 100, matchedCount: 5 });
    expect(result.evaluations.map(item => item.ruleId)).toEqual(["daily-macd", "five-minute-turnover", "five-minute-volume-repeat", "daily-bullish", "daily-price-range"]);
  });
});
