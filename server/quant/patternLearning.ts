/**
 * 패턴 학습 엔진
 *
 * 차트 데이터를 "학습 데이터"로 사용:
 * 1. Forward labeling: 모든 봉에서 미래 N봉 수익률 계산
 * 2. Top entry selection: 상위 수익 진입점 추출
 * 3. Feature extraction: 각 진입점의 기술적 상태 추출
 * 4. Pattern discovery: 공통 조건을 자동으로 조건식화
 * 5. Validation: 역추적된 조건식으로 백테스트
 */

import type { DailyBar } from "./conditions";
import type { ConditionExpressionGroup, ConditionRule } from "../../shared/trading";
import { runDailyBacktest, runIntradayBacktest, type BacktestResult, type IntradayBacktestResult } from "./backtest";

// ─── Types ───

export type LabeledEntry = {
  index: number;
  date: string;
  entryPrice: number;
  exitPrice: number;
  futureReturn: number; // %
  features: TechnicalFeatures;
};

export type TechnicalFeatures = {
  rsi14: number;
  rsi7: number;
  macdHist: number;
  macdSignal: number;
  bollingerPosition: number; // 0=하단, 0.5=중앙, 1=상단
  ma5Slope: number; // 5일선 기울기 (%)
  ma20Slope: number;
  ma5AboveMa20: boolean;
  ma20AboveMa60: boolean;
  volumeRatio: number; // 오늘 거래량 / 20일 평균
  priceChange1: number; // 전일 대비 변동률
  priceChange3: number; // 3일 변동률
  priceChange5: number; // 5일 변동률
  atrPercent: number; // ATR / 종가
  gapPercent: number; // 갭 비율
  intrabarPosition: number; // (종가-저가)/(고가-저가)
  highFromMa20: number; // (종가 - MA20) / MA20
};

export type LearnedPattern = {
  name: string;
  description: string;
  conditions: Array<{ feature: keyof TechnicalFeatures; operator: ">" | "<" | ">=" | "<="; threshold: number }>;
  matchCount: number;
  avgReturn: number;
  winRate: number;
  expression: ConditionExpressionGroup;
};

export type PatternLearningResult = {
  totalBars: number;
  totalEntries: number;
  topEntryCount: number;
  avgTopReturn: number;
  patterns: LearnedPattern[];
  backtestResults: Array<{ patternName: string; result: BacktestResult }>;
  featureImportance: Array<{ feature: string; label: string; importance: number; direction: "high" | "low" }>;
};

// ─── Main Engine ───

export function learnPatternsFromBars(input: {
  bars: DailyBar[];
  holdingBars: number;
  topPercentile?: number; // 상위 몇 %를 "좋은 진입점"으로 볼 것인가 (default: 20%)
  minSamples?: number;
  feeRate?: number;
}): PatternLearningResult {
  const { bars, holdingBars } = input;
  const topPercentile = input.topPercentile ?? 20;
  const feeRate = input.feeRate ?? 0.001;
  const minSamples = input.minSamples ?? 5;

  if (bars.length < holdingBars + 60) {
    return { totalBars: bars.length, totalEntries: 0, topEntryCount: 0, avgTopReturn: 0, patterns: [], backtestResults: [], featureImportance: [] };
  }

  // Step 1: Forward labeling - 모든 봉에서 미래 수익률 계산
  const entries: LabeledEntry[] = [];

  for (let i = 60; i < bars.length - holdingBars; i++) {
    const entryPrice = bars[i + 1]?.open ?? bars[i].close; // 다음봉 시가 진입
    const exitPrice = bars[i + holdingBars].close; // N봉 후 종가 청산
    const futureReturn = ((exitPrice - entryPrice) / entryPrice - feeRate * 2) * 100;

    const features = extractFeatures(bars, i);
    entries.push({ index: i, date: bars[i].date, entryPrice, exitPrice, futureReturn, features });
  }

  if (!entries.length) {
    return { totalBars: bars.length, totalEntries: 0, topEntryCount: 0, avgTopReturn: 0, patterns: [], backtestResults: [], featureImportance: [] };
  }

  // Step 2: 상위 진입점 추출
  const sorted = [...entries].sort((a, b) => b.futureReturn - a.futureReturn);
  const topCount = Math.max(minSamples, Math.ceil(entries.length * topPercentile / 100));
  const topEntries = sorted.slice(0, topCount);
  const bottomEntries = sorted.slice(-topCount);
  const avgTopReturn = topEntries.reduce((s, e) => s + e.futureReturn, 0) / topEntries.length;

  // Step 3: Feature importance — 상위 vs 하위 비교
  const featureImportance = calculateFeatureImportance(topEntries, bottomEntries);

  // Step 4: Pattern discovery — 상위 진입점 공통 조건 역추적
  const patterns = discoverPatterns(topEntries, entries, featureImportance, minSamples);

  // Step 5: Validation — 패턴으로 백테스트
  const backtestResults: Array<{ patternName: string; result: BacktestResult }> = [];
  for (const pattern of patterns.slice(0, 5)) {
    const result = runDailyBacktest({
      bars,
      expression: pattern.expression,
      minScore: 50,
      holdingDays: holdingBars,
      feeRate,
      entryDelayDays: 1,
      entryTiming: "open",
      maxOpenGapPercent: 3,
      stopLossPercent: 3,
      takeProfitPercent: 5,
    });
    backtestResults.push({ patternName: pattern.name, result });
  }

  return {
    totalBars: bars.length,
    totalEntries: entries.length,
    topEntryCount: topEntries.length,
    avgTopReturn,
    patterns,
    backtestResults,
    featureImportance,
  };
}

// ─── Feature Extraction ───

function extractFeatures(bars: DailyBar[], index: number): TechnicalFeatures {
  const slice = bars.slice(0, index + 1);
  const bar = bars[index];
  const prevBar = bars[index - 1];

  // RSI
  const rsi14 = calcRSI(slice, 14);
  const rsi7 = calcRSI(slice, 7);

  // MACD
  const { histogram, signal } = calcMACD(slice);
  const macdHist = histogram;
  const macdSignal = signal;

  // Moving Averages
  const ma5 = calcMA(slice, 5);
  const ma20 = calcMA(slice, 20);
  const ma60 = calcMA(slice, 60);
  const ma5Prev = index >= 5 ? calcMA(bars.slice(0, index), 5) : ma5;
  const ma20Prev = index >= 20 ? calcMA(bars.slice(0, index), 20) : ma20;

  // Bollinger Band position
  const { upper, lower } = calcBollinger(slice, 20);
  const bollingerPosition = upper > lower ? (bar.close - lower) / (upper - lower) : 0.5;

  // Volume ratio
  const vol20 = slice.slice(-20).reduce((s, b) => s + b.volume, 0) / Math.min(20, slice.length);
  const volumeRatio = vol20 > 0 ? bar.volume / vol20 : 1;

  // Price changes
  const priceChange1 = prevBar ? (bar.close - prevBar.close) / prevBar.close * 100 : 0;
  const bar3 = bars[index - 3];
  const priceChange3 = bar3 ? (bar.close - bar3.close) / bar3.close * 100 : 0;
  const bar5 = bars[index - 5];
  const priceChange5 = bar5 ? (bar.close - bar5.close) / bar5.close * 100 : 0;

  // ATR
  const atr = calcATR(slice, 14);
  const atrPercent = bar.close > 0 ? atr / bar.close * 100 : 0;

  // Gap
  const gapPercent = prevBar ? (bar.open - prevBar.close) / prevBar.close * 100 : 0;

  // Intrabar position
  const range = bar.high - bar.low;
  const intrabarPosition = range > 0 ? (bar.close - bar.low) / range : 0.5;

  return {
    rsi14,
    rsi7,
    macdHist,
    macdSignal,
    bollingerPosition,
    ma5Slope: ma5 > 0 ? (ma5 - ma5Prev) / ma5 * 100 : 0,
    ma20Slope: ma20 > 0 ? (ma20 - ma20Prev) / ma20 * 100 : 0,
    ma5AboveMa20: ma5 > ma20,
    ma20AboveMa60: ma20 > ma60,
    volumeRatio,
    priceChange1,
    priceChange3,
    priceChange5,
    atrPercent,
    gapPercent,
    intrabarPosition,
    highFromMa20: ma20 > 0 ? (bar.close - ma20) / ma20 * 100 : 0,
  };
}

// ─── Feature Importance ───

const FEATURE_LABELS: Record<string, string> = {
  rsi14: "RSI(14)",
  rsi7: "RSI(7)",
  macdHist: "MACD 히스토그램",
  macdSignal: "MACD 시그널",
  bollingerPosition: "볼린저 위치",
  ma5Slope: "5일선 기울기",
  ma20Slope: "20일선 기울기",
  ma5AboveMa20: "5일선 > 20일선",
  ma20AboveMa60: "20일선 > 60일선",
  volumeRatio: "거래량 비율",
  priceChange1: "전일 대비 변동",
  priceChange3: "3일 변동",
  priceChange5: "5일 변동",
  atrPercent: "ATR%",
  gapPercent: "갭 비율",
  intrabarPosition: "봉내 위치",
  highFromMa20: "20일선 이격도",
};

function calculateFeatureImportance(
  topEntries: LabeledEntry[],
  bottomEntries: LabeledEntry[],
): Array<{ feature: string; label: string; importance: number; direction: "high" | "low" }> {
  const numericFeatures: (keyof TechnicalFeatures)[] = [
    "rsi14", "rsi7", "macdHist", "bollingerPosition", "ma5Slope", "ma20Slope",
    "volumeRatio", "priceChange1", "priceChange3", "priceChange5",
    "atrPercent", "gapPercent", "intrabarPosition", "highFromMa20",
  ];

  const result: Array<{ feature: string; label: string; importance: number; direction: "high" | "low" }> = [];

  for (const feature of numericFeatures) {
    const topMean = topEntries.reduce((s, e) => s + (e.features[feature] as number), 0) / topEntries.length;
    const bottomMean = bottomEntries.reduce((s, e) => s + (e.features[feature] as number), 0) / bottomEntries.length;

    const allValues = [...topEntries, ...bottomEntries].map(e => e.features[feature] as number);
    const std = calcStd(allValues);
    const importance = std > 0 ? Math.abs(topMean - bottomMean) / std : 0;
    const direction: "high" | "low" = topMean > bottomMean ? "high" : "low";

    result.push({ feature, label: FEATURE_LABELS[feature] || feature, importance, direction });
  }

  return result.sort((a, b) => b.importance - a.importance);
}

// ─── Pattern Discovery ───

function discoverPatterns(
  topEntries: LabeledEntry[],
  allEntries: LabeledEntry[],
  featureImportance: Array<{ feature: string; importance: number; direction: "high" | "low" }>,
  minSamples: number,
): LearnedPattern[] {
  const patterns: LearnedPattern[] = [];

  // 상위 3개 중요 피쳐로 조건 생성
  const topFeatures = featureImportance.slice(0, 6);

  // Single-feature patterns
  for (const fi of topFeatures.slice(0, 4)) {
    const values = topEntries.map(e => e.features[fi.feature as keyof TechnicalFeatures] as number);
    const threshold = fi.direction === "high"
      ? percentile(values, 25) // 상위 진입점의 25% 백분위수를 기준으로
      : percentile(values, 75);
    const operator = fi.direction === "high" ? ">=" : "<=";

    // Count matches in top entries
    const matchCount = topEntries.filter(e => {
      const v = e.features[fi.feature as keyof TechnicalFeatures] as number;
      return fi.direction === "high" ? v >= threshold : v <= threshold;
    }).length;

    if (matchCount < minSamples) continue;

    const matchedEntries = topEntries.filter(e => {
      const v = e.features[fi.feature as keyof TechnicalFeatures] as number;
      return fi.direction === "high" ? v >= threshold : v <= threshold;
    });
    const avgReturn = matchedEntries.reduce((s, e) => s + e.futureReturn, 0) / matchedEntries.length;
    const winRate = (matchedEntries.filter(e => e.futureReturn > 0).length / matchedEntries.length) * 100;

    const expression = featureToExpression(fi.feature, fi.direction, threshold);

    patterns.push({
      name: `${FEATURE_LABELS[fi.feature] || fi.feature} ${operator} ${threshold.toFixed(2)}`,
      description: `상위 진입점의 ${((matchCount / topEntries.length) * 100).toFixed(0)}%가 이 조건을 만족`,
      conditions: [{ feature: fi.feature as keyof TechnicalFeatures, operator, threshold }],
      matchCount,
      avgReturn,
      winRate,
      expression,
    });
  }

  // Combo patterns (top 2 features combined)
  for (let i = 0; i < Math.min(3, topFeatures.length); i++) {
    for (let j = i + 1; j < Math.min(5, topFeatures.length); j++) {
      const fi = topFeatures[i];
      const fj = topFeatures[j];

      const valuesI = topEntries.map(e => e.features[fi.feature as keyof TechnicalFeatures] as number);
      const valuesJ = topEntries.map(e => e.features[fj.feature as keyof TechnicalFeatures] as number);

      const threshI = fi.direction === "high" ? percentile(valuesI, 30) : percentile(valuesI, 70);
      const threshJ = fj.direction === "high" ? percentile(valuesJ, 30) : percentile(valuesJ, 70);

      const matchedEntries = topEntries.filter(e => {
        const vi = e.features[fi.feature as keyof TechnicalFeatures] as number;
        const vj = e.features[fj.feature as keyof TechnicalFeatures] as number;
        const passI = fi.direction === "high" ? vi >= threshI : vi <= threshI;
        const passJ = fj.direction === "high" ? vj >= threshJ : vj <= threshJ;
        return passI && passJ;
      });

      if (matchedEntries.length < minSamples) continue;

      const avgReturn = matchedEntries.reduce((s, e) => s + e.futureReturn, 0) / matchedEntries.length;
      const winRate = (matchedEntries.filter(e => e.futureReturn > 0).length / matchedEntries.length) * 100;

      const expression = comboToExpression(fi, fj, threshI, threshJ);

      patterns.push({
        name: `${FEATURE_LABELS[fi.feature]} + ${FEATURE_LABELS[fj.feature]}`,
        description: `2조건 조합 · ${matchedEntries.length}건 일치`,
        conditions: [
          { feature: fi.feature as keyof TechnicalFeatures, operator: fi.direction === "high" ? ">=" : "<=", threshold: threshI },
          { feature: fj.feature as keyof TechnicalFeatures, operator: fj.direction === "high" ? ">=" : "<=", threshold: threshJ },
        ],
        matchCount: matchedEntries.length,
        avgReturn,
        winRate,
        expression,
      });
    }
  }

  return patterns.sort((a, b) => b.avgReturn - a.avgReturn || b.winRate - a.winRate);
}

// ─── Helpers ───

function featureToExpression(feature: string, direction: "high" | "low", threshold: number): ConditionExpressionGroup {
  const ruleType = featureToRuleType(feature);
  const config = featureToConfig(feature, direction, threshold);

  return {
    id: `learned-${feature}`,
    logic: "AND",
    enabled: true,
    children: [{
      id: `rule-${feature}`,
      type: ruleType,
      enabled: true,
      weight: 100,
      config,
    }],
  } as unknown as ConditionExpressionGroup;
}

function comboToExpression(
  fi: { feature: string; direction: "high" | "low" },
  fj: { feature: string; direction: "high" | "low" },
  threshI: number, threshJ: number,
): ConditionExpressionGroup {
  return {
    id: `learned-combo-${fi.feature}-${fj.feature}`,
    logic: "AND",
    enabled: true,
    children: [
      { id: `rule-${fi.feature}`, type: featureToRuleType(fi.feature), enabled: true, weight: 50, config: featureToConfig(fi.feature, fi.direction, threshI) },
      { id: `rule-${fj.feature}`, type: featureToRuleType(fj.feature), enabled: true, weight: 50, config: featureToConfig(fj.feature, fj.direction, threshJ) },
    ],
  } as unknown as ConditionExpressionGroup;
}

function featureToRuleType(feature: string): string {
  const map: Record<string, string> = {
    rsi14: "rsi", rsi7: "rsi",
    macdHist: "macd_rising", macdSignal: "macd_rising",
    bollingerPosition: "bollinger",
    ma5Slope: "ma_position", ma20Slope: "ma_position",
    ma5AboveMa20: "ma_position", ma20AboveMa60: "ma_position",
    volumeRatio: "volume_ratio",
    priceChange1: "close_change", priceChange3: "close_change", priceChange5: "close_change",
    atrPercent: "atr_percent",
    gapPercent: "gap_percent",
    intrabarPosition: "intrabar_position",
    highFromMa20: "ma_position",
  };
  return map[feature] || "close_change";
}

function featureToConfig(feature: string, direction: "high" | "low", threshold: number): Record<string, unknown> {
  const comparator = direction === "high" ? "이상" : "이하";
  switch (feature) {
    case "rsi14": return { period: 14, threshold: Math.round(threshold), comparator };
    case "rsi7": return { period: 7, threshold: Math.round(threshold), comparator };
    case "macdHist": return { lookback: 5, comparator: direction === "high" ? "상승" : "하락" };
    case "bollingerPosition": return { period: 20, threshold: Math.round(threshold * 100), comparator };
    case "ma5Slope": case "ma20Slope": return { periods: "5,20,60", comparator: direction === "high" ? "상향돌파" : "하향돌파" };
    case "volumeRatio": return { threshold: Number(threshold.toFixed(1)), comparator };
    case "priceChange1": case "priceChange3": case "priceChange5": return { threshold: Number(threshold.toFixed(2)), comparator };
    case "atrPercent": return { threshold: Number(threshold.toFixed(2)), comparator };
    case "gapPercent": return { threshold: Number(threshold.toFixed(2)), comparator };
    case "intrabarPosition": return { threshold: Number(threshold.toFixed(2)), comparator };
    default: return { threshold: Number(threshold.toFixed(2)), comparator };
  }
}

function calcRSI(bars: DailyBar[], period: number): number {
  if (bars.length <= period) return 50;
  let avgGain = 0, avgLoss = 0;
  for (let i = bars.length - period; i < bars.length; i++) {
    const change = bars[i].close - bars[i - 1].close;
    if (change > 0) avgGain += change; else avgLoss += Math.abs(change);
  }
  avgGain /= period; avgLoss /= period;
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

function calcMACD(bars: DailyBar[]): { histogram: number; signal: number } {
  if (bars.length < 26) return { histogram: 0, signal: 0 };
  const ema12 = emaLast(bars.map(b => b.close), 12);
  const ema26 = emaLast(bars.map(b => b.close), 26);
  const macd = ema12 - ema26;
  const signal = emaLast([...Array(8).fill(macd), macd], 9); // approximation
  return { histogram: macd - signal, signal };
}

function calcMA(bars: DailyBar[], period: number): number {
  if (bars.length < period) return bars[bars.length - 1]?.close ?? 0;
  let sum = 0;
  for (let i = bars.length - period; i < bars.length; i++) sum += bars[i].close;
  return sum / period;
}

function calcBollinger(bars: DailyBar[], period: number): { upper: number; lower: number } {
  const ma = calcMA(bars, period);
  if (bars.length < period) return { upper: ma, lower: ma };
  let variance = 0;
  for (let i = bars.length - period; i < bars.length; i++) variance += (bars[i].close - ma) ** 2;
  const std = Math.sqrt(variance / period);
  return { upper: ma + 2 * std, lower: ma - 2 * std };
}

function calcATR(bars: DailyBar[], period: number): number {
  if (bars.length < 2) return 0;
  let sum = 0;
  const start = Math.max(1, bars.length - period);
  for (let i = start; i < bars.length; i++) {
    const tr = Math.max(bars[i].high - bars[i].low, Math.abs(bars[i].high - bars[i - 1].close), Math.abs(bars[i].low - bars[i - 1].close));
    sum += tr;
  }
  return sum / (bars.length - start);
}

function emaLast(data: number[], period: number): number {
  if (!data.length) return 0;
  const k = 2 / (period + 1);
  let ema = data[0];
  for (let i = 1; i < data.length; i++) ema = data[i] * k + ema * (1 - k);
  return ema;
}

function calcStd(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function percentile(values: number[], pct: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * pct / 100);
  return sorted[Math.min(idx, sorted.length - 1)];
}


// ─── Walk-Forward Validation ───

export type WalkForwardConfig = {
  /** 학습 기간 비율 (0.5~0.9, 기본 0.7) */
  trainRatio: number;
  /** 보유 봉 수 */
  holdingBars: number;
  /** 상위 진입점 비율 */
  topPercentile: number;
  /** 수수료율 */
  feeRate: number;
};

export type WalkForwardResult = {
  trainPeriod: { start: string; end: string; barCount: number };
  testPeriod: { start: string; end: string; barCount: number };
  /** 학습 기간 성과 (in-sample) */
  inSample: {
    patterns: LearnedPattern[];
    featureImportance: Array<{ feature: string; label: string; importance: number; direction: "high" | "low" }>;
    topEntryAvgReturn: number;
  };
  /** 검증 기간 성과 (out-of-sample) — 진짜 실력 */
  outOfSample: Array<{
    patternName: string;
    totalReturn: number;
    winRate: number;
    tradeCount: number;
    maxDrawdown: number;
  }>;
  /** 학습→검증 성과 유지율 (100%면 학습 성과가 그대로 유지) */
  robustness: number;
};

/**
 * Walk-Forward 검증:
 * 데이터를 학습/검증으로 분리해서 과적합 여부를 판단
 */
export function walkForwardValidation(input: {
  bars: DailyBar[];
  config: WalkForwardConfig;
}): WalkForwardResult {
  const { bars, config } = input;
  const splitIndex = Math.floor(bars.length * config.trainRatio);

  const trainBars = bars.slice(0, splitIndex);
  const testBars = bars.slice(splitIndex);

  if (trainBars.length < 100 || testBars.length < 30) {
    return {
      trainPeriod: { start: bars[0]?.date ?? "", end: bars[splitIndex - 1]?.date ?? "", barCount: trainBars.length },
      testPeriod: { start: bars[splitIndex]?.date ?? "", end: bars[bars.length - 1]?.date ?? "", barCount: testBars.length },
      inSample: { patterns: [], featureImportance: [], topEntryAvgReturn: 0 },
      outOfSample: [],
      robustness: 0,
    };
  }

  // Step 1: 학습 기간에서 패턴 학습
  const trainResult = learnPatternsFromBars({
    bars: trainBars,
    holdingBars: config.holdingBars,
    topPercentile: config.topPercentile,
    feeRate: config.feeRate,
  });

  // Step 2: 학습된 패턴으로 검증 기간 백테스트
  const outOfSample: WalkForwardResult["outOfSample"] = [];

  for (const pattern of trainResult.patterns.slice(0, 5)) {
    const testResult = runDailyBacktest({
      bars: testBars,
      expression: pattern.expression,
      minScore: 50,
      holdingDays: config.holdingBars,
      feeRate: config.feeRate,
      entryDelayDays: 1,
      entryTiming: "open",
      maxOpenGapPercent: 3,
      stopLossPercent: 3,
      takeProfitPercent: 5,
    });

    outOfSample.push({
      patternName: pattern.name,
      totalReturn: testResult.totalReturn,
      winRate: testResult.winRate,
      tradeCount: testResult.tradeCount,
      maxDrawdown: testResult.maxDrawdown,
    });
  }

  // Step 3: 견고성 계산 (검증 기간 평균 수익률 / 학습 기간 평균 수익률)
  const inSampleAvgReturn = trainResult.backtestResults.length
    ? trainResult.backtestResults.reduce((s, r) => s + r.result.totalReturn, 0) / trainResult.backtestResults.length
    : 0;
  const outSampleAvgReturn = outOfSample.length
    ? outOfSample.reduce((s, r) => s + r.totalReturn, 0) / outOfSample.length
    : 0;
  const robustness = inSampleAvgReturn > 0
    ? Math.min(200, (outSampleAvgReturn / inSampleAvgReturn) * 100)
    : 0;

  return {
    trainPeriod: { start: trainBars[0].date, end: trainBars[trainBars.length - 1].date, barCount: trainBars.length },
    testPeriod: { start: testBars[0].date, end: testBars[testBars.length - 1].date, barCount: testBars.length },
    inSample: {
      patterns: trainResult.patterns,
      featureImportance: trainResult.featureImportance,
      topEntryAvgReturn: trainResult.avgTopReturn,
    },
    outOfSample,
    robustness,
  };
}
