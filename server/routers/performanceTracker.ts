/**
 * 성과 추적 라우터 — 백테스트 예측 vs 실투 실제 성과 비교
 *
 * 핵심 기능:
 * - 배포된 전략의 백테스트 예측 수익률과 실제 체결 성과를 비교
 * - 슬리피지(예측가 vs 실제 체결가) 측정
 * - 전략별 신뢰도 점수 산출
 */

import { z } from "zod";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { publicProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  orderIntents,
  orderExecutions,
  positionSnapshots,
  autoTradePolicies,
  strategyPresets,
} from "../../drizzle/schema";

export const performanceTrackerRouter = router({
  /**
   * 전체 성과 요약 — 실투 결과 집계
   */
  summary: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 불가" });

    // 전체 체결된 주문 (local_node 실행)
    const allFilled = await db.select({
      side: orderIntents.side,
      quantity: orderIntents.quantity,
      price: orderIntents.price,
      symbol: orderIntents.symbol,
      name: orderIntents.name,
      createdAt: orderIntents.createdAt,
    }).from(orderIntents)
      .where(and(
        eq(orderIntents.executionOrigin, "local_node"),
        eq(orderIntents.status, "filled"),
      ))
      .orderBy(desc(orderIntents.createdAt))
      .limit(500);

    const buyOrders = allFilled.filter(o => o.side === "buy");
    const sellOrders = allFilled.filter(o => o.side === "sell");

    const totalBuyAmount = buyOrders.reduce((s, o) => s + o.price * o.quantity, 0);
    const totalSellAmount = sellOrders.reduce((s, o) => s + o.price * o.quantity, 0);

    // 종목별 매매 쌍 매칭
    const tradesBySymbol = new Map<string, { buys: typeof buyOrders; sells: typeof sellOrders }>();
    for (const order of allFilled) {
      const entry = tradesBySymbol.get(order.symbol) ?? { buys: [], sells: [] };
      if (order.side === "buy") entry.buys.push(order);
      else entry.sells.push(order);
      tradesBySymbol.set(order.symbol, entry);
    }

    // 완결된 라운드트립 (매수+매도 쌍) 수익률 계산
    const roundTrips: Array<{
      symbol: string;
      name: string;
      buyPrice: number;
      sellPrice: number;
      quantity: number;
      returnPercent: number;
      buyDate: string;
      sellDate: string;
    }> = [];

    for (const [symbol, { buys, sells }] of Array.from(tradesBySymbol.entries())) {
      const sortedBuys = [...buys].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      const sortedSells = [...sells].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

      const pairs = Math.min(sortedBuys.length, sortedSells.length);
      for (let i = 0; i < pairs; i++) {
        const buy = sortedBuys[i];
        const sell = sortedSells[i];
        const returnPercent = ((sell.price - buy.price) / buy.price) * 100;
        roundTrips.push({
          symbol,
          name: buy.name || sell.name,
          buyPrice: buy.price,
          sellPrice: sell.price,
          quantity: Math.min(buy.quantity, sell.quantity),
          returnPercent: Number(returnPercent.toFixed(2)),
          buyDate: new Date(buy.createdAt).toISOString().slice(0, 10),
          sellDate: new Date(sell.createdAt).toISOString().slice(0, 10),
        });
      }
    }

    const wins = roundTrips.filter(t => t.returnPercent > 0).length;
    const losses = roundTrips.filter(t => t.returnPercent <= 0).length;
    const avgReturn = roundTrips.length
      ? roundTrips.reduce((s, t) => s + t.returnPercent, 0) / roundTrips.length
      : 0;
    const avgWin = wins > 0
      ? roundTrips.filter(t => t.returnPercent > 0).reduce((s, t) => s + t.returnPercent, 0) / wins
      : 0;
    const avgLoss = losses > 0
      ? roundTrips.filter(t => t.returnPercent <= 0).reduce((s, t) => s + t.returnPercent, 0) / losses
      : 0;

    // 실현 손익: 라운드트립 기반 (매도가 - 매수가) × 수량
    const realizedPnl = roundTrips.reduce((s, t) => s + (t.sellPrice - t.buyPrice) * t.quantity, 0);

    return {
      totalOrders: allFilled.length,
      buyCount: buyOrders.length,
      sellCount: sellOrders.length,
      totalBuyAmount,
      totalSellAmount,
      realizedPnl,
      roundTripCount: roundTrips.length,
      winRate: roundTrips.length ? Number(((wins / roundTrips.length) * 100).toFixed(1)) : null,
      avgReturn: Number(avgReturn.toFixed(2)),
      avgWin: Number(avgWin.toFixed(2)),
      avgLoss: Number(avgLoss.toFixed(2)),
      profitFactor: avgLoss !== 0 ? Number(Math.abs(avgWin / avgLoss).toFixed(2)) : null,
      recentTrades: roundTrips.slice(0, 20),
    };
  }),

  /**
   * 백테스트 예측 vs 실투 실제 비교
   * 배포된 전략의 백테스트 승률/수익률과 실제 체결 결과를 대조
   */
  backtestVsActual: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 불가" });

    // 최근 활성/이전 정책들
    const policies = await db.select()
      .from(autoTradePolicies)
      .orderBy(desc(autoTradePolicies.version))
      .limit(5);

    if (!policies.length) return { comparisons: [], message: "아직 배포된 정책이 없습니다." };

    // 각 정책에 연결된 주문 결과
    const comparisons: Array<{
      policyId: number;
      version: number;
      status: string;
      config: { stopLoss: number; takeProfit: number; sizing: string; gap: number };
      actual: { tradeCount: number; winRate: number | null; avgReturn: number; totalPnl: number };
    }> = [];

    for (const policy of policies) {
      const orders = await db.select({
        side: orderIntents.side,
        quantity: orderIntents.quantity,
        price: orderIntents.price,
        symbol: orderIntents.symbol,
        status: orderIntents.status,
      }).from(orderIntents)
        .where(and(
          eq(orderIntents.autoPolicyId, policy.id),
          eq(orderIntents.status, "filled"),
        ))
        .limit(200);

      const buys = orders.filter(o => o.side === "buy");
      const sells = orders.filter(o => o.side === "sell");
      const buyTotal = buys.reduce((s, o) => s + o.price * o.quantity, 0);
      const sellTotal = sells.reduce((s, o) => s + o.price * o.quantity, 0);

      // 간이 승률 (매도가 > 매수 평균가인 비율 근사)
      const tradeCount = Math.min(buys.length, sells.length);
      let winCount = 0;
      let totalReturn = 0;

      const symbolBuys = new Map<string, { totalCost: number; totalQty: number }>();
      for (const b of buys) {
        const entry = symbolBuys.get(b.symbol) ?? { totalCost: 0, totalQty: 0 };
        entry.totalCost += b.price * b.quantity;
        entry.totalQty += b.quantity;
        symbolBuys.set(b.symbol, entry);
      }

      for (const s of sells) {
        const buyData = symbolBuys.get(s.symbol);
        if (buyData && buyData.totalQty > 0) {
          const avgBuyPrice = buyData.totalCost / buyData.totalQty;
          const ret = (s.price - avgBuyPrice) / avgBuyPrice;
          totalReturn += ret;
          if (ret > 0) winCount++;
        }
      }

      // 실현 손익: 매도 종목별 (매도가 - 가중평균매수가) × 수량
      let totalPnl = 0;
      for (const s of sells) {
        const buyData = symbolBuys.get(s.symbol);
        if (buyData && buyData.totalQty > 0) {
          totalPnl += (s.price - buyData.totalCost / buyData.totalQty) * s.quantity;
        }
      }

      comparisons.push({
        policyId: policy.id,
        version: policy.version,
        status: policy.status,
        config: {
          stopLoss: Number(policy.stopLossPercent),
          takeProfit: Number(policy.takeProfitPercent),
          sizing: policy.positionSizingMode ?? "half_kelly",
          gap: Number(policy.maxOpenGapPercent ?? "3"),
        },
        actual: {
          tradeCount,
          winRate: tradeCount > 0 ? Number(((winCount / tradeCount) * 100).toFixed(1)) : null,
          avgReturn: tradeCount > 0 ? Number(((totalReturn / tradeCount) * 100).toFixed(2)) : 0,
          totalPnl: Math.round(totalPnl),
        },
      });
    }

    return { comparisons };
  }),

  /**
   * 슬리피지 분석 — 계획 가격 vs 실제 체결가 차이
   */
  slippageAnalysis: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 불가" });

    // orderIntents의 price(계획가) vs orderExecutions의 filledPrice(체결가) 비교
    const results = await db.select({
      intentId: orderIntents.id,
      symbol: orderIntents.symbol,
      name: orderIntents.name,
      side: orderIntents.side,
      plannedPrice: orderIntents.price,
      filledPrice: orderExecutions.filledPrice,
      filledQuantity: orderExecutions.filledQuantity,
      executedAt: orderExecutions.executedAt,
    }).from(orderIntents)
      .innerJoin(orderExecutions, eq(orderExecutions.orderIntentId, orderIntents.id))
      .where(and(
        eq(orderIntents.executionOrigin, "local_node"),
        eq(orderExecutions.executionStatus, "filled"),
      ))
      .orderBy(desc(orderExecutions.executedAt))
      .limit(100);

    const slippages = results
      .filter(r => r.plannedPrice > 0 && r.filledPrice && r.filledPrice > 0)
      .map(r => {
        const slippagePct = ((r.filledPrice! - r.plannedPrice) / r.plannedPrice) * 100;
        return {
          symbol: r.symbol,
          name: r.name,
          side: r.side,
          plannedPrice: r.plannedPrice,
          filledPrice: r.filledPrice!,
          slippagePercent: Number((r.side === "buy" ? slippagePct : -slippagePct).toFixed(3)),
          executedAt: r.executedAt,
        };
      });

    const avgSlippage = slippages.length
      ? slippages.reduce((s, r) => s + r.slippagePercent, 0) / slippages.length
      : 0;

    return {
      totalMeasured: slippages.length,
      avgSlippagePercent: Number(avgSlippage.toFixed(3)),
      maxSlippagePercent: slippages.length ? Number(Math.max(...slippages.map(s => s.slippagePercent)).toFixed(3)) : 0,
      recentSlippages: slippages.slice(0, 20),
    };
  }),

  /**
   * 피드백 루프 수동 트리거 — 대시보드에서 "성과 분석 → 파라미터 조정" 실행
   */
  triggerFeedbackLoop: publicProcedure.mutation(async () => {
    const { feedbackLoopHandler } = await import("../scheduled/feedbackLoop");
    // 가짜 req/res로 핸들러 실행하여 결과 반환
    let result: unknown = null;
    const fakeReq = {} as any;
    const fakeRes = {
      status: (code: number) => ({ json: (data: unknown) => { result = { status: code, ...data as object }; return fakeRes; } }),
      json: (data: unknown) => { result = data; return fakeRes; },
    } as any;
    await feedbackLoopHandler(fakeReq, fakeRes);
    return result;
  }),
});
