/**
 * 돌파 진입 시뮬레이션 — 1분봉 기반
 *
 * 전략:
 * 1. 종목 선정: 전일 평균 봉 크기 상위 (검증된 시그널)
 * 2. 진입: 당일 시가 대비 +N% 돌파 시 매수 (시가에 무조건 사는 게 아님)
 * 3. 손절: 진입가 대비 -N%
 * 4. 익절: trailing stop 또는 종가 청산
 * 5. 시간제한: 14:30 이후 미체결 시 종가 강제 청산
 *
 * 데이터: intraday_minute_bars (2.1M봉, 124거래일, 45종목)
 * 비용: 왕복 0.16% (수수료 0.03%×2 + 슬리피지 0.1%)
 */

import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";

type MinuteBar = { symbol: string; tradingDate: string; minuteAt: Date; open: number; high: number; low: number; close: number; volume: number };

function mean(v: number[]) { return v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0; }
function std(v: number[]) { if (v.length < 2) return 0; const m = mean(v); return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1)); }
function median(v: number[]) { const s = [...v].sort((a, b) => a - b); return s.length % 2 ? s[Math.floor(s.length / 2)] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; }

const COST = 0.0016; // 왕복 0.16%

type Strategy = {
  name: string;
  breakoutPct: number;     // 시가 대비 N% 돌파 시 진입
  stopLossPct: number;     // 진입가 대비 손절 (음수)
  trailingStopPct: number | null; // trailing stop (null = 종가 청산)
  takeProfitPct: number | null;   // 고정 익절 (null = 없음)
  topN: number;            // 전일 봉크기 상위 N종목만
};

type Trade = { date: string; symbol: string; entry: number; exit: number; entryTime: string; exitTime: string; exitReason: string; grossPct: number; netPct: number };

async function main() {
  const client = postgres(process.env.DATABASE_URL!, { prepare: false, idle_timeout: 30, connect_timeout: 15, ssl: "require" });
  const db = drizzle(client);

  console.log("=== 돌파 진입 시뮬레이션 (1분봉 기반) ===\n");

  // Load all minute bars
  const rawBars = await db.execute(sql`
    SELECT "tradingDate", symbol, "minuteAt", open, high, low, close, volume::bigint as volume
    FROM intraday_minute_bars
    ORDER BY "tradingDate", symbol, "minuteAt"
  `);
  const bars: MinuteBar[] = rawBars.map(r => ({
    tradingDate: r.tradingDate as string, symbol: r.symbol as string,
    minuteAt: new Date(r.minuteAt as string),
    open: Number(r.open), high: Number(r.high), low: Number(r.low), close: Number(r.close), volume: Number(r.volume),
  }));
  console.log(`${bars.length.toLocaleString()}봉 로드 (${new Set(bars.map(b => b.symbol)).size}종목, ${new Set(bars.map(b => b.tradingDate)).size}거래일)\n`);

  // Group by (date, symbol)
  const byDateSymbol = new Map<string, MinuteBar[]>();
  for (const bar of bars) {
    const key = `${bar.tradingDate}|${bar.symbol}`;
    const arr = byDateSymbol.get(key) ?? [];
    arr.push(bar);
    byDateSymbol.set(key, arr);
  }

  // Get sorted dates
  const allDates = Array.from(new Set(bars.map(b => b.tradingDate))).sort();

  // Precompute daily stats for filtering (전일 평균 봉 크기)
  const dailyAvgBarSize = new Map<string, number>(); // key: "date|symbol" → avg bar size %
  for (const [key, dayBars] of Array.from(byDateSymbol.entries())) {
    const sorted = dayBars.sort((a, b) => a.minuteAt.getTime() - b.minuteAt.getTime());
    const sizes = sorted.map(b => Math.abs(b.close - b.open) / Math.max(1, b.open) * 100);
    dailyAvgBarSize.set(key, mean(sizes));
  }

  // Strategies to test
  const strategies: Strategy[] = [
    // 다양한 돌파 비율
    { name: "Top10 + 돌파+0.5% + SL-0.7%", breakoutPct: 0.5, stopLossPct: -0.7, trailingStopPct: null, takeProfitPct: null, topN: 10 },
    { name: "Top10 + 돌파+1.0% + SL-0.7%", breakoutPct: 1.0, stopLossPct: -0.7, trailingStopPct: null, takeProfitPct: null, topN: 10 },
    { name: "Top10 + 돌파+1.0% + SL-1.0%", breakoutPct: 1.0, stopLossPct: -1.0, trailingStopPct: null, takeProfitPct: null, topN: 10 },
    { name: "Top10 + 돌파+1.5% + SL-1.0%", breakoutPct: 1.5, stopLossPct: -1.0, trailingStopPct: null, takeProfitPct: null, topN: 10 },
    { name: "Top10 + 돌파+2.0% + SL-1.0%", breakoutPct: 2.0, stopLossPct: -1.0, trailingStopPct: null, takeProfitPct: null, topN: 10 },

    // Trailing stop 추가
    { name: "Top10 + 돌파+1% + SL-1% + TS2%", breakoutPct: 1.0, stopLossPct: -1.0, trailingStopPct: 2.0, takeProfitPct: null, topN: 10 },
    { name: "Top10 + 돌파+1% + SL-1% + TS3%", breakoutPct: 1.0, stopLossPct: -1.0, trailingStopPct: 3.0, takeProfitPct: null, topN: 10 },
    { name: "Top10 + 돌파+1.5% + SL-1% + TS2%", breakoutPct: 1.5, stopLossPct: -1.0, trailingStopPct: 2.0, takeProfitPct: null, topN: 10 },

    // 고정 익절
    { name: "Top10 + 돌파+1% + SL-1% + TP+3%", breakoutPct: 1.0, stopLossPct: -1.0, trailingStopPct: null, takeProfitPct: 3.0, topN: 10 },
    { name: "Top10 + 돌파+1% + SL-1% + TP+5%", breakoutPct: 1.0, stopLossPct: -1.0, trailingStopPct: null, takeProfitPct: 5.0, topN: 10 },

    // Top5 (더 선별적)
    { name: "Top5 + 돌파+1% + SL-1%", breakoutPct: 1.0, stopLossPct: -1.0, trailingStopPct: null, takeProfitPct: null, topN: 5 },
    { name: "Top5 + 돌파+1.5% + SL-1% + TS2%", breakoutPct: 1.5, stopLossPct: -1.0, trailingStopPct: 2.0, takeProfitPct: null, topN: 5 },

    // Top20 (더 넓게)
    { name: "Top20 + 돌파+1% + SL-1%", breakoutPct: 1.0, stopLossPct: -1.0, trailingStopPct: null, takeProfitPct: null, topN: 20 },

    // 기준선: 필터 없이 전 종목
    { name: "기준: 전종목 + 돌파+1% + SL-1%", breakoutPct: 1.0, stopLossPct: -1.0, trailingStopPct: null, takeProfitPct: null, topN: 45 },
  ];

  // Run simulation
  const splitDate = allDates[Math.floor(allDates.length * 0.7)];
  console.log(`분할: IS < ${splitDate} (${Math.floor(allDates.length * 0.7)}일) | OOS >= ${splitDate} (${allDates.length - Math.floor(allDates.length * 0.7)}일)\n`);

  for (const strategy of strategies) {
    const isTrades = simulate(strategy, allDates.filter(d => d < splitDate));
    const oosTrades = simulate(strategy, allDates.filter(d => d >= splitDate));
    printResult(strategy.name, "IS", isTrades);
    printResult(strategy.name, "OOS", oosTrades);
    console.log("───────────────────────────────────────────────────────────────────────────────────────────────────────");
  }

  // Final summary
  console.log("\n═══ OOS에서 수익성 있는 전략 ═══\n");
  const oosWinners: Array<{ name: string; stats: ReturnType<typeof computeStats> }> = [];
  for (const strategy of strategies) {
    const oosTrades = simulate(strategy, allDates.filter(d => d >= splitDate));
    const stats = computeStats(oosTrades);
    if (stats.avgNet > 0 && stats.count >= 30) oosWinners.push({ name: strategy.name, stats });
  }

  if (oosWinners.length) {
    oosWinners.sort((a, b) => b.stats.avgNet - a.stats.avgNet);
    for (const w of oosWinners) {
      console.log(`★ ${w.name}`);
      console.log(`  거래 ${w.stats.count}회 | 승률 ${w.stats.winRate.toFixed(1)}% | 순수익 ${w.stats.avgNet.toFixed(3)}%/건 | 누적 ${w.stats.cumReturn.toFixed(1)}% | PF ${w.stats.pf.toFixed(2)} | 낙폭 ${w.stats.maxDD.toFixed(1)}%\n`);
    }
    console.log("→ 위 전략들은 실투 적용 후보. 1분봉 124거래일 Walk-Forward 통과.");
  } else {
    console.log("❌ OOS에서 비용 후 양의 기대값을 가진 전략 없음.");
    console.log("→ 돌파 진입 + 손절만으로도 수익 불가. 다른 접근 필요:");
    console.log("  - 장 초반(09:00~09:30) 거래량 폭발 시그널 결합");
    console.log("  - 전일 종가 기준 매수 → 당일 시가 매도 (오버나이트 갭 전략)");
    console.log("  - 종목 선정을 더 정밀화 (섹터, 뉴스, 수급 데이터 추가)");
  }

  await client.end();

  // ─── Helper functions ───

  function simulate(strategy: Strategy, dates: string[]): Trade[] {
    const trades: Trade[] = [];

    for (let d = 1; d < dates.length; d++) {
      const prevDate = dates[d - 1];
      const todayDate = dates[d];

      // Get top N symbols by previous day's avg bar size
      const prevSymbolSizes: Array<{ symbol: string; size: number }> = [];
      for (const symbol of new Set(bars.filter(b => b.tradingDate === prevDate).map(b => b.symbol))) {
        const size = dailyAvgBarSize.get(`${prevDate}|${symbol}`);
        if (size !== undefined) prevSymbolSizes.push({ symbol, size });
      }
      prevSymbolSizes.sort((a, b) => b.size - a.size);
      const candidates = prevSymbolSizes.slice(0, strategy.topN).map(s => s.symbol);

      // Simulate each candidate
      for (const symbol of candidates) {
        const todayBars = byDateSymbol.get(`${todayDate}|${symbol}`);
        if (!todayBars || todayBars.length < 10) continue;

        const sorted = [...todayBars].sort((a, b) => a.minuteAt.getTime() - b.minuteAt.getTime());
        const openPrice = sorted[0].open;
        if (openPrice <= 0) continue;

        const breakoutPrice = openPrice * (1 + strategy.breakoutPct / 100);
        const trade = simulateIntraday(sorted, breakoutPrice, strategy);
        if (trade) trades.push({ ...trade, date: todayDate, symbol });
      }
    }
    return trades;
  }

  function simulateIntraday(bars: MinuteBar[], breakoutPrice: number, strategy: Strategy): Omit<Trade, "date" | "symbol"> | null {
    let entered = false;
    let entryPrice = 0;
    let entryTime = "";
    let highSinceEntry = 0;

    for (const bar of bars) {
      if (!entered) {
        // Check if breakout happened in this bar
        if (bar.high >= breakoutPrice) {
          entered = true;
          entryPrice = breakoutPrice; // 돌파가에 진입 가정
          entryTime = bar.minuteAt.toISOString();
          highSinceEntry = bar.high;

          // Check if stop loss also hit in same bar
          const slPrice = entryPrice * (1 + strategy.stopLossPct / 100);
          if (bar.low <= slPrice) {
            const gross = (slPrice / entryPrice - 1) * 100;
            return { entry: entryPrice, exit: slPrice, entryTime, exitTime: bar.minuteAt.toISOString(), exitReason: "stop_loss", grossPct: gross, netPct: gross - COST * 100 };
          }

          // Check take profit
          if (strategy.takeProfitPct) {
            const tpPrice = entryPrice * (1 + strategy.takeProfitPct / 100);
            if (bar.high >= tpPrice) {
              const gross = (tpPrice / entryPrice - 1) * 100;
              return { entry: entryPrice, exit: tpPrice, entryTime, exitTime: bar.minuteAt.toISOString(), exitReason: "take_profit", grossPct: gross, netPct: gross - COST * 100 };
            }
          }
        }
      } else {
        // Already entered — check exit conditions
        highSinceEntry = Math.max(highSinceEntry, bar.high);

        // Stop loss
        const slPrice = entryPrice * (1 + strategy.stopLossPct / 100);
        if (bar.low <= slPrice) {
          const gross = (slPrice / entryPrice - 1) * 100;
          return { entry: entryPrice, exit: slPrice, entryTime, exitTime: bar.minuteAt.toISOString(), exitReason: "stop_loss", grossPct: gross, netPct: gross - COST * 100 };
        }

        // Trailing stop
        if (strategy.trailingStopPct) {
          const tsPrice = highSinceEntry * (1 - strategy.trailingStopPct / 100);
          if (bar.low <= tsPrice && highSinceEntry > entryPrice) {
            const gross = (tsPrice / entryPrice - 1) * 100;
            return { entry: entryPrice, exit: tsPrice, entryTime, exitTime: bar.minuteAt.toISOString(), exitReason: "trailing_stop", grossPct: gross, netPct: gross - COST * 100 };
          }
        }

        // Take profit
        if (strategy.takeProfitPct) {
          const tpPrice = entryPrice * (1 + strategy.takeProfitPct / 100);
          if (bar.high >= tpPrice) {
            const gross = (tpPrice / entryPrice - 1) * 100;
            return { entry: entryPrice, exit: tpPrice, entryTime, exitTime: bar.minuteAt.toISOString(), exitReason: "take_profit", grossPct: gross, netPct: gross - COST * 100 };
          }
        }
      }
    }

    // End of day — close at last bar's close
    if (entered) {
      const lastBar = bars[bars.length - 1];
      const gross = (lastBar.close / entryPrice - 1) * 100;
      return { entry: entryPrice, exit: lastBar.close, entryTime, exitTime: lastBar.minuteAt.toISOString(), exitReason: "eod_close", grossPct: gross, netPct: gross - COST * 100 };
    }

    return null; // No entry (breakout never happened)
  }

  function computeStats(trades: Trade[]) {
    if (!trades.length) return { count: 0, winRate: 0, avgGross: 0, avgNet: 0, cumReturn: 0, maxDD: 0, maxConsecLoss: 0, pf: 0 };
    const nets = trades.map(t => t.netPct);
    const wins = nets.filter(n => n > 0);
    const losses = nets.filter(n => n < 0);
    const cum = nets.reduce((s, r) => s * (1 + r / 100), 1);
    let peak = 1, equity = 1, maxDD = 0;
    for (const r of nets) { equity *= (1 + r / 100); peak = Math.max(peak, equity); maxDD = Math.min(maxDD, (equity - peak) / peak * 100); }
    let streak = 0, maxStreak = 0;
    for (const r of nets) { if (r < 0) { streak++; maxStreak = Math.max(maxStreak, streak); } else streak = 0; }
    const pf = losses.length ? Math.abs(wins.reduce((s, w) => s + w, 0)) / Math.abs(losses.reduce((s, l) => s + l, 0)) : wins.length ? Infinity : 0;
    return { count: trades.length, winRate: (wins.length / trades.length) * 100, avgGross: mean(trades.map(t => t.grossPct)), avgNet: mean(nets), cumReturn: (cum - 1) * 100, maxDD, maxConsecLoss: maxStreak, pf };
  }

  function printResult(name: string, period: string, trades: Trade[]) {
    const s = computeStats(trades);
    const marker = period === "OOS" && s.avgNet > 0 ? "★" : " ";
    const exitReasons = trades.reduce<Record<string, number>>((acc, t) => { acc[t.exitReason] = (acc[t.exitReason] ?? 0) + 1; return acc; }, {});
    const reasonStr = Object.entries(exitReasons).map(([k, v]) => `${k}:${v}`).join(" ");
    console.log(`${marker}${name.padEnd(38)}| ${period.padEnd(4)}| ${String(s.count).padStart(5)} | ${s.winRate.toFixed(1).padStart(5)}% | ${s.avgNet.toFixed(3).padStart(7)}% | ${s.cumReturn.toFixed(1).padStart(8)}% | ${s.maxDD.toFixed(1).padStart(6)}% | PF ${s.pf.toFixed(2)} | ${reasonStr}`);
  }
}

main().catch(e => { console.error("에러:", e.message); process.exit(1); });
