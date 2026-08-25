import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { autonomousResearchObservations, paperPortfolioPriceEvents, paperPortfolios, paperPositions } from "../../drizzle/schema";
import { getDb } from "../db";
import { operatorProcedure, router } from "../_core/trpc";

const isActualObservationSource = (source: string) => source.startsWith("kiwoom_ka10032") || source.startsWith("kiwoom_ka10081");

export function assertActualObservationSource(source: string) {
  if (!isActualObservationSource(source)) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "키움 실제 가격 관찰만 모의 포트폴리오의 가격 근거로 사용할 수 있습니다." });
  }
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "데이터베이스 연결을 사용할 수 없습니다." });
  return db;
}

async function findActualObservation(db: Awaited<ReturnType<typeof requireDb>>, observationId: number) {
  const observation = (await db.select().from(autonomousResearchObservations).where(eq(autonomousResearchObservations.id, observationId)).limit(1))[0];
  if (!observation) throw new TRPCError({ code: "NOT_FOUND", message: "실제 가격 관찰 기록을 찾을 수 없습니다." });
  assertActualObservationSource(observation.source);
  if (!observation.candidateId) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "연구 후보와 연결된 실제 가격 관찰만 모의 포트폴리오에 추가할 수 있습니다." });
  return observation;
}

export const paperPortfolioRouter = router({
  latestActualObservations: operatorProcedure.input(z.object({ limit: z.number().int().min(1).max(100).default(20) })).query(async ({ input }) => {
    const db = await requireDb();
    const observations = await db.select().from(autonomousResearchObservations).orderBy(desc(autonomousResearchObservations.capturedAt)).limit(input.limit * 5);
    return observations.filter(observation => Boolean(observation.candidateId) && isActualObservationSource(observation.source)).slice(0, input.limit);
  }),

  list: operatorProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const portfolios = await db.select().from(paperPortfolios).where(eq(paperPortfolios.userId, ctx.user.id)).orderBy(desc(paperPortfolios.updatedAt));
    const positions = await db.select().from(paperPositions).orderBy(desc(paperPositions.updatedAt));
    return portfolios.map(portfolio => ({ ...portfolio, positions: positions.filter(position => position.portfolioId === portfolio.id) }));
  }),

  openFromObservation: operatorProcedure.input(z.object({ observationId: z.number().int().positive(), quantity: z.number().int().positive().max(1_000_000) })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const observation = await findActualObservation(db, input.observationId);
    const amount = observation.price * input.quantity;
    const [portfolioCreated] = await db.insert(paperPortfolios).values({ userId: ctx.user.id, name: `${observation.name ?? observation.symbol} 실제가격 추적`, initialCash: amount, cashBalance: 0 }).returning();
    const [positionCreated] = await db.insert(paperPositions).values({ portfolioId: portfolioCreated.id, sourceCandidateId: observation.candidateId, symbol: observation.symbol, name: observation.name ?? observation.symbol, quantity: input.quantity, entryPrice: observation.price, latestPrice: observation.price, unrealizedPnl: 0 }).returning();
    await db.insert(paperPortfolioPriceEvents).values({ portfolioId: portfolioCreated.id, positionId: positionCreated.id, eventType: "entry", price: observation.price, source: observation.source, sourceTimestamp: observation.capturedAt, evidenceJson: { observationId: observation.id, runId: observation.runId, candidateId: observation.candidateId } });
    return { portfolioId: portfolioCreated.id, positionId: positionCreated.id, symbol: observation.symbol, entryPrice: observation.price, quantity: input.quantity, source: observation.source, capturedAt: observation.capturedAt };
  }),

  markFromObservation: operatorProcedure.input(z.object({ positionId: z.number().int().positive(), observationId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const position = (await db.select().from(paperPositions).where(eq(paperPositions.id, input.positionId)).limit(1))[0];
    if (!position || position.status !== "open") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "가격을 갱신할 열린 모의 포지션이 없습니다." });
    const portfolio = (await db.select().from(paperPortfolios).where(and(eq(paperPortfolios.id, position.portfolioId), eq(paperPortfolios.userId, ctx.user.id))).limit(1))[0];
    if (!portfolio) throw new TRPCError({ code: "FORBIDDEN", message: "이 모의 포트폴리오에 접근할 수 없습니다." });
    const observation = await findActualObservation(db, input.observationId);
    if (observation.symbol !== position.symbol) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "같은 종목의 실제 가격 관찰만 포지션에 반영할 수 있습니다." });
    const unrealizedPnl = (observation.price - position.entryPrice) * position.quantity;
    await db.update(paperPositions).set({ latestPrice: observation.price, unrealizedPnl }).where(eq(paperPositions.id, position.id));
    await db.insert(paperPortfolioPriceEvents).values({ portfolioId: portfolio.id, positionId: position.id, eventType: "mark", price: observation.price, source: observation.source, sourceTimestamp: observation.capturedAt, evidenceJson: { observationId: observation.id, runId: observation.runId, candidateId: observation.candidateId } });
    return { positionId: position.id, latestPrice: observation.price, unrealizedPnl, source: observation.source, capturedAt: observation.capturedAt };
  }),

  closeFromObservation: operatorProcedure.input(z.object({ positionId: z.number().int().positive(), observationId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const position = (await db.select().from(paperPositions).where(eq(paperPositions.id, input.positionId)).limit(1))[0];
    if (!position || position.status !== "open") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "종료할 열린 모의 포지션이 없습니다." });
    const portfolio = (await db.select().from(paperPortfolios).where(and(eq(paperPortfolios.id, position.portfolioId), eq(paperPortfolios.userId, ctx.user.id))).limit(1))[0];
    if (!portfolio) throw new TRPCError({ code: "FORBIDDEN", message: "이 모의 포트폴리오에 접근할 수 없습니다." });
    const observation = await findActualObservation(db, input.observationId);
    if (observation.symbol !== position.symbol) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "같은 종목의 실제 가격 관찰만 포지션 종료에 반영할 수 있습니다." });
    const realizedPnl = (observation.price - position.entryPrice) * position.quantity;
    await db.update(paperPositions).set({ latestPrice: observation.price, unrealizedPnl: realizedPnl, status: "closed", closedAt: new Date() }).where(eq(paperPositions.id, position.id));
    await db.update(paperPortfolios).set({ cashBalance: portfolio.cashBalance + observation.price * position.quantity }).where(eq(paperPortfolios.id, portfolio.id));
    await db.insert(paperPortfolioPriceEvents).values({ portfolioId: portfolio.id, positionId: position.id, eventType: "exit", price: observation.price, source: observation.source, sourceTimestamp: observation.capturedAt, evidenceJson: { observationId: observation.id, runId: observation.runId, candidateId: observation.candidateId } });
    return { positionId: position.id, exitPrice: observation.price, realizedPnl, source: observation.source, capturedAt: observation.capturedAt };
  }),
});
