import { createHash } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { autonomousResearchCandidates, autonomousResearchRuns, dayTradeExperimentPositions, dayTradeExperiments, localResearchNodeSyncEvents } from "../../drizzle/schema";
import { calculateDayTradePortfolio, DAY_TRADE_FEE_RATE, DAY_TRADE_TOTAL_CAPITAL } from "../../shared/dayTradePortfolio";
import { getDb } from "../db";

type Entry = { symbol: string; name: string; entryPrice: number; entryAt: string; evidence: { score: number; matchedRuleCount: number; details: string[] }; lastPrice?: number; lastObservedAt?: string; exitPrice?: number; exitAt?: string };
type Candidate = { id: number; fingerprint: string; rootGenomeJson: unknown; inSampleMetricsJson: unknown; outOfSampleMetricsJson: unknown; walkForwardMetricsJson: unknown; fitnessScore: string | null; simulationJson: unknown };
type Run = { id: number; tradingDate: string; policyVersion: string };
type Selected = { candidate: Candidate; entry: Entry; signalCount: number };

function extractEntries(candidate: Candidate): Entry[] {
  const simulation = candidate.simulationJson as { entries?: Entry[] } | null;
  return simulation?.entries ?? [];
}

export function selectUniquePositions(candidates: Candidate[]): { selected: Selected[]; signalCount: number } {
  const bySymbol = new Map<string, Selected>();
  let signalCount = 0;
  candidates.forEach(candidate => extractEntries(candidate).forEach(entry => {
    signalCount += 1;
    const previous = bySymbol.get(entry.symbol);
    if (!previous || Number(candidate.fitnessScore ?? -Infinity) > Number(previous.candidate.fitnessScore ?? -Infinity)) bySymbol.set(entry.symbol, { candidate, entry, signalCount: (previous?.signalCount ?? 0) + 1 });
    else previous.signalCount += 1;
  }));
  return { selected: Array.from(bySymbol.values()), signalCount };
}

export async function persistDayTradeExperiment(input: { run: Run; candidates: Candidate[]; isClosing: boolean }) {
  const db = await getDb();
  if (!db) throw new Error("데이트레이드 실험 이력 데이터베이스를 사용할 수 없습니다.");
  const { selected, signalCount } = selectUniquePositions(input.candidates);
  const portfolio = calculateDayTradePortfolio(selected.map(({ candidate, entry }) => ({ id: `${candidate.id}:${entry.symbol}`, entryPrice: entry.entryPrice, currentPrice: entry.exitPrice ?? entry.lastPrice })));
  const sourceFingerprint = createHash("sha256").update(JSON.stringify({ runId: input.run.id, tradingDate: input.run.tradingDate, entries: selected.map(({ candidate, entry, signalCount: count }) => [candidate.fingerprint, entry.symbol, entry.entryPrice, entry.lastPrice, entry.exitPrice, count]) })).digest("hex");
  let experiment = (await db.select().from(dayTradeExperiments).where(eq(dayTradeExperiments.runId, input.run.id)).limit(1))[0];
  const summary = { runId: input.run.id, tradingDate: input.run.tradingDate, policyVersion: input.run.policyVersion, status: input.isClosing ? "closed" as const : "tracking" as const, totalCapital: DAY_TRADE_TOTAL_CAPITAL, buyFeeRate: String(DAY_TRADE_FEE_RATE), sellFeeRate: String(DAY_TRADE_FEE_RATE), signalCount, selectedPositionCount: portfolio.positions.length, netValue: Math.round(portfolio.netValue), netPnl: Math.round(portfolio.netPnl), netReturnPercent: portfolio.netReturnPercent.toFixed(4), sourceFingerprint, closedAt: input.isClosing ? new Date() : null };
  if (!experiment) {
    await db.insert(dayTradeExperiments).values(summary);
    experiment = (await db.select().from(dayTradeExperiments).where(eq(dayTradeExperiments.runId, input.run.id)).limit(1))[0];
  } else {
    await db.update(dayTradeExperiments).set(summary).where(eq(dayTradeExperiments.id, experiment.id));
  }
  if (!experiment) throw new Error("데이트레이드 실험 이력 생성에 실패했습니다.");
  const selectedById = new Map(selected.map(item => [`${item.candidate.id}:${item.entry.symbol}`, item]));
  for (const ledger of portfolio.positions) {
    const item = selectedById.get(ledger.id)!;
    const closed = Boolean(item.entry.exitPrice);
    const status = ledger.quantity === 0 ? "cash_only" as const : closed ? "closed" as const : "tracking" as const;
    const values = { experimentId: experiment.id, candidateId: item.candidate.id, candidateFingerprint: item.candidate.fingerprint, symbol: item.entry.symbol, name: item.entry.name, signalCount: item.signalCount, quantity: ledger.quantity, allocation: ledger.allocation, entryPrice: item.entry.entryPrice, entryAt: new Date(item.entry.entryAt), lastPrice: item.entry.lastPrice ?? null, lastObservedAt: item.entry.lastObservedAt ? new Date(item.entry.lastObservedAt) : null, exitPrice: item.entry.exitPrice ?? null, exitAt: item.entry.exitAt ? new Date(item.entry.exitAt) : null, buyFee: ledger.buyFee, estimatedExitFee: ledger.estimatedExitFee, netValue: Math.round(ledger.netValue), netPnl: Math.round(ledger.netPnl), netReturnPercent: ledger.netReturnPercent.toFixed(4), status, evidenceJson: { entryEvidence: item.entry.evidence, rootGenome: item.candidate.rootGenomeJson, historicalValidation: { inSample: item.candidate.inSampleMetricsJson, outOfSample: item.candidate.outOfSampleMetricsJson, walkForward: item.candidate.walkForwardMetricsJson, fitnessScore: item.candidate.fitnessScore } } };
    await db.insert(dayTradeExperimentPositions).values(values).onConflictDoUpdate({
      target: dayTradeExperimentPositions.candidateId,
      set: { signalCount: values.signalCount, quantity: values.quantity, allocation: values.allocation, lastPrice: values.lastPrice, lastObservedAt: values.lastObservedAt, exitPrice: values.exitPrice, exitAt: values.exitAt, buyFee: values.buyFee, estimatedExitFee: values.estimatedExitFee, netValue: values.netValue, netPnl: values.netPnl, netReturnPercent: values.netReturnPercent, status: values.status, evidenceJson: values.evidenceJson },
    });
  }
  return { experimentId: experiment.id, signalCount, selectedPositionCount: portfolio.positions.length, netValue: portfolio.netValue, netPnl: portfolio.netPnl, netReturnPercent: portfolio.netReturnPercent };
}

export async function syncDayTradeExperimentForRun(runId: number) {
  const db = await getDb();
  if (!db) throw new Error("데이트레이드 실험 이력 데이터베이스를 사용할 수 없습니다.");
  const run = (await db.select().from(autonomousResearchRuns).where(eq(autonomousResearchRuns.id, runId)).limit(1))[0];
  if (!run) throw new Error("저장할 자동 연구 실행을 찾을 수 없습니다.");
  const candidates = await db.select().from(autonomousResearchCandidates).where(eq(autonomousResearchCandidates.runId, run.id));
  return persistDayTradeExperiment({ run, candidates: candidates.filter(candidate => candidate.status === "survived"), isClosing: run.phase === "closing" || run.phase === "completed" });
}

export async function getDayTradeHistory() {
  const db = await getDb();
  if (!db) return { experiments: [], positions: [], conditionStats: [], latestSyncEvent: null };
  const experiments = await db.select().from(dayTradeExperiments).orderBy(dayTradeExperiments.tradingDate).limit(60);
  const positions = experiments.length ? await db.select().from(dayTradeExperimentPositions).where(eq(dayTradeExperimentPositions.experimentId, experiments[experiments.length - 1].id)).orderBy(dayTradeExperimentPositions.netPnl) : [];
  const allPositions = experiments.length ? await db.select().from(dayTradeExperimentPositions).limit(5000) : [];
  const latestSyncEvent = (await db.select().from(localResearchNodeSyncEvents).orderBy(desc(localResearchNodeSyncEvents.createdAt)).limit(1))[0] ?? null;
  const grouped = new Map<string, { candidateFingerprint: string; days: Set<number>; positions: number; wins: number; grossProfit: number; grossLoss: number; netPnl: number; latestNetPnl: number; latestReturnPercent: number }>();
  allPositions.forEach(position => {
    const stats = grouped.get(position.candidateFingerprint) ?? { candidateFingerprint: position.candidateFingerprint, days: new Set<number>(), positions: 0, wins: 0, grossProfit: 0, grossLoss: 0, netPnl: 0, latestNetPnl: 0, latestReturnPercent: 0 };
    const pnl = Number(position.netPnl);
    stats.days.add(position.experimentId); stats.positions += 1; stats.netPnl += pnl; stats.latestNetPnl = pnl; stats.latestReturnPercent = Number(position.netReturnPercent);
    if (pnl > 0) { stats.wins += 1; stats.grossProfit += pnl; } else if (pnl < 0) stats.grossLoss += Math.abs(pnl);
    grouped.set(position.candidateFingerprint, stats);
  });
  const conditionStats = Array.from(grouped.values()).map(stats => ({ candidateFingerprint: stats.candidateFingerprint, experimentDays: stats.days.size, positions: stats.positions, winRate: stats.positions ? stats.wins / stats.positions * 100 : 0, netPnl: stats.netPnl, profitFactor: stats.grossLoss ? stats.grossProfit / stats.grossLoss : stats.grossProfit > 0 ? null : 0, latestNetPnl: stats.latestNetPnl, latestReturnPercent: stats.latestReturnPercent })).sort((a, b) => b.netPnl - a.netPnl || b.experimentDays - a.experimentDays);
  return { experiments: [...experiments].reverse(), positions, conditionStats, latestSyncEvent };
}
