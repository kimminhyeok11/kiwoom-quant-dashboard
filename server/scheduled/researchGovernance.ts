import type { Request, Response } from "express";
import { and, desc, eq, like } from "drizzle-orm";
import { autonomousResearchRuns, researchGovernanceSchedules } from "../../drizzle/schema";
import { getDb } from "../db";
import { sdk } from "../_core/sdk";
import { runResearchGovernanceCycle } from "../quant/researchGovernance";
import { runResearchCommittee } from "../quant/researchCommittee";

export async function researchGovernanceHandler(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "cron-only" });
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "database-unavailable", timestamp: new Date().toISOString() });
    const schedule = (await db.select().from(researchGovernanceSchedules).where(and(eq(researchGovernanceSchedules.taskUid, user.taskUid), eq(researchGovernanceSchedules.isEnabled, true))).limit(1))[0];
    if (!schedule) return res.json({ ok: true, skipped: "unknown-or-disabled-schedule" });
    await db.update(researchGovernanceSchedules).set({ lastRequestedAt: new Date(), lastError: null }).where(eq(researchGovernanceSchedules.id, schedule.id));
    const latestActualRun = (await db.select().from(autonomousResearchRuns).where(and(eq(autonomousResearchRuns.dataStatus, "ready"), eq(autonomousResearchRuns.phase, "completed"), like(autonomousResearchRuns.runKey, "%:day"))).orderBy(desc(autonomousResearchRuns.updatedAt)).limit(1))[0];
    if (!latestActualRun) return res.json({ ok: true, skipped: "completed-actual-daily-run-not-found" });
    const committee = await runResearchCommittee(latestActualRun.id);
    if (committee.report?.status !== "completed") {
      return res.json({ ok: true, runId: latestActualRun.id, committeeReportId: committee.report?.id ?? null, awaiting: "committee-completion" });
    }
    const result = await runResearchGovernanceCycle();
    if ("skipped" in result) return res.json({ ok: true, ...result });
    await db.update(researchGovernanceSchedules).set({ latestCycleId: result.cycle.id }).where(eq(researchGovernanceSchedules.id, schedule.id));
    return res.json({ ok: true, cycleId: result.cycle.id, reused: result.reused });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: message, context: { url: req.originalUrl }, timestamp: new Date().toISOString() });
  }
}
