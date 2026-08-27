/**
 * 대안 전략 검증 — 실투 적용 가능성 탐색
 *
 * 이전 검증에서 실패한 것:
 * - 시가 무조건 진입 → 실패
 * - 돌파 진입(시가+N%) → 손절 과다 발동으로 실패
 *
 * 새 가설들:
 *
 * A) 오버나이트 갭 전략: 전일 종가에 매수 → 당일 시가에 매도
 *    - 갭업으로 수익을 노림
 *    - 변동성 높은 종목은 갭도 클 수 있음
 *
 * B) 장 초반 거래량 확인 후 진입:
 *    - 09:00~09:10 구간의 거래량이 전일 같은 시간대 대비 2배 이상일 때만 진입
 *    - "돈이 몰리는 종목"을 실시간으로 확인하고 진입
 *
 * C) 전일 대음봉 + 당일 갭업 = 반등 진입:
 *    - 전일 -3% 이상 하락 + 당일 시가가 전일 종가보다 높으면 반등 시작
 *    - 시가에 진입, 종가에 청산
 *
 * D) 시가 갭업 종목 모멘텀:
 *    - 당일 시가가 전일 종가보다 2%+ 갭업으로 시작
 *    - 09:05에 진입, 장중 보유, 종가 청산
 *    - "갭업 후 계속 오르는" 모멘텀 가설
 *
 * E) 종가 마감 전략 (14:30 매수 → 15:20 매도):
 *    - 마감 직전 매수해서 마감 호가 상승으로 수익
 *    - 대형주 한정 (유동성)
 *
 * 데이터: 1분봉 2.1M (124일, 45종목) + 일봉 70K (1800일, 40종목)
 */

import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";

type MinuteBar = { symbol: string; tradingDate: string; minuteAt: Date; open: number; high: number; low: number; close: number; volume: number };
type DailyBar = { symbol: string; date: string; open: number; high: number; low: number; close: number; volume: number; turnover: number };
type Trade = { date: string; symbol: string; entry: number; exit: number; grossPct: number; netPct: number; reason: string };

function mean(v: number[]) { return v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0; }
function std(v: number[]) { if (v.length < 2) return 0; const m = mean(v); return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1)); }

const COST = 0.16; // 왕복 비용 %

type StrategyResult = { name: string; period: string; count: number; winRate: number; avgGross: number; avgNet: number; cumReturn: number; maxDD: number; pf: number; medianNet: number };

function computeStats(trades: Trade[], period: string, name: string): StrategyResult {
  if (!trades.length) return { name, period, count: 0, winRate: 0, avgGross: 0, avgNet: 0, cumReturn: 0, maxDD: 0, pf: 0, medianNet: 0 };
  const nets = trades.map(t => t.netPct);
  const wins = nets.filter(n => n > 0);
  const losses = nets.filter(n => n <= 0);
  const cum = nets.reduce((s, r) => s * (1 + r / 100), 1);
  let peak = 1, equity = 1, maxDD = 0;
  for (const r of nets) { equity *= (1 + r / 100); peak = Math.max(peak, equity); maxDD = Math.min(maxDD, (equity - peak) / peak * 100); }
  const pf = losses.length ? Math.abs(wins.reduce((s, w) => s + w, 0)) / Math.abs(losses.reduce((s, l) => s + l, 0)) : wins.length ? 99 : 0;
  const sorted = [...nets].sort((a, b) => a - b);
  const medianNet = sorted[Math.floor(sorted.length / 2)];
  return { name, period, count: trades.length, winRate: (wins.length / trades.length) * 100, avgGross: mean(trades.map(t => t.grossPct)), avgNet: mean(nets), cumReturn: (cum - 1) * 100, maxDD, pf, medianNet };
}

async function main() {
  const client = postgres(process.env.DATABASE_URL!, { prepare: false, idle_timeout: 30, connect_timeout: 15, ssl: "require" });
  const db = drizzle(client);

  console.log("=== 대안 전략 검증 ===\n");

  // Load minute bars
  const rawMinute = await db.execute(sql`
    SELECT "tradingDate", symbol, "minuteAt", open, high, low, close, volume::bigint as volume
    FROM intraday_minute_bars ORDER BY "tradingDate", symbol, "minuteAt"
  `);
  const minuteBars: MinuteBar[] = rawMinute.map(r => ({
    tradingDate: r.tradingDate as string, symbol: r.symbol as string, minuteAt: new Date(r.minuteAt as string),
    open: Number(r.open), high: Number(r.high), low: Number(r.low), close: Number(r.close), volume: Number(r.volume),
  }));

  // Load daily bars
  const rawDaily = await db.execute(sql`
    SELECT symbol, date, open, high, low, close, volume::bigint as volume, turnover::bigint as turnover
    FROM local_research_daily_bars WHERE "adjustmentBasis" = 'adjusted' AND open > 0
    ORDER BY symbol, date
  `);
  const dailyBars: DailyBar[] = rawDaily.map(r => ({
    symbol: r.symbol as string, date: r.date as string,
    open: Number(r.open), high: Number(r.high), low: Number(r.low), close: Number(r.close),
    volume: Number(r.volume), turnover: Number(r.turnover),
  }));

  console.log(`1분봉: ${minuteBars.length.toLocaleString()} | 일봉: ${dailyBars.length.toLocaleString()}\n`);

  // Group minute bars
  const minuteByDateSymbol = new Map<string, MinuteBar[]>();
  for (const bar of minuteBars) {
    const key = `${bar.tradingDate}|${bar.symbol}`;
    const arr = minuteByDateSymbol.get(key) ?? [];
    arr.push(bar);
    minuteByDateSymbol.set(key, arr);
  }

  // Group daily bars by symbol
  const dailyBySymbol = new Map<string, DailyBar[]>();
  for (const bar of dailyBars) { const arr = dailyBySymbol.get(bar.symbol) ?? []; arr.push(bar); dailyBySymbol.set(bar.symbol, arr); }

  const minuteDates = Array.from(new Set(minuteBars.map(b => b.tradingDate))).sort();
  const dailyDates = Array.from(new Set(dailyBars.map(b => b.date))).sort();

  // ═══════════════════════════════════════════════════
  // Strategy A: 오버나이트 갭 (일봉 기반, 7년치)
  // ═══════════════════════════════════════════════════
  console.log("─── A) 오버나이트 갭: 전일 종가 매수 → 당일 시가 매도 ───");

  function runOvernightGap(filter: (prev: DailyBar, prev5: DailyBar[]) => boolean, name: string) {
    const trades: Trade[] = [];
    for (const [symbol, sBars] of Array.from(dailyBySymbol.entries())) {
      sBars.sort((a, b) => a.date.localeCompare(b.date));
      for (let i = 5; i < sBars.length; i++) {
        const prev = sBars[i - 1];
        const today = sBars[i];
        const prev5 = sBars.slice(i - 5, i);
        if (!filter(prev, prev5)) continue;
        if (prev.close <= 0 || today.open <= 0) continue;
        const gross = (today.open / prev.close - 1) * 100;
        const net = gross - COST;
        trades.push({ date: today.date, symbol, entry: prev.close, exit: today.open, grossPct: gross, netPct: net, reason: "gap" });
      }
    }
    return trades;
  }

  const gapFilters = [
    { name: "A1: 변동성>4% 종목 갭", filter: (p: DailyBar) => ((p.high - p.low) / p.open * 100) > 4 },
    { name: "A2: 전일 양봉 + 변동성>3%", filter: (p: DailyBar) => p.close > p.open && ((p.high - p.low) / p.open * 100) > 3 },
    { name: "A3: 전일 대음봉(-2%↓) 반등 갭", filter: (p: DailyBar) => ((p.close / p.open - 1) * 100) < -2 },
    { name: "A4: 5일 수익률 양수 + 변동성>3%", filter: (p: DailyBar, p5: DailyBar[]) => p5[0].close > 0 && (p.close / p5[0].close - 1) * 100 > 0 && ((p.high - p.low) / p.open * 100) > 3 },
    { name: "A5: 거래대금 상위 (전일 > 5일평균×1.5)", filter: (p: DailyBar, p5: DailyBar[]) => p.turnover > mean(p5.map(b => b.turnover)) * 1.5 },
    { name: "A-기준: 무필터", filter: () => true },
  ];

  const dailySplit = dailyDates[Math.floor(dailyDates.length * 0.7)];
  for (const { name, filter } of gapFilters) {
    const all = runOvernightGap(filter, name);
    const is = computeStats(all.filter(t => t.date < dailySplit), "IS", name);
    const oos = computeStats(all.filter(t => t.date >= dailySplit), "OOS", name);
    printRow(is); printRow(oos);
    console.log("");
  }

  // ═══════════════════════════════════════════════════
  // Strategy B: 장 초반 거래량 폭발 (1분봉 기반)
  // ═══════════════════════════════════════════════════
  console.log("\n─── B) 장 초반 거래량 확인 후 진입 (1분봉) ───");

  function runEarlyVolumeStrategy(volumeMultiplier: number, entryMinute: number, name: string): Trade[] {
    const trades: Trade[] = [];
    for (let d = 1; d < minuteDates.length; d++) {
      const prevDate = minuteDates[d - 1];
      const todayDate = minuteDates[d];
      const symbols = new Set(minuteBars.filter(b => b.tradingDate === todayDate).map(b => b.symbol));

      for (const symbol of symbols) {
        const prevBars = minuteByDateSymbol.get(`${prevDate}|${symbol}`);
        const todayBars = minuteByDateSymbol.get(`${todayDate}|${symbol}`);
        if (!prevBars?.length || !todayBars?.length) continue;

        const todaySorted = [...todayBars].sort((a, b) => a.minuteAt.getTime() - b.minuteAt.getTime());
        const prevSorted = [...prevBars].sort((a, b) => a.minuteAt.getTime() - b.minuteAt.getTime());

        // 장 초반 N분 거래량
        const earlyBars = todaySorted.slice(0, entryMinute);
        const prevEarlyBars = prevSorted.slice(0, entryMinute);
        if (earlyBars.length < entryMinute || prevEarlyBars.length < entryMinute) continue;

        const todayEarlyVol = earlyBars.reduce((s, b) => s + b.volume, 0);
        const prevEarlyVol = prevEarlyBars.reduce((s, b) => s + b.volume, 0);

        if (prevEarlyVol <= 0 || todayEarlyVol < prevEarlyVol * volumeMultiplier) continue;

        // 진입: entryMinute 봉의 종가
        const entryBar = earlyBars[earlyBars.length - 1];
        const entryPrice = entryBar.close;
        if (entryPrice <= 0) continue;

        // 청산: 종가
        const exitBar = todaySorted[todaySorted.length - 1];
        const exitPrice = exitBar.close;
        const gross = (exitPrice / entryPrice - 1) * 100;
        trades.push({ date: todayDate, symbol, entry: entryPrice, exit: exitPrice, grossPct: gross, netPct: gross - COST, reason: "early_volume" });
      }
    }
    return trades;
  }

  const minuteSplit = minuteDates[Math.floor(minuteDates.length * 0.7)];
  const earlyVolStrategies = [
    { name: "B1: 10분 거래량 2배↑ → 종가청산", mult: 2.0, mins: 10 },
    { name: "B2: 10분 거래량 3배↑ → 종가청산", mult: 3.0, mins: 10 },
    { name: "B3: 5분 거래량 2배↑ → 종가청산", mult: 2.0, mins: 5 },
    { name: "B4: 5분 거래량 3배↑ → 종가청산", mult: 3.0, mins: 5 },
    { name: "B5: 15분 거래량 2배↑ → 종가청산", mult: 2.0, mins: 15 },
  ];

  for (const { name, mult, mins } of earlyVolStrategies) {
    const all = runEarlyVolumeStrategy(mult, mins, name);
    const is = computeStats(all.filter(t => t.date < minuteSplit), "IS", name);
    const oos = computeStats(all.filter(t => t.date >= minuteSplit), "OOS", name);
    printRow(is); printRow(oos);
    console.log("");
  }

  // ═══════════════════════════════════════════════════
  // Strategy C: 시가 갭업 모멘텀 (1분봉)
  // ═══════════════════════════════════════════════════
  console.log("\n─── C) 시가 갭업 모멘텀: 갭업 종목 09:05 매수 → 종가 ───");

  function runGapUpMomentum(gapThreshold: number, name: string): Trade[] {
    const trades: Trade[] = [];
    for (let d = 1; d < minuteDates.length; d++) {
      const prevDate = minuteDates[d - 1];
      const todayDate = minuteDates[d];
      const symbols = new Set(minuteBars.filter(b => b.tradingDate === todayDate).map(b => b.symbol));

      for (const symbol of symbols) {
        const prevBars = minuteByDateSymbol.get(`${prevDate}|${symbol}`);
        const todayBars = minuteByDateSymbol.get(`${todayDate}|${symbol}`);
        if (!prevBars?.length || !todayBars?.length) continue;

        const prevSorted = [...prevBars].sort((a, b) => a.minuteAt.getTime() - b.minuteAt.getTime());
        const todaySorted = [...todayBars].sort((a, b) => a.minuteAt.getTime() - b.minuteAt.getTime());

        const prevClose = prevSorted[prevSorted.length - 1].close;
        const todayOpen = todaySorted[0].open;
        if (prevClose <= 0 || todayOpen <= 0) continue;

        const gapPct = (todayOpen / prevClose - 1) * 100;
        if (gapPct < gapThreshold) continue;

        // 진입: 5번째 봉(09:05) 종가
        if (todaySorted.length < 6) continue;
        const entryPrice = todaySorted[4].close;
        const exitPrice = todaySorted[todaySorted.length - 1].close;
        if (entryPrice <= 0) continue;

        const gross = (exitPrice / entryPrice - 1) * 100;
        trades.push({ date: todayDate, symbol, entry: entryPrice, exit: exitPrice, grossPct: gross, netPct: gross - COST, reason: "gap_momentum" });
      }
    }
    return trades;
  }

  for (const gap of [1.0, 1.5, 2.0, 3.0]) {
    const name = `C: 갭업 ${gap}%+ → 09:05진입 → 종가`;
    const all = runGapUpMomentum(gap, name);
    const is = computeStats(all.filter(t => t.date < minuteSplit), "IS", name);
    const oos = computeStats(all.filter(t => t.date >= minuteSplit), "OOS", name);
    printRow(is); printRow(oos);
    console.log("");
  }

  // ═══════════════════════════════════════════════════
  // Strategy D: 종가 마감 전략 (1분봉)
  // ═══════════════════════════════════════════════════
  console.log("\n─── D) 종가 마감: 14:30 매수 → 15:20 매도 ───");

  function runClosingStrategy(name: string): Trade[] {
    const trades: Trade[] = [];
    for (const todayDate of minuteDates) {
      const symbols = new Set(minuteBars.filter(b => b.tradingDate === todayDate).map(b => b.symbol));
      for (const symbol of symbols) {
        const todayBars = minuteByDateSymbol.get(`${todayDate}|${symbol}`);
        if (!todayBars?.length) continue;
        const sorted = [...todayBars].sort((a, b) => a.minuteAt.getTime() - b.minuteAt.getTime());
        // 14:30 = 330분 (09:00 기준), 15:20 = 380분
        const totalBars = sorted.length; // 390분봉이면 인덱스 330~380
        if (totalBars < 350) continue;
        const entryIdx = Math.floor(totalBars * 330 / 390);
        const exitIdx = Math.min(totalBars - 1, Math.floor(totalBars * 380 / 390));
        const entryPrice = sorted[entryIdx]?.close;
        const exitPrice = sorted[exitIdx]?.close;
        if (!entryPrice || !exitPrice || entryPrice <= 0) continue;
        const gross = (exitPrice / entryPrice - 1) * 100;
        trades.push({ date: todayDate, symbol, entry: entryPrice, exit: exitPrice, grossPct: gross, netPct: gross - COST, reason: "closing" });
      }
    }
    return trades;
  }

  const closingAll = runClosingStrategy("D: 전종목 14:30→15:20");
  const isClosing = computeStats(closingAll.filter(t => t.date < minuteSplit), "IS", "D: 전종목 14:30→15:20");
  const oosClosing = computeStats(closingAll.filter(t => t.date >= minuteSplit), "OOS", "D: 전종목 14:30→15:20");
  printRow(isClosing); printRow(oosClosing);

  // ═══════════════════════════════════════════════════
  // 종합 결론
  // ═══════════════════════════════════════════════════
  console.log("\n\n═══════════════════════════════════════════════════════════════");
  console.log("  종합: OOS에서 수익성 확인된 전략");
  console.log("═══════════════════════════════════════════════════════════════\n");

  // Collect all OOS results
  const allResults: StrategyResult[] = [];
  for (const { name, filter } of gapFilters) {
    const all = runOvernightGap(filter, name);
    allResults.push(computeStats(all.filter(t => t.date >= dailySplit), "OOS", name));
  }
  for (const { name, mult, mins } of earlyVolStrategies) {
    const all = runEarlyVolumeStrategy(mult, mins, name);
    allResults.push(computeStats(all.filter(t => t.date >= minuteSplit), "OOS", name));
  }
  for (const gap of [1.0, 1.5, 2.0, 3.0]) {
    const name = `C: 갭업 ${gap}%+ → 09:05진입 → 종가`;
    const all = runGapUpMomentum(gap, name);
    allResults.push(computeStats(all.filter(t => t.date >= minuteSplit), "OOS", name));
  }
  allResults.push(oosClosing);

  const winners = allResults.filter(r => r.avgNet > 0 && r.count >= 30);
  if (winners.length) {
    winners.sort((a, b) => b.avgNet - a.avgNet);
    for (const w of winners) {
      console.log(`  ★ ${w.name}`);
      console.log(`    거래 ${w.count}회 | 승률 ${w.winRate.toFixed(1)}% | 순수익 ${w.avgNet.toFixed(3)}%/건 | 누적 ${w.cumReturn.toFixed(1)}% | PF ${w.pf.toFixed(2)} | 낙폭 ${w.maxDD.toFixed(1)}%\n`);
    }
  } else {
    console.log("  ❌ 모든 대안 전략도 OOS에서 양의 기대값을 달성하지 못했습니다.\n");
    console.log("  현 데이터(45종목 대형주)에서 단순 기계적 데이트레이딩으로");
    console.log("  수수료를 커버하는 것은 통계적으로 불가능합니다.");
    console.log("  ");
    console.log("  이것이 의미하는 것:");
    console.log("  - 대형주 45종목은 효율적 시장에 가까움 (기계적 엣지 없음)");
    console.log("  - 데이트레이딩 수익은 '패턴'이 아니라 '실시간 판단'에서 나옴");
    console.log("  - 서비스로 제공할 수 있는 것: 리스크 관리 도구, 복기 도구, 데이터 시각화");
  }

  await client.end();
}

function printRow(r: StrategyResult) {
  const marker = r.period === "OOS" && r.avgNet > 0 ? "★" : " ";
  console.log(`${marker} ${r.name.padEnd(40)}| ${r.period.padEnd(4)}| ${String(r.count).padStart(6)} | 승률 ${r.winRate.toFixed(1).padStart(5)}% | 순 ${r.avgNet.toFixed(3).padStart(7)}% | 누적 ${r.cumReturn.toFixed(1).padStart(8)}% | PF ${r.pf.toFixed(2)} | DD ${r.maxDD.toFixed(1)}%`);
}

main().catch(e => { console.error("에러:", e.message); process.exit(1); });
