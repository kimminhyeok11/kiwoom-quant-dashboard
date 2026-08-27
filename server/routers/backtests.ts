import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { backtestRuns, strategyPresets } from "../../drizzle/schema";
import type { ConditionRule } from "../../shared/trading";
import { getDb } from "../db";
import { runDailyBacktest } from "../quant/backtest";
import type { DailyBar } from "../quant/conditions";
import { operatorProcedure, router } from "../_core/trpc";

const barSchema = z.object({
  date: z.string(), open: z.number().positive(), high: z.number().positive(), low: z.number().positive(),
  close: z.number().positive(), volume: z.number().nonnegative(), turnover: z.number().nonnegative(),
});
const ruleSchema = z.object({
  id: z.string(), type: z.enum(["macd_rising", "macd_level", "ma_position", "high_return", "new_high", "turnover", "rsi", "bollinger", "stochastic", "atr_percent", "volume_ratio", "close_change", "gap_percent", "intrabar_position"]), enabled: z.boolean(),
  weight: z.number(), config: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
});

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "데이터베이스 연결을 사용할 수 없습니다." });
  return db;
}

export const backtestsRouter = router({
  list: operatorProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    return db.select().from(backtestRuns).where(eq(backtestRuns.userId, ctx.user.id)).orderBy(desc(backtestRuns.createdAt));
  }),

  run: operatorProcedure.input(z.object({
    presetId: z.number().int().positive(), bars: z.array(barSchema).min(60), initialCapital: z.number().int().positive().default(10_000_000),
    minScore: z.number().min(0).max(100).default(70), holdingDays: z.number().int().min(1).max(60).default(5), feeRate: z.number().min(0).max(0.1).default(0),
  })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const preset = (await db.select().from(strategyPresets).where(and(eq(strategyPresets.id, input.presetId), eq(strategyPresets.userId, ctx.user.id))).limit(1))[0];
    if (!preset) throw new TRPCError({ code: "NOT_FOUND", message: "백테스트할 프리셋을 찾을 수 없습니다." });
    const rules = z.array(ruleSchema).parse(preset.rulesJson) as ConditionRule[];
    const result = runDailyBacktest({ bars: input.bars as DailyBar[], rules, minScore: input.minScore, holdingDays: input.holdingDays, feeRate: input.feeRate, entryDelayDays: 1, entryTiming: "open", maxOpenGapPercent: 3, stopLossPercent: 3, takeProfitPercent: 5 });
    const [created] = await db.insert(backtestRuns).values({
      userId: ctx.user.id, presetId: preset.id, status: "completed", startDate: input.bars[0].date, endDate: input.bars.at(-1)?.date ?? input.bars[0].date,
      initialCapital: input.initialCapital, totalReturn: result.totalReturn.toFixed(3), winRate: result.winRate.toFixed(2), tradeCount: result.tradeCount,
      maxDrawdown: result.maxDrawdown.toFixed(3), resultsJson: result, completedAt: new Date(),
    }).returning();
    return { id: created.id, result };
  }),
});
