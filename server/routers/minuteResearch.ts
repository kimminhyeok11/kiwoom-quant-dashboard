import { and, eq } from "drizzle-orm";
import { parse as parseCookie } from "cookie";
import { z } from "zod";
import { minuteResearchPrograms } from "../../drizzle/schema";
import { COOKIE_NAME } from "../../shared/const";
import { createHeartbeatJob, deleteHeartbeatJob, updateHeartbeatJob } from "../_core/heartbeat";
import { operatorProcedure, protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { DEFAULT_MINUTE_RESEARCH_CONFIGURATION, enqueueMinuteResearchSweep, getAllTimeTopRanking, getCumulativeIndicatorStats, getMinuteResearchDashboard, getPublicMinuteResearchDashboard, runMinuteResearchSweep } from "../quant/minuteResearch";
import { analyzeMarketRegime } from "../quant/marketRegime";

const configSchema = z.object({
  combinationsPerSweep: z.number().int().min(100).max(50_000),
  maxUniverseSymbols: z.number().int().min(1).max(100),
  lookbackTradingDays: z.number().int().min(1).max(60),
  validationTradingDays: z.number().int().min(1).max(20),
  minimumTrades: z.number().int().min(1).max(10_000),
  minimumValidationTrades: z.number().int().min(1).max(10_000),
  maxDrawdownPercent: z.number().min(-100).max(0),
  stopLossPercent: z.number().positive().max(30),
  takeProfitPercent: z.number().positive().max(100),
  maxHoldingBars: z.number().int().min(1).max(390),
  feeRate: z.number().min(0).max(0.1),
  slippageBps: z.number().min(0).max(500),
  explorationMode: z.enum(["survivor_core", "diverse_random"]).default("survivor_core"),
});

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("1분봉 연구 데이터베이스를 사용할 수 없습니다.");
  return db;
}

async function preparePersonalArenaProgram(userId: number, configuration: z.infer<typeof configSchema>) {
  const db = await requireDb();
  const current = (await db.select().from(minuteResearchPrograms).where(eq(minuteResearchPrograms.userId, userId)).limit(1))[0];
  if (current?.scheduleCronTaskUid) throw new Error("예약 연구 프로그램은 운영자 연구소에서만 관리할 수 있습니다.");
  if (!current) {
    const [created] = await db.insert(minuteResearchPrograms).values({
      userId,
      name: "개인 아레나",
      status: "active",
      cronExpression: "manual",
      scheduleCronTaskUid: null,
      configurationJson: configuration,
    }).returning();
    return created.id;
  }
  await db.update(minuteResearchPrograms).set({
    name: "개인 아레나",
    status: "active",
    cronExpression: "manual",
    configurationJson: configuration,
    lastError: null,
  }).where(eq(minuteResearchPrograms.id, current.id));
  return current.id;
}

export const minuteResearchRouter = router({
  publicDashboard: publicProcedure.query(() => getPublicMinuteResearchDashboard()),

  dashboard: operatorProcedure.query(({ ctx }) => getMinuteResearchDashboard(ctx.user.id)),

  /** 로그인 사용자 본인 범위의 수동 연구만 실행하며, 예약·계좌·주문 경로를 사용하지 않는다. */
  personalDashboard: protectedProcedure.query(({ ctx }) => getMinuteResearchDashboard(ctx.user.id)),

  runPersonal: protectedProcedure.input(configSchema.default(DEFAULT_MINUTE_RESEARCH_CONFIGURATION)).mutation(async ({ ctx, input }) => {
    const programId = await preparePersonalArenaProgram(ctx.user.id, input);
    return runMinuteResearchSweep(programId);
  }),

  saveProgram: operatorProcedure.input(z.object({
    name: z.string().trim().min(2).max(120),
    cronExpression: z.string().regex(/^\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+$/),
    configuration: configSchema.default(DEFAULT_MINUTE_RESEARCH_CONFIGURATION),
    enabled: z.boolean().default(true),
  })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const current = (await db.select().from(minuteResearchPrograms).where(eq(minuteResearchPrograms.userId, ctx.user.id)).limit(1))[0];
    const sessionToken = parseCookie(ctx.req.headers.cookie ?? "")[COOKIE_NAME] ?? "";
    if (!current) {
      const job = await createHeartbeatJob({ name: `minute-research-${ctx.user.id}`, cron: input.cronExpression, path: "/api/scheduled/minute-research", payload: {}, description: "실제 저장 1분봉 조건식 대량 검증" }, sessionToken);
      const [created] = await db.insert(minuteResearchPrograms).values({ userId: ctx.user.id, name: input.name, status: input.enabled ? "active" : "paused", cronExpression: input.cronExpression, scheduleCronTaskUid: job.taskUid, configurationJson: input.configuration }).returning();
      if (!input.enabled) await updateHeartbeatJob(job.taskUid, { enable: false }, sessionToken);
      return { programId: created.id, taskUid: job.taskUid, nextExecutionAt: job.nextExecutionAt ?? null };
    }
    if (!current.scheduleCronTaskUid) {
      const job = await createHeartbeatJob({ name: `minute-research-${ctx.user.id}`, cron: input.cronExpression, path: "/api/scheduled/minute-research", payload: {}, description: "실제 저장 1분봉 조건식 대량 검증" }, sessionToken);
      await db.update(minuteResearchPrograms).set({ name: input.name, status: input.enabled ? "active" : "paused", cronExpression: input.cronExpression, scheduleCronTaskUid: job.taskUid, configurationJson: input.configuration }).where(eq(minuteResearchPrograms.id, current.id));
      if (!input.enabled) await updateHeartbeatJob(job.taskUid, { enable: false }, sessionToken);
      return { programId: current.id, taskUid: job.taskUid, nextExecutionAt: job.nextExecutionAt ?? null };
    }
    const job = await updateHeartbeatJob(current.scheduleCronTaskUid, { cron: input.cronExpression, path: "/api/scheduled/minute-research", payload: {}, description: "실제 저장 1분봉 조건식 대량 검증", enable: input.enabled }, sessionToken);
    await db.update(minuteResearchPrograms).set({ name: input.name, status: input.enabled ? "active" : "paused", cronExpression: input.cronExpression, configurationJson: input.configuration }).where(eq(minuteResearchPrograms.id, current.id));
    return { programId: current.id, taskUid: current.scheduleCronTaskUid, nextExecutionAt: job.nextExecutionAt ?? null };
  }),

  runNow: operatorProcedure.mutation(async ({ ctx }) => {
    const db = await requireDb();
    const program = (await db.select().from(minuteResearchPrograms).where(and(eq(minuteResearchPrograms.userId, ctx.user.id), eq(minuteResearchPrograms.status, "active"))).limit(1))[0];
    if (!program) throw new Error("활성 1분봉 연구 프로그램을 먼저 저장하세요.");
    return enqueueMinuteResearchSweep(program.id);
  }),

  removeSchedule: operatorProcedure.mutation(async ({ ctx }) => {
    const db = await requireDb();
    const program = (await db.select().from(minuteResearchPrograms).where(eq(minuteResearchPrograms.userId, ctx.user.id)).limit(1))[0];
    if (!program?.scheduleCronTaskUid) return { removed: false };
    const sessionToken = parseCookie(ctx.req.headers.cookie ?? "")[COOKIE_NAME] ?? "";
    await deleteHeartbeatJob(program.scheduleCronTaskUid, sessionToken);
    await db.update(minuteResearchPrograms).set({ status: "paused", scheduleCronTaskUid: null }).where(eq(minuteResearchPrograms.id, program.id));
    return { removed: true };
  }),

  /** 역대 Top 50 랭킹 (fitnessScore 기준, promoted만) */
  allTimeRanking: protectedProcedure.query(({ ctx }) => getAllTimeTopRanking(ctx.user.id)),

  /** 누적 지표 통계 — 어떤 규칙이 promoted 카드에 가장 자주 등장했는가 */
  cumulativeIndicatorStats: protectedProcedure.query(({ ctx }) => getCumulativeIndicatorStats(ctx.user.id)),

  /** 시장 국면 분석 — 현재 상승/하락/전환 판단 + 국면별 전략 가이드 */
  marketRegime: protectedProcedure.query(() => analyzeMarketRegime()),
});
