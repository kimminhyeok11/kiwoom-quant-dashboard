import type { Request, Response } from "express";
import { eq } from "drizzle-orm";
import { rankingRefreshProfiles } from "../../drizzle/schema";
import { getDb } from "../db";
import { KiwoomClient } from "../kiwoom/client";
import { sdk } from "../_core/sdk";
import { refreshLiveRanking, type RankingUniverseItem } from "../quant/liveRanking";

export function buildRankingRunKey(taskUid: string, now: Date): string {
  return `${taskUid}:${now.toISOString().slice(0, 16)}`;
}

export function getRankingRefreshSkip(profile: { lastRunKey: string | null; status: string }, runKey: string): "already-running" | "already-completed" | null {
  if (profile.lastRunKey !== runKey || !["running", "ready"].includes(profile.status)) return null;
  return profile.status === "running" ? "already-running" : "already-completed";
}

export async function rankingRefreshHandler(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "cron-only" });
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "database-unavailable", timestamp: new Date().toISOString() });
    const profile = (await db.select().from(rankingRefreshProfiles).where(eq(rankingRefreshProfiles.scheduleCronTaskUid, user.taskUid)).limit(1))[0];
    if (!profile) return res.json({ ok: true, skipped: "orphan" });
    const broker = new KiwoomClient().getStatus();
    if (!broker.fixedIpRegistered) return res.json({ ok: true, skipped: "fixed-ip-not-registered" });
    if (!broker.hasCredentials) return res.json({ ok: true, skipped: "credentials-unavailable" });
    const runKey = buildRankingRunKey(user.taskUid, new Date());
    const skip = getRankingRefreshSkip(profile, runKey);
    if (skip) return res.json({ ok: true, skipped: skip, runKey });
    await db.update(rankingRefreshProfiles).set({ status: "running", lastRunKey: runKey, lastRunAt: new Date(), lastError: null }).where(eq(rankingRefreshProfiles.id, profile.id));
    try {
      const result = await refreshLiveRanking({ userId: profile.userId, presetId: profile.presetId, universe: profile.universeJson as RankingUniverseItem[], maxPagesPerSymbol: profile.maxPagesPerSymbol, runKey });
      await db.update(rankingRefreshProfiles).set({ status: "ready", lastCompletedAt: new Date(), lastError: result.failedSymbols.length ? `${result.failedSymbols.length}개 종목 수집 실패` : null }).where(eq(rankingRefreshProfiles.id, profile.id));
      return res.json({ ok: true, runKey, collected: result.collectedSymbols.length, ranked: result.ranked.length, failed: result.failedSymbols.length });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await db.update(rankingRefreshProfiles).set({ status: "error", lastError: message.slice(0, 500) }).where(eq(rankingRefreshProfiles.id, profile.id));
      throw error;
    }
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : String(error),
      context: { url: req.originalUrl },
      timestamp: new Date().toISOString(),
    });
  }
}
