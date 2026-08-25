import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { autoTradePolicies, tradingProfiles } from "../../drizzle/schema";
import { getDb } from "../db";
import { KiwoomClient } from "../kiwoom/client";
import { operatorProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { parse as parseCookie } from "cookie";
import { COOKIE_NAME } from "../../shared/const";
import { createHeartbeatJob, updateHeartbeatJob } from "../_core/heartbeat";
import { normalizeAutoTradePolicy } from "../quant/autoTradePolicy";

const safetyInput = z.object({
  maxBuyAmount: z.number().int().min(10_000).max(1_000_000_000),
  dailyTradeLimit: z.number().int().min(1).max(100),
  killSwitch: z.boolean(),
  autoTradeEnabled: z.boolean(),
  refreshIntervalSeconds: z.number().int().min(60).max(86_400),
});

const autoPolicyInput = z.object({
  totalCapital: z.number().int().min(100_000).max(1_000_000_000),
  maxConcurrentPositions: z.number().int().min(1).max(20),
  stopLossPercent: z.number().min(0.1).max(30),
  takeProfitPercent: z.number().min(0.1).max(100),
  dailyLossLimitPercent: z.number().min(0.1).max(30),
});

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "데이터베이스 연결을 사용할 수 없습니다." });
  return db;
}

export const tradingProfileRouter = router({
  get: operatorProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const profile = (await db.select().from(tradingProfiles).where(eq(tradingProfiles.userId, ctx.user.id)).limit(1))[0];
    return { profile: profile ?? null, broker: new KiwoomClient().getStatus() };
  }),

  getAutoPolicy: operatorProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const policy = (await db.select().from(autoTradePolicies).where(eq(autoTradePolicies.userId, ctx.user.id)).orderBy(desc(autoTradePolicies.version)).limit(1))[0] ?? null;
    return { policy, broker: new KiwoomClient().getStatus() };
  }),

  setSimpleMode: operatorProcedure.input(z.object({ mode: z.enum(["paper", "live_ready"]) })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const broker = new KiwoomClient().getStatus();
    if (input.mode === "live_ready" && (!broker.hasCredentials || !broker.fixedIpRegistered)) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "실전 준비에는 키움 인증 정보와 지정 공인 IP 등록이 모두 필요합니다." });
    }
    const current = (await db.select().from(tradingProfiles).where(eq(tradingProfiles.userId, ctx.user.id)).limit(1))[0];
    const values = {
      environment: input.mode === "paper" ? "mock" as const : "live" as const,
      maxBuyAmount: current?.maxBuyAmount ?? 500_000,
      dailyTradeLimit: current?.dailyTradeLimit ?? 3,
      killSwitch: true,
      autoTradeEnabled: false,
      requireConfirmation: true,
      refreshIntervalSeconds: current?.refreshIntervalSeconds ?? 60,
      accountNumberMasked: process.env.KIWOOM_ACCOUNT_NUMBER ? `****${process.env.KIWOOM_ACCOUNT_NUMBER.slice(-4)}` : null,
      connectionStatus: input.mode === "live_ready" ? "connected" as const : "failed" as const,
    };
    if (current) {
      await db.update(tradingProfiles).set(values).where(eq(tradingProfiles.id, current.id));
      return { profileId: current.id, mode: input.mode, orderTransmissionEnabled: false, requireConfirmation: true };
    }
    const [created] = await db.insert(tradingProfiles).values({ userId: ctx.user.id, ...values }).returning();
    return { profileId: created.id, mode: input.mode, orderTransmissionEnabled: false, requireConfirmation: true };
  }),

  saveAutoPolicy: operatorProcedure.input(autoPolicyInput).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const broker = new KiwoomClient().getStatus();
    if (!broker.mayTransmitOrders) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "실제 주문 전송이 활성화된 환경에서만 자동 실투 정책을 저장할 수 있습니다." });
    const current = (await db.select().from(autoTradePolicies).where(eq(autoTradePolicies.userId, ctx.user.id)).orderBy(desc(autoTradePolicies.version)).limit(1))[0];
    const policy = normalizeAutoTradePolicy(input);
    if (current?.status === "active") await db.update(autoTradePolicies).set({ status: "superseded" }).where(eq(autoTradePolicies.id, current.id));
    const version = (current?.version ?? 0) + 1;
    const [created] = await db.insert(autoTradePolicies).values({
      userId: ctx.user.id,
      version,
      status: "active",
      totalCapital: policy.totalCapital,
      maxConcurrentPositions: policy.maxConcurrentPositions,
      stopLossPercent: String(policy.stopLossPercent),
      takeProfitPercent: String(policy.takeProfitPercent),
      dailyLossLimitPercent: String(policy.dailyLossLimitPercent),
    }).returning();
    return { id: created.id, version, policy };
  }),

  saveSafety: operatorProcedure.input(safetyInput).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const broker = new KiwoomClient().getStatus();
    const values = {
      environment: "live" as const,
      maxBuyAmount: input.maxBuyAmount,
      dailyTradeLimit: input.dailyTradeLimit,
      killSwitch: input.killSwitch,
      autoTradeEnabled: input.autoTradeEnabled && broker.mayTransmitOrders,
      requireConfirmation: true,
      refreshIntervalSeconds: input.refreshIntervalSeconds,
      accountNumberMasked: process.env.KIWOOM_ACCOUNT_NUMBER ? `****${process.env.KIWOOM_ACCOUNT_NUMBER.slice(-4)}` : null,
      connectionStatus: broker.fixedIpRegistered && broker.hasCredentials ? "connected" as const : "failed" as const,
    };
    const existing = (await db.select({ id: tradingProfiles.id }).from(tradingProfiles).where(eq(tradingProfiles.userId, ctx.user.id)).limit(1))[0];
    if (existing) {
      await db.update(tradingProfiles).set(values).where(eq(tradingProfiles.id, existing.id));
      return { id: existing.id, autoTradeEnabled: values.autoTradeEnabled, forcedConfirmation: true };
    }
    const [created] = await db.insert(tradingProfiles).values({ userId: ctx.user.id, ...values }).returning();
    return { id: created.id, autoTradeEnabled: values.autoTradeEnabled, forcedConfirmation: true };
  }),

  configureRankingRefresh: operatorProcedure.input(z.object({ cron: z.string().regex(/^\d+\s+\d+(?:[\d,*/-]*)\s+\d+(?:[\d,*/-]*)\s+[\d*/,-]+\s+[\d*/,-]+\s+[\d*/,-]+$/, "6필드 UTC cron 형식이 필요합니다."), enabled: z.boolean() })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const profile = (await db.select().from(tradingProfiles).where(eq(tradingProfiles.userId, ctx.user.id)).limit(1))[0];
    if (!profile) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "랭킹 갱신 설정을 저장하기 전에 실거래 안전 한도를 저장해야 합니다." });
    const sessionToken = parseCookie(ctx.req.headers.cookie ?? "")[COOKIE_NAME] ?? "";
    if (profile.scheduleCronTaskUid) {
      const updated = await updateHeartbeatJob(profile.scheduleCronTaskUid, { cron: input.cron, enable: input.enabled, path: "/api/scheduled/ranking-refresh", description: "사용자 설정 조건의 랭킹 갱신" }, sessionToken);
      return { taskUid: profile.scheduleCronTaskUid, nextExecutionAt: updated.nextExecutionAt };
    }
    const created = await createHeartbeatJob({ name: `ranking-refresh-${profile.id}`, cron: input.cron, path: "/api/scheduled/ranking-refresh", description: "사용자 설정 조건의 랭킹 갱신" }, sessionToken);
    await db.update(tradingProfiles).set({ scheduleCronTaskUid: created.taskUid }).where(eq(tradingProfiles.id, profile.id));
    return created;
  }),
});
