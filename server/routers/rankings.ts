import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { rankingSnapshots, users } from "../../drizzle/schema";
import { getDb } from "../db";
import { KiwoomClient } from "../kiwoom/client";
import { externalVerificationPausedMessage, isExternalResearchVerificationEnabled } from "../quant/externalVerificationGate";
import { refreshLiveRanking } from "../quant/liveRanking";
import { operatorProcedure, publicProcedure, router } from "../_core/trpc";

/**
 * Exposes only the dashboard owner's published market-ranking snapshot.
 * Private user rankings, orders, positions, and account data remain behind
 * authenticated procedures.
 */
export const rankingsRouter = router({
  turnover: operatorProcedure.input(z.object({
    market: z.enum(["000", "001", "101"]).default("000"),
    includeManagedStocks: z.boolean().default(false),
    exchange: z.enum(["KRX", "NXT", "INTEGRATED"]).default("KRX"),
  })).query(async ({ input }) => {
    if (!isExternalResearchVerificationEnabled()) throw new TRPCError({ code: "PRECONDITION_FAILED", message: `${externalVerificationPausedMessage}: 사용자가 요청하면 읽기 전용 거래대금 순위 조회를 진행합니다.` });
    const client = new KiwoomClient();
    const { token } = await client.getAccessToken();
    return client.getTurnoverRankings(token, input);
  }),

  refresh: operatorProcedure.input(z.object({
    presetId: z.number().int().positive(),
    universe: z.array(z.object({ symbol: z.string().regex(/^\d{6}$/), name: z.string().min(1).max(120).optional() })).min(1).max(20),
    maxPagesPerSymbol: z.number().int().min(1).max(10).default(3),
  })).mutation(async ({ ctx, input }) => {
    return refreshLiveRanking({ userId: ctx.user.id, presetId: input.presetId, universe: input.universe, maxPagesPerSymbol: input.maxPagesPerSymbol });
  }),

  latest: publicProcedure.query(async () => {
    const db = await getDb();
    const ownerOpenId = process.env.OWNER_OPEN_ID;
    if (!db || !ownerOpenId) return { capturedAt: null, items: [] };

    const [owner] = await db.select({ id: users.id }).from(users).where(eq(users.openId, ownerOpenId)).limit(1);
    if (!owner) return { capturedAt: null, items: [] };

    const [latestRow] = await db
      .select({ capturedAt: rankingSnapshots.capturedAt })
      .from(rankingSnapshots)
      .where(eq(rankingSnapshots.userId, owner.id))
      .orderBy(desc(rankingSnapshots.capturedAt))
      .limit(1);
    if (!latestRow) return { capturedAt: null, items: [] };

    const items = await db
      .select()
      .from(rankingSnapshots)
      .where(and(eq(rankingSnapshots.userId, owner.id), eq(rankingSnapshots.capturedAt, latestRow.capturedAt)))
      .orderBy(desc(rankingSnapshots.score));
    return { capturedAt: latestRow.capturedAt, items };
  }),
});
