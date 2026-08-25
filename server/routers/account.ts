import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { positionSnapshots } from "../../drizzle/schema";
import { getDb } from "../db";
import { KiwoomClient } from "../kiwoom/client";
import { externalVerificationPausedMessage, isExternalResearchVerificationEnabled } from "../quant/externalVerificationGate";
import { operatorProcedure, router } from "../_core/trpc";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "데이터베이스 연결을 사용할 수 없습니다." });
  return db;
}

export const accountRouter = router({
  listPositions: operatorProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const snapshots = await db.select().from(positionSnapshots).where(eq(positionSnapshots.userId, ctx.user.id)).orderBy(desc(positionSnapshots.capturedAt));
    const latestBySymbol = new Map<string, typeof snapshots[number]>();
    snapshots.forEach(snapshot => { if (!latestBySymbol.has(snapshot.symbol)) latestBySymbol.set(snapshot.symbol, snapshot); });
    return Array.from(latestBySymbol.values());
  }),

  syncPositions: operatorProcedure.mutation(async ({ ctx }) => {
    if (!isExternalResearchVerificationEnabled()) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: `${externalVerificationPausedMessage}: 계좌·포지션 동기화는 연구 전용 범위에서 실행하지 않습니다.` });
    }
    const db = await requireDb();
    const client = new KiwoomClient();
    try {
      const token = await client.getAccessToken();
      const account = await client.getAccountEvaluation(token.token);
      const capturedAt = new Date();
      if (account.positions.length) await db.insert(positionSnapshots).values(account.positions.map(position => ({
        userId: ctx.user.id, symbol: position.symbol, name: position.name, quantity: position.quantity, averagePrice: position.averagePrice,
        currentPrice: position.currentPrice, profitLoss: position.profitLoss, profitLossRate: position.profitLossRate.toFixed(3), capturedAt,
      })));
      return { capturedAt, positionCount: account.positions.length, totalEvaluationAmount: account.totalEvaluationAmount, totalProfitLoss: account.totalProfitLoss, totalProfitLossRate: account.totalProfitLossRate };
    } catch (error) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: error instanceof Error ? error.message : "계좌 동기화에 실패했습니다." });
    }
  }),
});
