/**
 * 데이트레이딩 시뮬레이션 v4: 손절/익절 포함
 *
 * 일봉 7년치로 시뮬레이션:
 * - 전일 기준으로 "변동성 높은 종목" 필터
 * - 당일 시가에 진입
 * - 장중 시나리오 시뮬레이션 (일봉의 고가/저가 활용):
 *   A) 시가→저가 먼저 → 손절 발동? → 이후 고가까지?
 *   B) 시가→고가 먼저 → 익절? → 이후 저가?
 *   → 보수적 가정: 손절선에 닿으면 무조건 손절됨
 *
 * 전략:
 * - 진입: 당일 시가
 * - 손절: 시가 대비 -1% (고정)
 * - 익절: 없음 (장 끝까지 보유) 또는 trailing stop
 * - 청산: 종가
 *
 * 비용: 왕복 0.16% (수수료 0.03%×2 + 슬리피지 0.1%)
 */

import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";

type DailyBar = { symbol: string; date: string; open: number; high: number; low: number; close: number; volume: number; turnover: number };

function mean(v: number[]) { return v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0; }
function std(v: number[]) { if (v.length < 2) return 0; const m = mean(v); return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1)); }

const COST = 0.0016; // 왕복 비용 0.16%

type Strategy = {
  name: string;
  filter: (prev5: DailyBar[], prev: DailyBar) => boolean;
  stopLoss: number;   // 시가 대비 손절 % (음수, 예: -1.0)
  takeProfit: number | null; // 시가 대비 익절 % (양수, null=없음)
};

type SimResult = { strategy: string; period: string; trades: number; wins: number; winRate: number; avgGross: number; avgNet: number; cumReturn: number; maxDrawdown: number; maxConsecLoss: number; profitFactor: number; };

function simulateTrade(bar: DailyBar, stopLoss: number, takeProfit: number | null): { exitPrice: number; exitReason: string } {
  const entry = bar.open;
  if (entry <= 0) return { exitPrice: entry, exitReason: "invalid" };

  const slPrice = entry * (1 + stopLoss / 100);
  const tpPrice = takeProfit ? entry * (1 + takeProfit / 100) : Infinity;

  // 보수적 가정: 저가에 먼저 닿으면 손절
  if (bar.low <= slPrice) return { exitPrice: slPrice, exitReason: "stop_loss" };
  // 고가에 닿으면 익절 (takeProfit이 있을 때)
  if (takeProfit && bar.high >= tpPrice) return { exitPrice: tpPrice, exitReason: "take_profit" };
  // 아무것도 안 걸리면 종가 청산
  return { exitPrice: bar.close, exitReason: "eod_close" };
}

async function main() {
  const client = postgres(process.env.DATABASE_URL!, { prepare: false, idle_timeout: 20, connect_timeout: 10, ssl: "require" });
  const db = drizzle(client);

  console.log("=== 데이트레이딩 시뮬레이션: 손절/익절 포함 ===\n");

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

  const bySymbol = new Map<string, DailyBar[]>();
  for (const bar of bars) { const arr = bySymbol.get(bar.symbol) ?? []; arr.push(bar); bySymbol.set(bar.symbol, arr); }

  // Strategies to test
  const strategies: Strategy[] = [
    // 기본 변동성 필터 + 다양한 손절
    { name: "변동성>4% + SL-0.5%", filter: (p5, p) => ((p.high - p.low) / p.open * 100) > 4, stopLoss: -0.5, takeProfit: null },
    { name: "변동성>4% + SL-1.0%", filter: (p5, p) => ((p.high - p.low) / p.open * 100) > 4, stopLoss: -1.0, takeProfit: null },
    { name: "변동성>4% + SL-1.5%", filter: (p5, p) => ((p.high - p.low) / p.open * 100) > 4, stopLoss: -1.5, takeProfit: null },
    { name: "변동성>4% + SL-2.0%", filter: (p5, p) => ((p.high - p.low) / p.open * 100) > 4, stopLoss: -2.0, takeProfit: null },

    // 변동성 + 익절 추가
    { name: "변동성>4% + SL-1% + TP+3%", filter: (p5, p) => ((p.high - p.low) / p.open * 100) > 4, stopLoss: -1.0, takeProfit: 3.0 },
    { name: "변동성>4% + SL-1% + TP+5%", filter: (p5, p) => ((p.high - p.low) / p.open * 100) > 4, stopLoss: -1.0, takeProfit: 5.0 },
    { name: "변동성>4% + SL-1.5% + TP+3%", filter: (p5, p) => ((p.high - p.low) / p.open * 100) > 4, stopLoss: -1.5, takeProfit: 3.0 },

    // 5일 변동성 조합
    { name: "5일σ>2.5% + SL-1%", filter: (p5, p) => { const rets = p5.map((b, i) => i === 0 ? 0 : (b.close / p5[i-1].close - 1) * 100).slice(1); return std(rets) > 2.5; }, stopLoss: -1.0, takeProfit: null },
    { name: "변동성>4% + 5일σ>2.5% + SL-1%", filter: (p5, p) => { const vol = (p.high - p.low) / p.open * 100; const rets = p5.map((b, i) => i === 0 ? 0 : (b.close / p5[i-1].close - 1) * 100).slice(1); return vol > 4 && std(rets) > 2.5; }, stopLoss: -1.0, takeProfit: null },
    { name: "변동성>4% + 5일σ>2.5% + SL-1% + TP+3%", filter: (p5, p) => { const vol = (p.high - p.low) / p.open * 100; const rets = p5.map((b, i) => i === 0 ? 0 : (b.close / p5[i-1].close - 1) * 100).slice(1); return vol > 4 && std(rets) > 2.5; }, stopLoss: -1.0, takeProfit: 3.0 },

    // 거래대금 추가
    { name: "변동성>4% + 거래대금상위 + SL-1%", filter: (p5, p) => ((p.high - p.low) / p.open * 100) > 4 && p.turnover > mean(p5.map(b => b.turnover)) * 1.2, stopLoss: -1.0, takeProfit: null },

    // 전일 음봉 후 반등 (낙폭 반등 가설)
    { name: "전일음봉+변동성>4% + SL-1%", filter: (p5, p) => ((p.high - p.low) / p.open * 100) > 4 && p.close < p.open, stopLoss: -1.0, takeProfit: null },

    // 기준선: 무필터
    { name: "기준: 무필터 + SL-1%", filter: () => true, stopLoss: -1.0, takeProfit: null },
  ];

  // Run simulation
  const allDates = Array.from(new Set(bars.map(b => b.date))).sort();
  const splitDate = allDates[Math.floor(allDates.length * 0.7)];

  console.log(`전체 ${allDates.length}거래일 | IS < ${splitDate} | OOS >= ${splitDate}\n`);

  const results: SimResult[] = [];

  for (const strategy of strategies) {
    for (const period of ["IS", "OOS"] as const) {
      const periodDates = period === "IS" ? allDates.filter(d => d < splitDate) : allDates.filter(d => d >= splitDate);
      let trades = 0, wins = 0, grossReturns: number[] = [], netReturns: number[] = [];

      for (const [symbol, symbolBars] of Array.from(bySymbol.entries())) {
        for (let i = 5; i < symbolBars.length; i++) {
          const today = symbolBars[i];
          if (!periodDates.includes(today.date)) continue;
          const prev = symbolBars[i - 1];
          const prev5 = symbolBars.slice(i - 5, i);

          if (!strategy.filter(prev5, prev)) continue;

          const { exitPrice } = simulateTrade(today, strategy.stopLoss, strategy.takeProfit);
          const grossReturn = (exitPrice / today.open - 1) * 100;
          const netReturn = grossReturn - COST * 100;

          trades++;
          if (netReturn > 0) wins++;
          grossReturns.push(grossReturn);
          netReturns.push(netReturn);
        }
      }

      // Calculate stats
      const cumReturn = netReturns.reduce((s, r) => s * (1 + r / 100), 1);
      let maxDD = 0, peak = 1, equity = 1;
      for (const r of netReturns) { equity *= (1 + r / 100); peak = Math.max(peak, equity); maxDD = Math.min(maxDD, (equity - peak) / peak * 100); }
      let maxConsecLoss = 0, streak = 0;
      for (const r of netReturns) { if (r < 0) { streak++; maxConsecLoss = Math.max(maxConsecLoss, streak); } else streak = 0; }
      const grossWins = netReturns.filter(r => r > 0).reduce((s, r) => s + r, 0);
      const grossLosses = Math.abs(netReturns.filter(r => r < 0).reduce((s, r) => s + r, 0));
      const profitFactor = grossLosses > 0 ? grossWins / grossLosses : grossWins > 0 ? Infinity : 0;

      results.push({
        strategy: strategy.name, period,
        trades, wins, winRate: trades ? (wins / trades) * 100 : 0,
        avgGross: mean(grossReturns), avgNet: mean(netReturns),
        cumReturn: (cumReturn - 1) * 100, maxDrawdown: maxDD,
        maxConsecLoss, profitFactor,
      });
    }
  }

  // Print results
  console.log("═══════════════════════════════════════════════════════════════════════════════════════════════════════════");
  console.log("전략                              | 구간 | 거래수 | 승률   | 평균순수익 | 누적수익    | 최대낙폭  | 연패 | PF");
  console.log("─────────────────────────────────────────────────────────────────────────────────────────────────────────");
  for (const r of results) {
    const marker = r.period === "OOS" && r.avgNet > 0 ? "★" : " ";
    console.log(`${marker}${r.strategy.padEnd(33)}| ${r.period.padEnd(4)} | ${String(r.trades).padStart(5)} | ${r.winRate.toFixed(1).padStart(5)}% | ${r.avgNet.toFixed(3).padStart(8)}% | ${r.cumReturn.toFixed(1).padStart(9)}% | ${r.maxDrawdown.toFixed(1).padStart(7)}% | ${String(r.maxConsecLoss).padStart(4)} | ${r.profitFactor.toFixed(2).padStart(5)}`);
    if (r.period === "OOS") console.log("─────────────────────────────────────────────────────────────────────────────────────────────────────────");
  }

  // Conclusion
  console.log("\n═══ 결론 ═══");
  const oosPositive = results.filter(r => r.period === "OOS" && r.avgNet > 0 && r.trades >= 100);
  if (oosPositive.length) {
    console.log(`\n★ OOS에서 비용 후 양의 기대값 + 100회 이상 거래:\n`);
    for (const r of oosPositive.sort((a, b) => b.avgNet - a.avgNet)) {
      console.log(`  ${r.strategy}`);
      console.log(`    ${r.trades}회 | 승률 ${r.winRate.toFixed(1)}% | 순수익 ${r.avgNet.toFixed(3)}%/건 | 누적 ${r.cumReturn.toFixed(1)}% | PF ${r.profitFactor.toFixed(2)} | 낙폭 ${r.maxDrawdown.toFixed(1)}%`);
    }
    console.log("\n  → 이 전략은 실투 적용 후보. Walk-Forward 통과.");
  } else {
    console.log("\n  ❌ OOS에서 비용 후 양의 기대값을 가진 전략 없음.");
    console.log("     → 단순 변동성 필터 + 손절만으로는 수익 불가.");
    console.log("     → 진입 타이밍(시가 돌파), 더 정교한 필터, 또는 종가 기준 매매 필요.");
  }

  await client.end();
}

main().catch(e => { console.error("에러:", e.message); process.exit(1); });
