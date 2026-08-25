import { TRPCError } from "@trpc/server";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { rankingSnapshots, strategyPresets } from "../../drizzle/schema";
import { getDb } from "../db";
import { KiwoomClient } from "../kiwoom/client";
import { externalVerificationPausedMessage, isExternalResearchVerificationEnabled } from "./externalVerificationGate";
import { getLatestLocalSnapshotBars } from "./localSnapshotBars";
import { rankCandidates } from "./ranking";

const ruleSchema = z.object({
  id: z.string(), type: z.enum(["macd_rising", "macd_level", "ma_position", "high_return", "new_high", "turnover", "rsi", "bollinger", "stochastic", "atr_percent", "volume_ratio", "close_change", "gap_percent", "intrabar_position"]), enabled: z.boolean(),
  weight: z.number(), config: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
});

export type RankingUniverseItem = { symbol: string; name?: string };

export async function refreshLiveRanking(input: {
  userId: number;
  presetId: number;
  universe: RankingUniverseItem[];
  maxPagesPerSymbol: number;
  runKey?: string | null;
}) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "데이터베이스 연결을 사용할 수 없습니다." });
  const preset = (await db.select().from(strategyPresets).where(and(eq(strategyPresets.id, input.presetId), eq(strategyPresets.userId, input.userId))).limit(1))[0];
  if (!preset) throw new TRPCError({ code: "NOT_FOUND", message: "랭킹에 사용할 프리셋을 찾을 수 없습니다." });
  const rules = z.array(ruleSchema).parse(preset.rulesJson);
  const candidates: Array<{ symbol: string; name: string; bars: Awaited<ReturnType<KiwoomClient["getDailyBars"]>> }> = [];
  const failedSymbols: Array<{ symbol: string; message: string }> = [];
  const snapshotDatasetIds = new Set<number>();
  let client: KiwoomClient | null = null;
  let token: string | null = null;

  for (const item of input.universe) {
    try {
      const snapshot = await getLatestLocalSnapshotBars(db, item.symbol);
      if (snapshot) {
        snapshotDatasetIds.add(snapshot.datasetId);
        candidates.push({ symbol: item.symbol, name: item.name ?? item.symbol, bars: snapshot.bars });
        continue;
      }
      if (!isExternalResearchVerificationEnabled()) throw new Error(`${externalVerificationPausedMessage}: ${item.symbol}의 실제 불변 일봉 스냅샷이 없습니다.`);
      client ??= new KiwoomClient();
      token ??= (await client.getAccessToken()).token;
      const bars = await client.getDailyBars(token, { symbol: item.symbol, maxPages: input.maxPagesPerSymbol });
      candidates.push({ symbol: item.symbol, name: item.name ?? item.symbol, bars });
    } catch (error) {
      failedSymbols.push({ symbol: item.symbol, message: error instanceof Error ? error.message : "일봉 수집에 실패했습니다." });
    }
  }

  const ranked = rankCandidates(rules, candidates);
  const capturedAt = new Date();
  if (ranked.length) {
    const values = ranked.map(item => ({
      userId: input.userId, presetId: preset.id, symbol: item.symbol, name: item.name,
      score: item.score.toFixed(2), price: item.price, changeRate: item.changeRate.toFixed(3),
      matchedRulesJson: item.matchedRuleIds, runKey: input.runKey ?? null, capturedAt,
    }));
    if (input.runKey) {
      await db.insert(rankingSnapshots).values(values).onConflictDoUpdate({
        target: [rankingSnapshots.userId, rankingSnapshots.presetId, rankingSnapshots.symbol],
        set: { runKey: sql`excluded.runKey` },
      });
    } else {
      await db.insert(rankingSnapshots).values(values);
    }
  }
  return { capturedAt, ranked, collectedSymbols: candidates.map(item => item.symbol), failedSymbols, source: snapshotDatasetIds.size ? "ka10081_local_snapshot" as const : "ka10081" as const, snapshotDatasetIds: Array.from(snapshotDatasetIds) };
}
