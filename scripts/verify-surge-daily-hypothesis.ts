/**
 * 가설 검증 v2: 일봉 기반 "당일 급등 종목의 전일 공통 분모"
 *
 * 데이터: local_research_daily_bars (40종목, 1,800거래일, 7년치)
 * 급등 정의: 당일 시가→고가 5%+ (데이트레이더 관점 — 장중 최대 상승폭)
 *
 * 전일 특성 (일봉 기반):
 *   1. 전일 수익률 (종가/시가 - 1)
 *   2. 전일 거래대금
 *   3. 전일 변동성 (고가-저가)/시가
 *   4. 전일 종가 위치 (종가-저가)/(고가-저가)
 *   5. 전일 거래대금 vs 5일 평균 거래대금 비율
 *   6. 5일 수익률 (5일 전 종가 대비)
 *   7. 5일 변동성 (최근 5일 수익률의 표준편차)
 *   8. 20일 이평선 이격도 (종가/20MA - 1)
 *   9. 5일 이평선 이격도
 *   10. 전일 갭 (당일 시가/전일 종가 - 1)
 *   11. 전일 양봉 여부 (종가 > 시가)
 *   12. 3일 연속 거래대금 증가 여부
 *
 * In-Sample(앞 70%) / OOS(뒤 30%) 분할 검증
 */

import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

type DailyBar = { symbol: string; date: string; open: number; high: number; low: number; close: number; volume: number; turnover: number };
type Features = {
  symbol: string; date: string;
  prevReturn: number; prevVolatility: number; prevTurnover: number;
  prevClosePosition: number; turnoverVs5d: number; return5d: number;
  volatility5d: number; gapFrom20ma: number; gapFrom5ma: number;
  todayGap: number; prevBullish: number; turnover3dRising: number;
};
type FeatureResult = { feature: string; surgeMean: number; controlMean: number; cohensD: number; effect: string; direction: string; significant: boolean };

// ─────────────────────────────────────────────
// Stats
// ─────────────────────────────────────────────

function mean(v: number[]) { return v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0; }
function std(v: number[]) { if (v.length < 2) return 0; const m = mean(v); return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1)); }
function cohensD(g1: number[], g2: number[]) {
  const m1 = mean(g1), m2 = mean(g2), s1 = std(g1), s2 = std(g2);
  const pooled = Math.sqrt(((g1.length - 1) * s1 ** 2 + (g2.length - 1) * s2 ** 2) / (g1.length + g2.length - 2));
  return pooled === 0 ? 0 : (m1 - m2) / pooled;
}
function effectLabel(d: number) { const a = Math.abs(d); return a >= 0.8 ? "큰 효과" : a >= 0.5 ? "중간 효과" : a >= 0.2 ? "작은 효과" : "무시 가능"; }

// ─────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────

async function main() {
  const client = postgres(process.env.DATABASE_URL!, { prepare: false, idle_timeout: 20, connect_timeout: 10, ssl: "require" });
  const db = drizzle(client);

  console.log("=== 가설 검증 v2: 일봉 기반 급등 종목 전일 공통 분모 ===\n");
  console.log("데이터 로딩 중...");

  const rawBars = await db.execute(sql`
    SELECT symbol, date, open, high, low, close, volume::bigint as volume, turnover::bigint as turnover
    FROM local_research_daily_bars
    WHERE "adjustmentBasis" = 'adjusted' AND open > 0 AND high > 0 AND low > 0 AND close > 0
    ORDER BY symbol, date
  `);

  const bars: DailyBar[] = rawBars.map(r => ({
    symbol: r.symbol as string, date: r.date as string,
    open: Number(r.open), high: Number(r.high), low: Number(r.low), close: Number(r.close),
    volume: Number(r.volume), turnover: Number(r.turnover),
  }));

  console.log(`  ${bars.length.toLocaleString()}개 일봉 로드 (${new Set(bars.map(b => b.symbol)).size}종목)`);

  // Group by symbol
  const bySymbol = new Map<string, DailyBar[]>();
  for (const bar of bars) {
    const arr = bySymbol.get(bar.symbol) ?? [];
    arr.push(bar);
    bySymbol.set(bar.symbol, arr);
  }

  // Build features
  const surgeFeatures: Features[] = [];
  const controlFeatures: Features[] = [];

  for (const [symbol, symbolBars] of Array.from(bySymbol.entries())) {
    // Ensure sorted by date
    symbolBars.sort((a, b) => a.date.localeCompare(b.date));

    for (let i = 20; i < symbolBars.length; i++) {
      const today = symbolBars[i];
      const prev = symbolBars[i - 1];
      const prev5 = symbolBars.slice(i - 5, i);
      const prev20 = symbolBars.slice(i - 20, i);

      // 당일 급등 판정: 시가→고가 5%+
      const todayMaxGain = ((today.high / today.open) - 1) * 100;
      const isSurge = todayMaxGain >= 5;

      // Feature extraction
      const prevReturn = (prev.close / prev.open - 1) * 100;
      const prevVolatility = ((prev.high - prev.low) / prev.open) * 100;
      const prevTurnover = prev.turnover / 1_000_000; // 백만 단위
      const prevClosePosition = prev.high === prev.low ? 0.5 : (prev.close - prev.low) / (prev.high - prev.low);

      // 거래대금 vs 5일 평균
      const avg5dTurnover = mean(prev5.map(b => b.turnover));
      const turnoverVs5d = avg5dTurnover > 0 ? prev.turnover / avg5dTurnover : 1;

      // 5일 수익률
      const fiveDaysAgo = symbolBars[i - 5];
      const return5d = fiveDaysAgo.close > 0 ? ((prev.close / fiveDaysAgo.close) - 1) * 100 : 0;

      // 5일 변동성 (일별 수익률의 표준편차)
      const dailyReturns5d = prev5.map((b, idx) => idx === 0 ? 0 : ((b.close / prev5[idx - 1].close) - 1) * 100).slice(1);
      const volatility5d = std(dailyReturns5d);

      // 20일 이평선 이격도
      const ma20 = mean(prev20.map(b => b.close));
      const gapFrom20ma = ma20 > 0 ? ((prev.close / ma20) - 1) * 100 : 0;

      // 5일 이평선 이격도
      const ma5 = mean(prev5.map(b => b.close));
      const gapFrom5ma = ma5 > 0 ? ((prev.close / ma5) - 1) * 100 : 0;

      // 당일 갭 (당일 시가 vs 전일 종가)
      const todayGap = prev.close > 0 ? ((today.open / prev.close) - 1) * 100 : 0;

      // 전일 양봉
      const prevBullish = prev.close > prev.open ? 1 : 0;

      // 3일 연속 거래대금 증가
      const prev3 = symbolBars.slice(i - 3, i);
      const turnover3dRising = (prev3.length === 3 && prev3[1].turnover > prev3[0].turnover && prev3[2].turnover > prev3[1].turnover) ? 1 : 0;

      const features: Features = {
        symbol, date: today.date,
        prevReturn, prevVolatility, prevTurnover, prevClosePosition,
        turnoverVs5d, return5d, volatility5d, gapFrom20ma, gapFrom5ma,
        todayGap, prevBullish, turnover3dRising,
      };

      if (isSurge) surgeFeatures.push(features);
      else controlFeatures.push(features);
    }
  }

  console.log(`\n급등군: ${surgeFeatures.length}건, 대조군: ${controlFeatures.length}건`);
  console.log(`급등 비율: ${(surgeFeatures.length / (surgeFeatures.length + controlFeatures.length) * 100).toFixed(1)}%\n`);

  if (surgeFeatures.length < 30) {
    console.log("⚠️ 급등 표본 30건 미만. 분석 불가.");
    await client.end(); return;
  }

  // Split IS/OOS by date
  const allDates = Array.from(new Set([...surgeFeatures, ...controlFeatures].map(f => f.date))).sort();
  const splitDate = allDates[Math.floor(allDates.length * 0.7)];
  const surgeIS = surgeFeatures.filter(f => f.date < splitDate);
  const controlIS = controlFeatures.filter(f => f.date < splitDate);
  const surgeOOS = surgeFeatures.filter(f => f.date >= splitDate);
  const controlOOS = controlFeatures.filter(f => f.date >= splitDate);

  console.log(`데이터 분할: IS < ${splitDate}, OOS >= ${splitDate}`);
  console.log(`IS: 급등 ${surgeIS.length}건, 대조 ${controlIS.length}건`);
  console.log(`OOS: 급등 ${surgeOOS.length}건, 대조 ${controlOOS.length}건\n`);

  const featureKeys: Array<{ key: keyof Features; label: string }> = [
    { key: "prevReturn", label: "전일 수익률 (%)" },
    { key: "prevVolatility", label: "전일 변동성 (%)" },
    { key: "prevTurnover", label: "전일 거래대금 (백만)" },
    { key: "prevClosePosition", label: "전일 종가 위치 (0~1)" },
    { key: "turnoverVs5d", label: "거래대금/5일평균 비율" },
    { key: "return5d", label: "5일 수익률 (%)" },
    { key: "volatility5d", label: "5일 변동성 (σ)" },
    { key: "gapFrom20ma", label: "20일선 이격도 (%)" },
    { key: "gapFrom5ma", label: "5일선 이격도 (%)" },
    { key: "todayGap", label: "당일 시가 갭 (%)" },
    { key: "prevBullish", label: "전일 양봉 (0/1)" },
    { key: "turnover3dRising", label: "3일 거래대금 연속 증가 (0/1)" },
  ];

  function analyzeGroup(surge: Features[], control: Features[]): FeatureResult[] {
    return featureKeys.map(({ key, label }) => {
      const s = surge.map(f => f[key] as number).filter(Number.isFinite);
      const c = control.map(f => f[key] as number).filter(Number.isFinite);
      const d = cohensD(s, c);
      return { feature: label, surgeMean: mean(s), controlMean: mean(c), cohensD: d, effect: effectLabel(d), direction: d > 0 ? "급등군↑" : d < 0 ? "급등군↓" : "=", significant: Math.abs(d) >= 0.5 };
    });
  }

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  IN-SAMPLE");
  console.log("═══════════════════════════════════════════════════════════════");
  const isResults = analyzeGroup(surgeIS, controlIS);
  printResults(isResults);

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  OUT-OF-SAMPLE (OOS)");
  console.log("═══════════════════════════════════════════════════════════════");
  const oosResults = analyzeGroup(surgeOOS, controlOOS);
  printResults(oosResults);

  // Consistency check
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  IS + OOS 일관된 특성 (같은 방향, 둘 다 d≥0.2)");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const consistent: string[] = [];
  for (let i = 0; i < featureKeys.length; i++) {
    const is = isResults[i], oos = oosResults[i];
    const sameDir = Math.sign(is.cohensD) === Math.sign(oos.cohensD);
    const bothMeaningful = Math.abs(is.cohensD) >= 0.2 && Math.abs(oos.cohensD) >= 0.2;
    if (sameDir && bothMeaningful) {
      const marker = (Math.abs(is.cohensD) >= 0.5 && Math.abs(oos.cohensD) >= 0.5) ? "★★" : (Math.abs(is.cohensD) >= 0.3 && Math.abs(oos.cohensD) >= 0.3) ? "★ " : "  ";
      consistent.push(`${marker} ${is.feature}: IS d=${is.cohensD.toFixed(3)}, OOS d=${oos.cohensD.toFixed(3)} [${is.direction}]`);
    }
  }

  if (!consistent.length) {
    console.log("  ❌ 일관된 특성 없음. 일봉으로도 예측 불가.");
  } else {
    console.log(`  ✅ ${consistent.length}개 일관된 특성 발견:\n`);
    consistent.forEach(c => console.log(`  ${c}`));
    console.log("\n  ★★ = IS/OOS 모두 중간 효과 이상 (실투 후보)");
    console.log("  ★  = IS/OOS 모두 작은 효과 이상 (관찰 후보)");
  }

  await client.end();
}

function printResults(results: FeatureResult[]) {
  console.log("");
  console.log("  특성                     | 급등군 평균  | 대조군 평균  | Cohen's d |  효과   | 방향");
  console.log("  ────────────────────────────────────────────────────────────────────────────────────");
  for (const r of results) {
    const m = r.significant ? "★" : " ";
    console.log(`${m} ${r.feature.padEnd(25)}| ${r.surgeMean.toFixed(3).padStart(11)} | ${r.controlMean.toFixed(3).padStart(11)} | ${r.cohensD.toFixed(3).padStart(9)} | ${r.effect.padEnd(7)} | ${r.direction}`);
  }
  console.log(`\n  급등군: ${results[0]?.surgeMean !== undefined ? "계산됨" : "없음"}`);
}

main().catch(e => { console.error("에러:", e.message); process.exit(1); });
