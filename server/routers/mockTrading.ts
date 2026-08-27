/**
 * 모의투자 현황 라우터
 * 
 * 로컬 수집기가 push한 모의투자 체결/잔고 데이터를 조회하는 API.
 * 대시보드에서 실시간 포지션, 주문 내역, 수익률을 표시합니다.
 */

import { z } from "zod";
import { and, desc, eq, inArray, lt } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { publicProcedure, operatorProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { orderIntents, orderExecutions, positionSnapshots, autoTradePolicies, strategyPresets, users } from "../../drizzle/schema";
import * as mockTradingService from "../services/mockTrading.service";

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
    try {
      return await mockTradingService.getTodayPnlSummary();
    } catch {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 불가" });
    }
  }),

  /**
   * 전략 배포: 채택된 조건식을 자동매매 정책으로 활성화
   * 모의투자 계좌에서 이 조건식 기반으로 자동 주문 실행
   */
  deployStrategy: operatorProcedure
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

      const adminId = await mockTradingService.getAdminId();
      if (!adminId) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "시스템 관리자 계정이 필요합니다." });

      const version = await mockTradingService.getNextPolicyVersion(adminId);

      // Create new policy
      const [policy] = await db.insert(autoTradePolicies).values({
        userId: adminId,
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
      await mockTradingService.ensureAutoTradeProfile(adminId, true);

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
  stopAutoTrade: operatorProcedure.mutation(async () => {
    try {
      return await mockTradingService.stopAutoTrade();
    } catch {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 불가" });
    }
  }),

  /**
   * 안전장치 상태 조회
   */
  safetyStatus: publicProcedure.query(async () => {
    try {
      return await mockTradingService.computeSafetyStatus();
    } catch {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 불가" });
    }
  }),

  /**
   * 안전장치 체크 + 킬스위치 자동 발동 (mutation — query에서 분리)
   * 프론트엔드가 safetyTriggered=true 감지 시 호출
   */
  checkAndTriggerSafety: operatorProcedure.mutation(async () => {
    try {
      return await mockTradingService.checkAndTriggerSafety();
    } catch {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 불가" });
    }
  }),

  /**
   * 킬스위치 수동 해제 (위험 인지 후)
   */
  resetKillSwitch: operatorProcedure.mutation(async () => {
    try {
      return await mockTradingService.resetKillSwitch();
    } catch {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 불가" });
    }
  }),

  /**
   * 기본 정책 빠른 생성 (정책 없을 때 원클릭 시작용)
   * 보수적 기본값으로 즉시 활성 정책 생성 + autoTradeEnabled 활성화
   */
  quickCreatePolicy: operatorProcedure
    .input(z.object({
      totalCapital: z.number().int().min(1_000_000).max(100_000_000).default(10_000_000),
    }).optional())
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 불가" });

      // 이미 활성 정책이 있으면 에러
      const [existing] = await db.select().from(autoTradePolicies).where(eq(autoTradePolicies.status, "active")).limit(1);
      if (existing) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "이미 활성 정책이 있습니다." });

      const adminId = await mockTradingService.getAdminId();
      if (!adminId) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "관리자 계정이 필요합니다." });

      const capital = input?.totalCapital ?? 10_000_000;
      const nextVersion = await mockTradingService.getNextPolicyVersion(adminId);

      // 보수적 기본값으로 정책 생성
      const [policy] = await db.insert(autoTradePolicies).values({
        userId: adminId,
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
      await mockTradingService.ensureAutoTradeProfile(adminId, true);

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
  toggleAutoTrade: operatorProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(async ({ input }) => {
      try {
        return await mockTradingService.toggleAutoTrade(input.enabled);
      } catch (e: any) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: e.message ?? "DB 연결 불가" });
      }
    }),

  /**
   * 현재 활성 정책 파라미터 직접 수정 (프론트엔드 설정 패널)
   * 기존 정책을 superseded하고 수정된 값으로 새 버전 생성
   */
  updatePolicyParams: operatorProcedure
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
      const recentSummary = await mockTradingService.getRecentPnlSummary(30);

      return {
        history,
        summary: {
          totalTrades30d: recentSummary.totalTrades,
          buyCount: recentSummary.buyCount,
          sellCount: recentSummary.sellCount,
          netPnl30d: recentSummary.netPnl,
          policyVersions: policies.length,
          currentVersion: policies[0]?.version ?? 0,
        },
      };
    }),

  /**
   * 투자 성과 한눈에 보기 (전체 기간 누적 + 최근 30일)
   */
  tradingSummary: publicProcedure.query(async () => {
    try {
      return await mockTradingService.getTradingSummary();
    } catch {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 불가" });
    }
  }),

  /**
   * 수동 매도 주문 생성 (HTS 매도 버튼)
   * DB에 매도 의도를 생성하면, 수집기가 다음 실행 시 매도 실행
   */
  sellOrder: operatorProcedure
    .input(z.object({
      symbol: z.string().regex(/^\d{6}$/),
      name: z.string().min(1).max(120),
      quantity: z.number().int().positive(),
      price: z.number().int().positive(),
      reason: z.string().max(200).default("수동 매도"),
    }))
    .mutation(async ({ input }) => {
      try {
        const intent = await mockTradingService.createSellOrder(input);
        return {
          id: intent.id,
          symbol: input.symbol,
          name: input.name,
          quantity: input.quantity,
          price: input.price,
          message: `${input.name} ${input.quantity}주 매도 주문이 대기열에 추가되었습니다. 수집기 다음 실행 시 매도됩니다.`,
        };
      } catch (e: any) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: e.message ?? "DB 연결 불가" });
      }
    }),

  /**
   * 전체 청산 (보유 종목 모두 매도 대기열에 추가)
   */
  liquidateAll: operatorProcedure.mutation(async () => {
    try {
      const result = await mockTradingService.liquidateAll();
      return { ...result, message: `${result.count}종목 전체 청산 주문이 대기열에 추가되었습니다.` };
    } catch (e: any) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: e.message ?? "DB 연결 불가" });
    }
  }),

  /**
   * 매도 대기열 조회 (pending_confirmation 상태의 sell 주문)
   */
  pendingSellOrders: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 불가" });

    const pending = await db
      .select({
        id: orderIntents.id,
        symbol: orderIntents.symbol,
        name: orderIntents.name,
        quantity: orderIntents.quantity,
        price: orderIntents.price,
        status: orderIntents.status,
        createdAt: orderIntents.createdAt,
      })
      .from(orderIntents)
      .where(and(
        eq(orderIntents.executionOrigin, "local_node"),
        eq(orderIntents.side, "sell"),
        eq(orderIntents.status, "pending_confirmation"),
      ))
      .orderBy(desc(orderIntents.createdAt))
      .limit(50);

    return { orders: pending };
  }),

  /**
   * 매도 주문 취소 (대기 중인 것만)
   */
  cancelSellOrder: operatorProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 불가" });

      const [intent] = await db.select().from(orderIntents).where(and(
        eq(orderIntents.id, input.id),
        eq(orderIntents.side, "sell"),
        eq(orderIntents.status, "pending_confirmation"),
      )).limit(1);

      if (!intent) throw new TRPCError({ code: "NOT_FOUND", message: "취소할 매도 주문을 찾을 수 없거나 이미 실행되었습니다." });

      await db.update(orderIntents).set({ status: "rejected", riskReasonsJson: ["사용자 취소"] }).where(eq(orderIntents.id, input.id));

      return { id: input.id, message: `${intent.name} 매도 주문이 취소되었습니다.` };
    }),

  /**
   * 전략(정책) 삭제 — active가 아닌 정책만 삭제 가능
   */
  deletePolicy: operatorProcedure
    .input(z.object({ policyId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 불가" });

      const [policy] = await db.select().from(autoTradePolicies).where(eq(autoTradePolicies.id, input.policyId)).limit(1);
      if (!policy) throw new TRPCError({ code: "NOT_FOUND", message: "정책을 찾을 수 없습니다." });
      if (policy.status === "active") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "활성 정책은 삭제할 수 없습니다. 먼저 일시정지하세요." });

      // 연관 주문도 정리 (해당 정책으로 생성된 주문 중 filled가 아닌 것)
      await db.delete(autoTradePolicies).where(eq(autoTradePolicies.id, input.policyId));
      return { id: input.policyId, message: `정책 v${policy.version}이 삭제되었습니다.` };
    }),

  /**
   * 채택 전략(프리셋) 삭제
   */
  deletePreset: operatorProcedure
    .input(z.object({ presetId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 불가" });

      const [preset] = await db.select().from(strategyPresets).where(eq(strategyPresets.id, input.presetId)).limit(1);
      if (!preset) throw new TRPCError({ code: "NOT_FOUND", message: "전략을 찾을 수 없습니다." });

      await db.delete(strategyPresets).where(eq(strategyPresets.id, input.presetId));
      return { id: input.presetId, message: `"${preset.name}" 전략이 삭제되었습니다.` };
    }),

  /**
   * 데이터 정리 — 오래된 positionSnapshots, 완료된 주문 이력 등 정리
   * retainDays: 이 일수보다 오래된 데이터 삭제 (기본 30일)
   */
  cleanupOldData: operatorProcedure
    .input(z.object({ retainDays: z.number().int().min(7).max(365).default(30) }).optional())
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 불가" });

      const retainDays = input?.retainDays ?? 30;
      const cutoff = new Date(Date.now() - retainDays * 24 * 60 * 60 * 1000);

      // 오래된 positionSnapshots 삭제 (최근 스냅샷은 유지)
      const deletedSnapshots = await db.delete(positionSnapshots).where(lt(positionSnapshots.capturedAt, cutoff)).returning({ id: positionSnapshots.id });

      // 오래된 rejected/cancelled 주문 삭제
      const deletedOrders = await db.delete(orderIntents).where(and(
        lt(orderIntents.createdAt, cutoff),
        inArray(orderIntents.status, ["rejected", "blocked"]),
      )).returning({ id: orderIntents.id });

      // 오래된 superseded 정책 삭제 (30일 넘은 것)
      const deletedPolicies = await db.delete(autoTradePolicies).where(and(
        eq(autoTradePolicies.status, "superseded"),
        lt(autoTradePolicies.createdAt, cutoff),
      )).returning({ id: autoTradePolicies.id });

      return {
        retainDays,
        cutoffDate: cutoff.toISOString().slice(0, 10),
        deleted: {
          positionSnapshots: deletedSnapshots.length,
          rejectedOrders: deletedOrders.length,
          oldPolicies: deletedPolicies.length,
        },
        message: `${retainDays}일 이전 데이터 정리 완료: 스냅샷 ${deletedSnapshots.length}건, 거부 주문 ${deletedOrders.length}건, 종료 정책 ${deletedPolicies.length}건 삭제.`,
      };
    }),

  /**
   * 활성 전략 목록 조회 (다중 전략 동시 운용)
   */
  activePolicies: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 불가" });

    const policies = await db.select().from(autoTradePolicies)
      .where(eq(autoTradePolicies.status, "active"))
      .orderBy(desc(autoTradePolicies.createdAt))
      .limit(20);

    return {
      policies: policies.map(p => ({
        id: p.id,
        version: p.version,
        totalCapital: p.totalCapital,
        maxConcurrentPositions: p.maxConcurrentPositions,
        stopLossPercent: Number(p.stopLossPercent),
        takeProfitPercent: Number(p.takeProfitPercent),
        dailyLossLimitPercent: Number(p.dailyLossLimitPercent),
        entryTiming: p.entryTiming ?? "prev_close_next_open",
        positionSizingMode: p.positionSizingMode ?? "half_kelly",
        createdAt: p.createdAt,
      })),
      count: policies.length,
    };
  }),

  /**
   * 전략별 성과 조회 (정책 ID 기반)
   */
  policyPerformance: publicProcedure
    .input(z.object({ policyId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 불가" });

      const orders = await db.select({
        side: orderIntents.side,
        symbol: orderIntents.symbol,
        name: orderIntents.name,
        quantity: orderIntents.quantity,
        price: orderIntents.price,
        status: orderIntents.status,
        createdAt: orderIntents.createdAt,
      }).from(orderIntents)
        .where(and(eq(orderIntents.autoPolicyId, input.policyId), eq(orderIntents.status, "filled")))
        .orderBy(desc(orderIntents.createdAt))
        .limit(200);

      const buys = orders.filter(o => o.side === "buy");
      const sells = orders.filter(o => o.side === "sell");

      // 라운드트립 구성
      const bySymbol = new Map<string, { buys: typeof orders; sells: typeof orders }>();
      for (const o of orders) {
        const entry = bySymbol.get(o.symbol) ?? { buys: [], sells: [] };
        if (o.side === "buy") entry.buys.push(o);
        else entry.sells.push(o);
        bySymbol.set(o.symbol, entry);
      }

      let realizedPnl = 0;
      let winCount = 0;
      let lossCount = 0;
      const positions: Array<{ symbol: string; name: string; quantity: number; avgBuyPrice: number }> = [];

      for (const [symbol, { buys: symBuys, sells: symSells }] of Array.from(bySymbol.entries())) {
        const totalCost = symBuys.reduce((s, b) => s + b.price * b.quantity, 0);
        const totalQty = symBuys.reduce((s, b) => s + b.quantity, 0);
        const avgBuy = totalQty > 0 ? totalCost / totalQty : 0;
        const soldQty = symSells.reduce((s, s2) => s + s2.quantity, 0);

        for (const sell of symSells) {
          const pnl = (sell.price - avgBuy) * sell.quantity;
          realizedPnl += pnl;
          if (pnl >= 0) winCount++; else lossCount++;
        }

        const remainingQty = totalQty - soldQty;
        if (remainingQty > 0) {
          positions.push({ symbol, name: symBuys[0]?.name ?? symbol, quantity: remainingQty, avgBuyPrice: Math.round(avgBuy) });
        }
      }

      const roundTrips = winCount + lossCount;

      return {
        policyId: input.policyId,
        totalOrders: orders.length,
        buyCount: buys.length,
        sellCount: sells.length,
        realizedPnl: Math.round(realizedPnl),
        winCount,
        lossCount,
        winRate: roundTrips > 0 ? Number(((winCount / roundTrips) * 100).toFixed(1)) : null,
        openPositions: positions,
        capitalDeployed: buys.reduce((s, b) => s + b.price * b.quantity, 0),
      };
    }),

  /**
   * 전략 일시정지 (status를 paused로)
   */
  pausePolicy: operatorProcedure
    .input(z.object({ policyId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 불가" });

      const [policy] = await db.select().from(autoTradePolicies).where(and(eq(autoTradePolicies.id, input.policyId), eq(autoTradePolicies.status, "active"))).limit(1);
      if (!policy) throw new TRPCError({ code: "NOT_FOUND", message: "활성 정책을 찾을 수 없습니다." });

      await db.update(autoTradePolicies).set({ status: "superseded" }).where(eq(autoTradePolicies.id, input.policyId));
      return { id: input.policyId, message: `정책 v${policy.version}이 일시정지되었습니다.` };
    }),

  /**
   * 전략 재개 (superseded → active로)
   */
  resumePolicy: operatorProcedure
    .input(z.object({ policyId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 불가" });

      const [policy] = await db.select().from(autoTradePolicies).where(and(eq(autoTradePolicies.id, input.policyId), eq(autoTradePolicies.status, "superseded"))).limit(1);
      if (!policy) throw new TRPCError({ code: "NOT_FOUND", message: "재개할 정책을 찾을 수 없습니다." });

      await db.update(autoTradePolicies).set({ status: "active" }).where(eq(autoTradePolicies.id, input.policyId));
      return { id: input.policyId, message: `정책 v${policy.version}이 다시 활성화되었습니다.` };
    }),

  /**
   * 자동매매 프로필 전체 상태 (컨트롤 패널 메인 조회)
   */
  controlPanelStatus: publicProcedure.query(async () => {
    try {
      return await mockTradingService.getControlPanelStatus();
    } catch {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 불가" });
    }
  }),
});
