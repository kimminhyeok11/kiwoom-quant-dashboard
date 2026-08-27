/**
 * 모의투자 현황 라우터
 * 
 * 로컬 수집기가 push한 모의투자 체결/잔고 데이터를 조회하는 API.
 * 대시보드에서 실시간 포지션, 주문 내역, 수익률을 표시합니다.
 */

import { z } from "zod";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
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

    const buyOrders = todayOrders.filter(o => o.side === "buy");
    const sellOrders = todayOrders.filter(o => o.side === "sell");
    const buyTotal = buyOrders.reduce((s, o) => s + o.price * o.quantity, 0);
    const sellTotal = sellOrders.reduce((s, o) => s + o.price * o.quantity, 0);
    const filledCount = todayOrders.length;

    // 실현 손익: 오늘 매도 종목에 대해 (매도가 - 평균매수가) × 수량
    // 평균매수가는 같은 종목의 과거 매수 체결 기록에서 가중평균으로 계산
    let realizedPnl = 0;
    if (sellOrders.length > 0) {
      const sellSymbols = Array.from(new Set(sellOrders.map(o => o.symbol)));
      // 해당 종목들의 모든 filled 매수 기록 조회
      const buyHistory = await db
        .select({ symbol: orderIntents.symbol, price: orderIntents.price, quantity: orderIntents.quantity })
        .from(orderIntents)
        .where(and(
          eq(orderIntents.executionOrigin, "local_node"),
          eq(orderIntents.status, "filled"),
          eq(orderIntents.side, "buy"),
          inArray(orderIntents.symbol, sellSymbols),
        ));
      // 종목별 가중평균 매수가 계산
      const avgBuyBySymbol = new Map<string, number>();
      const grouped = new Map<string, typeof buyHistory>();
      for (const b of buyHistory) {
        const list = grouped.get(b.symbol) ?? [];
        list.push(b);
        grouped.set(b.symbol, list);
      }
      for (const [symbol, buys] of Array.from(grouped.entries())) {
        const totalCost = buys.reduce((s, b) => s + b.price * b.quantity, 0);
        const totalQty = buys.reduce((s, b) => s + b.quantity, 0);
        if (totalQty > 0) avgBuyBySymbol.set(symbol, Math.round(totalCost / totalQty));
      }
      for (const sell of sellOrders) {
        const avgBuy = avgBuyBySymbol.get(sell.symbol) ?? sell.price;
        realizedPnl += (sell.price - avgBuy) * sell.quantity;
      }
    }

    return {
      tradingDate: today,
      buyTotal,
      sellTotal,
      realizedPnl,
      filledOrderCount: filledCount,
      buyOrderCount: buyOrders.length,
      sellOrderCount: sellOrders.length,
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

      // userId 스코핑으로 최대 version 조회 (unique constraint 충돌 방지)
      const [latestForUser] = await db.select({ version: autoTradePolicies.version })
        .from(autoTradePolicies)
        .where(eq(autoTradePolicies.userId, admin.id))
        .orderBy(desc(autoTradePolicies.version))
        .limit(1);
      const version = (latestForUser?.version ?? 0) + 1;

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

    // 오늘 실현 손익 계산 (매도된 종목만 — 매도가와 매수 평단가의 차이)
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
    const todayStart = new Date(today + "T00:00:00+09:00");
    const todayOrders = await db.select({ side: orderIntents.side, quantity: orderIntents.quantity, price: orderIntents.price, status: orderIntents.status, symbol: orderIntents.symbol })
      .from(orderIntents).where(and(eq(orderIntents.executionOrigin, "local_node"), eq(orderIntents.status, "filled"), gte(orderIntents.createdAt, todayStart)));

    // 실현 손익: 오늘 매도한 종목에 대해 (매도가 - 해당 종목 평균매수가) × 수량
    // 평균매수가는 positionSnapshots의 averagePrice를 사용 (매수 시점에 기록됨)
    const todaySells = todayOrders.filter(o => o.side === "sell");
    let realizedPnl = 0;
    if (todaySells.length > 0) {
      // 매도 종목의 평균매수가를 과거 매수 체결 기록에서 계산
      const sellSymbols = Array.from(new Set(todaySells.map(o => o.symbol)));
      const buyHistory = await db
        .select({ symbol: orderIntents.symbol, price: orderIntents.price, quantity: orderIntents.quantity })
        .from(orderIntents)
        .where(and(
          eq(orderIntents.executionOrigin, "local_node"),
          eq(orderIntents.status, "filled"),
          eq(orderIntents.side, "buy"),
          inArray(orderIntents.symbol, sellSymbols),
        ));
      const avgBuyBySymbol = new Map<string, number>();
      const grouped = new Map<string, typeof buyHistory>();
      for (const b of buyHistory) {
        const list = grouped.get(b.symbol) ?? [];
        list.push(b);
        grouped.set(b.symbol, list);
      }
      for (const [symbol, buys] of Array.from(grouped.entries())) {
        const totalCost = buys.reduce((s, b) => s + b.price * b.quantity, 0);
        const totalQty = buys.reduce((s, b) => s + b.quantity, 0);
        if (totalQty > 0) avgBuyBySymbol.set(symbol, Math.round(totalCost / totalQty));
      }
      for (const sell of todaySells) {
        const avgBuy = avgBuyBySymbol.get(sell.symbol) ?? sell.price;
        realizedPnl += (sell.price - avgBuy) * sell.quantity;
      }
    }
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

  /**
   * 기본 정책 빠른 생성 (정책 없을 때 원클릭 시작용)
   * 보수적 기본값으로 즉시 활성 정책 생성 + autoTradeEnabled 활성화
   */
  quickCreatePolicy: publicProcedure
    .input(z.object({
      totalCapital: z.number().int().min(1_000_000).max(100_000_000).default(10_000_000),
    }).optional())
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 불가" });

      // 이미 활성 정책이 있으면 에러
      const [existing] = await db.select().from(autoTradePolicies).where(eq(autoTradePolicies.status, "active")).limit(1);
      if (existing) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "이미 활성 정책이 있습니다." });

      const { users } = await import("../../drizzle/schema");
      const [admin] = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin")).limit(1);
      if (!admin) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "관리자 계정이 필요합니다." });

      const capital = input?.totalCapital ?? 10_000_000;

      // 기존 최대 version 조회
      const [latestPolicy] = await db.select({ version: autoTradePolicies.version })
        .from(autoTradePolicies)
        .where(eq(autoTradePolicies.userId, admin.id))
        .orderBy(desc(autoTradePolicies.version))
        .limit(1);
      const nextVersion = (latestPolicy?.version ?? 0) + 1;

      // 보수적 기본값으로 정책 생성
      const [policy] = await db.insert(autoTradePolicies).values({
        userId: admin.id,
        version: nextVersion,
        status: "active",
        totalCapital: capital,
        maxConcurrentPositions: 5,
        stopLossPercent: "3",
        takeProfitPercent: "5",
        dailyLossLimitPercent: "5",
        entryTiming: "prev_close_next_open",
        maxOpenGapPercent: "3",
        positionSizingMode: "half_kelly",
        positionSizingFixedPercent: "10",
      }).returning();

      // autoTradeEnabled 활성화
      const existingProfile = (await db.select().from(tradingProfiles).where(eq(tradingProfiles.userId, admin.id)).limit(1))[0];
      if (existingProfile) {
        await db.update(tradingProfiles).set({ autoTradeEnabled: true, killSwitch: false }).where(eq(tradingProfiles.id, existingProfile.id));
      } else {
        await db.insert(tradingProfiles).values({ userId: admin.id, autoTradeEnabled: true, killSwitch: false });
      }

      return {
        policyId: policy.id,
        version: nextVersion,
        message: `기본 정책 생성 완료 (자본 ${(capital / 10000).toFixed(0)}만원, SL 3%, TP 5%, 5종목). 자동매매가 활성화되었습니다.`,
      };
    }),

  /**
   * 자동매매 시작/중지 토글 (프론트엔드 원버튼 제어)
   * - enabled=true: 활성 정책이 있으면 autoTradeEnabled=true + killSwitch=false
   * - enabled=false: autoTradeEnabled=false (정책은 유지, 실행만 중단)
   */
  toggleAutoTrade: publicProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 불가" });

      const { users } = await import("../../drizzle/schema");
      const [admin] = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin")).limit(1);
      if (!admin) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "관리자 계정이 필요합니다." });

      if (input.enabled) {
        // 활성 정책 확인
        const [policy] = await db.select().from(autoTradePolicies).where(eq(autoTradePolicies.status, "active")).orderBy(desc(autoTradePolicies.version)).limit(1);
        if (!policy) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "활성 자동매매 정책이 없습니다. 먼저 전략을 배포하세요." });
      }

      const existing = (await db.select().from(tradingProfiles).where(eq(tradingProfiles.userId, admin.id)).limit(1))[0];
      if (existing) {
        await db.update(tradingProfiles).set({
          autoTradeEnabled: input.enabled,
          killSwitch: input.enabled ? false : existing.killSwitch,
        }).where(eq(tradingProfiles.id, existing.id));
      } else {
        await db.insert(tradingProfiles).values({
          userId: admin.id,
          autoTradeEnabled: input.enabled,
          killSwitch: false,
        });
      }

      return {
        enabled: input.enabled,
        message: input.enabled
          ? "자동매매가 활성화되었습니다. 수집기 다음 실행 시 주문이 생성됩니다."
          : "자동매매가 일시정지되었습니다. 정책은 유지되며 수집기가 주문을 생성하지 않습니다.",
      };
    }),

  /**
   * 현재 활성 정책 파라미터 직접 수정 (프론트엔드 설정 패널)
   * 기존 정책을 superseded하고 수정된 값으로 새 버전 생성
   */
  updatePolicyParams: publicProcedure
    .input(z.object({
      totalCapital: z.number().int().min(1_000_000).max(100_000_000).optional(),
      maxConcurrentPositions: z.number().int().min(1).max(10).optional(),
      stopLossPercent: z.number().min(0.5).max(20).optional(),
      takeProfitPercent: z.number().min(0.5).max(50).optional(),
      dailyLossLimitPercent: z.number().min(0.5).max(30).optional(),
      entryTiming: z.enum(["prev_close_next_open", "intraday_realtime"]).optional(),
      maxOpenGapPercent: z.number().min(0.5).max(20).optional(),
      positionSizingMode: z.enum(["kelly", "half_kelly", "quarter_kelly", "fixed_percent"]).optional(),
      positionSizingFixedPercent: z.number().min(1).max(100).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 불가" });

      const [current] = await db.select().from(autoTradePolicies).where(eq(autoTradePolicies.status, "active")).orderBy(desc(autoTradePolicies.version)).limit(1);
      if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "수정할 활성 정책이 없습니다. 먼저 전략을 배포하세요." });

      // Supersede current
      await db.update(autoTradePolicies).set({ status: "superseded" }).where(eq(autoTradePolicies.id, current.id));

      // userId 스코핑으로 최대 version 조회 (unique constraint 충돌 방지)
      const [latestForUser] = await db.select({ version: autoTradePolicies.version })
        .from(autoTradePolicies)
        .where(eq(autoTradePolicies.userId, current.userId))
        .orderBy(desc(autoTradePolicies.version))
        .limit(1);
      const version = (latestForUser?.version ?? 0) + 1;
      const [newPolicy] = await db.insert(autoTradePolicies).values({
        userId: current.userId,
        version,
        status: "active",
        totalCapital: input.totalCapital ?? current.totalCapital,
        maxConcurrentPositions: input.maxConcurrentPositions ?? current.maxConcurrentPositions,
        stopLossPercent: String(input.stopLossPercent ?? Number(current.stopLossPercent)),
        takeProfitPercent: String(input.takeProfitPercent ?? Number(current.takeProfitPercent)),
        dailyLossLimitPercent: String(input.dailyLossLimitPercent ?? Number(current.dailyLossLimitPercent)),
        entryTiming: input.entryTiming ?? current.entryTiming ?? "prev_close_next_open",
        maxOpenGapPercent: String(input.maxOpenGapPercent ?? Number(current.maxOpenGapPercent ?? "3")),
        positionSizingMode: input.positionSizingMode ?? current.positionSizingMode ?? "half_kelly",
        positionSizingFixedPercent: String(input.positionSizingFixedPercent ?? Number(current.positionSizingFixedPercent ?? "10")),
      }).returning();

      return {
        policyId: newPolicy.id,
        version,
        message: `정책 v${version}이 적용되었습니다.`,
        params: {
          totalCapital: newPolicy.totalCapital,
          maxConcurrentPositions: newPolicy.maxConcurrentPositions,
          stopLossPercent: Number(newPolicy.stopLossPercent),
          takeProfitPercent: Number(newPolicy.takeProfitPercent),
          dailyLossLimitPercent: Number(newPolicy.dailyLossLimitPercent),
          entryTiming: newPolicy.entryTiming,
          maxOpenGapPercent: Number(newPolicy.maxOpenGapPercent),
          positionSizingMode: newPolicy.positionSizingMode,
          positionSizingFixedPercent: Number(newPolicy.positionSizingFixedPercent),
        },
      };
    }),

  /**
   * 피드백 루프 결과 이력 조회
   * autoTradePolicies 버전 이력에서 조정 내역을 추적
   */
  feedbackHistory: publicProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).default(10) }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 불가" });

      const limit = input?.limit ?? 10;

      // 정책 버전 이력 (최신 순, admin 유저 스코핑)
      const { users } = await import("../../drizzle/schema");
      const [admin] = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin")).limit(1);
      const policies = await db
        .select()
        .from(autoTradePolicies)
        .where(admin ? eq(autoTradePolicies.userId, admin.id) : undefined)
        .orderBy(desc(autoTradePolicies.version))
        .limit(limit);

      // 정책 간 변화 추적
      const history = policies.map((p, idx) => {
        const prev = policies[idx + 1]; // 이전 버전
        const changes: Array<{ param: string; from: number; to: number }> = [];
        if (prev) {
          if (Number(p.stopLossPercent) !== Number(prev.stopLossPercent))
            changes.push({ param: "stopLoss", from: Number(prev.stopLossPercent), to: Number(p.stopLossPercent) });
          if (Number(p.takeProfitPercent) !== Number(prev.takeProfitPercent))
            changes.push({ param: "takeProfit", from: Number(prev.takeProfitPercent), to: Number(p.takeProfitPercent) });
          if (p.maxConcurrentPositions !== prev.maxConcurrentPositions)
            changes.push({ param: "maxPositions", from: prev.maxConcurrentPositions, to: p.maxConcurrentPositions });
          if (p.totalCapital !== prev.totalCapital)
            changes.push({ param: "totalCapital", from: prev.totalCapital, to: p.totalCapital });
        }
        return {
          id: p.id,
          version: p.version,
          status: p.status,
          totalCapital: p.totalCapital,
          maxConcurrentPositions: p.maxConcurrentPositions,
          stopLossPercent: Number(p.stopLossPercent),
          takeProfitPercent: Number(p.takeProfitPercent),
          dailyLossLimitPercent: Number(p.dailyLossLimitPercent),
          entryTiming: p.entryTiming,
          positionSizingMode: p.positionSizingMode,
          createdAt: p.createdAt,
          changes,
        };
      });

      // 최근 30일 성과 요약 (간략)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const recentFilled = await db
        .select({ side: orderIntents.side, price: orderIntents.price, quantity: orderIntents.quantity, symbol: orderIntents.symbol })
        .from(orderIntents)
        .where(and(
          eq(orderIntents.executionOrigin, "local_node"),
          eq(orderIntents.status, "filled"),
          gte(orderIntents.createdAt, thirtyDaysAgo),
        ));

      const buys = recentFilled.filter(o => o.side === "buy");
      const sells = recentFilled.filter(o => o.side === "sell");

      // 실현 손익: 매도 종목에 대해 (매도가 - 가중평균매수가) × 수량
      let netPnl30d = 0;
      if (sells.length > 0) {
        const sellSymbols = Array.from(new Set(sells.map(o => o.symbol)));
        const buysBySymbol = new Map<string, typeof buys>();
        for (const b of buys) {
          const list = buysBySymbol.get(b.symbol) ?? [];
          list.push(b);
          buysBySymbol.set(b.symbol, list);
        }
        for (const symbol of sellSymbols) {
          const symbolBuys = buysBySymbol.get(symbol) ?? [];
          const totalCost = symbolBuys.reduce((s, b) => s + b.price * b.quantity, 0);
          const totalQty = symbolBuys.reduce((s, b) => s + b.quantity, 0);
          const avgBuy = totalQty > 0 ? totalCost / totalQty : 0;
          const symbolSells = sells.filter(s => s.symbol === symbol);
          for (const sell of symbolSells) {
            netPnl30d += (sell.price - avgBuy) * sell.quantity;
          }
        }
      }

      return {
        history,
        summary: {
          totalTrades30d: recentFilled.length,
          buyCount: buys.length,
          sellCount: sells.length,
          netPnl30d: Math.round(netPnl30d),
          policyVersions: policies.length,
          currentVersion: policies[0]?.version ?? 0,
        },
      };
    }),

  /**
   * 투자 성과 한눈에 보기 (전체 기간 누적 + 최근 30일)
   */
  tradingSummary: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 불가" });

    // 전체 매매 이력
    const allFilled = await db
      .select({
        side: orderIntents.side,
        price: orderIntents.price,
        quantity: orderIntents.quantity,
        symbol: orderIntents.symbol,
        createdAt: orderIntents.createdAt,
      })
      .from(orderIntents)
      .where(and(
        eq(orderIntents.executionOrigin, "local_node"),
        eq(orderIntents.status, "filled"),
      ))
      .orderBy(orderIntents.createdAt);

    if (allFilled.length === 0) {
      return {
        hasData: false,
        startDate: null,
        totalDays: 0,
        totalCapitalDeployed: 0,
        totalTrades: 0,
        totalBuys: 0,
        totalSells: 0,
        realizedPnl: 0,
        realizedPnlPercent: 0,
        winCount: 0,
        lossCount: 0,
        winRate: 0,
        avgWinPercent: 0,
        avgLossPercent: 0,
        bestTrade: null,
        worstTrade: null,
      };
    }

    const startDate = allFilled[0].createdAt;
    const totalDays = Math.max(1, Math.ceil((Date.now() - new Date(startDate).getTime()) / (24 * 60 * 60 * 1000)));

    // 라운드트립 구성 (종목별 매수-매도 쌍)
    const bySymbol = new Map<string, { buys: typeof allFilled; sells: typeof allFilled }>();
    for (const o of allFilled) {
      const entry = bySymbol.get(o.symbol) ?? { buys: [], sells: [] };
      if (o.side === "buy") entry.buys.push(o);
      else entry.sells.push(o);
      bySymbol.set(o.symbol, entry);
    }

    let totalRealizedPnl = 0;
    let winCount = 0;
    let lossCount = 0;
    let totalWinPct = 0;
    let totalLossPct = 0;
    let bestReturn = -Infinity;
    let worstReturn = Infinity;
    let bestTrade: { symbol: string; returnPct: number } | null = null;
    let worstTrade: { symbol: string; returnPct: number } | null = null;

    for (const [symbol, { buys, sells }] of Array.from(bySymbol.entries())) {
      const sortedBuys = buys.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      const sortedSells = sells.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      const pairs = Math.min(sortedBuys.length, sortedSells.length);
      for (let i = 0; i < pairs; i++) {
        const buy = sortedBuys[i];
        const sell = sortedSells[i];
        const qty = Math.min(buy.quantity, sell.quantity);
        const pnl = (sell.price - buy.price) * qty;
        const returnPct = buy.price > 0 ? ((sell.price - buy.price) / buy.price) * 100 : 0;
        totalRealizedPnl += pnl;
        if (pnl >= 0) { winCount++; totalWinPct += returnPct; }
        else { lossCount++; totalLossPct += Math.abs(returnPct); }
        if (returnPct > bestReturn) { bestReturn = returnPct; bestTrade = { symbol, returnPct: Number(returnPct.toFixed(2)) }; }
        if (returnPct < worstReturn) { worstReturn = returnPct; worstTrade = { symbol, returnPct: Number(returnPct.toFixed(2)) }; }
      }
    }

    const totalRoundTrips = winCount + lossCount;
    const totalBuys = allFilled.filter(o => o.side === "buy");
    const totalCapitalDeployed = totalBuys.reduce((s, o) => s + o.price * o.quantity, 0);

    return {
      hasData: true,
      startDate,
      totalDays,
      totalCapitalDeployed,
      totalTrades: allFilled.length,
      totalBuys: totalBuys.length,
      totalSells: allFilled.filter(o => o.side === "sell").length,
      realizedPnl: totalRealizedPnl,
      realizedPnlPercent: totalCapitalDeployed > 0 ? Number(((totalRealizedPnl / totalCapitalDeployed) * 100).toFixed(2)) : 0,
      winCount,
      lossCount,
      winRate: totalRoundTrips > 0 ? Number(((winCount / totalRoundTrips) * 100).toFixed(1)) : 0,
      avgWinPercent: winCount > 0 ? Number((totalWinPct / winCount).toFixed(2)) : 0,
      avgLossPercent: lossCount > 0 ? Number((totalLossPct / lossCount).toFixed(2)) : 0,
      bestTrade: bestReturn > -Infinity ? bestTrade : null,
      worstTrade: worstReturn < Infinity ? worstTrade : null,
    };
  }),

  /**
   * 자동매매 프로필 전체 상태 (컨트롤 패널 메인 조회)
   */
  controlPanelStatus: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 불가" });

    const { users } = await import("../../drizzle/schema");
    const [admin] = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin")).limit(1);

    let profile: { autoTradeEnabled: boolean; killSwitch: boolean } | null = null;
    if (admin) {
      const existing = (await db.select().from(tradingProfiles).where(eq(tradingProfiles.userId, admin.id)).limit(1))[0];
      if (existing) profile = { autoTradeEnabled: existing.autoTradeEnabled ?? false, killSwitch: existing.killSwitch ?? false };
    }

    const [policy] = await db.select().from(autoTradePolicies).where(eq(autoTradePolicies.status, "active")).orderBy(desc(autoTradePolicies.version)).limit(1);

    return {
      autoTradeEnabled: profile?.autoTradeEnabled ?? false,
      killSwitch: profile?.killSwitch ?? false,
      hasActivePolicy: Boolean(policy),
      policy: policy ? {
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
        createdAt: policy.createdAt,
      } : null,
    };
  }),
});
