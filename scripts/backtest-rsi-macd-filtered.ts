/**
 * RSI 과매도 회복 + MACD OSC 증가 + 필터 강화 백테스트
 *
 * 조건식 (AND):
 *   1. RSI(14) 직전 봉 ≤ 35 이고, 현재 봉 > 35 (과매도 회복)
 *   2. MACD 히스토그램 2연속 증가
 *   3. 현재 봉이 양봉 (close > open)
 *   4. 거래량이 20봉 평균 대비 1.5배 이상
 *
 * 5분봉 기준 인트라데이 백테스트
 */

import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error("DATABASE_URL not set"); process.exit(1); }

const client = postgres(DATABASE_URL);
const db = drizzle(client);

function average(values: number[]) { return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0; }

function exponentialMovingAverage(data: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const ema = new Array(data.length).fill(0);
  ema[0] = data[0];
  for (let i = 1; i < data.length; i++) ema[i] = data[i] * k + ema[i - 1] * (1 - k);
  return ema;
}

function macdHistogram(closes: number[], fast = 12, slow = 26, signal = 9): number[] {
  if (closes.length < slow) return [];
  const fastEma = exponentialMovingAverage(closes, fast);
  const slowEma = exponentialMovingAverage(closes, slow);
  const macdLine = closes.map((_, i) => fastEma[i] - slowEma[i]);
  const signalLine = exponentialMovingAverage(macdLine, signal);
  return macdLine.map((val, i) => val - signalLine[i]);
}

function relativeStrengthIndex(closes: number[], period = 14): number | null {
  if (period <= 0 || closes.length <= period) return null;
  const changes = closes.slice(-(period + 1)).slice(1).map((val, i) => val - closes.slice(-(period + 1))[i]);
  const gains = changes.map(v => Math.max(v, 0));
  const losses = changes.map(v => Math.max(-v, 0));
  const avgGain = average(gains);
  const avgLoss = average(losses);
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

type MinuteBar = { symbol: string; tradingDate: string; minuteAt: Date; open: number; high: number; low: number; close: number; volume: number; };
type FiveMinuteBar = { date: string; open: number; high: number; low: number; close: number; volume: number; };
type Trade = { entryDate: string; exitDate: string; entryPrice: number; exitPrice: number; returnPct: number; exitReason: string; holdingBars: number; symbol: string; tradingDate: string; };

function aggregateToFiveMinute(bars: MinuteBar[]): FiveMinuteBar[] {
  const sorted = [...bars].sort((a, b) => a.minuteAt.getTime() - b.minuteAt.getTime());
  const result: FiveMinuteBar[] = [];
  for (let i = 0; i + 4 < sorted.length; i += 5) {
    const chunk = sorted.slice(i, i + 5);
    result.push({
      date: chunk[0].minuteAt.toISOString(),
      open: chunk[0].open,
      high: Math.max(...chunk.map(b => b.high)),
      low: Math.min(...chunk.map(b => b.low)),
      close: chunk[4].close,
      volume: chunk.reduce((s, b) => s + Number(b.volume), 0),
    });
  }
  return result;
}

type StrategyConfig = {
  label: string;
  rsiThreshold: number;       // RSI 과매도 기준 (default 35)
  requireBullish: boolean;    // 양봉 조건
  volumeFilter: number;       // 거래량 배수 (0이면 무시)
  macdRisingBars: number;     // MACD 연속 증가 봉 수
  stopLossPct: number;
  takeProfitPct: number;
  maxHoldBars: number;
};

function runBacktest(fiveBars: FiveMinuteBar[], cfg: StrategyConfig & { symbol: string; tradingDate: string }): Trade[] {
  const { stopLossPct, takeProfitPct, maxHoldBars, rsiThreshold, requireBullish, volumeFilter, macdRisingBars, symbol, tradingDate } = cfg;
  const feeRate = 0.0003;
  const slippageBps = 8;
  const trades: Trade[] = [];
  const closes = fiveBars.map(b => b.close);

  let i = 0;
  while (i < fiveBars.length - 1) {
    if (i >= 1 && i >= 26) { // MACD(12,26,9) 최소 필요
      const prevCloses = closes.slice(0, i);
      const currCloses = closes.slice(0, i + 1);

      const prevRsi = relativeStrengthIndex(prevCloses, 14);
      const currRsi = relativeStrengthIndex(currCloses, 14);

      // RSI 과매도 회복
      const rsiRecovery = prevRsi !== null && currRsi !== null && prevRsi <= rsiThreshold && currRsi > rsiThreshold;
      if (!rsiRecovery) { i++; continue; }

      // MACD 히스토그램 연속 증가
      const hist = macdHistogram(currCloses, 12, 26, 9);
      let macdOk = hist.length >= macdRisingBars + 1;
      if (macdOk) {
        for (let k = 0; k < macdRisingBars; k++) {
          if (hist[hist.length - 1 - k] <= hist[hist.length - 2 - k]) { macdOk = false; break; }
        }
      }
      if (!macdOk) { i++; continue; }

      // 양봉 필터
      if (requireBullish && fiveBars[i].close <= fiveBars[i].open) { i++; continue; }

      // 거래량 필터
      if (volumeFilter > 0) {
        const volWindow = fiveBars.slice(Math.max(0, i - 20), i);
        const avgVol = volWindow.length ? average(volWindow.map(b => b.volume)) : 0;
        if (avgVol > 0 && fiveBars[i].volume < avgVol * volumeFilter) { i++; continue; }
      }

      // 진입: 다음 봉 시가
      const entryBar = fiveBars[i + 1];
      const entryPrice = entryBar.open * (1 + slippageBps / 10000);
      const stopPrice = entryPrice * (1 - stopLossPct / 100);
      const targetPrice = entryPrice * (1 + takeProfitPct / 100);

      let exitPrice = entryBar.close;
      let exitReason = "time_exit";
      let exitIdx = Math.min(fiveBars.length - 1, i + 1 + maxHoldBars);

      for (let j = i + 1; j <= exitIdx; j++) {
        const bar = fiveBars[j];
        if (bar.low <= stopPrice) { exitPrice = stopPrice; exitReason = "stop_loss"; exitIdx = j; break; }
        if (bar.high >= targetPrice) { exitPrice = targetPrice; exitReason = "take_profit"; exitIdx = j; break; }
        if (j === exitIdx) { exitPrice = bar.close; }
      }

      exitPrice *= (1 - slippageBps / 10000);
      const grossReturn = (exitPrice - entryPrice) / entryPrice;
      const netReturn = grossReturn - feeRate * 2;

      trades.push({ entryDate: fiveBars[i + 1].date, exitDate: fiveBars[exitIdx].date, entryPrice, exitPrice, returnPct: netReturn * 100, exitReason, holdingBars: exitIdx - (i + 1), symbol, tradingDate });
      i = exitIdx + 1;
      continue;
    }
    i++;
  }
  return trades;
}

async function main() {
  console.log("=== RSI 과매도 회복 + MACD + 필터 강화 백테스트 ===\n");

  const dateRows = await db.execute(sql`SELECT DISTINCT "tradingDate" FROM intraday_minute_bars ORDER BY "tradingDate"`);
  const dates = ((dateRows.rows ?? dateRows) as Array<{ tradingDate: string }>).map(r => r.tradingDate);
  console.log(`전체 ${dates.length}거래일 데이터 사용\n`);

  const strategies: StrategyConfig[] = [
    { label: "A: RSI≤35 회복 + MACD 2증가 + 양봉 + 거래량1.5x | SL1.5 TP3 45봉", rsiThreshold: 35, requireBullish: true, volumeFilter: 1.5, macdRisingBars: 2, stopLossPct: 1.5, takeProfitPct: 3, maxHoldBars: 45 },
    { label: "B: RSI≤30 회복 + MACD 2증가 + 양봉 + 거래량2x | SL2 TP4 45봉", rsiThreshold: 30, requireBullish: true, volumeFilter: 2.0, macdRisingBars: 2, stopLossPct: 2, takeProfitPct: 4, maxHoldBars: 45 },
    { label: "C: RSI≤30 회복 + MACD 3증가 + 양봉 | SL1.5 TP3 30봉", rsiThreshold: 30, requireBullish: true, volumeFilter: 0, macdRisingBars: 3, stopLossPct: 1.5, takeProfitPct: 3, maxHoldBars: 30 },
    { label: "D: RSI≤25 회복 + MACD 2증가 + 양봉 + 거래량1.5x | SL2 TP5 60봉", rsiThreshold: 25, requireBullish: true, volumeFilter: 1.5, macdRisingBars: 2, stopLossPct: 2, takeProfitPct: 5, maxHoldBars: 60 },
    { label: "E: RSI≤35 회복 + MACD 2증가 + 양봉 + 거래량2x | SL1 TP2 30봉 (단타)", rsiThreshold: 35, requireBullish: true, volumeFilter: 2.0, macdRisingBars: 2, stopLossPct: 1, takeProfitPct: 2, maxHoldBars: 30 },
  ];

  const summaryRows: Array<Record<string, unknown>> = [];

  for (const strategy of strategies) {
    console.log(`\n--- ${strategy.label} ---`);
    const allTrades: Trade[] = [];

    for (const tradingDate of dates) {
      const rows = await db.execute(sql`
        SELECT symbol, "tradingDate", "minuteAt", open, high, low, close, volume
        FROM intraday_minute_bars WHERE "tradingDate" = ${tradingDate}
        ORDER BY symbol, "minuteAt"
      `);
      const minuteBars = ((rows.rows ?? rows) as Array<Record<string, unknown>>).map(r => ({
        symbol: String(r.symbol), tradingDate: String(r.tradingDate),
        minuteAt: new Date(r.minuteAt as string),
        open: Number(r.open), high: Number(r.high), low: Number(r.low), close: Number(r.close), volume: Number(r.volume),
      }));

      const bySymbol = new Map<string, MinuteBar[]>();
      for (const bar of minuteBars) { const list = bySymbol.get(bar.symbol) ?? []; list.push(bar); bySymbol.set(bar.symbol, list); }

      for (const [symbol, bars] of bySymbol) {
        if (bars.length < 130) continue; // 26 * 5 = 130 1분봉 → 26 5분봉 최소
        const fiveBars = aggregateToFiveMinute(bars);
        if (fiveBars.length < 30) continue;
        const trades = runBacktest(fiveBars, { ...strategy, symbol, tradingDate });
        allTrades.push(...trades);
      }
    }

    const wins = allTrades.filter(t => t.returnPct > 0);
    const losses = allTrades.filter(t => t.returnPct < 0);
    const grossProfit = wins.reduce((s, t) => s + t.returnPct, 0);
    const grossLoss = Math.abs(losses.reduce((s, t) => s + t.returnPct, 0));
    const netReturn = allTrades.reduce((s, t) => s + t.returnPct, 0);
    const avgReturn = allTrades.length ? netReturn / allTrades.length : 0;
    const winRate = allTrades.length ? wins.length / allTrades.length * 100 : 0;
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;
    const avgHold = allTrades.length ? allTrades.reduce((s, t) => s + t.holdingBars, 0) / allTrades.length : 0;

    let cumulative = 0, peak = 0, maxDD = 0;
    for (const t of allTrades) { cumulative += t.returnPct; peak = Math.max(peak, cumulative); maxDD = Math.min(maxDD, cumulative - peak); }

    const slCount = allTrades.filter(t => t.exitReason === "stop_loss").length;
    const tpCount = allTrades.filter(t => t.exitReason === "take_profit").length;
    const timeCount = allTrades.filter(t => t.exitReason === "time_exit").length;

    // 양(+)일 비율
    const byDate = new Map<string, number>();
    for (const t of allTrades) byDate.set(t.tradingDate, (byDate.get(t.tradingDate) ?? 0) + t.returnPct);
    const positiveDays = [...byDate.values()].filter(v => v > 0).length;
    const totalDays = byDate.size;
    const posDayRate = totalDays ? positiveDays / totalDays * 100 : 0;

    console.log(`  거래 ${allTrades.length}건 | 승률 ${winRate.toFixed(1)}% | 누적 ${netReturn >= 0 ? "+" : ""}${netReturn.toFixed(1)}% | 평균 ${avgReturn >= 0 ? "+" : ""}${avgReturn.toFixed(3)}%`);
    console.log(`  최대낙폭 ${maxDD.toFixed(1)}% | 손익비 ${profitFactor === Infinity ? "∞" : profitFactor.toFixed(2)} | 양일 ${posDayRate.toFixed(0)}%`);
    console.log(`  보유 ${avgHold.toFixed(1)}봉 | 손절 ${slCount} 익절 ${tpCount} 시간 ${timeCount}`);

    const top3 = [...allTrades].sort((a, b) => b.returnPct - a.returnPct).slice(0, 3);
    if (top3.length) console.log(`  Best: ${top3.map(t => `${t.symbol}(${t.tradingDate}) +${t.returnPct.toFixed(2)}%`).join(", ")}`);

    summaryRows.push({
      전략: strategy.label.slice(0, 3),
      거래수: allTrades.length,
      승률: `${winRate.toFixed(1)}%`,
      누적: `${netReturn.toFixed(1)}%`,
      평균: `${avgReturn.toFixed(3)}%`,
      낙폭: `${maxDD.toFixed(1)}%`,
      손익비: profitFactor === Infinity ? "∞" : profitFactor.toFixed(2),
      양일률: `${posDayRate.toFixed(0)}%`,
      "보유(봉)": avgHold.toFixed(1),
    });
  }

  console.log("\n\n=== 전략별 비교 요약 ===");
  console.table(summaryRows);

  await client.end();
}

main().catch(err => { console.error(err); process.exit(1); });
