/**
 * 모의투자 현황 라우터
 * 
 * 로컬 수집기가 push한 모의투자 체결/잔고 데이터를 조회하는 API.
 * 대시보드에서 실시간 포지션, 주문 내역, 수익률을 표시합니다.
 */

import { z } from "zod";
import { and, desc, eq, gte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { publicProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { orderIntents, orderExecutions, positionSnapshots, autoTradePolicies } from "../../drizzle/schema";

export const mockTradingRouter = router({
  /**
   * 현재 보유 포지션 (최신 스냅샷)
   */
  positions: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 불가" });

    // Get latest snapshot per symbol
    const snapshots = await db
      .select()
      .from(positionSnapshots)
      .orderBy(desc(positionSnapshots.capturedAt))
      .limit(100);

    // Deduplicate: keep only latest per symbol
    const bySymbol = new Map<string, typeof snapshots[0]>();
    for (const snap of snapshots) {
      if (!bySymbol.has(snap.symbol)) {
        bySymbol.set(snap.symbol, snap);
      }
    }

    const positions = Array.from(bySymbol.values())
      .filter(p => p.quantity > 0)
      .map(p => ({
        symbol: p.symbol,
        name: p.name,
        quantity: p.quantity,
        averagePrice: p.averagePrice,
        currentPrice: p.currentPrice,
        profitLoss: p.profitLoss,
        profitLossRate: Number(p.profitLossRate),
        capturedAt: p.capturedAt,
      }));

    const totalPurchase = positions.reduce((s, p) => s + p.averagePrice * p.quantity, 0);
    const totalEvaluation = positions.reduce((s, p) => s + p.currentPrice * p.quantity, 0);
    const totalProfitLoss = positions.reduce((s, p) => s + p.profitLoss, 0);

    return {
      positions,
      summary: {
        totalPurchase,
        totalEvaluation,
        totalProfitLoss,
        totalProfitLossRate: totalPurchase > 0 ? (totalProfitLoss / totalPurchase) * 100 : 0,
        positionCount: positions.length,
      },
      lastUpdated: snapshots[0]?.capturedAt ?? null,
    };
  }),

  /**
   * 최근 주문 내역
   */
  recentOrders: publicProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).default(30) }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 불가" });

      const limit = input?.limit ?? 30;
      const orders = await db
        .select({
          id: orderIntents.id,
          symbol: orderIntents.symbol,
          name: orderIntents.name,
          side: orderIntents.side,
          quantity: orderIntents.quantity,
          price: orderIntents.price,
          amount: orderIntents.amount,
          status: orderIntents.status,
          executionOrigin: orderIntents.executionOrigin,
          brokerOrderId: orderIntents.brokerOrderId,
          dedupeKey: orderIntents.dedupeKey,
          createdAt: orderIntents.createdAt,
          updatedAt: orderIntents.updatedAt,
        })
        .from(orderIntents)
        .where(eq(orderIntents.executionOrigin, "local_node"))
        .orderBy(desc(orderIntents.createdAt))
        .limit(limit);

      return { orders };
    }),

  /**
   * 주문별 체결 상세
   */
  executions: publicProcedure
    .input(z.object({ orderIntentId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 불가" });

      const executions = await db
        .select()
        .from(orderExecutions)
        .where(eq(orderExecutions.orderIntentId, input.orderIntentId))
        .orderBy(desc(orderExecutions.executedAt));

      return { executions };
    }),

  /**
   * 현재 활성 자동매매 정책
   */
  activePolicy: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 불가" });

    const [policy] = await db
      .select()
      .from(autoTradePolicies)
      .where(eq(autoTradePolicies.status, "active"))
      .orderBy(desc(autoTradePolicies.createdAt))
      .limit(1);

    if (!policy) return null;

    return {
      id: policy.id,
      version: policy.version,
      totalCapital: policy.totalCapital,
      maxConcurrentPositions: policy.maxConcurrentPositions,
      stopLossPercent: Number(policy.stopLossPercent),
      takeProfitPercent: Number(policy.takeProfitPercent),
      dailyLossLimitPercent: Number(policy.dailyLossLimitPercent),
      status: policy.status,
      createdAt: policy.createdAt,
    };
  }),

  /**
   * 오늘 실현 손익
   */
  todayPnl: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 불가" });

    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
    const todayStart = new Date(today + "T00:00:00+09:00");

    const todayOrders = await db
      .select({
        side: orderIntents.side,
        quantity: orderIntents.quantity,
        price: orderIntents.price,
        status: orderIntents.status,
        symbol: orderIntents.symbol,
      })
      .from(orderIntents)
      .where(and(
        eq(orderIntents.executionOrigin, "local_node"),
        eq(orderIntents.status, "filled"),
        gte(orderIntents.createdAt, todayStart),
      ));

    const buyTotal = todayOrders.filter(o => o.side === "buy").reduce((s, o) => s + o.price * o.quantity, 0);
    const sellTotal = todayOrders.filter(o => o.side === "sell").reduce((s, o) => s + o.price * o.quantity, 0);
    const filledCount = todayOrders.length;

    return {
      tradingDate: today,
      buyTotal,
      sellTotal,
      realizedPnl: sellTotal - buyTotal,
      filledOrderCount: filledCount,
      buyOrderCount: todayOrders.filter(o => o.side === "buy").length,
      sellOrderCount: todayOrders.filter(o => o.side === "sell").length,
    };
  }),
});
