import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { autonomousResearchObservations, orderExecutions, orderIntents, tradingProfiles } from "../../drizzle/schema";
import { getDb } from "../db";
import { KiwoomClient } from "../kiwoom/client";
import { evaluateOrderRisk } from "../quant/risk";
import { externalVerificationPausedMessage, isExternalResearchVerificationEnabled } from "../quant/externalVerificationGate";
import { operatorProcedure, router } from "../_core/trpc";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "데이터베이스 연결을 사용할 수 없습니다." });
  return db;
}

export function assertResearchObservationForOrder(observation: { candidateId: number | null; source: string }) {
  if (!observation.candidateId || !(observation.source.startsWith("kiwoom_ka10032") || observation.source.startsWith("kiwoom_ka10081"))) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "키움 실제 가격 관찰과 연구 후보가 연결된 경우에만 주문 초안을 만들 수 있습니다." });
  }
}

export const ordersRouter = router({
  list: operatorProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    return db.select().from(orderIntents).where(eq(orderIntents.userId, ctx.user.id));
  }),

  listExecutions: operatorProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const intents = await db.select().from(orderIntents).where(eq(orderIntents.userId, ctx.user.id));
    const executions = await db.select().from(orderExecutions).orderBy(desc(orderExecutions.executedAt));
    const intentById = new Map(intents.map(intent => [intent.id, intent]));
    return executions.flatMap(execution => {
      const intent = intentById.get(execution.orderIntentId);
      return intent ? [{ ...execution, symbol: intent.symbol, name: intent.name, side: intent.side, quantity: intent.quantity, intentStatus: intent.status }] : [];
    });
  }),

  createFromResearchObservation: operatorProcedure.input(z.object({ observationId: z.number().int().positive(), quantity: z.number().int().positive().max(1_000_000) })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const observation = (await db.select().from(autonomousResearchObservations).where(eq(autonomousResearchObservations.id, input.observationId)).limit(1))[0];
    if (!observation) throw new TRPCError({ code: "NOT_FOUND", message: "실제 가격 관찰 기록을 찾을 수 없습니다." });
    assertResearchObservationForOrder(observation);
    const profile = (await db.select().from(tradingProfiles).where(eq(tradingProfiles.userId, ctx.user.id)).limit(1))[0];
    if (!profile) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "주문 안전 한도를 먼저 저장해야 합니다." });
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayOrders = await db.select().from(orderIntents).where(eq(orderIntents.userId, ctx.user.id));
    const confirmedToday = todayOrders.filter(order => order.confirmedAt && order.confirmedAt >= today && ["confirmed", "submitted", "filled"].includes(order.status)).length;
    const candidate = { symbol: observation.symbol, name: observation.name ?? observation.symbol, side: "buy" as const, quantity: input.quantity, price: observation.price };
    const risk = evaluateOrderRisk(candidate, { environment: profile.environment, maxBuyAmount: profile.maxBuyAmount, dailyTradeLimit: profile.dailyTradeLimit, killSwitch: profile.killSwitch, autoTradeEnabled: profile.autoTradeEnabled, requireConfirmation: profile.requireConfirmation }, confirmedToday, new KiwoomClient().getStatus().mayTransmitOrders);
    const [created] = await db.insert(orderIntents).values({ userId: ctx.user.id, sourceCandidateId: observation.candidateId, sourceObservationId: observation.id, symbol: candidate.symbol, name: candidate.name, side: "buy", orderType: "limit", quantity: candidate.quantity, price: candidate.price, amount: candidate.quantity * candidate.price, status: risk.allowed ? "pending_confirmation" : "blocked", riskReasonsJson: risk.reasons }).returning();
    return { id: created.id, status: risk.allowed ? "pending_confirmation" as const : "blocked" as const, amount: risk.amount, reasons: risk.reasons, source: { observationId: observation.id, candidateId: observation.candidateId, capturedAt: observation.capturedAt, price: observation.price } };
  }),

  confirm: operatorProcedure.input(z.object({ id: z.number().int().positive(), acknowledged: z.literal(true) })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const intent = (await db.select().from(orderIntents).where(and(eq(orderIntents.id, input.id), eq(orderIntents.userId, ctx.user.id))).limit(1))[0];
    if (!intent) throw new TRPCError({ code: "NOT_FOUND", message: "확인할 주문 의도를 찾을 수 없습니다." });
    if (intent.status !== "pending_confirmation") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "확인 대기 상태의 주문만 승인할 수 있습니다." });
    const confirmationNonce = randomUUID();
    await db.update(orderIntents).set({ status: "confirmed", confirmationNonce, confirmedAt: new Date() }).where(eq(orderIntents.id, intent.id));
    return { id: intent.id, status: "confirmed" as const, confirmationNonce };
  }),

  transmit: operatorProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    if (!isExternalResearchVerificationEnabled()) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: `${externalVerificationPausedMessage}: 주문 전송은 연구 전용 서비스에서 실행하지 않습니다.` });
    }
    const db = await requireDb();
    const intent = (await db.select().from(orderIntents).where(and(eq(orderIntents.id, input.id), eq(orderIntents.userId, ctx.user.id))).limit(1))[0];
    const profile = (await db.select().from(tradingProfiles).where(eq(tradingProfiles.userId, ctx.user.id)).limit(1))[0];
    if (!intent || !profile) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "주문 의도 또는 실거래 안전 설정이 없습니다." });
    const confirmedToday = (await db.select().from(orderIntents).where(eq(orderIntents.userId, ctx.user.id)))
      .filter(order => ["confirmed", "submitted", "filled"].includes(order.status)).length;
    const client = new KiwoomClient();
    try {
      client.assertOrderMayBeSubmitted({
        candidate: { symbol: intent.symbol, name: intent.name, side: intent.side, quantity: intent.quantity, price: intent.price },
        settings: { environment: profile.environment, maxBuyAmount: profile.maxBuyAmount, dailyTradeLimit: profile.dailyTradeLimit, killSwitch: profile.killSwitch, autoTradeEnabled: profile.autoTradeEnabled, requireConfirmation: profile.requireConfirmation },
        confirmedOrderCountToday: confirmedToday - 1,
        confirmedAt: intent.confirmedAt, confirmationNonce: intent.confirmationNonce,
        status: intent.status === "confirmed" ? "confirmed" : intent.status === "submitted" ? "submitted" : intent.status === "filled" ? "filled" : intent.status === "blocked" ? "blocked" : "pending_confirmation",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "주문 안전 검증에 실패했습니다.";
      throw new TRPCError({ code: "PRECONDITION_FAILED", message });
    }
    const claim = await db.update(orderIntents).set({ status: "submitting" }).where(and(
      eq(orderIntents.id, intent.id),
      eq(orderIntents.userId, ctx.user.id),
      eq(orderIntents.status, "confirmed"),
    ));
    if (claim.length !== 1) {
      throw new TRPCError({ code: "CONFLICT", message: "이 주문은 이미 전송 처리 중이거나 처리되었습니다." });
    }
    try {
      const token = await client.getAccessToken();
      const brokerOrder = await client.submitLiveBuyOrder(token.token, { symbol: intent.symbol, quantity: intent.quantity, price: intent.orderType === "limit" ? intent.price : undefined, exchange: "KRX", tradeType: intent.orderType === "market" ? "3" : "0" });
      await db.update(orderIntents).set({ status: "submitted", brokerOrderId: brokerOrder.orderNumber }).where(and(eq(orderIntents.id, intent.id), eq(orderIntents.status, "submitting")));
      await db.insert(orderExecutions).values({ orderIntentId: intent.id, brokerOrderId: brokerOrder.orderNumber, executionStatus: "submitted", responseJson: { exchange: brokerOrder.exchange } });
      return { id: intent.id, status: "submitted" as const, brokerOrderId: brokerOrder.orderNumber };
    } catch (error) {
      const message = error instanceof Error ? error.message : "키움 주문 전송에 실패했습니다.";
      await db.update(orderIntents).set({ status: "rejected", riskReasonsJson: [message] }).where(and(eq(orderIntents.id, intent.id), eq(orderIntents.status, "submitting")));
      await db.insert(orderExecutions).values({ orderIntentId: intent.id, executionStatus: "rejected", responseJson: { message } });
      throw new TRPCError({ code: "PRECONDITION_FAILED", message });
    }
  }),
});
