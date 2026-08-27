/**
 * 급등 종목 역분석 엔진 (서버 모듈)
 *
 * 전일 1분봉 기술적 특성으로 당일 급등을 예측할 수 있는지 통계 검증.
 * In-Sample / OOS 분할, Cohen's d 효과 크기 측정.
 *
 * 이 모듈은 tRPC에서 호출 가능하며, 데이터 충분성 여부에 따라
 * "분석 불가" 또는 검증 결과를 반환한다.
 */

import { sql } from "drizzle-orm";
import { getDb } from "../db";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

type MinuteBar = {
  tradingDate: string;
  symbol: string;
  minuteAt: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type DailyFeatures = {
  symbol: string;
  tradingDate: string;
  prevDayReturn: number;
  prevDayVolatility: number;
  prevDayTurnover: number;
  prevDayClosePosition: number;
  prevDayVolumeBackHalf: number;
  prevDayBullishRatio: number;
  prevDayAvgBarSize: number;
  prevDayHighTiming: number;
  prevDayLowTiming: number;
  prevDayGap: number;
};

type FeatureResult = {
  feature: string;
  surgeMean: number;
  controlMean: number;
  cohensD: number;
  effect: string;
  direction: string;
  significant: boolean;
};

export type SurgeAnalysisResult = {
  status: "insufficient_data" | "completed";
  message: string;
  dataSummary: { tradingDays: number; symbols: number; totalBars: number; surgeCount: number; controlCount: number };
  inSample: { surgeCount: number; controlCount: number; features: FeatureResult[] } | null;
  outOfSample: { surgeCount: number; controlCount: number; features: FeatureResult[] } | null;
  consistentFeatures: Array<{ feature: string; isD: number; oosD: number; effect: string }>;
  conclusion: string;
};

// ─────────────────────────────────────────────
// Stats helpers
// ─────────────────────────────────────────────

function mean(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function std(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function cohensD(group1: number[], group2: number[]): number {
  const m1 = mean(group1);
  const m2 = mean(group2);
  const s1 = std(group1);
  const s2 = std(group2);
  const n1 = group1.length;
  const n2 = group2.length;
  const pooledStd = Math.sqrt(((n1 - 1) * s1 ** 2 + (n2 - 1) * s2 ** 2) / (n1 + n2 - 2));
  if (pooledStd === 0) return 0;
  return (m1 - m2) / pooledStd;
}

function effectLabel(d: number): string {
  const abs = Math.abs(d);
  if (abs >= 0.8) return "큰 효과";
  if (abs >= 0.5) return "중간 효과";
  if (abs >= 0.2) return "작은 효과";
  return "무시 가능";
}

// ─────────────────────────────────────────────
// Feature extraction
// ─────────────────────────────────────────────

function extractDayFeatures(bars: MinuteBar[]) {
  if (bars.length < 10) return null;
  const sorted = [...bars].sort((a, b) => a.minuteAt.getTime() - b.minuteAt.getTime());
  const dayOpen = sorted[0].open;
  const dayClose = sorted[sorted.length - 1].close;
  const dayHigh = Math.max(...sorted.map(b => b.high));
  const dayLow = Math.min(...sorted.map(b => b.low));
  const totalVolume = sorted.reduce((s, b) => s + b.volume, 0);
  if (dayOpen <= 0 || dayLow <= 0) return null;

  const dayReturn = (dayClose / dayOpen - 1) * 100;
  const volatility = ((dayHigh - dayLow) / dayOpen) * 100;
  const avgPrice = sorted.reduce((s, b) => s + (b.open + b.close) / 2, 0) / sorted.length;
  const turnover = (totalVolume * avgPrice) / 1_000_000;
  const closePosition = dayHigh === dayLow ? 0.5 : (dayClose - dayLow) / (dayHigh - dayLow);
  const halfIdx = Math.floor(sorted.length / 2);
  const backHalfVolume = sorted.slice(halfIdx).reduce((s, b) => s + b.volume, 0);
  const volumeBackHalf = totalVolume > 0 ? backHalfVolume / totalVolume : 0.5;
  const bullishCount = sorted.filter(b => b.close > b.open).length;
  const bullishRatio = bullishCount / sorted.length;
  const avgBarSize = mean(sorted.map(b => Math.abs(b.close - b.open) / Math.max(1, b.open) * 100));
  const highIdx = sorted.findIndex(b => b.high === dayHigh);
  const lowIdx = sorted.findIndex(b => b.low === dayLow);
  const highTiming = highIdx / (sorted.length - 1);
  const lowTiming = lowIdx / (sorted.length - 1);

  return { dayReturn, volatility, turnover, closePosition, volumeBackHalf, bullishRatio, avgBarSize, highTiming, lowTiming, dayClose, dayOpen };
}

// ─────────────────────────────────────────────
// Main analysis function
// ─────────────────────────────────────────────

export async function runSurgeHypothesisAnalysis(): Promise<SurgeAnalysisResult> {
  const db = await getDb();
  if (!db) return { status: "insufficient_data", message: "데이터베이스 연결 불가", dataSummary: { tradingDays: 0, symbols: 0, totalBars: 0, surgeCount: 0, controlCount: 0 }, inSample: null, outOfSample: null, consistentFeatures: [], conclusion: "데이터베이스에 연결할 수 없습니다." };

  // Load all minute bars
  const rawBars = await db.execute(sql`
    SELECT "tradingDate", symbol, "minuteAt", open, high, low, close, volume::bigint as volume
    FROM intraday_minute_bars
    ORDER BY "tradingDate", symbol, "minuteAt"
  `);

  const bars: MinuteBar[] = rawBars.map(row => ({
    tradingDate: row.tradingDate as string,
    symbol: row.symbol as string,
    minuteAt: new Date(row.minuteAt as string),
    open: Number(row.open),
    high: Number(row.high),
    low: Number(row.low),
    close: Number(row.close),
    volume: Number(row.volume),
  }));

  const allDates = Array.from(new Set(bars.map(b => b.tradingDate))).sort();
  const allSymbols = new Set(bars.map(b => b.symbol));
  const totalBars = bars.length;

  // Minimum requirements
  if (allDates.length < 10 || allSymbols.size < 5 || totalBars < 20000) {
    return {
      status: "insufficient_data",
      message: `데이터 부족: ${allDates.length}거래일, ${allSymbols.size}종목, ${totalBars.toLocaleString()}봉. 최소 10일·5종목·20,000봉 필요.`,
      dataSummary: { tradingDays: allDates.length, symbols: allSymbols.size, totalBars, surgeCount: 0, controlCount: 0 },
      inSample: null, outOfSample: null, consistentFeatures: [],
      conclusion: "데이터가 부족하여 분석 불가. 벌크 수집을 실행하세요.",
    };
  }

  // Group by (date, symbol)
  const byDateSymbol = new Map<string, MinuteBar[]>();
  for (const bar of bars) {
    const key = `${bar.tradingDate}|${bar.symbol}`;
    const arr = byDateSymbol.get(key) ?? [];
    arr.push(bar);
    byDateSymbol.set(key, arr);
  }

  // Build features
  const surgeFeatures: DailyFeatures[] = [];
  const controlFeatures: DailyFeatures[] = [];

  for (let i = 1; i < allDates.length; i++) {
    const today = allDates[i];
    const yesterday = allDates[i - 1];
    const todaySymbols = new Set<string>();
    const yesterdaySymbols = new Set<string>();
    for (const key of Array.from(byDateSymbol.keys())) {
      const [date, symbol] = key.split("|");
      if (date === today) todaySymbols.add(symbol);
      if (date === yesterday) yesterdaySymbols.add(symbol);
    }
    const commonSymbols = Array.from(todaySymbols).filter(s => yesterdaySymbols.has(s));

    for (const symbol of commonSymbols) {
      const todayBars = byDateSymbol.get(`${today}|${symbol}`) ?? [];
      const yesterdayBars = byDateSymbol.get(`${yesterday}|${symbol}`) ?? [];
      if (todayBars.length < 10 || yesterdayBars.length < 10) continue;

      const todaySorted = [...todayBars].sort((a, b) => a.minuteAt.getTime() - b.minuteAt.getTime());
      const todayOpen = todaySorted[0].open;
      const todayHigh = Math.max(...todaySorted.map(b => b.high));
      if (todayOpen <= 0) continue;
      const todayMaxGain = ((todayHigh / todayOpen) - 1) * 100;
      const isSurge = todayMaxGain >= 5;

      const prevFeats = extractDayFeatures(yesterdayBars);
      if (!prevFeats) continue;
      const gap = prevFeats.dayClose > 0 ? ((todayOpen / prevFeats.dayClose) - 1) * 100 : 0;

      const features: DailyFeatures = {
        symbol, tradingDate: today,
        prevDayReturn: prevFeats.dayReturn, prevDayVolatility: prevFeats.volatility,
        prevDayTurnover: prevFeats.turnover, prevDayClosePosition: prevFeats.closePosition,
        prevDayVolumeBackHalf: prevFeats.volumeBackHalf, prevDayBullishRatio: prevFeats.bullishRatio,
        prevDayAvgBarSize: prevFeats.avgBarSize, prevDayHighTiming: prevFeats.highTiming,
        prevDayLowTiming: prevFeats.lowTiming, prevDayGap: gap,
      };

      if (isSurge) surgeFeatures.push(features);
      else controlFeatures.push(features);
    }
  }

  if (surgeFeatures.length < 10) {
    return {
      status: "insufficient_data",
      message: `급등 표본 부족: ${surgeFeatures.length}건. 최소 10건 필요. 데이터를 더 수집하세요.`,
      dataSummary: { tradingDays: allDates.length, symbols: allSymbols.size, totalBars, surgeCount: surgeFeatures.length, controlCount: controlFeatures.length },
      inSample: null, outOfSample: null, consistentFeatures: [],
      conclusion: "급등 표본이 10건 미만으로 통계 분석 불가.",
    };
  }

  // Split IS/OOS (70/30)
  const splitIdx = Math.floor(allDates.length * 0.7);
  const splitDate = allDates[splitIdx];
  const surgeIS = surgeFeatures.filter(f => f.tradingDate < splitDate);
  const controlIS = controlFeatures.filter(f => f.tradingDate < splitDate);
  const surgeOOS = surgeFeatures.filter(f => f.tradingDate >= splitDate);
  const controlOOS = controlFeatures.filter(f => f.tradingDate >= splitDate);

  const featureKeys: Array<{ key: keyof DailyFeatures; label: string }> = [
    { key: "prevDayReturn", label: "전일 수익률 (%)" },
    { key: "prevDayVolatility", label: "전일 변동성 (%)" },
    { key: "prevDayTurnover", label: "전일 거래대금 (백만)" },
    { key: "prevDayClosePosition", label: "전일 종가 위치" },
    { key: "prevDayVolumeBackHalf", label: "전일 후반 거래량 비율" },
    { key: "prevDayBullishRatio", label: "전일 양봉 비율" },
    { key: "prevDayAvgBarSize", label: "전일 평균 봉 크기 (%)" },
    { key: "prevDayHighTiming", label: "전일 고가 시점" },
    { key: "prevDayLowTiming", label: "전일 저가 시점" },
    { key: "prevDayGap", label: "시가 갭 (%)" },
  ];

  function analyzeGroup(surge: DailyFeatures[], control: DailyFeatures[]): FeatureResult[] {
    return featureKeys.map(({ key, label }) => {
      const sValues = surge.map(f => f[key] as number).filter(v => Number.isFinite(v));
      const cValues = control.map(f => f[key] as number).filter(v => Number.isFinite(v));
      const d = cohensD(sValues, cValues);
      return {
        feature: label,
        surgeMean: mean(sValues),
        controlMean: mean(cValues),
        cohensD: d,
        effect: effectLabel(d),
        direction: d > 0 ? "급등군 높음" : d < 0 ? "급등군 낮음" : "동일",
        significant: Math.abs(d) >= 0.5,
      };
    });
  }

  const isResults = analyzeGroup(surgeIS, controlIS);
  const oosResults = analyzeGroup(surgeOOS, controlOOS);

  // Check consistency
  const consistentFeatures: Array<{ feature: string; isD: number; oosD: number; effect: string }> = [];
  for (let i = 0; i < featureKeys.length; i++) {
    const is = isResults[i];
    const oos = oosResults[i];
    const sameDirection = Math.sign(is.cohensD) === Math.sign(oos.cohensD);
    const bothMeaningful = Math.abs(is.cohensD) >= 0.3 && Math.abs(oos.cohensD) >= 0.3;
    if (sameDirection && bothMeaningful) {
      consistentFeatures.push({ feature: is.feature, isD: is.cohensD, oosD: oos.cohensD, effect: effectLabel(is.cohensD) });
    }
  }

  const conclusion = consistentFeatures.length === 0
    ? `In-Sample과 OOS에서 일관된 공통 특성이 발견되지 않았습니다. 전일 1분봉 기술적 특성만으로 당일 급등을 예측하는 것은 현재 데이터(${allDates.length}일, ${allSymbols.size}종목)에서 통계적으로 지지되지 않습니다.`
    : `${consistentFeatures.length}개 특성이 IS/OOS 모두에서 일관된 차이를 보입니다: ${consistentFeatures.map(f => f.feature).join(", ")}. Walk-Forward 시뮬레이션 후보로 적합합니다.`;

  return {
    status: "completed",
    message: `분석 완료: ${allDates.length}거래일, ${allSymbols.size}종목, 급등 ${surgeFeatures.length}건 vs 대조 ${controlFeatures.length}건`,
    dataSummary: { tradingDays: allDates.length, symbols: allSymbols.size, totalBars, surgeCount: surgeFeatures.length, controlCount: controlFeatures.length },
    inSample: { surgeCount: surgeIS.length, controlCount: controlIS.length, features: isResults },
    outOfSample: { surgeCount: surgeOOS.length, controlCount: controlOOS.length, features: oosResults },
    consistentFeatures,
    conclusion,
  };
}
