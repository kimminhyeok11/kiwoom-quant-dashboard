import { TRPCError } from "@trpc/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { strategyPresets } from "../../drizzle/schema";
import { getDb } from "../db";
import { operatorProcedure, publicProcedure, router } from "../_core/trpc";

const ruleSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["macd_rising", "ma_position", "high_return", "turnover"]),
  enabled: z.boolean(),
  weight: z.number().int().min(0).max(100),
  config: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
});

type ExpressionNode = z.infer<typeof ruleSchema> | { id: string; logic: "AND" | "OR" | "NOT"; enabled: boolean; children: ExpressionNode[] };
const expressionSchema: z.ZodType<ExpressionNode> = z.lazy(() => z.object({
  id: z.string().min(1),
  logic: z.enum(["AND", "OR", "NOT"]),
  enabled: z.boolean().default(true),
  children: z.array(z.union([ruleSchema, expressionSchema])).min(1),
}));

const presetInput = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  rules: z.array(ruleSchema).min(1),
  expression: expressionSchema.optional(),
  isActive: z.boolean().default(true),
});

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "데이터베이스 연결을 사용할 수 없습니다." });
  return db;
}

export const presetsRouter = router({
  list: operatorProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    return db.select().from(strategyPresets).where(eq(strategyPresets.userId, ctx.user.id)).orderBy(desc(strategyPresets.updatedAt));
  }),

  detail: operatorProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ ctx, input }) => {
    const db = await requireDb();
    const preset = (await db.select().from(strategyPresets).where(and(eq(strategyPresets.id, input.id), eq(strategyPresets.userId, ctx.user.id))).limit(1))[0];
    if (!preset) throw new TRPCError({ code: "NOT_FOUND", message: "조회할 프리셋을 찾을 수 없습니다." });
    return preset;
  }),

  save: operatorProcedure.input(presetInput.extend({ id: z.number().int().positive().optional() })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const values = { name: input.name, description: input.description ?? null, rulesJson: input.rules, scoringJson: input.expression ?? null, isActive: input.isActive };
    if (input.id) {
      const result = await db.update(strategyPresets).set(values).where(and(eq(strategyPresets.id, input.id), eq(strategyPresets.userId, ctx.user.id)));
      if (result.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "저장할 프리셋을 찾을 수 없습니다." });
      return { id: input.id, updated: true };
    }
    const [created] = await db.insert(strategyPresets).values({ userId: ctx.user.id, ...values }).returning();
    return { id: created.id, updated: false };
  }),

  remove: operatorProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const result = await db.delete(strategyPresets).where(and(eq(strategyPresets.id, input.id), eq(strategyPresets.userId, ctx.user.id)));
    if (result.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "삭제할 프리셋을 찾을 수 없습니다." });
    return { success: true };
  }),

  /**
   * 기본 제공 추천 전략 목록 (모든 사용자 접근 가능)
   * 7년 데이터 검증된 전략들
   */
  defaults: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    // isDefault flag is stored in scoringJson.tags or rulesJson.isDefault
    const all = await db.select().from(strategyPresets).orderBy(desc(strategyPresets.createdAt)).limit(50);
    return all
      .filter(p => {
        const rules = p.rulesJson as Record<string, unknown> | null;
        return rules && (rules as { isDefault?: boolean }).isDefault === true;
      })
      .map(p => {
        const data = p.rulesJson as { rules?: unknown[]; expression?: unknown; backtest?: unknown; tags?: string[]; holdingDays?: number; isDefault?: boolean };
        return {
          id: p.id,
          name: p.name,
          description: p.description,
          expression: data.expression,
          rules: data.rules,
          backtest: data.backtest as { winRate: number; totalReturn: number; tradeCount: number; maxDrawdown: number; holdingDays: number; testedPeriod: string; dataPoints: number } | undefined,
          tags: data.tags ?? [],
          holdingDays: data.holdingDays ?? 5,
          createdAt: p.createdAt,
        };
      });
  }),
});
