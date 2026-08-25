import type { ConditionExpressionGroup, ConditionRule } from "../../shared/trading";

export type DailyBar = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  turnover: number;
};

export type ConditionTimeframe = "active" | "daily" | "five_minute" | "three_minute" | "two_minute" | "one_minute" | "ten_minute" | "sixty_minute";

export type ConditionEvaluationContext = {
  activeBars: DailyBar[];
  timeframeBars?: Partial<Record<ConditionTimeframe, DailyBar[]>>;
};

type ConditionBarsInput = DailyBar[] | ConditionEvaluationContext;

export type ConditionEvaluation = {
  ruleId: string;
  matched: boolean;
  score: number;
  detail: string;
  actual?: number;
  expected?: number;
  comparator?: string;
};

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function simpleMovingAverage(bars: DailyBar[], period: number): number | null {
  if (period <= 0 || bars.length < period) return null;
  return average(bars.slice(-period).map(bar => bar.close));
}

export function exponentialMovingAverage(values: number[], period: number): number[] {
  if (period <= 0 || values.length === 0) return [];
  const multiplier = 2 / (period + 1);
  return values.reduce<number[]>((series, value, index) => {
    const previous = series[index - 1] ?? value;
    series.push(index === 0 ? value : (value - previous) * multiplier + previous);
    return series;
  }, []);
}

export function macdHistogram(bars: DailyBar[], fast = 12, slow = 26, signal = 9): number[] {
  if (bars.length < slow) return [];
  const closes = bars.map(bar => bar.close);
  const fastEma = exponentialMovingAverage(closes, fast);
  const slowEma = exponentialMovingAverage(closes, slow);
  const macdLine = closes.map((_, index) => fastEma[index] - slowEma[index]);
  const signalLine = exponentialMovingAverage(macdLine, signal);
  return macdLine.map((value, index) => value - signalLine[index]);
}

export function isMacdRising(bars: DailyBar[], lookback = 3): boolean {
  const histogram = macdHistogram(bars);
  if (histogram.length < lookback) return false;
  const values = histogram.slice(-lookback);
  return values.every((value, index) => index === 0 || value > values[index - 1]);
}

export function isNewHigh(bars: DailyBar[], period = 5): boolean {
  if (period <= 1 || bars.length < period) return false;
  const window = bars.slice(-period);
  return window.at(-1)!.high >= Math.max(...window.slice(0, -1).map(bar => bar.high));
}

function evaluateBarsForRule(input: ConditionBarsInput, rule: ConditionRule): DailyBar[] {
  if (Array.isArray(input)) return input;
  const requested = String(rule.config.timeframe ?? "active") as ConditionTimeframe;
  if (requested === "active") return input.activeBars;
  return input.timeframeBars?.[requested] ?? [];
}

function countBollingerUpperBreakouts(bars: DailyBar[], period: number, deviation: number, withinBars: number) {
  const start = Math.max(period, bars.length - Math.max(1, withinBars));
  let count = 0;
  for (let index = start; index < bars.length; index += 1) {
    const currentBars = bars.slice(0, index + 1);
    const previousBars = bars.slice(0, index);
    const currentBands = bollingerBands(currentBars, period, deviation);
    const previousBands = bollingerBands(previousBars, period, deviation);
    const current = currentBars.at(-1);
    const previous = previousBars.at(-1);
    if (currentBands && previousBands && current && previous && current.close > currentBands.upper && previous.close <= previousBands.upper) count += 1;
  }
  return count;
}

export function isAboveMovingAverages(bars: DailyBar[], periods: number[]): boolean {
  const close = bars.at(-1)?.close;
  if (!close) return false;
  const averages = periods.map(period => simpleMovingAverage(bars, period));
  return averages.every(value => value !== null && close > value);
}

export function highReturnPercent(bars: DailyBar[], days: number): number | null {
  if (days <= 0 || bars.length < days) return null;
  const window = bars.slice(-days);
  const low = Math.min(...window.map(bar => bar.low));
  const high = Math.max(...window.map(bar => bar.high));
  return ((high - low) / low) * 100;
}

export function hasTurnoverThreshold(bars: DailyBar[], days: number, threshold: number): boolean {
  return bars.slice(-days).some(bar => bar.turnover >= threshold);
}

export function relativeStrengthIndex(bars: DailyBar[], period = 14): number | null {
  if (period <= 0 || bars.length <= period) return null;
  const changes = bars.slice(-(period + 1)).slice(1).map((bar, index) => bar.close - bars.slice(-(period + 1))[index]!.close);
  const gains = changes.map(value => Math.max(value, 0)); const losses = changes.map(value => Math.max(-value, 0));
  const averageGain = average(gains); const averageLoss = average(losses);
  if (averageLoss === 0) return 100;
  return 100 - 100 / (1 + averageGain / averageLoss);
}

export function bollingerBands(bars: DailyBar[], period = 20, deviation = 2): { upper: number; middle: number; lower: number } | null {
  if (period <= 0 || bars.length < period) return null;
  const values = bars.slice(-period).map(bar => bar.close); const middle = average(values); const variance = average(values.map(value => (value - middle) ** 2)); const standardDeviation = Math.sqrt(variance);
  return { upper: middle + deviation * standardDeviation, middle, lower: middle - deviation * standardDeviation };
}

export function stochasticK(bars: DailyBar[], period = 14): number | null {
  if (period <= 0 || bars.length < period) return null;
  const window = bars.slice(-period); const high = Math.max(...window.map(bar => bar.high)); const low = Math.min(...window.map(bar => bar.low)); const close = window.at(-1)!.close;
  return high === low ? 50 : ((close - low) / (high - low)) * 100;
}

export function atrPercent(bars: DailyBar[], period = 14): number | null {
  if (period <= 0 || bars.length <= period) return null;
  const window = bars.slice(-(period + 1)); const trueRanges = window.slice(1).map((bar, index) => Math.max(bar.high - bar.low, Math.abs(bar.high - window[index]!.close), Math.abs(bar.low - window[index]!.close)));
  const close = window.at(-1)!.close;
  return close > 0 ? average(trueRanges) / close * 100 : null;
}

export function volumeRatio(bars: DailyBar[], period = 20): number | null {
  if (period <= 0 || bars.length < period + 1) return null;
  const current = bars.at(-1)!.volume; const baseline = average(bars.slice(-(period + 1), -1).map(bar => bar.volume));
  return baseline > 0 ? current / baseline : null;
}

export function closeChangePercent(bars: DailyBar[], days = 1): number | null {
  if (days <= 0 || bars.length < days + 1) return null;
  const previous = bars.at(-(days + 1))!.close;
  const current = bars.at(-1)!.close;
  return previous > 0 ? (current / previous - 1) * 100 : null;
}

export function gapPercent(bars: DailyBar[]): number | null {
  if (bars.length < 2) return null;
  const previousClose = bars.at(-2)!.close;
  const open = bars.at(-1)!.open;
  return previousClose > 0 ? (open / previousClose - 1) * 100 : null;
}

export function intrabarClosePosition(bars: DailyBar[]): number | null {
  const latest = bars.at(-1);
  if (!latest || latest.high <= latest.low) return null;
  return (latest.close - latest.low) / (latest.high - latest.low) * 100;
}

function comparatorFor(rule: ConditionRule) {
  const comparator = String(rule.config.comparator ?? "이상");
  if ((rule.type === "high_return" || rule.type === "turnover" || rule.type === "turnover_count" || rule.type === "volume_ratio_count" || rule.type === "bullish_candle_count" || rule.type === "price_range" || rule.type === "close_change" || rule.type === "gap_percent" || rule.type === "intrabar_position") && !["이상", "초과", "이하", "미만", "between"].includes(comparator)) return "이상";
  return comparator;
}

function normalizedUnitFor(rule: ConditionRule): "지수" | "원" | "%" | "억원" | "배" | "회" {
  if (rule.type === "macd_rising" || rule.type === "macd_level") return "지수";
  if (rule.type === "ma_position") return "원";
  if (["high_return", "rsi", "stochastic", "atr_percent", "close_change", "gap_percent", "intrabar_position"].includes(rule.type)) return "%";
  if (rule.type === "volume_ratio") return "배";
  if (rule.type === "volume_ratio_count") return "회";
  if (rule.type === "bullish_candle_count" || rule.type === "turnover_count") return "회";
  if (rule.type === "price_range") return "원";
  if (rule.type === "bollinger") return "원";
  return rule.config.unit === "억원" ? "억원" : "원";
}

function matchesComparator(actual: number, expected: number, comparator: string): boolean {
  if (comparator === "초과") return actual > expected;
  if (comparator === "이하") return actual <= expected;
  if (comparator === "미만") return actual < expected;
  return actual >= expected;
}

function evaluateMacdComparator(bars: DailyBar[], lookback: number, comparator: string) {
  const histogram = macdHistogram(bars);
  const actual = histogram.at(-1) ?? 0;
  const previous = histogram.at(-2) ?? 0;
  if (comparator === "상향돌파") return { matched: previous <= 0 && actual > 0, actual, expected: 0 };
  if (comparator === "하향돌파") return { matched: previous >= 0 && actual < 0, actual, expected: 0 };
  if (comparator === "이하" || comparator === "미만") return { matched: matchesComparator(actual, previous, comparator), actual, expected: previous };
  return { matched: isMacdRising(bars, lookback), actual, expected: previous };
}

function evaluateMovingAverageComparator(bars: DailyBar[], periods: number[], comparator: string) {
  const actual = bars.at(-1)?.close ?? 0;
  const averages = periods.map(period => simpleMovingAverage(bars, period)).filter((value): value is number => value !== null);
  const expected = averages.length ? average(averages) : 0;
  const above = averages.length === periods.length && actual > Math.max(...averages);
  const below = averages.length === periods.length && actual < Math.min(...averages);
  const previousBars = bars.slice(0, -1);
  const previousClose = previousBars.at(-1)?.close ?? 0;
  const previousAverages = periods.map(period => simpleMovingAverage(previousBars, period)).filter((value): value is number => value !== null);
  const wasBelow = previousAverages.length === periods.length && previousClose <= Math.max(...previousAverages);
  const wasAbove = previousAverages.length === periods.length && previousClose >= Math.min(...previousAverages);
  if (comparator === "상향돌파") return { matched: above && wasBelow, actual, expected };
  if (comparator === "하향돌파") return { matched: below && wasAbove, actual, expected };
  if (comparator === "이하" || comparator === "미만") return { matched: below, actual, expected };
  return { matched: above, actual, expected };
}

export function evaluateRule(rule: ConditionRule, input: ConditionBarsInput): ConditionEvaluation {
  const bars = evaluateBarsForRule(input, rule);
  const numberConfig = (key: string, fallback: number) => typeof rule.config[key] === "number" ? Number(rule.config[key]) : fallback;
  if (!rule.enabled) return { ruleId: rule.id, matched: false, score: 0, detail: "비활성 조건" };
  if (!bars.length) return { ruleId: rule.id, matched: false, score: 0, detail: "선택 시간축 원본 없음" };

  if (rule.type === "macd_rising") {
    const lookback = numberConfig("lookback", 3);
    const comparator = comparatorFor(rule);
    const evaluation = evaluateMacdComparator(bars, lookback, comparator);
    return { ruleId: rule.id, matched: evaluation.matched, score: evaluation.matched ? rule.weight : 0, detail: `MACD 히스토그램 ${lookback}봉 ${comparator} (${normalizedUnitFor(rule)})`, actual: evaluation.actual, expected: evaluation.expected, comparator };
  }
  if (rule.type === "macd_level") {
    const actual = macdHistogram(bars).at(-1) ?? 0;
    const threshold = numberConfig("threshold", 0);
    const comparator = comparatorFor(rule);
    const matched = matchesComparator(actual, threshold, comparator);
    return { ruleId: rule.id, matched, score: matched ? rule.weight : 0, detail: `MACD 히스토그램 ${actual.toFixed(4)} ${comparator} ${threshold.toFixed(4)} (${normalizedUnitFor(rule)})`, actual, expected: threshold, comparator };
  }
  if (rule.type === "ma_position") {
    const periods = String(rule.config.periods ?? rule.config.period ?? "5,21,60").split(",").map(Number).filter(period => Number.isFinite(period) && period > 0);
    const comparator = comparatorFor(rule);
    const evaluation = evaluateMovingAverageComparator(bars, periods, comparator);
    return { ruleId: rule.id, matched: evaluation.matched, score: evaluation.matched ? rule.weight : 0, detail: `종가가 ${periods.join("·")}일선 기준 ${comparator} (${normalizedUnitFor(rule)})`, actual: evaluation.actual, expected: evaluation.expected, comparator };
  }
  if (rule.type === "high_return") {
    const days = numberConfig("days", 11);
    const minPercent = numberConfig("minPercent", 20);
    const change = highReturnPercent(bars, days);
    const comparator = comparatorFor(rule);
    const matched = change !== null && matchesComparator(change, minPercent, comparator);
    return { ruleId: rule.id, matched, score: matched ? rule.weight : 0, detail: `${days}일 고저 변동률 ${change?.toFixed(2) ?? "N/A"}${normalizedUnitFor(rule)} ${comparator} ${minPercent}${normalizedUnitFor(rule)}`, actual: change ?? undefined, expected: minPercent, comparator };
  }
  if (rule.type === "new_high") {
    const period = numberConfig("period", 5);
    const window = bars.slice(-period);
    const actual = window.at(-1)?.high;
    const expected = window.length > 1 ? Math.max(...window.slice(0, -1).map(bar => bar.high)) : undefined;
    const matched = actual !== undefined && expected !== undefined && actual >= expected;
    return { ruleId: rule.id, matched, score: matched ? rule.weight : 0, detail: `${period}봉 신고가`, actual, expected, comparator: "신고가" };
  }
  if (rule.type === "close_change") {
    const days = numberConfig("days", 1); const threshold = numberConfig("threshold", 2); const actual = closeChangePercent(bars, days); const comparator = comparatorFor(rule);
    const matched = actual !== null && matchesComparator(actual, threshold, comparator);
    return { ruleId: rule.id, matched, score: matched ? rule.weight : 0, detail: `${days}봉 종가 변동률 ${actual?.toFixed(2) ?? "N/A"}% ${comparator} ${threshold}%`, actual: actual ?? undefined, expected: threshold, comparator };
  }
  if (rule.type === "gap_percent") {
    const threshold = numberConfig("threshold", 1); const actual = gapPercent(bars); const comparator = comparatorFor(rule);
    const matched = actual !== null && matchesComparator(actual, threshold, comparator);
    return { ruleId: rule.id, matched, score: matched ? rule.weight : 0, detail: `시가 갭 ${actual?.toFixed(2) ?? "N/A"}% ${comparator} ${threshold}%`, actual: actual ?? undefined, expected: threshold, comparator };
  }
  if (rule.type === "intrabar_position") {
    const threshold = numberConfig("threshold", 70); const actual = intrabarClosePosition(bars); const comparator = comparatorFor(rule);
    const matched = actual !== null && matchesComparator(actual, threshold, comparator);
    return { ruleId: rule.id, matched, score: matched ? rule.weight : 0, detail: `봉 내부 종가 위치 ${actual?.toFixed(2) ?? "N/A"}% ${comparator} ${threshold}%`, actual: actual ?? undefined, expected: threshold, comparator };
  }
  if (rule.type === "rsi") {
    const period = numberConfig("period", 14); const threshold = numberConfig("threshold", 70); const actual = relativeStrengthIndex(bars, period); const comparator = comparatorFor(rule);
    const matched = actual !== null && matchesComparator(actual, threshold, comparator);
    return { ruleId: rule.id, matched, score: matched ? rule.weight : 0, detail: `RSI(${period}) ${actual?.toFixed(2) ?? "N/A"} ${comparator} ${threshold}`, actual: actual ?? undefined, expected: threshold, comparator };
  }
  if (rule.type === "bollinger") {
    const period = numberConfig("period", 20); const deviation = numberConfig("deviation", 2); const band = String(rule.config.band ?? "upper"); const bands = bollingerBands(bars, period, deviation); const actual = bars.at(-1)?.close; const expected = bands ? (band === "lower" ? bands.lower : band === "middle" ? bands.middle : bands.upper) : undefined; const comparator = comparatorFor(rule);
    if (band === "upper" && comparator === "상향돌파") {
      const withinBars = numberConfig("withinBars", 1);
      const breakoutCount = countBollingerUpperBreakouts(bars, period, deviation, withinBars);
      const matched = breakoutCount > 0;
      return { ruleId: rule.id, matched, score: matched ? rule.weight : 0, detail: `볼린저(${period}, ${deviation}σ) 상단 상향돌파 ${withinBars}봉 내`, actual: breakoutCount, expected: 1, comparator };
    }
    const matched = actual !== undefined && expected !== undefined && matchesComparator(actual, expected, comparator);
    return { ruleId: rule.id, matched, score: matched ? rule.weight : 0, detail: `볼린저(${period}, ${deviation}σ) ${band} 밴드 기준 ${comparator}`, actual, expected, comparator };
  }
  if (rule.type === "stochastic") {
    const period = numberConfig("period", 14); const threshold = numberConfig("threshold", 80); const actual = stochasticK(bars, period); const comparator = comparatorFor(rule);
    const matched = actual !== null && matchesComparator(actual, threshold, comparator);
    return { ruleId: rule.id, matched, score: matched ? rule.weight : 0, detail: `스토캐스틱 %K(${period}) ${actual?.toFixed(2) ?? "N/A"} ${comparator} ${threshold}`, actual: actual ?? undefined, expected: threshold, comparator };
  }
  if (rule.type === "atr_percent") {
    const period = numberConfig("period", 14); const threshold = numberConfig("threshold", 3); const actual = atrPercent(bars, period); const comparator = comparatorFor(rule);
    const matched = actual !== null && matchesComparator(actual, threshold, comparator);
    return { ruleId: rule.id, matched, score: matched ? rule.weight : 0, detail: `ATR 비율(${period}) ${actual?.toFixed(2) ?? "N/A"}% ${comparator} ${threshold}%`, actual: actual ?? undefined, expected: threshold, comparator };
  }
  if (rule.type === "volume_ratio") {
    const period = numberConfig("period", 20); const threshold = numberConfig("threshold", 1.5); const actual = volumeRatio(bars, period); const comparator = comparatorFor(rule);
    const matched = actual !== null && matchesComparator(actual, threshold, comparator);
    return { ruleId: rule.id, matched, score: matched ? rule.weight : 0, detail: `거래량 비율(${period}) ${actual?.toFixed(2) ?? "N/A"}배 ${comparator} ${threshold}배`, actual: actual ?? undefined, expected: threshold, comparator };
  }
  if (rule.type === "turnover_count") {
    const days = numberConfig("days", 5); const rawThreshold = numberConfig("threshold", 50_000_000_000); const threshold = rule.config.unit === "억원" ? rawThreshold * 100_000_000 : rawThreshold; const requiredCount = numberConfig("count", 1); const actual = bars.slice(-days).filter(bar => bar.turnover >= threshold).length; const comparator = comparatorFor(rule); const matched = matchesComparator(actual, requiredCount, comparator);
    return { ruleId: rule.id, matched, score: matched ? rule.weight : 0, detail: `${days}봉 내 거래대금 ${threshold.toLocaleString("ko-KR")}원 이상 ${actual}회`, actual, expected: requiredCount, comparator };
  }
  if (rule.type === "volume_ratio_count") {
    const days = numberConfig("days", 5); const threshold = numberConfig("threshold", 1); const requiredCount = numberConfig("count", 1); const window = bars.slice(-(days + 1)); const actual = window.slice(1).filter((bar, index) => window[index]!.volume > 0 && bar.volume / window[index]!.volume >= threshold).length; const comparator = comparatorFor(rule); const matched = matchesComparator(actual, requiredCount, comparator);
    return { ruleId: rule.id, matched, score: matched ? rule.weight : 0, detail: `${days}봉 내 전봉 대비 거래량 ${threshold.toFixed(2)}배 이상 ${actual}회`, actual, expected: requiredCount, comparator };
  }
  if (rule.type === "bullish_candle_count") {
    const days = numberConfig("days", 5); const requiredCount = numberConfig("count", 1); const actual = bars.slice(-days).filter(bar => bar.close > bar.open).length; const comparator = comparatorFor(rule); const matched = matchesComparator(actual, requiredCount, comparator);
    return { ruleId: rule.id, matched, score: matched ? rule.weight : 0, detail: `${days}봉 내 양봉 ${actual}회`, actual, expected: requiredCount, comparator };
  }
  if (rule.type === "price_range") {
    const actual = bars.at(-1)?.open; const minPrice = numberConfig("minPrice", 0); const maxPrice = numberConfig("maxPrice", Number.POSITIVE_INFINITY); const matched = actual !== undefined && actual >= minPrice && actual <= maxPrice;
    return { ruleId: rule.id, matched, score: matched ? rule.weight : 0, detail: `시가 ${actual?.toLocaleString("ko-KR") ?? "N/A"}원, 허용 범위 ${minPrice.toLocaleString("ko-KR")}~${Number.isFinite(maxPrice) ? maxPrice.toLocaleString("ko-KR") : "∞"}원`, actual, expected: minPrice, comparator: "between" };
  }
  if (rule.type === "macd_histogram") {
    const fast = numberConfig("fast", 12);
    const slow = numberConfig("slow", 26);
    const signal = numberConfig("signal", 9);
    const histogram = macdHistogram(bars, fast, slow, signal);
    const actual = histogram.at(-1) ?? 0;
    const threshold = numberConfig("threshold", 0);
    const comparator = comparatorFor(rule);
    const matched = matchesComparator(actual, threshold, comparator);
    return { ruleId: rule.id, matched, score: matched ? rule.weight : 0, detail: `MACD 히스토그램(${fast},${slow},${signal}) ${actual.toFixed(4)} ${comparator} ${threshold}`, actual, expected: threshold, comparator };
  }
  if (rule.type === "disparity") {
    const period = numberConfig("period", 20);
    const threshold = numberConfig("threshold", 100);
    const sma = simpleMovingAverage(bars, period);
    const close = bars.at(-1)?.close ?? 0;
    const actual = sma && sma > 0 ? (close / sma) * 100 : null;
    const comparator = comparatorFor(rule);
    const matched = actual !== null && matchesComparator(actual, threshold, comparator);
    return { ruleId: rule.id, matched, score: matched ? rule.weight : 0, detail: `이격도(${period}) ${actual?.toFixed(2) ?? "N/A"}% ${comparator} ${threshold}%`, actual: actual ?? undefined, expected: threshold, comparator };
  }
  if (rule.type === "envelope") {
    const period = numberConfig("period", 20);
    const percent = numberConfig("percent", 5);
    const sma = simpleMovingAverage(bars, period);
    const close = bars.at(-1)?.close ?? 0;
    const comparator = comparatorFor(rule);
    if (sma === null) return { ruleId: rule.id, matched: false, score: 0, detail: `엔벨로프 데이터 부족` };
    const upper = sma * (1 + percent / 100);
    const lower = sma * (1 - percent / 100);
    const actual = close;
    const expected = comparator === "이하" || comparator === "미만" ? lower : upper;
    const matched = matchesComparator(actual, expected, comparator);
    return { ruleId: rule.id, matched, score: matched ? rule.weight : 0, detail: `엔벨로프(${period}, ${percent}%) 종가 ${actual.toFixed(0)} ${comparator} ${expected.toFixed(0)}`, actual, expected, comparator };
  }
  if (rule.type === "williams_r") {
    const period = numberConfig("period", 14);
    const threshold = numberConfig("threshold", -20);
    if (bars.length < period) return { ruleId: rule.id, matched: false, score: 0, detail: `Williams %R 데이터 부족` };
    const window = bars.slice(-period);
    const highestHigh = Math.max(...window.map(b => b.high));
    const lowestLow = Math.min(...window.map(b => b.low));
    const close = window.at(-1)!.close;
    const actual = highestHigh === lowestLow ? -50 : ((highestHigh - close) / (highestHigh - lowestLow)) * -100;
    const comparator = comparatorFor(rule);
    const matched = matchesComparator(actual, threshold, comparator);
    return { ruleId: rule.id, matched, score: matched ? rule.weight : 0, detail: `Williams %R(${period}) ${actual.toFixed(2)} ${comparator} ${threshold}`, actual, expected: threshold, comparator };
  }
  if (rule.type === "cci") {
    const period = numberConfig("period", 20);
    const threshold = numberConfig("threshold", 100);
    if (bars.length < period) return { ruleId: rule.id, matched: false, score: 0, detail: `CCI 데이터 부족` };
    const window = bars.slice(-period);
    const typicalPrices = window.map(b => (b.high + b.low + b.close) / 3);
    const smaTP = average(typicalPrices);
    const meanDeviation = average(typicalPrices.map(tp => Math.abs(tp - smaTP)));
    const latestTP = typicalPrices.at(-1)!;
    const actual = meanDeviation === 0 ? 0 : (latestTP - smaTP) / (0.015 * meanDeviation);
    const comparator = comparatorFor(rule);
    const matched = matchesComparator(actual, threshold, comparator);
    return { ruleId: rule.id, matched, score: matched ? rule.weight : 0, detail: `CCI(${period}) ${actual.toFixed(2)} ${comparator} ${threshold}`, actual, expected: threshold, comparator };
  }
  if (rule.type === "obv") {
    const period = numberConfig("period", 20);
    if (bars.length < period + 1) return { ruleId: rule.id, matched: false, score: 0, detail: `OBV 데이터 부족` };
    const window = bars.slice(-(period + 1));
    let obv = 0;
    for (let i = 1; i < window.length; i++) {
      if (window[i]!.close > window[i - 1]!.close) obv += window[i]!.volume;
      else if (window[i]!.close < window[i - 1]!.close) obv -= window[i]!.volume;
    }
    // Check OBV trend: compare last half vs first half
    const halfPeriod = Math.floor(period / 2);
    const firstHalfBars = bars.slice(-(period + 1), -(halfPeriod + 1));
    const secondHalfBars = bars.slice(-(halfPeriod + 1));
    let obvFirst = 0;
    for (let i = 1; i < firstHalfBars.length; i++) {
      if (firstHalfBars[i]!.close > firstHalfBars[i - 1]!.close) obvFirst += firstHalfBars[i]!.volume;
      else if (firstHalfBars[i]!.close < firstHalfBars[i - 1]!.close) obvFirst -= firstHalfBars[i]!.volume;
    }
    let obvSecond = 0;
    for (let i = 1; i < secondHalfBars.length; i++) {
      if (secondHalfBars[i]!.close > secondHalfBars[i - 1]!.close) obvSecond += secondHalfBars[i]!.volume;
      else if (secondHalfBars[i]!.close < secondHalfBars[i - 1]!.close) obvSecond -= secondHalfBars[i]!.volume;
    }
    const comparator = comparatorFor(rule);
    // OBV rising if second half OBV > first half OBV
    const actual = obvSecond;
    const expected = obvFirst;
    const matched = matchesComparator(actual, expected, comparator);
    return { ruleId: rule.id, matched, score: matched ? rule.weight : 0, detail: `OBV(${period}) 후반 ${obvSecond.toLocaleString("ko-KR")} ${comparator} 전반 ${obvFirst.toLocaleString("ko-KR")}`, actual, expected, comparator };
  }
  if (rule.type === "turnover_ma") {
    const period = numberConfig("period", 20);
    const threshold = numberConfig("threshold", 1.5);
    if (bars.length < period) return { ruleId: rule.id, matched: false, score: 0, detail: `거래대금이평 데이터 부족` };
    const maTurnover = average(bars.slice(-period).map(b => b.turnover));
    const currentTurnover = bars.at(-1)!.turnover;
    const actual = maTurnover > 0 ? currentTurnover / maTurnover : 0;
    const comparator = comparatorFor(rule);
    const matched = matchesComparator(actual, threshold, comparator);
    return { ruleId: rule.id, matched, score: matched ? rule.weight : 0, detail: `거래대금이평(${period}) 비율 ${actual.toFixed(2)}배 ${comparator} ${threshold}배`, actual, expected: threshold, comparator };
  }
  if (rule.type === "bearish_candle_count") {
    const days = numberConfig("days", 5);
    const requiredCount = numberConfig("count", 3);
    const actual = bars.slice(-days).filter(bar => bar.close < bar.open).length;
    const comparator = comparatorFor(rule);
    const matched = matchesComparator(actual, requiredCount, comparator);
    return { ruleId: rule.id, matched, score: matched ? rule.weight : 0, detail: `${days}봉 내 음봉 ${actual}회`, actual, expected: requiredCount, comparator };
  }
  if (rule.type === "gap_up") {
    const threshold = numberConfig("threshold", 2);
    if (bars.length < 2) return { ruleId: rule.id, matched: false, score: 0, detail: `갭상승 데이터 부족` };
    const yesterdayClose = bars.at(-2)!.close;
    const todayOpen = bars.at(-1)!.open;
    const actual = yesterdayClose > 0 ? ((todayOpen - yesterdayClose) / yesterdayClose) * 100 : 0;
    const comparator = comparatorFor(rule);
    const matched = matchesComparator(actual, threshold, comparator);
    return { ruleId: rule.id, matched, score: matched ? rule.weight : 0, detail: `갭상승 ${actual.toFixed(2)}% ${comparator} ${threshold}%`, actual, expected: threshold, comparator };
  }
  if (rule.type === "gap_down") {
    const threshold = numberConfig("threshold", 2);
    if (bars.length < 2) return { ruleId: rule.id, matched: false, score: 0, detail: `갭하락 데이터 부족` };
    const yesterdayClose = bars.at(-2)!.close;
    const todayOpen = bars.at(-1)!.open;
    const actual = yesterdayClose > 0 ? ((todayOpen - yesterdayClose) / yesterdayClose) * 100 : 0;
    const negativeThreshold = -threshold;
    const comparator = comparatorFor(rule);
    const matched = matchesComparator(actual, negativeThreshold, comparator === "이상" ? "이하" : comparator);
    return { ruleId: rule.id, matched, score: matched ? rule.weight : 0, detail: `갭하락 ${actual.toFixed(2)}% ${comparator === "이상" ? "이하" : comparator} ${negativeThreshold.toFixed(2)}%`, actual, expected: negativeThreshold, comparator: comparator === "이상" ? "이하" : comparator };
  }
  const days = numberConfig("days", 5);
  const rawThreshold = numberConfig("threshold", 50_000_000_000);
  const unit = normalizedUnitFor(rule);
  const threshold = unit === "억원" ? rawThreshold * 100_000_000 : rawThreshold;
  const largestTurnover = Math.max(0, ...bars.slice(-days).map(bar => bar.turnover));
  const comparator = comparatorFor(rule);
  const matched = matchesComparator(largestTurnover, threshold, comparator);
  return { ruleId: rule.id, matched, score: matched ? rule.weight : 0, detail: `${days}일 내 최대 거래대금 ${largestTurnover.toLocaleString("ko-KR")}원 ${comparator} ${threshold.toLocaleString("ko-KR")}원`, actual: largestTurnover, expected: threshold, comparator };
}

export function evaluateStrategy(rules: ConditionRule[], input: ConditionBarsInput) {
  const evaluations = rules.map(rule => evaluateRule(rule, input));
  const activeRules = rules.filter(rule => rule.enabled);
  const activeEvaluations = evaluations.filter((_, index) => rules[index]?.enabled);
  const eligible = activeEvaluations.reduce((result, evaluation, index) => {
    if (index === 0) return evaluation.matched;
    const logic = String(activeRules[index]?.config.logic ?? "AND");
    if (logic === "OR") return result || evaluation.matched;
    if (logic === "NOT") return result && !evaluation.matched;
    return result && evaluation.matched;
  }, activeEvaluations.length > 0);
  return {
    score: eligible ? evaluations.reduce((sum, evaluation) => sum + evaluation.score, 0) : 0,
    matchedCount: evaluations.filter(evaluation => evaluation.matched).length,
    eligible,
    evaluations,
  };
}

type ConditionExpressionNode = ConditionRule | ConditionExpressionGroup;

function isConditionGroup(node: ConditionExpressionNode): node is ConditionExpressionGroup {
  return "children" in node;
}

export function evaluateExpression(node: ConditionExpressionNode, input: ConditionBarsInput): { eligible: boolean; score: number; evaluations: ConditionEvaluation[] } {
  if (!isConditionGroup(node)) {
    const evaluation = evaluateRule(node, input);
    return { eligible: evaluation.matched, score: evaluation.score, evaluations: [evaluation] };
  }
  if (!node.enabled) return { eligible: false, score: 0, evaluations: [] };
  const children = node.children.map(child => evaluateExpression(child, input));
  const eligible = node.logic === "OR" ? children.some(child => child.eligible)
    : node.logic === "NOT" ? !children.some(child => child.eligible)
    : children.every(child => child.eligible);
  return { eligible, score: eligible ? children.reduce((sum, child) => sum + child.score, 0) : 0, evaluations: children.flatMap(child => child.evaluations) };
}
