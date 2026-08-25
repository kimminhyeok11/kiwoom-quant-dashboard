import type { Request, Response } from "express";
import { and, desc, eq } from "drizzle-orm";
import { autonomousResearchBars, autonomousResearchCandidates, autonomousResearchObservations, autonomousResearchRuns, autonomousResearchTasks } from "../../drizzle/schema";
import { getDb } from "../db";
import { KiwoomClient } from "../kiwoom/client";
import { sdk } from "../_core/sdk";
import { buildAutonomousRunKey, getAutonomousResearchPhase, getKoreaTradingDate, getWaitingForDataTransition, AUTONOMOUS_RESEARCH_POLICY } from "../quant/autonomousResearch";
import { buildAutonomousInitialCandidates, evaluateAutonomousCandidate, selectAutonomousSurvivorFingerprints, selectAutonomousUniverse } from "../quant/autonomousPipeline";
import { runWalkForward } from "../quant/walkForward";
import type { ConditionExpressionGroup } from "../../shared/trading";
import { evaluateExpression } from "../quant/conditions";
import { externalVerificationPausedMessage, isExternalResearchVerificationEnabled } from "../quant/externalVerificationGate";
import { persistDayTradeExperiment } from "../quant/dayTradeHistory";

type SimulationEntry = { symbol: string; name: string; entryPrice: number; entryAt: string; evidence: { score: number; matchedRuleCount: number; details: string[] }; lastPrice?: number; lastObservedAt?: string; returnPercent?: number; exitPrice?: number; exitAt?: string };
type CandidateSimulation = { status: "tracking" | "not_entered" | "closed"; entries: SimulationEntry[]; updatedAt: string };
type InternalResponse = Pick<Response, "json" | "status">;

export function getAutonomousTaskSkip(existing: { status: string } | undefined): "already-running" | "already-completed" | null {
  if (!existing) return null;
  return existing.status === "running" ? "already-running" : "already-completed";
}

export { isExternalResearchVerificationEnabled as isExternalResearchCollectionEnabled } from "../quant/externalVerificationGate";

async function getOrCreateDailyRun(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, tradingDate: string) {
  const runKey = `${AUTONOMOUS_RESEARCH_POLICY.version}:${tradingDate}:day`;
  const existing = (await db.select().from(autonomousResearchRuns).where(eq(autonomousResearchRuns.runKey, runKey)).limit(1))[0];
  if (existing) return existing;
  try {
    await db.insert(autonomousResearchRuns).values({ tradingDate, runKey, policyVersion: AUTONOMOUS_RESEARCH_POLICY.version, phase: "preparing", dataStatus: "pending" });
  } catch {
    // Another platform retry may have created the deterministic daily run first.
  }
  const created = (await db.select().from(autonomousResearchRuns).where(eq(autonomousResearchRuns.runKey, runKey)).limit(1))[0];
  if (!created) throw new Error("자동 리서치 일일 실행을 생성하지 못했습니다.");
  return created;
}

async function claimTask(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, input: { runId: number; runKey: string; phase: "preparing" | "opening" | "intraday" | "closing" }) {
  const existing = (await db.select().from(autonomousResearchTasks).where(eq(autonomousResearchTasks.runKey, input.runKey)).limit(1))[0];
  const skip = getAutonomousTaskSkip(existing);
  if (skip) return { claimed: false as const, skip };
  try {
    await db.insert(autonomousResearchTasks).values(input);
  } catch {
    return { claimed: false as const, skip: "already-running" as const };
  }
  const task = (await db.select().from(autonomousResearchTasks).where(eq(autonomousResearchTasks.runKey, input.runKey)).limit(1))[0];
  if (!task) throw new Error("자동 리서치 작업을 생성하지 못했습니다.");
  return { claimed: true as const, task };
}

export async function autonomousResearchHandler(req: Request, res: Response, options: { internalWorker?: boolean } = {}) {
  try {
    if (!options.internalWorker) {
      const user = await sdk.authenticateRequest(req);
      if (!user.isCron) return res.status(403).json({ error: "cron-only" });
    }
    const now = new Date();
    const phase = getAutonomousResearchPhase(now);
    if (!phase || (phase !== "preparing" && phase !== "opening" && phase !== "intraday" && phase !== "closing")) return res.json({ ok: true, skipped: "outside-market-hours" });
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "database-unavailable", timestamp: now.toISOString() });
    const dailyRun = await getOrCreateDailyRun(db, getKoreaTradingDate(now));
    const runKey = buildAutonomousRunKey(now, phase);
    const claim = await claimTask(db, { runId: dailyRun.id, runKey, phase });
    if (!claim.claimed) return res.json({ ok: true, skipped: claim.skip, runKey, runId: dailyRun.id });

    const completeTask = async (input: { status: "completed" | "waiting_for_data" | "failed"; resultJson?: Record<string, unknown>; lastError?: string }) => {
      await db.update(autonomousResearchTasks).set({ ...input, completedAt: new Date() }).where(eq(autonomousResearchTasks.id, claim.task.id));
    };
    if (!isExternalResearchVerificationEnabled()) {
      const transition = getWaitingForDataTransition(externalVerificationPausedMessage);
      await db.update(autonomousResearchRuns).set({ ...transition, updatedAt: new Date() }).where(eq(autonomousResearchRuns.id, dailyRun.id));
      await completeTask({ status: "waiting_for_data", resultJson: transition.summary, lastError: transition.lastError });
      return res.json({ ok: true, waitingForData: true, runKey, reason: transition.lastError, externalCollection: "user-request-required" });
    }
    const client = new KiwoomClient();
    const broker = client.getStatus();
    if (!broker.fixedIpRegistered || !broker.hasCredentials) {
      const transition = getWaitingForDataTransition(!broker.fixedIpRegistered ? "키움 지정 단말 인증 대기" : "키움 서버 자격 증명 대기");
      await db.update(autonomousResearchRuns).set({ ...transition, updatedAt: new Date() }).where(eq(autonomousResearchRuns.id, dailyRun.id));
      await completeTask({ status: "waiting_for_data", resultJson: transition.summary, lastError: transition.lastError });
      return res.json({ ok: true, waitingForData: true, runKey, reason: transition.lastError });
    }

    try {
      const token = await client.getAccessToken();
      const ranking = await client.getTurnoverRankings(token.token, { market: "000", exchange: "KRX" });
      const universe = selectAutonomousUniverse(ranking.items, AUTONOMOUS_RESEARCH_POLICY.maxUniverseSize);
      if (!universe.length) throw new Error("자동 유동성 유니버스에 실제 가격·거래대금 종목이 없습니다.");
      await db.insert(autonomousResearchObservations).values(universe.map(item => ({ runId: dailyRun.id, symbol: item.symbol, name: item.name, price: Math.round(item.price), changeRate: String(item.changeRate), source: "kiwoom_ka10032" })));
      let candidateSummary: Record<string, unknown> = {};
      if (phase === "opening") {
        const barsBySymbol: Record<string, Awaited<ReturnType<typeof client.getDailyBars>>> = {};
        for (const item of universe) {
          const bars = await client.getDailyBars(token.token, { symbol: item.symbol, adjustedPrice: "1", maxPages: 3 });
          if (bars.length < 60) continue;
          barsBySymbol[item.symbol] = bars;
          await db.insert(autonomousResearchBars).values(bars.map(bar => ({ runId: dailyRun.id, symbol: item.symbol, date: bar.date, open: Math.round(bar.open), high: Math.round(bar.high), low: Math.round(bar.low), close: Math.round(bar.close), volume: String(Math.round(bar.volume)), turnover: String(Math.round(bar.turnover)), source: "kiwoom_ka10081" })));
        }
        const eligibleSymbols = Object.keys(barsBySymbol);
        if (!eligibleSymbols.length) throw new Error("자동 조건식 평가에 필요한 60개 이상 실제 일봉 원본을 수집하지 못했습니다.");
        const datasetVersionKey = `${AUTONOMOUS_RESEARCH_POLICY.version}:${dailyRun.tradingDate}:${eligibleSymbols.join(",")}`;
        const seed = Number(dailyRun.tradingDate.replaceAll("-", ""));
        const generated = buildAutonomousInitialCandidates({ seed, datasetVersionKey });
        const scored = generated.map(candidate => {
          const inSample = evaluateAutonomousCandidate({ root: candidate.root, minimumScore: candidate.minimumScore, barsBySymbol });
          const outOfSample = evaluateAutonomousCandidate({ root: candidate.root, minimumScore: candidate.minimumScore, barsBySymbol, evaluationStartRatio: 0.7 });
          return { candidate, inSample, outOfSample };
        });
        const survivorFingerprints = selectAutonomousSurvivorFingerprints(scored.map(item => ({ fingerprint: item.candidate.fingerprint, fitnessScore: item.inSample.fitnessScore })));
        await db.insert(autonomousResearchCandidates).values(scored.map(item => ({ runId: dailyRun.id, fingerprint: item.candidate.fingerprint, rootGenomeJson: item.candidate.root, minimumScore: item.candidate.minimumScore, status: survivorFingerprints.has(item.candidate.fingerprint) ? "survived" as const : "rejected" as const, inSampleMetricsJson: { metrics: item.inSample.metrics, symbols: item.inSample.results.map(result => result.symbol), assumptions: { policyVersion: AUTONOMOUS_RESEARCH_POLICY.version } }, outOfSampleMetricsJson: { metrics: item.outOfSample.metrics, symbols: item.outOfSample.results.map(result => result.symbol), split: "tail-30-percent" }, fitnessScore: String(item.inSample.fitnessScore), evaluatedAt: new Date() })));
        const survivorRows = await db.select().from(autonomousResearchCandidates).where(and(eq(autonomousResearchCandidates.runId, dailyRun.id), eq(autonomousResearchCandidates.status, "survived")));
        const universeBySymbol = new Map(universe.map(item => [item.symbol, item]));
        for (const candidate of survivorRows) {
          const entries: SimulationEntry[] = eligibleSymbols.flatMap(symbol => {
            const evaluation = evaluateExpression(candidate.rootGenomeJson as unknown as ConditionExpressionGroup, barsBySymbol[symbol]!);
            const current = universeBySymbol.get(symbol);
            if (!current || !evaluation.eligible || evaluation.score < candidate.minimumScore) return [];
            return [{ symbol, name: current.name, entryPrice: Math.round(current.price), entryAt: new Date().toISOString(), evidence: { score: evaluation.score, matchedRuleCount: evaluation.evaluations.filter(item => item.matched).length, details: evaluation.evaluations.filter(item => item.matched).slice(0, 5).map(item => item.detail) } }];
          });
          const simulation: CandidateSimulation = { status: entries.length ? "tracking" : "not_entered", entries, updatedAt: new Date().toISOString() };
          await db.update(autonomousResearchCandidates).set({ simulationJson: simulation }).where(eq(autonomousResearchCandidates.id, candidate.id));
          if (entries.length) await db.insert(autonomousResearchObservations).values(entries.map(entry => ({ runId: dailyRun.id, candidateId: candidate.id, symbol: entry.symbol, name: entry.name, price: entry.entryPrice, source: "kiwoom_ka10032_entry" })));
        }
        candidateSummary = { generatedCandidates: generated.length, evaluatedSymbols: eligibleSymbols.length, survivorCount: survivorFingerprints.size };
      }
      if (phase === "intraday" || phase === "closing") {
        const trackingCandidates = await db.select().from(autonomousResearchCandidates).where(and(eq(autonomousResearchCandidates.runId, dailyRun.id), eq(autonomousResearchCandidates.status, "survived")));
        const priceBySymbol = new Map(universe.map(item => [item.symbol, item]));
        let trackedPositions = 0;
        for (const candidate of trackingCandidates) {
          const simulation = candidate.simulationJson as CandidateSimulation | null;
          if (!simulation?.entries.length) continue;
          const entries = simulation.entries.map(entry => {
            const latest = priceBySymbol.get(entry.symbol);
            if (!latest) return entry;
            const returnPercent = (latest.price - entry.entryPrice) / entry.entryPrice * 100;
            return phase === "closing" ? { ...entry, lastPrice: Math.round(latest.price), lastObservedAt: new Date().toISOString(), returnPercent, exitPrice: Math.round(latest.price), exitAt: new Date().toISOString() } : { ...entry, lastPrice: Math.round(latest.price), lastObservedAt: new Date().toISOString(), returnPercent };
          });
          const next: CandidateSimulation = { status: phase === "closing" ? "closed" : simulation.status, entries, updatedAt: new Date().toISOString() };
          await db.update(autonomousResearchCandidates).set({ simulationJson: next }).where(eq(autonomousResearchCandidates.id, candidate.id));
          const observed = entries.filter(entry => entry.lastPrice !== undefined).map(entry => ({ runId: dailyRun.id, candidateId: candidate.id, symbol: entry.symbol, name: entry.name, price: entry.lastPrice!, changeRate: String(entry.returnPercent ?? 0), source: phase === "closing" ? "kiwoom_ka10032_exit" : "kiwoom_ka10032_tracking" }));
          if (observed.length) await db.insert(autonomousResearchObservations).values(observed);
          trackedPositions += entries.length;
        }
        const updatedSurvivors = await db.select().from(autonomousResearchCandidates).where(and(eq(autonomousResearchCandidates.runId, dailyRun.id), eq(autonomousResearchCandidates.status, "survived")));
        const dayTradeExperiment = await persistDayTradeExperiment({ run: dailyRun, candidates: updatedSurvivors, isClosing: phase === "closing" });
        candidateSummary = { ...candidateSummary, trackedPositions, dayTradeExperiment };
      }
      if (phase === "closing") {
        const [survivors, storedBars] = await Promise.all([
          db.select().from(autonomousResearchCandidates).where(and(eq(autonomousResearchCandidates.runId, dailyRun.id), eq(autonomousResearchCandidates.status, "survived"))).orderBy(desc(autonomousResearchCandidates.fitnessScore)),
          db.select().from(autonomousResearchBars).where(eq(autonomousResearchBars.runId, dailyRun.id)),
        ]);
        const barsBySymbol = storedBars.reduce<Record<string, Array<{ date: string; open: number; high: number; low: number; close: number; volume: number; turnover: number }>>>((all, bar) => {
          (all[bar.symbol] ??= []).push({ date: bar.date, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: Number(bar.volume), turnover: Number(bar.turnover) });
          return all;
        }, {});
        let walkForwardCount = 0;
        for (const candidate of survivors) {
          const folds = Object.values(barsBySymbol).flatMap(bars => bars.length >= 85 ? [runWalkForward({ bars, expression: candidate.rootGenomeJson as unknown as ConditionExpressionGroup, configuration: { trainingDays: 60, validationDays: 20, stepDays: 20, minScore: candidate.minimumScore, holdingDays: AUTONOMOUS_RESEARCH_POLICY.holdingDays, feeRate: AUTONOMOUS_RESEARCH_POLICY.feeRate + AUTONOMOUS_RESEARCH_POLICY.slippageBps / 10_000, entryDelayDays: AUTONOMOUS_RESEARCH_POLICY.informationCutoffTradingDays, entryTiming: "open" } })] : []);
          if (!folds.length) continue;
          const totalReturn = folds.reduce((sum, item) => sum + item.totalReturn, 0) / folds.length;
          const maxDrawdown = folds.reduce((sum, item) => sum + item.worstFoldDrawdown, 0) / folds.length;
          const tradeCount = folds.reduce((sum, item) => sum + item.tradeCount, 0);
          await db.update(autonomousResearchCandidates).set({ walkForwardMetricsJson: { configuration: { trainingDays: 60, validationDays: 20, stepDays: 20 }, metrics: { totalReturn, maxDrawdown, tradeCount }, foldCount: folds.length } }).where(eq(autonomousResearchCandidates.id, candidate.id));
          walkForwardCount += 1;
        }
        candidateSummary = { ...candidateSummary, walkForwardCandidates: walkForwardCount, survivedCandidates: survivors.length };
      }
      const summary = { phase, runKey, universeSize: universe.length, observedSymbols: universe.map(item => item.symbol), policyVersion: AUTONOMOUS_RESEARCH_POLICY.version, ...candidateSummary };
      await db.update(autonomousResearchRuns).set({ phase: phase === "closing" ? "completed" : phase, dataStatus: "ready", universeJson: universe.map(item => ({ symbol: item.symbol, name: item.name })), summaryJson: summary, lastError: null, lastObservedAt: new Date(), ...(phase === "closing" ? { completedAt: new Date() } : {}) }).where(eq(autonomousResearchRuns.id, dailyRun.id));
      await completeTask({ status: "completed", resultJson: summary });
      return res.json({ ok: true, runId: dailyRun.id, runKey, phase, observed: universe.length });
    } catch (error) {
      const transition = getWaitingForDataTransition(error instanceof Error ? error.message : "자동 리서치 데이터 수집에 실패했습니다.");
      await db.update(autonomousResearchRuns).set({ ...transition, updatedAt: new Date() }).where(eq(autonomousResearchRuns.id, dailyRun.id));
      await completeTask({ status: "waiting_for_data", resultJson: transition.summary, lastError: transition.lastError });
      return res.json({ ok: true, waitingForData: true, runKey, reason: transition.lastError });
    }
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : String(error), context: { url: req.originalUrl }, timestamp: new Date().toISOString() });
  }
}

export function shouldStartAutonomousResearchWorker(value = process.env.AUTONOMOUS_RESEARCH_CONTINUOUS_ENABLED): boolean {
  return value !== "false";
}

export function startAutonomousResearchWorker(input: { intervalMs?: number } = {}): () => void {
  if (!shouldStartAutonomousResearchWorker()) return () => undefined;
  const intervalMs = Math.max(input.intervalMs ?? 60_000, 60_000);
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const response: InternalResponse = {
        status: () => response as Response,
        json: payload => {
          const message = payload as { error?: string; waitingForData?: boolean; skipped?: string };
          if (message.error) console.error("[AutonomousResearch]", message.error);
          else if (message.waitingForData) console.info("[AutonomousResearch] waiting-for-data");
          return response as Response;
        },
      };
      await autonomousResearchHandler({ originalUrl: "internal://autonomous-research" } as Request, response as Response, { internalWorker: true });
    } finally {
      running = false;
    }
  };
  void run();
  const timer = setInterval(() => void run(), intervalMs);
  console.info(`[AutonomousResearch] continuous worker started (${intervalMs}ms)`);
  return () => clearInterval(timer);
}
