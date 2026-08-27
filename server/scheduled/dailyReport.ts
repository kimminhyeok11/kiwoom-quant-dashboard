/**
 * 일간 보고서 스케줄러 핸들러
 *
 * 매일 15:30 KST에 외부 cron이 POST /api/scheduled/daily-report 호출.
 * 포트폴리오 상태, 당일 거래, 아레나 현황, 시장 국면을 텔레그램으로 전송.
 *
 * 기존 인프라 활용:
 * - server/_core/notification.ts → sendTelegram / notifyDailyReport
 * - performanceTracker 라우터 로직 재사용
 * - mockTrading 라우터의 포지션/주문 쿼리 로직 재사용
 */

import type { Request, Response } from "express";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { getDb } from "../db";
import {
  orderIntents,
  positionSnapshots,
  autoTradePolicies,
  minuteResearchSweeps,
  minuteResearchCandidates,
  intradayMinuteBars,
} from "../../drizzle/schema";
import { sendTelegram, notifyDailyReport } from "../_core/notification";

export async function dailyReportHandler(_req: Request, res: Response) {
  try {
    const db = await getDb();
    if (!db) return res.status(503).json({ error: "DB unavailable" });

    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
    const todayStart = new Date(today + "T00:00:00+09:00");

    // ─── 오늘 거래 ────────────────────────────────────────────

    const todayOrders = await db
      .select({ side: orderIntents.side, quantity: orderIntents.quantity, price: orderIntents.price, symbol: orderIntents.symbol, name: orderIntents.name })
      .from(orderIntents)
      .where(and(eq(orderIntents.executionOrigin, "local_node"), eq(orderIntents.status, "filled"), gte(orderIntents.createdAt, todayStart)));

    const buys = todayOrders.filter(o => o.side === "buy");
    const sells = todayOrders.filter(o => o.side === "sell");
    const buyTotal = buys.reduce((s, o) => s + o.price * o.quantity, 0);
    const sellTotal = sells.reduce((s, o) => s + o.price * o.quantity, 0);

    // 실현 손익: 매도 종목의 (매도가 - 가중평균매수가) × 수량
    let realizedPnl = 0;
    if (sells.length > 0) {
      const sellSymbols = Array.from(new Set(sells.map(o => o.symbol)));
      const buyHistory = await db
        .select({ symbol: orderIntents.symbol, price: orderIntents.price, quantity: orderIntents.quantity })
        .from(orderIntents)
        .where(and(eq(orderIntents.executionOrigin, "local_node"), eq(orderIntents.status, "filled"), eq(orderIntents.side, "buy")));
      const avgBuyBySymbol = new Map<string, number>();
      for (const sym of sellSymbols) {
        const symBuys = buyHistory.filter(b => b.symbol === sym);
        const totalCost = symBuys.reduce((s, b) => s + b.price * b.quantity, 0);
        const totalQty = symBuys.reduce((s, b) => s + b.quantity, 0);
        if (totalQty > 0) avgBuyBySymbol.set(sym, totalCost / totalQty);
      }
      for (const sell of sells) {
        const avgBuy = avgBuyBySymbol.get(sell.symbol) ?? sell.price;
        realizedPnl += (sell.price - avgBuy) * sell.quantity;
      }
    }

    // ─── 포지션 현황 ────────────────────────────────────────────

    const snapshots = await db.select().from(positionSnapshots).orderBy(desc(positionSnapshots.capturedAt)).limit(50);
    const bySymbol = new Map<string, typeof snapshots[0]>();
    for (const s of snapshots) { if (!bySymbol.has(s.symbol)) bySymbol.set(s.symbol, s); }
    const positions = Array.from(bySymbol.values()).filter(p => p.quantity > 0);
    const totalEval = positions.reduce((s, p) => s + p.currentPrice * p.quantity, 0);
    const unrealizedPnl = positions.reduce((s, p) => s + p.profitLoss, 0);

    // ─── 아레나 상태 ────────────────────────────────────────────

    const [latestSweep] = await db.select().from(minuteResearchSweeps).orderBy(desc(minuteResearchSweeps.updatedAt)).limit(1);
    const [promotedRow] = await db.execute(sql`SELECT COUNT(*) as count FROM minute_research_candidates WHERE status = 'promoted'`);
    const promotedCount = Number((promotedRow as Record<string, unknown>)?.count ?? 0);

    // ─── 정책 상태 ────────────────────────────────────────────

    const [policy] = await db.select().from(autoTradePolicies).where(eq(autoTradePolicies.status, "active")).orderBy(desc(autoTradePolicies.createdAt)).limit(1);

    // ─── 데이터 커버리지 ────────────────────────────────────────

    const [covRow] = await db.execute(sql`
      SELECT COUNT(DISTINCT "tradingDate") as dates, COUNT(DISTINCT symbol) as symbols, MAX("tradingDate") as latest
      FROM intraday_minute_bars
    `);
    const cov = covRow as Record<string, unknown> ?? {};

    // ─── 보고서 조합 ────────────────────────────────────────────

    const lines: string[] = [];
    lines.push(`📊 <b>일간 종합 보고서</b>`);
    lines.push(`${today}`);
    lines.push(``);
    lines.push(`<b>━━ 거래 ━━</b>`);
    if (todayOrders.length === 0) {
      lines.push(`거래 없음`);
    } else {
      lines.push(`매수 ${buys.length}건 (${buyTotal.toLocaleString()}원)`);
      lines.push(`매도 ${sells.length}건 (${sellTotal.toLocaleString()}원)`);
      lines.push(`실현 P&L: ${realizedPnl >= 0 ? "+" : ""}${realizedPnl.toLocaleString()}원`);
    }
    lines.push(``);
    lines.push(`<b>━━ 포트폴리오 ━━</b>`);
    if (positions.length === 0) {
      lines.push(`보유 종목 없음`);
    } else {
      lines.push(`${positions.length}종목 | 평가 ${totalEval.toLocaleString()}원`);
      lines.push(`미실현: ${unrealizedPnl >= 0 ? "+" : ""}${unrealizedPnl.toLocaleString()}원`);
      for (const p of positions.slice(0, 5)) {
        const rate = Number(p.profitLossRate ?? 0);
        lines.push(`  ${p.name}: ${rate >= 0 ? "+" : ""}${rate}%`);
      }
    }
    lines.push(``);
    lines.push(`<b>━━ 아레나 ━━</b>`);
    lines.push(`Promoted: ${promotedCount}개${latestSweep ? ` | 최근: ${latestSweep.status} (${latestSweep.generatedCount}→${latestSweep.promotedCount} 통과)` : ""}`);
    lines.push(``);
    lines.push(`<b>━━ 시스템 ━━</b>`);
    lines.push(`데이터: ${cov.dates ?? 0}일, ${cov.symbols ?? 0}종목, ~${cov.latest ?? "없음"}`);
    if (policy) {
      lines.push(`정책: ${policy.totalCapital.toLocaleString()}원, ${policy.maxConcurrentPositions}종목`);
    }

    const report = lines.join("\n");
    await sendTelegram(report);

    // 실제 승수: 매도 종목 중 수익 실현한 건수
    let actualWins = 0;
    if (sells.length > 0) {
      const sellSymbols = Array.from(new Set(sells.map(o => o.symbol)));
      const buyHistoryForWins = await db
        .select({ symbol: orderIntents.symbol, price: orderIntents.price, quantity: orderIntents.quantity })
        .from(orderIntents)
        .where(and(eq(orderIntents.executionOrigin, "local_node"), eq(orderIntents.status, "filled"), eq(orderIntents.side, "buy")));
      for (const sell of sells) {
        const symBuys = buyHistoryForWins.filter(b => b.symbol === sell.symbol);
        const totalCost = symBuys.reduce((s, b) => s + b.price * b.quantity, 0);
        const totalQty = symBuys.reduce((s, b) => s + b.quantity, 0);
        const avgBuy = totalQty > 0 ? totalCost / totalQty : sell.price;
        if (sell.price > avgBuy) actualWins++;
      }
    }
    const topTrade = todayOrders.length ? { symbol: todayOrders[0].symbol, name: todayOrders[0].name, returnPct: 0 } : null;
    await notifyDailyReport({
      date: today,
      totalTrades: todayOrders.length,
      wins: actualWins,
      netReturnPct: policy ? (realizedPnl / policy.totalCapital * 100) : 0,
      topTrade,
      worstTrade: null,
    });

    return res.json({ ok: true, date: today, orders: todayOrders.length, positions: positions.length, promotedCount });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await sendTelegram(`❌ <b>일간 보고서 오류</b>\n\n${message.slice(0, 200)}`);
    return res.status(500).json({ error: message });
  }
}
