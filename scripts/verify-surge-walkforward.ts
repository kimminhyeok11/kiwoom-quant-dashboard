/**
 * 가설 검증 v3: Walk-Forward 시뮬레이션
 *
 * 일봉 7년치 40종목 데이터로:
 * 1. 보조지표 계산: RSI(14), MACD(12,26,9), 볼린저밴드 위치, ATR(14)
 * 2. 복합 필터 조건 정의 (변동성 + 보조지표 조합)
 * 3. Walk-Forward 시뮬레이션:
 *    - 매일 아침 전일 데이터 기반으로 "급등 후보" 필터링
 *    - 필터 통과 종목을 당일 시가에 매수, 종가에 매도
 *    - 수수료 0.03% × 2 (왕복) + 슬리피지 0.1% 반영
 *    - 누적 수익률, 승률, 기대값 산출
 * 4. IS(앞 5년) / OOS(뒤 2년) 분할
 *
 * 데이터: local_research_daily_bars (40종목, ~1,800거래일)
 */

import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

type DailyBar = { symbol: string; date: string; open: number; high: number; low: number; close: number; volume: number; turnover: number };

type EnrichedBar = DailyBar & {
  rsi14: number;
  macdLine: number;
  macdSignal: number;
  macdHist: number;
  bollingerPosition: number; // 0 = 하단, 0.5 = 중앙, 1 = 상단
  atr14: number;
  atr14Pct: number; // ATR / close * 100
  volatility: number; // (high-low)/open * 100
  vol5d: number; // 5일 변동성
  turnoverRank: number; // 당일 전체 종목 중 거래대금 순위 비율 (0=최하, 1=최상)
  turnoverVs5d: number;
  ma5: number;
  ma20: number;
  ma60: number;
};

type TradeResult = { date: string; symbol: string; entryPrice: number; exitPrice: number; returnPct: number; netReturnPct: number };
type FilterResult = { name: string; trades: TradeResult[]; stats: TradeStats };
type TradeStats = { count: number; winRate: number; avgReturn: number; avgNetReturn: number; totalReturn: number; maxConsecLoss: number; sharpe: number };

// ─────────────────────────────────────────────
// Technical Indicators
// ─────────────────────────────────────────────

function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const result: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) {
    result.push(values[i] * k + result[i - 1] * (1 - k));
  }
  return result;
}

function rsi(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff; else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function macd(closes: number[]): { line: number; signal: number; hist: number } {
  if (closes.length < 35) return { line: 0, signal: 0, hist: 0 };
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signal = ema(macdLine.slice(-9), 9);
  const line = macdLine[macdLine.length - 1];
  const sig = signal[signal.length - 1];
  return { line, signal: sig, hist: line - sig };
}

function bollingerPosition(closes: number[], period = 20): number {
  if (closes.length < period) return 0.5;
  const recent = closes.slice(-period);
  const avg = recent.reduce((s, v) => s + v, 0) / period;
  const stdDev = Math.sqrt(recent.reduce((s, v) => s + (v - avg) ** 2, 0) / period);
  if (stdDev === 0) return 0.5;
  const upper = avg + 2 * stdDev;
  const lower = avg - 2 * stdDev;
  const current = closes[closes.length - 1];
  return Math.max(0, Math.min(1, (current - lower) / (upper - lower)));
}

function atr(bars: DailyBar[], period = 14): number {
  if (bars.length < period + 1) return 0;
  const trueRanges: number[] = [];
  for (let i = bars.length - period; i < bars.length; i++) {
    const tr = Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - bars[i - 1].close),
      Math.abs(bars[i].low - bars[i - 1].close)
    );
    trueRanges.push(tr);
  }
  return trueRanges.reduce((s, v) => s + v, 0) / period;
}

function mean(v: number[]) { return v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0; }
function std(v: number[]) { if (v.length < 2) return 0; const m = mean(v); return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1)); }

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const FEE_RATE = 0.0003; // 편도 0.03%
const SLIPPAGE = 0.001;  // 0.1%
const TOTAL_COST = FEE_RATE * 2 + SLIPPAGE; // 왕복 비용 ~0.16%

// ─────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────

async function main() {
  const client = postgres(process.env.DATABASE_URL!, { prepare: false, idle_timeout: 20, connect_timeout: 10, ssl: "require" });
  const db = drizzle(client);

  console.log("=== Walk-Forward 시뮬레이션: 일봉 보조지표 복합 검증 ===\n");

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

  console.log(`${bars.length.toLocaleString()}개 일봉 로드 (${new Set(bars.map(b => b.symbol)).size}종목)\n`);

  // Group by symbol and compute indicators
  const bySymbol = new Map<string, DailyBar[]>();
  for (const bar of bars) { const arr = bySymbol.get(bar.symbol) ?? []; arr.push(bar); bySymbol.set(bar.symbol, arr); }

  // Enrich all bars with indicators (per symbol)
  const enrichedByDate = new Map<string, EnrichedBar[]>();
  for (const [symbol, symbolBars] of Array.from(bySymbol.entries())) {
    symbolBars.sort((a, b) => a.date.localeCompare(b.date));
    for (let i = 60; i < symbolBars.length; i++) {
      const bar = symbolBars[i];
      const closesUpTo = symbolBars.slice(0, i + 1).map(b => b.close);
      const closes60 = closesUpTo.slice(-61);
      const closes20 = closesUpTo.slice(-21);
      const closes5 = closesUpTo.slice(-6);
      const prev5 = symbolBars.slice(i - 5, i);
      const prev14 = symbolBars.slice(i - 14, i + 1);

      const rsi14 = rsi(closesUpTo.slice(-16), 14);
      const { line, signal, hist } = macd(closesUpTo.slice(-36));
      const bollPos = bollingerPosition(closesUpTo.slice(-21), 20);
      const atr14Val = atr(prev14, 14);
      const atr14Pct = bar.close > 0 ? (atr14Val / bar.close) * 100 : 0;
      const volatility = ((bar.high - bar.low) / bar.open) * 100;
      const dailyReturns5d = prev5.map((b, idx) => idx === 0 ? 0 : ((b.close / prev5[idx - 1].close) - 1) * 100).slice(1);
      const vol5d = std(dailyReturns5d);
      const turnoverVs5d = mean(prev5.map(b => b.turnover)) > 0 ? bar.turnover / mean(prev5.map(b => b.turnover)) : 1;
      const ma5 = mean(closes5);
      const ma20 = mean(closes20);
      const ma60 = mean(closes60);

      const enriched: EnrichedBar = {
        ...bar, rsi14, macdLine: line, macdSignal: signal, macdHist: hist,
        bollingerPosition: bollPos, atr14: atr14Val, atr14Pct, volatility, vol5d,
        turnoverRank: 0, turnoverVs5d, ma5, ma20, ma60,
      };

      const dateArr = enrichedByDate.get(bar.date) ?? [];
      dateArr.push(enriched);
      enrichedByDate.set(bar.date, dateArr);
    }
  }

  // Compute turnover rank per date
  for (const [, dateBars] of Array.from(enrichedByDate.entries())) {
    dateBars.sort((a, b) => b.turnover - a.turnover);
    dateBars.forEach((bar, idx) => { bar.turnoverRank = 1 - idx / Math.max(1, dateBars.length - 1); });
  }

  const allDates = Array.from(enrichedByDate.keys()).sort();
  console.log(`보조지표 계산 완료: ${allDates.length}거래일\n`);

  // Define filters
  type Filter = { name: string; condition: (prev: EnrichedBar) => boolean };

  const filters: Filter[] = [
    { name: "F1: 전일 변동성 상위 (>4%)", condition: prev => prev.volatility > 4 },
    { name: "F2: 5일 변동성 상위 (σ>2.5%)", condition: prev => prev.vol5d > 2.5 },
    { name: "F3: F1+F2 (변동성 복합)", condition: prev => prev.volatility > 4 && prev.vol5d > 2.5 },
    { name: "F4: F3 + 거래대금 상위 50%", condition: prev => prev.volatility > 4 && prev.vol5d > 2.5 && prev.turnoverRank >= 0.5 },
    { name: "F5: F3 + RSI < 70 (과매수 아님)", condition: prev => prev.volatility > 4 && prev.vol5d > 2.5 && prev.rsi14 < 70 },
    { name: "F6: F3 + RSI 30~60 (중립~과매도)", condition: prev => prev.volatility > 4 && prev.vol5d > 2.5 && prev.rsi14 >= 30 && prev.rsi14 <= 60 },
    { name: "F7: F3 + MACD 히스토그램 양수", condition: prev => prev.volatility > 4 && prev.vol5d > 2.5 && prev.macdHist > 0 },
    { name: "F8: F3 + 볼린저 하단~중간 (0~0.5)", condition: prev => prev.volatility > 4 && prev.vol5d > 2.5 && prev.bollingerPosition <= 0.5 },
    { name: "F9: F3 + 종가 > 5일선", condition: prev => prev.volatility > 4 && prev.vol5d > 2.5 && prev.close > prev.ma5 },
    { name: "F10: F3 + 거래대금 5일대비 1.2배↑", condition: prev => prev.volatility > 4 && prev.vol5d > 2.5 && prev.turnoverVs5d >= 1.2 },
    { name: "F11: F4 + RSI<70 + 종가>5일선", condition: prev => prev.volatility > 4 && prev.vol5d > 2.5 && prev.turnoverRank >= 0.5 && prev.rsi14 < 70 && prev.close > prev.ma5 },
    { name: "기준: 무필터 (전체 종목 매수)", condition: () => true },
  ];

  // Walk-Forward simulation
  function simulate(dates: string[], filterFn: (prev: EnrichedBar) => boolean): TradeResult[] {
    const trades: TradeResult[] = [];
    for (let i = 1; i < dates.length; i++) {
      const prevDate = dates[i - 1];
      const todayDate = dates[i];
      const prevBars = enrichedByDate.get(prevDate) ?? [];
      const todayBars = enrichedByDate.get(todayDate) ?? [];

      // Filter on previous day
      const candidates = prevBars.filter(filterFn);

      // Execute trades on today's bars
      for (const candidate of candidates) {
        const todayBar = todayBars.find(b => b.symbol === candidate.symbol);
        if (!todayBar || todayBar.open <= 0) continue;

        const entryPrice = todayBar.open;
        const exitPrice = todayBar.close;
        const returnPct = ((exitPrice / entryPrice) - 1) * 100;
        const netReturnPct = returnPct - TOTAL_COST * 100;

        trades.push({ date: todayDate, symbol: candidate.symbol, entryPrice, exitPrice, returnPct, netReturnPct });
      }
    }
    return trades;
  }

  function computeStats(trades: TradeResult[]): TradeStats {
    if (!trades.length) return { count: 0, winRate: 0, avgReturn: 0, avgNetReturn: 0, totalReturn: 0, maxConsecLoss: 0, sharpe: 0 };
    const wins = trades.filter(t => t.netReturnPct > 0).length;
    const returns = trades.map(t => t.netReturnPct);
    const avgReturn = mean(trades.map(t => t.returnPct));
    const avgNet = mean(returns);
    const total = returns.reduce((s, r) => s * (1 + r / 100), 1);
    let maxConsecLoss = 0, currentStreak = 0;
    for (const r of returns) { if (r < 0) { currentStreak++; maxConsecLoss = Math.max(maxConsecLoss, currentStreak); } else currentStreak = 0; }
    const sharpe = std(returns) > 0 ? (avgNet / std(returns)) * Math.sqrt(252) : 0;
    return { count: trades.length, winRate: (wins / trades.length) * 100, avgReturn, avgNetReturn: avgNet, totalReturn: (total - 1) * 100, maxConsecLoss, sharpe };
  }

  // Split
  const splitIdx = Math.floor(allDates.length * 0.7);
  const splitDate = allDates[splitIdx];
  const isDates = allDates.slice(0, splitIdx);
  const oosDates = allDates.slice(splitIdx);

  console.log(`Walk-Forward 분할: IS ${isDates.length}일 (~${splitDate}), OOS ${oosDates.length}일\n`);

  // Run all filters
  console.log("═══════════════════════════════════════════════════════════════════════════════════════════");
  console.log("  필터                              | 구간 | 거래수  | 승률    | 평균수익 | 순수익  | 누적수익    | 최대연패 | 샤프");
  console.log("  ─────────────────────────────────────────────────────────────────────────────────────────");

  for (const filter of filters) {
    const isTrades = simulate(isDates, filter.condition);
    const oosTrades = simulate(oosDates, filter.condition);
    const isStats = computeStats(isTrades);
    const oosStats = computeStats(oosTrades);

    printRow(filter.name, "IS", isStats);
    printRow(filter.name, "OOS", oosStats);
    console.log("  ─────────────────────────────────────────────────────────────────────────────────────────");
  }

  // Best filter analysis
  console.log("\n═══════════════════════════════════════════════════════════════════════════════════════════");
  console.log("  결론");
  console.log("═══════════════════════════════════════════════════════════════════════════════════════════\n");

  const oosResults = filters.map(f => ({ name: f.name, stats: computeStats(simulate(oosDates, f.condition)) }));
  const profitable = oosResults.filter(r => r.stats.avgNetReturn > 0 && r.stats.count >= 50);

  if (!profitable.length) {
    console.log("  ❌ OOS에서 비용 후 양의 기대값을 가진 필터가 없습니다.");
    console.log("     → 단순 필터만으로 수익을 내기 어려움. 진입 타이밍·손절·익절 전략이 추가로 필요.");
  } else {
    console.log(`  ✅ OOS에서 비용 후 양의 기대값을 가진 필터 ${profitable.length}개:\n`);
    profitable.sort((a, b) => b.stats.avgNetReturn - a.stats.avgNetReturn);
    for (const r of profitable) {
      console.log(`    ${r.name}`);
      console.log(`      거래 ${r.stats.count}회 | 승률 ${r.stats.winRate.toFixed(1)}% | 순수익 ${r.stats.avgNetReturn.toFixed(3)}%/건 | 누적 ${r.stats.totalReturn.toFixed(1)}% | 샤프 ${r.stats.sharpe.toFixed(2)}`);
    }
    console.log("\n  → 이 필터들은 실투 적용 후보입니다. (단, 추가 손절/익절 로직으로 개선 가능)");
  }

  await client.end();
}

function printRow(name: string, period: string, s: TradeStats) {
  const n = name.length > 34 ? name.slice(0, 34) : name.padEnd(34);
  console.log(`  ${n}| ${period.padEnd(4)} | ${String(s.count).padStart(6)} | ${s.winRate.toFixed(1).padStart(5)}% | ${s.avgReturn.toFixed(3).padStart(7)}% | ${s.avgNetReturn.toFixed(3).padStart(6)}% | ${s.totalReturn.toFixed(1).padStart(9)}% | ${String(s.maxConsecLoss).padStart(6)} | ${s.sharpe.toFixed(2).padStart(5)}`);
}

main().catch(e => { console.error("에러:", e.message); process.exit(1); });
