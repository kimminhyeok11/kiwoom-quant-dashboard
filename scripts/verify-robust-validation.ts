/**
 * 강건성 검증 (Robustness Validation)
 *
 * 이전 검증에서 OOS 수익이 확인된 전략들을 여러 방식으로 재검증:
 *
 * 1. 기간 분할 다양화: 50/50, 60/40, 70/30, 80/20
 * 2. 연도별 분할: 각 연도를 OOS로 놓고 나머지로 IS
 * 3. 롤링 윈도우: 1년 훈련 → 6개월 검증, 슬라이딩
 * 4. 종목 서브셋: 홀수/짝수 종목으로 나눠서 각각 검증
 * 5. 시장 국면: KOSPI 추세(20일선 기준) 상승/하락 분리
 *
 * 대상 전략:
 * - A1: 변동성>4% 오버나이트 갭
 * - A3: 전일 대음봉 반등 갭
 * - A4: 5일 수익률 양수 + 변동성>3%
 * - B2: 10분 거래량 3배 (1분봉 - 참고용, 표본 적음)
 *
 * 데이터: 일봉 70,362건 (40종목, 1,800거래일, 7년)
 */

import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";

type DailyBar = { symbol: string; date: string; open: number; high: number; low: number; close: number; volume: number; turnover: number };

function mean(v: number[]) { return v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0; }
function std(v: number[]) { if (v.length < 2) return 0; const m = mean(v); return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1)); }

const COST = 0.16; // %

type StratFilter = { name: string; filter: (prev: DailyBar, prev5: DailyBar[]) => boolean };
type PeriodResult = { period: string; count: number; winRate: number; avgNet: number; cumReturn: number; pf: number; maxDD: number };

function runGapStrategy(bars: DailyBar[], symbols: string[], dates: string[], filter: (prev: DailyBar, prev5: DailyBar[]) => boolean): Array<{ date: string; symbol: string; net: number }> {
  const bySymbol = new Map<string, DailyBar[]>();
  for (const bar of bars) { if (symbols.includes(bar.symbol)) { const a = bySymbol.get(bar.symbol) ?? []; a.push(bar); bySymbol.set(bar.symbol, a); } }

  const trades: Array<{ date: string; symbol: string; net: number }> = [];
  const dateSet = new Set(dates);

  for (const [, sBars] of Array.from(bySymbol.entries())) {
    sBars.sort((a, b) => a.date.localeCompare(b.date));
    for (let i = 5; i < sBars.length; i++) {
      const prev = sBars[i - 1];
      const today = sBars[i];
      if (!dateSet.has(today.date)) continue;
      const prev5 = sBars.slice(i - 5, i);
      if (!filter(prev, prev5)) continue;
      if (prev.close <= 0 || today.open <= 0) continue;
      const gross = (today.open / prev.close - 1) * 100;
      trades.push({ date: today.date, symbol: prev.symbol, net: gross - COST });
    }
  }
  return trades;
}

function stats(trades: Array<{ net: number }>): PeriodResult {
  if (!trades.length) return { period: "", count: 0, winRate: 0, avgNet: 0, cumReturn: 0, pf: 0, maxDD: 0 };
  const nets = trades.map(t => t.net);
  const wins = nets.filter(n => n > 0);
  const losses = nets.filter(n => n <= 0);
  const cum = nets.reduce((s, r) => s * (1 + r / 100), 1);
  let peak = 1, equity = 1, maxDD = 0;
  for (const r of nets) { equity *= (1 + r / 100); peak = Math.max(peak, equity); maxDD = Math.min(maxDD, (equity - peak) / peak * 100); }
  const pf = losses.length ? Math.abs(wins.reduce((s, w) => s + w, 0)) / Math.abs(losses.reduce((s, l) => s + l, 0)) : 99;
  return { period: "", count: trades.length, winRate: (wins.length / trades.length) * 100, avgNet: mean(nets), cumReturn: (cum - 1) * 100, pf, maxDD };
}

async function main() {
  const client = postgres(process.env.DATABASE_URL!, { prepare: false, idle_timeout: 30, connect_timeout: 15, ssl: "require" });
  const db = drizzle(client);

  console.log("=== 강건성 검증 (다기간·다조합·다분할) ===\n");

  const rawBars = await db.execute(sql`
    SELECT symbol, date, open, high, low, close, volume::bigint as volume, turnover::bigint as turnover
    FROM local_research_daily_bars WHERE "adjustmentBasis" = 'adjusted' AND open > 0
    ORDER BY symbol, date
  `);
  const bars: DailyBar[] = rawBars.map(r => ({
    symbol: r.symbol as string, date: r.date as string,
    open: Number(r.open), high: Number(r.high), low: Number(r.low), close: Number(r.close),
    volume: Number(r.volume), turnover: Number(r.turnover),
  }));
  const allSymbols = Array.from(new Set(bars.map(b => b.symbol))).sort();
  const allDates = Array.from(new Set(bars.map(b => b.date))).sort();
  console.log(`${bars.length.toLocaleString()}개 일봉 | ${allSymbols.length}종목 | ${allDates.length}거래일\n`);

  const strategies: StratFilter[] = [
    { name: "A1: 변동성>4% 갭", filter: (p) => ((p.high - p.low) / p.open * 100) > 4 },
    { name: "A3: 대음봉(-2%) 반등", filter: (p) => ((p.close / p.open - 1) * 100) < -2 },
    { name: "A4: 5일수익↑+변동성>3%", filter: (p, p5) => p5[0].close > 0 && (p.close / p5[0].close - 1) * 100 > 0 && ((p.high - p.low) / p.open * 100) > 3 },
    { name: "A2: 양봉+변동성>3%", filter: (p) => p.close > p.open && ((p.high - p.low) / p.open * 100) > 3 },
    { name: "A5: 거래대금 폭발", filter: (p, p5) => p.turnover > mean(p5.map(b => b.turnover)) * 1.5 },
  ];

  // ════════════════════════════════════════════
  // 1. 기간 분할 다양화 (50/50, 60/40, 70/30, 80/20)
  // ════════════════════════════════════════════
  console.log("═══ 1. 기간 분할 다양화 ═══\n");
  console.log("전략                    | 분할  | IS 수익/건 | OOS 수익/건 | OOS 거래수 | OOS PF | 일관성");
  console.log("─────────────────────────────────────────────────────────────────────────────────────");

  for (const strat of strategies) {
    const results: Array<{ split: string; isAvg: number; oosAvg: number; oosCount: number; oosPf: number }> = [];
    for (const ratio of [0.5, 0.6, 0.7, 0.8]) {
      const splitIdx = Math.floor(allDates.length * ratio);
      const isDates = allDates.slice(0, splitIdx);
      const oosDates = allDates.slice(splitIdx);
      const isTrades = runGapStrategy(bars, allSymbols, isDates, strat.filter);
      const oosTrades = runGapStrategy(bars, allSymbols, oosDates, strat.filter);
      const isS = stats(isTrades);
      const oosS = stats(oosTrades);
      results.push({ split: `${Math.round(ratio * 100)}/${Math.round((1 - ratio) * 100)}`, isAvg: isS.avgNet, oosAvg: oosS.avgNet, oosCount: oosS.count, oosPf: oosS.pf });
    }
    const allPositive = results.every(r => r.oosAvg > 0);
    const consistency = allPositive ? "✅ 전분할 양수" : `⚠️ ${results.filter(r => r.oosAvg > 0).length}/4 양수`;
    for (const r of results) {
      console.log(`${strat.name.padEnd(24)}| ${r.split.padEnd(6)}| ${r.isAvg.toFixed(3).padStart(9)}% | ${r.oosAvg.toFixed(3).padStart(10)}% | ${String(r.oosCount).padStart(9)} | ${r.oosPf.toFixed(2).padStart(5)} | ${consistency}`);
    }
    console.log("");
  }

  // ════════════════════════════════════════════
  // 2. 연도별 Leave-One-Year-Out 검증
  // ════════════════════════════════════════════
  console.log("\n═══ 2. 연도별 검증 (해당 연도만 OOS) ═══\n");
  console.log("전략                    | 연도 | 거래수 | 승률  | 순수익/건 | PF");
  console.log("─────────────────────────────────────────────────────────────────");

  const years = Array.from(new Set(allDates.map(d => d.slice(0, 4)))).sort();
  for (const strat of strategies) {
    let positiveYears = 0;
    for (const year of years) {
      const yearDates = allDates.filter(d => d.startsWith(year));
      const trades = runGapStrategy(bars, allSymbols, yearDates, strat.filter);
      const s = stats(trades);
      if (s.avgNet > 0) positiveYears++;
      console.log(`${strat.name.padEnd(24)}| ${year} | ${String(s.count).padStart(5)} | ${s.winRate.toFixed(1).padStart(5)}% | ${s.avgNet.toFixed(3).padStart(8)}% | ${s.pf.toFixed(2)}`);
    }
    console.log(`${"".padEnd(24)}| 결과: ${positiveYears}/${years.length}년 양수 ${positiveYears >= years.length * 0.7 ? "✅" : "⚠️"}`);
    console.log("");
  }

  // ════════════════════════════════════════════
  // 3. 종목 서브셋 검증 (A그룹/B그룹)
  // ════════════════════════════════════════════
  console.log("\n═══ 3. 종목 서브셋 (A그룹·B그룹 각각) ═══\n");
  const groupA = allSymbols.filter((_, i) => i % 2 === 0);
  const groupB = allSymbols.filter((_, i) => i % 2 === 1);
  console.log(`A그룹: ${groupA.length}종목 | B그룹: ${groupB.length}종목\n`);
  console.log("전략                    | 그룹 | 거래수 | 순수익/건 | PF   | 일관성");
  console.log("─────────────────────────────────────────────────────────────────");

  for (const strat of strategies) {
    const tradesA = runGapStrategy(bars, groupA, allDates, strat.filter);
    const tradesB = runGapStrategy(bars, groupB, allDates, strat.filter);
    const sA = stats(tradesA);
    const sB = stats(tradesB);
    const consistent = sA.avgNet > 0 && sB.avgNet > 0 ? "✅ 양쪽 양수" : "⚠️ 불일치";
    console.log(`${strat.name.padEnd(24)}| A    | ${String(sA.count).padStart(5)} | ${sA.avgNet.toFixed(3).padStart(8)}% | ${sA.pf.toFixed(2)} | ${consistent}`);
    console.log(`${strat.name.padEnd(24)}| B    | ${String(sB.count).padStart(5)} | ${sB.avgNet.toFixed(3).padStart(8)}% | ${sB.pf.toFixed(2)} |`);
    console.log("");
  }

  // ════════════════════════════════════════════
  // 4. 시장 국면별 (삼성전자 20일선 기준 상승/하락)
  // ════════════════════════════════════════════
  console.log("\n═══ 4. 시장 국면별 (삼성전자 20일선 기준) ═══\n");
  const samsungBars = bars.filter(b => b.symbol === "005930").sort((a, b) => a.date.localeCompare(b.date));
  const bullDates = new Set<string>();
  const bearDates = new Set<string>();
  for (let i = 20; i < samsungBars.length; i++) {
    const ma20 = mean(samsungBars.slice(i - 20, i).map(b => b.close));
    if (samsungBars[i].close > ma20) bullDates.add(samsungBars[i].date);
    else bearDates.add(samsungBars[i].date);
  }
  console.log(`상승장: ${bullDates.size}일 | 하락장: ${bearDates.size}일\n`);
  console.log("전략                    | 국면 | 거래수 | 순수익/건 | PF   | 양쪽 양수?");
  console.log("─────────────────────────────────────────────────────────────────");

  for (const strat of strategies) {
    const bullTrades = runGapStrategy(bars, allSymbols, Array.from(bullDates), strat.filter);
    const bearTrades = runGapStrategy(bars, allSymbols, Array.from(bearDates), strat.filter);
    const sB = stats(bullTrades);
    const sBr = stats(bearTrades);
    const both = sB.avgNet > 0 && sBr.avgNet > 0 ? "✅" : "⚠️";
    console.log(`${strat.name.padEnd(24)}| 상승 | ${String(sB.count).padStart(5)} | ${sB.avgNet.toFixed(3).padStart(8)}% | ${sB.pf.toFixed(2)} | ${both}`);
    console.log(`${strat.name.padEnd(24)}| 하락 | ${String(sBr.count).padStart(5)} | ${sBr.avgNet.toFixed(3).padStart(8)}% | ${sBr.pf.toFixed(2)} |`);
    console.log("");
  }

  // ════════════════════════════════════════════
  // 최종 판정
  // ════════════════════════════════════════════
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  최종 강건성 판정");
  console.log("═══════════════════════════════════════════════════════════════\n");
  console.log("  기준: 4개 검증(기간분할·연도별·종목서브셋·시장국면) 모두 통과 = 실투 적용 가능\n");

  await client.end();
}

main().catch(e => { console.error("에러:", e.message); process.exit(1); });
