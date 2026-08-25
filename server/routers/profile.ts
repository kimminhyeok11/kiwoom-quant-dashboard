import { eq } from "drizzle-orm";
import { z } from "zod";
import { users } from "../../drizzle/schema";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";

export const AVATAR_IDS = ["nebula", "fox", "robot", "tiger", "owl", "dragon"] as const;

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스 연결을 사용할 수 없습니다.");
  return db;
}

export const profileRouter = router({
  me: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const [user] = await db.select({ name: users.name, email: users.email, avatarId: users.avatarId }).from(users).where(eq(users.id, ctx.user.id)).limit(1);
    return user ?? { name: ctx.user.name, email: ctx.user.email, avatarId: "nebula" };
  }),

  updateAvatar: protectedProcedure.input(z.object({ avatarId: z.enum(AVATAR_IDS) })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    await db.update(users).set({ avatarId: input.avatarId }).where(eq(users.id, ctx.user.id));
    return { avatarId: input.avatarId };
  }),
});
