/**
 * 데이터 수집 제어 라우터
 *
 * 웹 대시보드에서 일봉/분봉 수집을 시작하고 상태를 모니터링합니다.
 * 실제 수집은 로컬 PC 수집기가 폴링 방식으로 처리합니다.
 */

import { z } from "zod";
import { and, desc, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { publicProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  localDailyCollectionRequests,
  localMinuteCollectionRequests,
  localResearchDailyBars,
  intradayMinuteBars,
  kiwoomTerminalConnectionChecks,
} from "../../drizzle/schema";

export const dataCollectionRouter = router({
  /**
   * 일봉 수집 요청 생성
   * 수집기가 daily-bar-collection-plan을 폴링할 때 이 요청을 참조합니다.
   */
  requestDailyCollection: publicProcedure
    .input(z.object({
      /** 요청 식별 키 (중복 방지) */
      requestKey: z.string().min(1).max(64).optional(),
    }).optional())
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 불가" });

      // 이미 진행 중인 요청이 있으면 재사용
      const [active] = await db.select()
        .from(localDailyCollectionRequests)
        .where(inArray(localDailyCollectionRequests.status, ["queued", "running"]))
        .orderBy(desc(localDailyCollectionRequests.requestedAt))
        .limit(1);

      if (active) {
        return {
          status: active.status,
          requestId: active.id,
          reused: true,
          message: "이미 진행 중인 일봉 수집 요청이 있습니다. 수집기가 처리 중입니다.",
        };
      }

      const key = input?.requestKey ?? `web-daily-${Date.now()}`;

      const [created] = await db.insert(localDailyCollectionRequests).values({
        requestKey: key,
        status: "queued",
        source: "web_dashboard",
      }).returning();

      return {
        status: "queued" as const,
        requestId: created.id,
        reused: false,
        message: "일봉 수집 요청이 대기열에 추가되었습니다. 로컬 수집기가 다음 폴링 시 실행합니다.",
      };
    }),

  /**
   * 분봉 수집 요청 생성
   */
  requestMinuteCollection: publicProcedure
    .input(z.object({
      tradingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }).optional())
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 불가" });

      const tradingDate = input?.tradingDate
        ?? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());

      // 이미 진행 중인 요청이 있으면 재사용
      const [active] = await db.select()
        .from(localMinuteCollectionRequests)
        .where(and(
          eq(localMinuteCollectionRequests.tradingDate, tradingDate),
          inArray(localMinuteCollectionRequests.status, ["queued", "running"]),
        ))
        .orderBy(desc(localMinuteCollectionRequests.requestedAt))
        .limit(1);

      if (active) {
        return {
          status: active.status,
          requestId: active.id,
          tradingDate,
          reused: true,
          message: `${tradingDate} 분봉 수집이 이미 진행 중입니다.`,
        };
      }

      const key = `web-minute-${tradingDate}-${Date.now()}`;

      const [created] = await db.insert(localMinuteCollectionRequests).values({
        tradingDate,
        requestKey: key,
        status: "queued",
        source: "web_dashboard",
      }).returning();

      return {
        status: "queued" as const,
        requestId: created.id,
        tradingDate,
        reused: false,
        message: `${tradingDate} 분봉 수집 요청이 대기열에 추가되었습니다.`,
      };
    }),

  /**
   * 수집 상태 조회 (일봉 + 분봉 최근 요청)
   */
  collectionStatus: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { daily: null, minute: null, summary: null };

    // 최근 일봉 수집 요청
    const [dailyReq] = await db.select()
      .from(localDailyCollectionRequests)
      .orderBy(desc(localDailyCollectionRequests.requestedAt))
      .limit(1);

    // 최근 분봉 수집 요청
    const [minuteReq] = await db.select()
      .from(localMinuteCollectionRequests)
      .orderBy(desc(localMinuteCollectionRequests.requestedAt))
      .limit(1);

    // 전체 데이터 현황
    const dailySymbols = await db.selectDistinct({ symbol: localResearchDailyBars.symbol })
      .from(localResearchDailyBars)
      .where(eq(localResearchDailyBars.adjustmentBasis, "adjusted"))
      .limit(200);

    const tradingDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
    const todayMinuteBars = await db.select({ symbol: intradayMinuteBars.symbol })
      .from(intradayMinuteBars)
      .where(eq(intradayMinuteBars.tradingDate, tradingDate))
      .limit(1);

    // 수집기 연결 상태
    const [terminal] = await db.select({
      status: kiwoomTerminalConnectionChecks.status,
      terminalIp: kiwoomTerminalConnectionChecks.terminalIp,
      checkedAt: kiwoomTerminalConnectionChecks.checkedAt,
    }).from(kiwoomTerminalConnectionChecks)
      .orderBy(desc(kiwoomTerminalConnectionChecks.checkedAt))
      .limit(1);

    return {
      daily: dailyReq ? {
        id: dailyReq.id,
        status: dailyReq.status,
        acceptedBarCount: dailyReq.acceptedBarCount,
        rejectedBarCount: dailyReq.rejectedBarCount,
        lastError: dailyReq.lastError,
        requestedAt: dailyReq.requestedAt,
        completedAt: dailyReq.completedAt,
      } : null,
      minute: minuteReq ? {
        id: minuteReq.id,
        status: minuteReq.status,
        tradingDate: minuteReq.tradingDate,
        acceptedBarCount: minuteReq.acceptedBarCount,
        rejectedBarCount: minuteReq.rejectedBarCount,
        lastError: minuteReq.lastError,
        requestedAt: minuteReq.requestedAt,
        completedAt: minuteReq.completedAt,
      } : null,
      summary: {
        dailySymbolCount: dailySymbols.length,
        hasTodayMinuteData: todayMinuteBars.length > 0,
        terminalConnected: terminal?.status === "connected",
        terminalIp: terminal?.terminalIp ?? null,
        lastTerminalCheck: terminal?.checkedAt ?? null,
      },
    };
  }),

  /**
   * 수집기 heartbeat 조회
   * 수집기가 마지막으로 서버에 접속한 시각을 표시합니다.
   */
  collectorHeartbeat: publicProcedure.query(async () => {
    // collector-heartbeat 엔드포인트를 내부적으로 호출하는 대신,
    // 같은 서버 프로세스의 메모리 변수를 직접 참조
    const { getCollectorLastSeenAt } = await import("../localResearchNode");
    const lastSeenAt = getCollectorLastSeenAt();
    const alive = lastSeenAt && (Date.now() - lastSeenAt.getTime()) < 10 * 60 * 1000;
    return {
      lastSeenAt: lastSeenAt?.toISOString() ?? null,
      alive: Boolean(alive),
      agoSeconds: lastSeenAt ? Math.round((Date.now() - lastSeenAt.getTime()) / 1000) : null,
      message: !lastSeenAt
        ? "수집기가 아직 접속한 적 없습니다. 로컬 PC에서 수집기를 실행하세요."
        : alive
        ? `수집기 정상 (${Math.round((Date.now() - lastSeenAt.getTime()) / 1000)}초 전 접속)`
        : `수집기 오프라인 (${Math.round((Date.now() - lastSeenAt.getTime()) / 60000)}분 전 마지막 접속)`,
    };
  }),
});
