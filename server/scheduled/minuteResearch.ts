import type { Request, Response } from "express";
import { sdk } from "../_core/sdk";
import { getMinuteResearchProgramByTaskUid, runMinuteResearchSweep } from "../quant/minuteResearch";

export async function minuteResearchHandler(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "cron-only" });
    const program = await getMinuteResearchProgramByTaskUid(user.taskUid);
    if (!program) return res.json({ ok: true, skipped: "orphan-or-paused" });
    const result = await runMinuteResearchSweep(program.id);
    return res.json({ ok: true, result });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : String(error), context: { url: req.originalUrl }, timestamp: new Date().toISOString() });
  }
}
