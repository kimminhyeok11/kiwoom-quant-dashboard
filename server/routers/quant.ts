import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { orderIntents, strategyPresets, tradingProfiles } from "../../drizzle/schema";
import { KiwoomClient } from "../kiwoom/client";
import { publicOAuthConnectionCheck } from "../kiwoom/publicConnectionCheck";
import { getDb } from "../db";
import { evaluateExpression, evaluateStrategy, type DailyBar } from "../quant/conditions";
import { evaluateOrderRisk } from "../quant/risk";
import { rankCandidates } from "../quant/ranking";
import { externalVerificationPausedMessage, isExternalResearchVerificationEnabled } from "../quant/externalVerificationGate";
import { getLatestLocalSnapshotBars } from "../quant/localSnapshotBars";
import { operatorProcedure, publicProcedure, router } from "../_core/trpc";

const ruleSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["macd_rising", "ma_position", "high_return", "turnover"]),
  enabled: z.boolean(),
  weight: z.number().int().min(0).max(100),
  config: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
});

export function requireDailyBarsForEvaluation(bars: DailyBar[]): DailyBar[] {
  if (!bars.length) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "실데이터 없음: 키움 ka10081에서 일봉 데이터를 받지 못했습니다. 지정 단말·OAuth 상태와 종목코드를 확인하세요." });
  return bars;
}

function requireUserRequestedExternalVerification() {
  if (!isExternalResearchVerificationEnabled()) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: `${externalVerificationPausedMessage}: 사용자가 요청하면 읽기 전용 일봉 조회를 진행합니다.` });
  }
}

const barSchema = z.object({
  date: z.string(), open: z.number().positive(), high: z.number().positive(), low: z.number().positive(),
  close: z.number().positive(), volume: z.number().nonnegative(), turnover: z.number().nonnegative(),
});

export const quantRouter = router({
  brokerStatus: publicProcedure.query(() => {
    const client = new KiwoomClient();
    return { ...client.getStatus(), oauth: client.getAccessTokenStatus() };
  }),

  oauthStatus: operatorProcedure.query(() => {
    const client = new KiwoomClient();
    return client.getAccessTokenStatus();
  }),

  verifyOAuthConnection: operatorProcedure.mutation(async () => publicOAuthConnectionCheck.check()),

  evaluateConditions: publicProcedure.input(z.object({ rules: z.array(ruleSchema), bars: z.array(barSchema).min(1) }))
    .query(({ input }) => evaluateStrategy(input.rules, input.bars as DailyBar[])),

  rankCandidates: publicProcedure.input(z.object({
    rules: z.array(ruleSchema).min(1),
    candidates: z.array(z.object({ symbol: z.string().min(1), name: z.string().min(1), bars: z.array(barSchema).min(1) })),
    limit: z.number().int().min(1).max(500).default(200),
  })).query(({ input }) => rankCandidates(input.rules, input.candidates as Array<{ symbol: string; name: string; bars: DailyBar[] }>, input.limit)),

  dailyBars: operatorProcedure.input(z.object({
    symbol: z.string().regex(/^\d{6}$/, "국내주식 6자리 종목코드가 필요합니다."),
    baseDate: z.string().regex(/^\d{8}$/).optional(),
    maxPages: z.number().int().min(1).max(10).default(3),
  })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "데이터베이스 연결을 사용할 수 없습니다." });
    const snapshot = await getLatestLocalSnapshotBars(db, input.symbol);
    if (snapshot) return { symbol: input.symbol, bars: snapshot.bars, source: `ka10081_local_snapshot:${snapshot.versionKey}`, datasetId: snapshot.datasetId, datasetVersionKey: snapshot.versionKey };
    requireUserRequestedExternalVerification();
    const client = new KiwoomClient();
    const token = await client.getAccessToken();
    const bars = await client.getDailyBars(token.token, input);
    return { symbol: input.symbol, bars, source: "ka10081" as const };
  }),

  evaluatePreset: operatorProcedure.input(z.object({
    presetId: z.number().int().positive(),
    symbol: z.string().regex(/^\d{6}$/, "국내주식 6자리 종목코드가 필요합니다."),
    maxPages: z.number().int().min(1).max(10).default(3),
  })).query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "데이터베이스 연결을 사용할 수 없습니다." });
    const preset = (await db.select().from(strategyPresets).where(and(eq(strategyPresets.id, input.presetId), eq(strategyPresets.userId, ctx.user.id))).limit(1))[0];
    if (!preset) throw new TRPCError({ code: "NOT_FOUND", message: "평가할 프리셋을 찾을 수 없습니다." });
    const rules = z.array(ruleSchema).parse(preset.rulesJson);
    const snapshot = await getLatestLocalSnapshotBars(db, input.symbol);
    if (!snapshot) requireUserRequestedExternalVerification();
    const bars = snapshot ? snapshot.bars : await (async () => {
      const client = new KiwoomClient();
      const token = await client.getAccessToken();
      return client.getDailyBars(token.token, { symbol: input.symbol, maxPages: input.maxPages });
    })();
    requireDailyBarsForEvaluation(bars);
    const expression = preset.scoringJson;
    const hasExpression = expression && typeof expression === "object" && "logic" in expression && "children" in expression;
    const result = hasExpression ? evaluateExpression(expression as any, bars) : evaluateStrategy(rules, bars);
    return { preset: { id: preset.id, name: preset.name, rulesJson: preset.rulesJson, scoringJson: preset.scoringJson }, symbol: input.symbol, source: snapshot ? `ka10081_local_snapshot:${snapshot.versionKey}` : "ka10081", datasetId: snapshot?.datasetId ?? null, datasetVersionKey: snapshot?.versionKey ?? null, latestDate: bars.at(-1)?.date ?? null, barCount: bars.length, result };
  }),

  createOrderIntent: operatorProcedure.input(z.object({
    symbol: z.string().min(1).max(24), name: z.string().min(1).max(120), side: z.enum(["buy", "sell"]),
    quantity: z.number().int().positive(), price: z.number().int().positive(), presetId: z.number().int().positive().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "데이터베이스 연결을 사용할 수 없습니다." });
    const profile = (await db.select().from(tradingProfiles).where(eq(tradingProfiles.userId, ctx.user.id)).limit(1))[0];
    if (!profile) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "실거래 안전 한도를 먼저 저장해야 합니다." });

    const settings = {
      environment: profile.environment,
      maxBuyAmount: profile.maxBuyAmount,
      dailyTradeLimit: profile.dailyTradeLimit,
      killSwitch: profile.killSwitch,
      autoTradeEnabled: profile.autoTradeEnabled,
      requireConfirmation: profile.requireConfirmation,
    } as const;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayOrders = await db.select().from(orderIntents).where(eq(orderIntents.userId, ctx.user.id));
    const confirmedToday = todayOrders.filter(order => order.confirmedAt && order.confirmedAt >= today && ["confirmed", "submitted", "filled"].includes(order.status)).length;
    const risk = evaluateOrderRisk({ symbol: input.symbol, name: input.name, side: input.side, quantity: input.quantity, price: input.price }, settings, confirmedToday, new KiwoomClient().getStatus().mayTransmitOrders);
    const [created] = await db.insert(orderIntents).values({
      userId: ctx.user.id, presetId: input.presetId, symbol: input.symbol, name: input.name, side: input.side,
      quantity: input.quantity, price: input.price, amount: input.quantity * input.price,
      status: risk.allowed ? "pending_confirmation" : "blocked", riskReasonsJson: risk.reasons,
    }).returning();
    return { id: created.id, status: risk.allowed ? "pending_confirmation" : "blocked", amount: risk.amount, reasons: risk.reasons };
  }),
});
