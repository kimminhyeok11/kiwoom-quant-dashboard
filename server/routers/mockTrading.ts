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
import { orderIntents, orderExecutions, positionSnapshots, autoTradePolicies, strategyPresets, tradingProfiles } from "../../drizzle/schema";

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
      entryTiming: policy.entryTiming ?? "prev_close_next_open",
      maxOpenGapPercent: Number(policy.maxOpenGapPercent ?? "3"),
      positionSizingMode: policy.positionSizingMode ?? "half_kelly",
      positionSizingFixedPercent: Number(policy.positionSizingFixedPercent ?? "10"),
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

  /**
   * 전략 배포: 채택된 조건식을 자동매매 정책으로 활성화
   * 모의투자 계좌에서 이 조건식 기반으로 자동 주문 실행
   */
  deployStrategy: publicProcedure
    .input(z.object({
      presetId: z.number().int().positive(),
      totalCapital: z.number().int().min(1_000_000).max(100_000_000).default(10_000_000),
      maxConcurrentPositions: z.number().int().min(1).max(10).default(5),
      stopLossPercent: z.number().min(1).max(20).default(3),
      takeProfitPercent: z.number().min(1).max(50).default(5),
      dailyLossLimitPercent: z.number().min(1).max(30).default(5),
      /** 진입 타이밍: 백테스트와 동일하게 전일 종가 확정 → 다음날 시가 매수 */
      entryTiming: z.enum(["prev_close_next_open", "intraday_realtime"]).default("prev_close_next_open"),
      /** 시가 갭 방어: 다음날 시가가 전일 종가 대비 ±N% 이상이면 진입 취소 */
      maxOpenGapPercent: z.number().min(0.5).max(20).default(3),
      /** 포지션 사이징 모드 */
      positionSizingMode: z.enum(["kelly", "half_kelly", "quarter_kelly", "fixed_percent"]).default("half_kelly"),
      /** fixed_percent 모드 시 잔여 자본 대비 매수 비중(%) */
      positionSizingFixedPercent: z.number().min(1).max(100).default(10),
      mode: z.enum(["mock", "live"]).default("mock"),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 불가" });

      // Verify preset exists
      const [preset] = await db.select({ id: strategyPresets.id, name: strategyPresets.name }).from(strategyPresets).where(eq(strategyPresets.id, input.presetId)).limit(1);
      if (!preset) throw new TRPCError({ code: "NOT_FOUND", message: "선택한 조건식 프리셋을 찾을 수 없습니다." });

      // Find or create a user (use admin)
      const { users } = await import("../../drizzle/schema");
      const [admin] = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin")).limit(1);
      if (!admin) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "시스템 관리자 계정이 필요합니다." });

      // Supersede any existing active policy
      const [current] = await db.select().from(autoTradePolicies).where(eq(autoTradePolicies.status, "active")).orderBy(desc(autoTradePolicies.version)).limit(1);
      if (current) {
        await db.update(autoTradePolicies).set({ status: "superseded" }).where(eq(autoTradePolicies.id, current.id));
      }

      const version = (current?.version ?? 0) + 1;

      // Create new policy
      const [policy] = await db.insert(autoTradePolicies).values({
        userId: admin.id,
        version,
        status: "active",
        totalCapital: input.totalCapital,
        maxConcurrentPositions: input.maxConcurrentPositions,
        stopLossPercent: String(input.stopLossPercent),
        takeProfitPercent: String(input.takeProfitPercent),
        dailyLossLimitPercent: String(input.dailyLossLimitPercent),
        entryTiming: input.entryTiming,
        maxOpenGapPercent: String(input.maxOpenGapPercent),
        positionSizingMode: input.positionSizingMode,
        positionSizingFixedPercent: String(input.positionSizingFixedPercent),
      }).returning();

      // Ensure trading profile has autoTradeEnabled
      const existingProfile = (await db.select().from(tradingProfiles).where(eq(tradingProfiles.userId, admin.id)).limit(1))[0];
      if (existingProfile) {
        await db.update(tradingProfiles).set({ autoTradeEnabled: true, killSwitch: false }).where(eq(tradingProfiles.id, existingProfile.id));
      } else {
        await db.insert(tradingProfiles).values({ userId: admin.id, autoTradeEnabled: true, killSwitch: false });
      }

      return {
        status: "deployed",
        policyId: policy.id,
        version,
        presetName: preset.name,
        config: {
          totalCapital: input.totalCapital,
          maxConcurrentPositions: input.maxConcurrentPositions,
          stopLossPercent: input.stopLossPercent,
          takeProfitPercent: input.takeProfitPercent,
          entryTiming: input.entryTiming,
          maxOpenGapPercent: input.maxOpenGapPercent,
          positionSizingMode: input.positionSizingMode,
          positionSizingFixedPercent: input.positionSizingFixedPercent,
          mode: input.mode,
        },
        message: `"${preset.name}" 조건식이 ${input.mode === "mock" ? "모의투자" : "실투자"} 자동매매에 배포되었습니다. 진입 방식: ${input.entryTiming === "prev_close_next_open" ? "전일 종가 확정 → 다음날 시가 매수 (백테스트 동일)" : "장중 실시간 진입"}. 시가 갭 ±${input.maxOpenGapPercent}% 초과 시 진입 취소. 포지션 사이징: ${input.positionSizingMode === "fixed_percent" ? `잔여자본 ${input.positionSizingFixedPercent}%` : input.positionSizingMode.replace("_", " ")}. 수집기가 다음 실행 시 이 정책으로 주문합니다.`,
      };
    }),

  /**
   * 자동매매 중지 (킬 스위치)
   */
  stopAutoTrade: publicProcedure.mutation(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 불가" });

    const [current] = await db.select().from(autoTradePolicies).where(eq(autoTradePolicies.status, "active")).orderBy(desc(autoTradePolicies.version)).limit(1);
    if (current) {
      await db.update(autoTradePolicies).set({ status: "superseded" }).where(eq(autoTradePolicies.id, current.id));
    }

    return { status: "stopped", message: "자동매매가 중지되었습니다. 수집기의 다음 실행부터 주문이 생성되지 않습니다." };
  }),

  /**
   * 안전장치 상태 조회
   */
  safetyStatus: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 불가" });

    const [policy] = await db.select().from(autoTradePolicies).where(eq(autoTradePolicies.status, "active")).orderBy(desc(autoTradePolicies.createdAt)).limit(1);
    if (!policy) return { active: false, killSwitch: false, safetyTriggered: false, limits: null, todayStats: null };

    // 오늘 실현 손익 계산
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
    const todayStart = new Date(today + "T00:00:00+09:00");
    const todayOrders = await db.select({ side: orderIntents.side, quantity: orderIntents.quantity, price: orderIntents.price, status: orderIntents.status })
      .from(orderIntents).where(and(eq(orderIntents.executionOrigin, "local_node"), eq(orderIntents.status, "filled"), gte(orderIntents.createdAt, todayStart)));

    const buyTotal = todayOrders.filter(o => o.side === "buy").reduce((s, o) => s + o.price * o.quantity, 0);
    const sellTotal = todayOrders.filter(o => o.side === "sell").reduce((s, o) => s + o.price * o.quantity, 0);
    const realizedPnl = sellTotal - buyTotal;
    const realizedPnlPercent = policy.totalCapital > 0 ? (realizedPnl / Number(policy.totalCapital)) * 100 : 0;

    // 현재 포지션 수
    const snapshots = await db.select().from(positionSnapshots).orderBy(desc(positionSnapshots.capturedAt)).limit(50);
    const bySymbol = new Map<string, typeof snapshots[0]>();
    for (const snap of snapshots) { if (!bySymbol.has(snap.symbol)) bySymbol.set(snap.symbol, snap); }
    const activePositions = Array.from(bySymbol.values()).filter(p => p.quantity > 0);
    const positionCount = activePositions.length;

    // 1종목 최대 비중
    const maxPositionValue = Math.max(...activePositions.map(p => p.currentPrice * p.quantity), 0);
    const maxPositionPercent = Number(policy.totalCapital) > 0 ? (maxPositionValue / Number(policy.totalCapital)) * 100 : 0;

    // 안전장치 판정
    const dailyLossLimit = Number(policy.dailyLossLimitPercent);
    const maxPositions = policy.maxConcurrentPositions;
    const dailyLossTriggered = realizedPnlPercent <= -dailyLossLimit;
    const positionLimitTriggered = positionCount >= maxPositions;
    const maxConcentration = 40; // 1종목 최대 40% 비중
    const concentrationTriggered = maxPositionPercent >= maxConcentration;
    const safetyTriggered = dailyLossTriggered;

    // 킬스위치 자동 발동
    if (safetyTriggered) {
      const { users } = await import("../../drizzle/schema");
      const [admin] = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin")).limit(1);
      if (admin) {
        const existing = (await db.select().from(tradingProfiles).where(eq(tradingProfiles.userId, admin.id)).limit(1))[0];
        if (existing && !existing.killSwitch) {
          await db.update(tradingProfiles).set({ killSwitch: true }).where(eq(tradingProfiles.id, existing.id));
        }
      }
    }

    return {
      active: true,
      killSwitch: safetyTriggered,
      safetyTriggered,
      limits: {
        dailyLossLimit: dailyLossLimit,
        maxPositions,
        maxConcentration,
        totalCapital: Number(policy.totalCapital),
      },
      todayStats: {
        realizedPnl,
        realizedPnlPercent: Number(realizedPnlPercent.toFixed(2)),
        positionCount,
        maxPositionPercent: Number(maxPositionPercent.toFixed(1)),
        orderCount: todayOrders.length,
      },
      triggers: {
        dailyLoss: { triggered: dailyLossTriggered, current: Number(realizedPnlPercent.toFixed(2)), limit: -dailyLossLimit },
        positionLimit: { triggered: positionLimitTriggered, current: positionCount, limit: maxPositions },
        concentration: { triggered: concentrationTriggered, current: Number(maxPositionPercent.toFixed(1)), limit: maxConcentration },
      },
    };
  }),

  /**
   * 킬스위치 수동 해제 (위험 인지 후)
   */
  resetKillSwitch: publicProcedure.mutation(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 불가" });

    const { users } = await import("../../drizzle/schema");
    const [admin] = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin")).limit(1);
    if (!admin) return { success: false, message: "관리자 계정을 찾을 수 없습니다." };

    const existing = (await db.select().from(tradingProfiles).where(eq(tradingProfiles.userId, admin.id)).limit(1))[0];
    if (existing) {
      await db.update(tradingProfiles).set({ killSwitch: false }).where(eq(tradingProfiles.id, existing.id));
    }

    return { success: true, message: "킬스위치가 해제되었습니다. 자동매매가 다시 활성화됩니다." };
  }),
});
