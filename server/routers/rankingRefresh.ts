import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { parse as parseCookie } from "cookie";
import { z } from "zod";
import { rankingRefreshProfiles } from "../../drizzle/schema";
import { COOKIE_NAME } from "../../shared/const";
import { getDb } from "../db";
import { createHeartbeatJob, updateHeartbeatJob } from "../_core/heartbeat";
import { operatorProcedure, router } from "../_core/trpc";

const universeSchema = z.array(z.object({ symbol: z.string().regex(/^\d{6}$/), name: z.string().min(1).max(120).optional() })).min(1).max(20);
const cronSchema = z.string().regex(/^\d+\s+\d+(?:[\d,*/-]*)\s+\d+(?:[\d,*/-]*)\s+[\d*/,-]+\s+[\d*/,-]+\s+[\d*/,-]+$/, "6필드 UTC cron 형식이 필요합니다.");

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "데이터베이스 연결을 사용할 수 없습니다." });
  return db;
}

export const rankingRefreshRouter = router({
  get: operatorProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    return (await db.select().from(rankingRefreshProfiles).where(eq(rankingRefreshProfiles.userId, ctx.user.id)).limit(1))[0] ?? null;
  }),

  save: operatorProcedure.input(z.object({ presetId: z.number().int().positive(), universe: universeSchema, maxPagesPerSymbol: z.number().int().min(1).max(10).default(3), cron: cronSchema, enabled: z.boolean() })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const existing = (await db.select().from(rankingRefreshProfiles).where(eq(rankingRefreshProfiles.userId, ctx.user.id)).limit(1))[0];
    const sessionToken = parseCookie(ctx.req.headers.cookie ?? "")[COOKIE_NAME] ?? "";
    const baseValues = { presetId: input.presetId, universeJson: input.universe, maxPagesPerSymbol: input.maxPagesPerSymbol, cronExpression: input.cron, status: input.enabled ? "idle" as const : "paused" as const, lastError: null };
    if (existing?.scheduleCronTaskUid) {
      const updated = await updateHeartbeatJob(existing.scheduleCronTaskUid, { cron: input.cron, path: "/api/scheduled/ranking-refresh", enable: input.enabled, description: "운영자 유니버스의 실데이터 조건 랭킹 갱신" }, sessionToken);
      await db.update(rankingRefreshProfiles).set(baseValues).where(eq(rankingRefreshProfiles.id, existing.id));
      return { id: existing.id, taskUid: existing.scheduleCronTaskUid, nextExecutionAt: updated.nextExecutionAt };
    }
    const created = await createHeartbeatJob({ name: `ranking-refresh-${ctx.user.id}`, cron: input.cron, path: "/api/scheduled/ranking-refresh", description: "운영자 유니버스의 실데이터 조건 랭킹 갱신" }, sessionToken);
    if (existing) {
      await db.update(rankingRefreshProfiles).set({ ...baseValues, scheduleCronTaskUid: created.taskUid }).where(eq(rankingRefreshProfiles.id, existing.id));
      return { id: existing.id, taskUid: created.taskUid, nextExecutionAt: created.nextExecutionAt };
    }
    const [inserted] = await db.insert(rankingRefreshProfiles).values({ userId: ctx.user.id, ...baseValues, scheduleCronTaskUid: created.taskUid }).returning();
    return { id: inserted.id, taskUid: created.taskUid, nextExecutionAt: created.nextExecutionAt };
  }),
});
