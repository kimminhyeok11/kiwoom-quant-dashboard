/**
 * 가설 검증: "당일 급등 종목은 전일 1분봉에서 공통 특성을 가진다"
 *
 * 방법:
 * 1. 모든 거래일에서 당일 시가→고가 5%+ 급등 종목 추출 (급등군)
 * 2. 같은 날 5% 미만인 종목 추출 (대조군)
 * 3. 각 종목의 "전일" 1분봉 데이터에서 기술적 특성 계산:
 *    - 전일 종가 대비 시가 이격도
 *    - 전일 거래대금 (volume * close 합산)
 *    - 전일 일중 변동성 (고가-저가 범위 / 시가)
 *    - 전일 종가 위치 (당일 범위 내 종가 위치 0~1)
 *    - 전일 거래량 후반 집중도 (후반 거래량 / 전체 거래량)
 *    - 전일 수익률 (종가/시가 - 1)
 *    - 전일 양봉 비율 (양봉 수 / 전체 봉 수)
 *    - 전일 평균 봉 크기 (|close-open|/open 평균)
 *    - 전일 고가 시점 (장중 어느 시점에 고가를 찍었는가 0~1)
 *    - 전일 저가 시점
 * 4. 급등군 vs 대조군의 각 특성 비교: 평균, 표준편차, Cohen's d, 신뢰 수준
 * 5. In-Sample(앞 15일) / OOS(뒤 6일) 분리 검증
 */

import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";

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
  // 전일 기준 특성들
  prevDayReturn: number;          // 전일 수익률 (%)
  prevDayVolatility: number;      // 전일 일중 변동성 (%)
  prevDayTurnover: number;        // 전일 거래대금 (백만원)
  prevDayClosePosition: number;   // 전일 종가 위치 (0=저가, 1=고가)
  prevDayVolumeBackHalf: number;  // 전일 후반 거래량 비율 (0~1)
  prevDayBullishRatio: number;    // 전일 양봉 비율 (0~1)
  prevDayAvgBarSize: number;      // 전일 평균 봉 크기 (%)
  prevDayHighTiming: number;      // 전일 고가 시점 (0=시작, 1=끝)
  prevDayLowTiming: number;       // 전일 저가 시점 (0=시작, 1=끝)
  prevDayGap: number;             // 당일 시가 vs 전일 종가 갭 (%)
};

type GroupStats = {
  mean: number;
  std: number;
  count: number;
};

type FeatureComparison = {
  feature: string;
  surgeGroup: GroupStats;
  controlGroup: GroupStats;
  cohensD: number;
  direction: string;
  significant: boolean;
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
  // Pooled standard deviation
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
// Feature extraction from minute bars
// ─────────────────────────────────────────────

function extractDailyFeatures(bars: MinuteBar[]): {
  dayReturn: number;
  volatility: number;
  turnover: number;
  closePosition: number;
  volumeBackHalf: number;
  bullishRatio: number;
  avgBarSize: number;
  highTiming: number;
  lowTiming: number;
  dayClose: number;
  dayOpen: number;
} | null {
  if (bars.length < 10) return null;

  // Sort by time
  const sorted = [...bars].sort((a, b) => a.minuteAt.getTime() - b.minuteAt.getTime());

  const dayOpen = sorted[0].open;
  const dayClose = sorted[sorted.length - 1].close;
  const dayHigh = Math.max(...sorted.map(b => b.high));
  const dayLow = Math.min(...sorted.map(b => b.low));
  const totalVolume = sorted.reduce((s, b) => s + b.volume, 0);

  if (dayOpen <= 0 || dayLow <= 0) return null;

  // Return
  const dayReturn = (dayClose / dayOpen - 1) * 100;

  // Volatility
  const volatility = ((dayHigh - dayLow) / dayOpen) * 100;

  // Turnover (sum of volume * close for each bar, simplified as total volume * avg price)
  const avgPrice = sorted.reduce((s, b) => s + (b.open + b.close) / 2, 0) / sorted.length;
  const turnover = (totalVolume * avgPrice) / 1_000_000; // 백만원 단위

  // Close position within day range
  const closePosition = dayHigh === dayLow ? 0.5 : (dayClose - dayLow) / (dayHigh - dayLow);

  // Volume back half ratio
  const halfIdx = Math.floor(sorted.length / 2);
  const backHalfVolume = sorted.slice(halfIdx).reduce((s, b) => s + b.volume, 0);
  const volumeBackHalf = totalVolume > 0 ? backHalfVolume / totalVolume : 0.5;

  // Bullish ratio
  const bullishCount = sorted.filter(b => b.close > b.open).length;
  const bullishRatio = bullishCount / sorted.length;

  // Average bar size
  const avgBarSize = mean(sorted.map(b => Math.abs(b.close - b.open) / Math.max(1, b.open) * 100));

  // High/Low timing (0 = start of day, 1 = end of day)
  const highIdx = sorted.findIndex(b => b.high === dayHigh);
  const lowIdx = sorted.findIndex(b => b.low === dayLow);
  const highTiming = highIdx / (sorted.length - 1);
  const lowTiming = lowIdx / (sorted.length - 1);

  return {
    dayReturn, volatility, turnover, closePosition, volumeBackHalf,
    bullishRatio, avgBarSize, highTiming, lowTiming, dayClose, dayOpen,
  };
}

// ─────────────────────────────────────────────
// Main analysis
// ─────────────────────────────────────────────

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL이 설정되지 않았습니다.");
    process.exit(1);
  }

  const client = postgres(process.env.DATABASE_URL, {
    prepare: false, idle_timeout: 20, connect_timeout: 10, ssl: "require",
  });
  const db = drizzle(client);

  console.log("=== 가설 검증: 당일 급등 종목의 전일 공통 분모 ===\n");

  // 1. 모든 1분봉 데이터를 가져온다 (81K rows — manageable)
  console.log("데이터 로딩 중...");
  const rawBars = await db.execute(sql`
    SELECT "tradingDate", symbol, "minuteAt", open, high, low, close, volume::bigint as volume
    FROM intraday_minute_bars
    ORDER BY "tradingDate", symbol, "minuteAt"
  `);
  console.log(`  ${rawBars.length.toLocaleString()}개 봉 로드 완료`);

  // Parse into typed objects
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

  // Group by (tradingDate, symbol)
  const byDateSymbol = new Map<string, MinuteBar[]>();
  for (const bar of bars) {
    const key = `${bar.tradingDate}|${bar.symbol}`;
    const arr = byDateSymbol.get(key) ?? [];
    arr.push(bar);
    byDateSymbol.set(key, arr);
  }

  // Get sorted unique dates
  const allDates = [...new Set(bars.map(b => b.tradingDate))].sort();
  console.log(`  ${allDates.length}거래일, ${new Set(bars.map(b => b.symbol)).size}종목\n`);

  // 2. 각 날짜별로: 급등군 vs 대조군 분류 + 전일 특성 수집
  const surgeFeatures: DailyFeatures[] = [];
  const controlFeatures: DailyFeatures[] = [];

  let totalSurge = 0;
  let totalControl = 0;
  let skippedNoData = 0;

  for (let i = 1; i < allDates.length; i++) {
    const today = allDates[i];
    const yesterday = allDates[i - 1];

    // Get all symbols that have data on both days
    const todaySymbols = new Set<string>();
    const yesterdaySymbols = new Set<string>();
    for (const [key] of byDateSymbol) {
      const [date, symbol] = key.split("|");
      if (date === today) todaySymbols.add(symbol);
      if (date === yesterday) yesterdaySymbols.add(symbol);
    }

    const commonSymbols = [...todaySymbols].filter(s => yesterdaySymbols.has(s));

    for (const symbol of commonSymbols) {
      const todayBars = byDateSymbol.get(`${today}|${symbol}`) ?? [];
      const yesterdayBars = byDateSymbol.get(`${yesterday}|${symbol}`) ?? [];

      if (todayBars.length < 10 || yesterdayBars.length < 10) {
        skippedNoData++;
        continue;
      }

      // Today's performance: open (first bar) vs high (max)
      const todaySorted = [...todayBars].sort((a, b) => a.minuteAt.getTime() - b.minuteAt.getTime());
      const todayOpen = todaySorted[0].open;
      const todayHigh = Math.max(...todaySorted.map(b => b.high));

      if (todayOpen <= 0) continue;

      const todayMaxGain = ((todayHigh / todayOpen) - 1) * 100;
      const isSurge = todayMaxGain >= 5;

      // Extract yesterday's features
      const prevFeats = extractDailyFeatures(yesterdayBars);
      if (!prevFeats) { skippedNoData++; continue; }

      // Gap: today's open vs yesterday's close
      const gap = prevFeats.dayClose > 0 ? ((todayOpen / prevFeats.dayClose) - 1) * 100 : 0;

      const features: DailyFeatures = {
        symbol,
        tradingDate: today,
        prevDayReturn: prevFeats.dayReturn,
        prevDayVolatility: prevFeats.volatility,
        prevDayTurnover: prevFeats.turnover,
        prevDayClosePosition: prevFeats.closePosition,
        prevDayVolumeBackHalf: prevFeats.volumeBackHalf,
        prevDayBullishRatio: prevFeats.bullishRatio,
        prevDayAvgBarSize: prevFeats.avgBarSize,
        prevDayHighTiming: prevFeats.highTiming,
        prevDayLowTiming: prevFeats.lowTiming,
        prevDayGap: gap,
      };

      if (isSurge) {
        surgeFeatures.push(features);
        totalSurge++;
      } else {
        controlFeatures.push(features);
        totalControl++;
      }
    }
  }

  console.log(`급등군: ${totalSurge}건, 대조군: ${totalControl}건 (전일 데이터 없어 제외: ${skippedNoData}건)\n`);

  if (totalSurge < 5) {
    console.log("⚠️ 급등 표본이 5건 미만이라 통계 분석이 의미 없습니다.");
    await client.end();
    return;
  }

  // 3. In-Sample / OOS 분할
  const splitIdx = Math.floor(allDates.length * 0.7); // 약 15일 / 6일
  const splitDate = allDates[splitIdx];
  console.log(`데이터 분할: In-Sample ~${splitDate} 이전, OOS ${splitDate}~ 이후\n`);

  const surgeIS = surgeFeatures.filter(f => f.tradingDate < splitDate);
  const controlIS = controlFeatures.filter(f => f.tradingDate < splitDate);
  const surgeOOS = surgeFeatures.filter(f => f.tradingDate >= splitDate);
  const controlOOS = controlFeatures.filter(f => f.tradingDate >= splitDate);

  console.log(`In-Sample: 급등 ${surgeIS.length}건, 대조 ${controlIS.length}건`);
  console.log(`OOS:       급등 ${surgeOOS.length}건, 대조 ${controlOOS.length}건\n`);

  // 4. Feature comparison
  const featureKeys: Array<{ key: keyof DailyFeatures; label: string; unit: string }> = [
    { key: "prevDayReturn", label: "전일 수익률", unit: "%" },
    { key: "prevDayVolatility", label: "전일 변동성", unit: "%" },
    { key: "prevDayTurnover", label: "전일 거래대금", unit: "백만" },
    { key: "prevDayClosePosition", label: "전일 종가 위치", unit: "0~1" },
    { key: "prevDayVolumeBackHalf", label: "전일 후반 거래량 비율", unit: "0~1" },
    { key: "prevDayBullishRatio", label: "전일 양봉 비율", unit: "0~1" },
    { key: "prevDayAvgBarSize", label: "전일 평균 봉 크기", unit: "%" },
    { key: "prevDayHighTiming", label: "전일 고가 시점", unit: "0~1" },
    { key: "prevDayLowTiming", label: "전일 저가 시점", unit: "0~1" },
    { key: "prevDayGap", label: "시가 갭 (vs 전일 종가)", unit: "%" },
  ];

  function analyzeGroup(surgeGroup: DailyFeatures[], controlGroup: DailyFeatures[]): FeatureComparison[] {
    return featureKeys.map(({ key, label, unit }) => {
      const sValues = surgeGroup.map(f => f[key] as number).filter(v => Number.isFinite(v));
      const cValues = controlGroup.map(f => f[key] as number).filter(v => Number.isFinite(v));

      const d = cohensD(sValues, cValues);
      const significant = Math.abs(d) >= 0.5; // 중간 효과 이상을 "의미 있음"으로

      return {
        feature: `${label} (${unit})`,
        surgeGroup: { mean: mean(sValues), std: std(sValues), count: sValues.length },
        controlGroup: { mean: mean(cValues), std: std(cValues), count: cValues.length },
        cohensD: d,
        direction: d > 0 ? "급등군 높음" : d < 0 ? "급등군 낮음" : "동일",
        significant,
      };
    });
  }

  // In-Sample analysis
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  IN-SAMPLE 분석 결과");
  console.log("═══════════════════════════════════════════════════════════════");
  const isResults = analyzeGroup(surgeIS, controlIS);
  printResults(isResults);

  // OOS analysis
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  OUT-OF-SAMPLE (OOS) 검증 결과");
  console.log("═══════════════════════════════════════════════════════════════");
  const oosResults = analyzeGroup(surgeOOS, controlOOS);
  printResults(oosResults);

  // 5. 전체 종합 (IS + OOS 일관성)
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  종합 판단: In-Sample과 OOS 모두 일관된 특성");
  console.log("═══════════════════════════════════════════════════════════════");

  const consistentFeatures: string[] = [];
  for (let i = 0; i < featureKeys.length; i++) {
    const is = isResults[i];
    const oos = oosResults[i];
    // 같은 방향 + 둘 다 효과 크기 0.3 이상
    const sameDirection = Math.sign(is.cohensD) === Math.sign(oos.cohensD);
    const bothMeaningful = Math.abs(is.cohensD) >= 0.3 && Math.abs(oos.cohensD) >= 0.3;
    if (sameDirection && bothMeaningful) {
      consistentFeatures.push(`  ✅ ${is.feature}: IS d=${is.cohensD.toFixed(2)}, OOS d=${oos.cohensD.toFixed(2)} [${effectLabel(is.cohensD)}]`);
    }
  }

  if (consistentFeatures.length === 0) {
    console.log("\n  ❌ In-Sample과 OOS에서 일관된 공통 특성이 발견되지 않았습니다.");
    console.log("     → 전일 1분봉 특성만으로 당일 급등을 예측하는 것은 이 데이터에서 불가능합니다.");
    console.log("     → 가설 폐기 또는 다른 변수(거래대금 절대값, 섹터, 뉴스 등) 탐색 필요.");
  } else {
    console.log(`\n  ${consistentFeatures.length}개 특성이 In-Sample과 OOS 모두에서 일관된 차이를 보입니다:\n`);
    consistentFeatures.forEach(f => console.log(f));
    console.log("\n  → 이 특성들은 Walk-Forward 시뮬레이션 후보입니다.");
    console.log("     (단, 표본 크기가 작아 과적합 위험은 여전히 있음)");
  }

  // 6. 전체 데이터 기반 최종 비교도 출력
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  참고: 전체 데이터 통합 분석");
  console.log("═══════════════════════════════════════════════════════════════");
  const allResults = analyzeGroup(surgeFeatures, controlFeatures);
  printResults(allResults);

  await client.end();
}

function printResults(results: FeatureComparison[]) {
  console.log("");
  console.log("  특성                       | 급등군 평균  | 대조군 평균  | Cohen's d | 효과    | 방향");
  console.log("  ─────────────────────────────────────────────────────────────────────────────────────");
  for (const r of results) {
    const marker = r.significant ? "★" : " ";
    console.log(
      `${marker} ${r.feature.padEnd(27)}| ${r.surgeGroup.mean.toFixed(3).padStart(11)} | ${r.controlGroup.mean.toFixed(3).padStart(11)} | ${r.cohensD.toFixed(3).padStart(9)} | ${effectLabel(r.cohensD).padEnd(7)} | ${r.direction}`
    );
  }
  console.log(`\n  ★ = Cohen's d ≥ 0.5 (중간 효과 이상, 주목할 만한 차이)`);
  console.log(`  급등군: ${results[0]?.surgeGroup.count ?? 0}건, 대조군: ${results[0]?.controlGroup.count ?? 0}건`);
}

main().catch(error => {
  console.error("에러:", error.message);
  process.exit(1);
});
