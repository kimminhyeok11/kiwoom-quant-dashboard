import { and, desc, eq, like } from "drizzle-orm";
import { autonomousResearchBars, autonomousResearchCandidates, autonomousResearchRuns, researchDailyBars, researchDatasets } from "../../drizzle/schema";
import type { ConditionExpressionGroup } from "../../shared/trading";
import { getDb } from "../db";
import { KiwoomClient } from "../kiwoom/client";
import { buildAutonomousInitialCandidates, evaluateAutonomousCandidate, selectAutonomousSurvivorFingerprints, selectAutonomousUniverse, type AutonomousUniverseItem } from "./autonomousPipeline";
import { AUTONOMOUS_RESEARCH_POLICY, getKoreaTradingDate, getWaitingForDataTransition } from "./autonomousResearch";
import { runWalkForward } from "./walkForward";

export type PublicHistoricalBacktestResult = {
  status: "ready" | "waiting" | "running";
  runId: number | null;
  message: string;
  reused: boolean;
};

type RunnerOptions = {
  getDb?: typeof getDb;
  createClient?: () => KiwoomClient;
  now?: () => Date;
};

type DailyBars = Awaited<ReturnType<KiwoomClient["getDailyBars"]>>;
type HistoricalSummary = { mode?: string; dataset?: { versionKey?: string; sourceRunId?: number; reused?: boolean } };

const historicalMarker = ":historical";
const reusePendingTimeoutMs = 60_000;

type StoredUniverseRun = { universeJson: unknown };

function toStoredUniverse(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function selectFreshHistoricalUniverse(
  rankingUniverse: AutonomousUniverseItem[],
  storedRuns: StoredUniverseRun[],
  limit: number,
): { universe: AutonomousUniverseItem[]; source: "kiwoom_ka10032" | "stored_actual_universe" } {
  if (rankingUniverse.length) return { universe: rankingUniverse, source: "kiwoom_ka10032" };
  for (const run of storedRuns) {
    const universe = toStoredUniverse(run.universeJson);
    const normalized = universe
      .filter((item): item is { symbol: string; name?: string } => Boolean(item) && typeof item === "object" && typeof (item as { symbol?: unknown }).symbol === "string")
      .map(item => ({ symbol: item.symbol, name: item.name ?? item.symbol, turnover: 0, price: 0, changeRate: 0 }))
      .slice(0, limit);
    if (normalized.length) return { universe: normalized, source: "stored_actual_universe" };
  }
  return { universe: [], source: "kiwoom_ka10032" };
}

function toBarRecord(rows: Array<{ symbol: string; date: string; open: number; high: number; low: number; close: number; volume: string | number; turnover: string | number }>): Record<string, DailyBars> {
  return rows.reduce<Record<string, DailyBars>>((result, row) => {
    (result[row.symbol] ??= []).push({ date: row.date, open: Number(row.open), high: Number(row.high), low: Number(row.low), close: Number(row.close), volume: Number(row.volume), turnover: Number(row.turnover) });
    return result;
  }, {});
}

function historicalSourceRunId(run: { id: number; summaryJson: unknown }) {
  const summary = run.summaryJson as HistoricalSummary | null;
  return summary?.dataset?.sourceRunId ?? run.id;
}

export function buildLocalSnapshotRunKey(input: { datasetId: number; versionKey: string; referenceDate: string }) {
  return `${AUTONOMOUS_RESEARCH_POLICY.version}:${input.referenceDate}${historicalMarker}:local:${input.datasetId}:${input.versionKey.split(":").at(-1)}`;
}

export function classifyPendingReuseRuns(runs: Array<{ id: number; runKey: string; dataStatus: string; updatedAt: Date }>, now: Date) {
  const pending = runs.filter(run => run.runKey.includes(`${historicalMarker}:reuse:`) && run.dataStatus === "pending");
  const active = pending.find(run => now.getTime() - run.updatedAt.getTime() < reusePendingTimeoutMs);
  return { activeRunId: active?.id ?? null, staleRunIds: pending.filter(run => now.getTime() - run.updatedAt.getTime() >= reusePendingTimeoutMs).map(run => run.id) };
}

export class PublicHistoricalBacktestRunner {
  private readonly dbFactory: typeof getDb;
  private readonly createClient: () => KiwoomClient;
  private readonly now: () => Date;
  private inFlight: Promise<PublicHistoricalBacktestResult> | null = null;

  constructor(options: RunnerOptions = {}) {
    this.dbFactory = options.getDb ?? getDb;
    this.createClient = options.createClient ?? (() => new KiwoomClient());
    this.now = options.now ?? (() => new Date());
  }

  async run(): Promise<PublicHistoricalBacktestResult> {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.runFresh();
    try {
      return await this.inFlight;
    } finally {
      this.inFlight = null;
    }
  }

  async reuseStoredDataset(): Promise<PublicHistoricalBacktestResult> {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.runReuse();
    try {
      return await this.inFlight;
    } finally {
      this.inFlight = null;
    }
  }

  async runLocalSnapshot(datasetId: number): Promise<PublicHistoricalBacktestResult> {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.runLocalSnapshotInternal(datasetId);
    try {
      return await this.inFlight;
    } finally {
      this.inFlight = null;
    }
  }

  private async runLocalSnapshotInternal(datasetId: number): Promise<PublicHistoricalBacktestResult> {
    const db = await this.dbFactory();
    if (!db) return { status: "waiting", runId: null, message: "저장된 실제 일봉 스냅샷을 조회할 수 없습니다.", reused: true };
    const dataset = (await db.select().from(researchDatasets).where(eq(researchDatasets.id, datasetId)).limit(1))[0];
    if (!dataset || dataset.qualityStatus !== "ready") return { status: "waiting", runId: null, message: "ready 상태의 실제 일봉 스냅샷이 필요합니다.", reused: true };
    const now = this.now();
    const runKey = buildLocalSnapshotRunKey({ datasetId: dataset.id, versionKey: dataset.versionKey, referenceDate: dataset.endDate });
    let run = (await db.select().from(autonomousResearchRuns).where(eq(autonomousResearchRuns.runKey, runKey)).limit(1))[0];
    if (run?.dataStatus === "ready") return { status: "ready", runId: run.id, message: "동일한 불변 실제 일봉 스냅샷의 자동 연구 결과를 다시 사용합니다.", reused: true };
    if (!run) {
      try {
        await db.insert(autonomousResearchRuns).values({ tradingDate: dataset.endDate, runKey, policyVersion: AUTONOMOUS_RESEARCH_POLICY.version, phase: "preparing", dataStatus: "pending", summaryJson: { mode: "historical_backtest_local_snapshot", datasetId: dataset.id, datasetVersionKey: dataset.versionKey, requestedAt: now.toISOString() } });
      } catch {
        // 고정 원본 지문 기반 실행 키가 동일한 동시 요청을 흡수한다.
      }
      run = (await db.select().from(autonomousResearchRuns).where(eq(autonomousResearchRuns.runKey, runKey)).limit(1))[0];
    }
    if (!run) return { status: "waiting", runId: null, message: "불변 실제 일봉 스냅샷 실행 기록을 만들지 못했습니다.", reused: true };
    let stage = "snapshot_prepare";
    try {
      const storedRows = await db.select().from(researchDailyBars).where(eq(researchDailyBars.datasetId, dataset.id)).orderBy(researchDailyBars.symbol, researchDailyBars.date);
      const allBars = toBarRecord(storedRows);
      const eligibleSymbols = Object.entries(allBars).filter(([, bars]) => bars.length >= 85).map(([symbol]) => symbol);
      if (!eligibleSymbols.length) throw new Error("불변 실제 일봉 스냅샷에 85개 이상의 종목별 일봉이 없습니다.");
      const barsBySymbol = Object.fromEntries(eligibleSymbols.map(symbol => [symbol, allBars[symbol]!])) as Record<string, DailyBars>;
      const snapshotRows = Object.entries(barsBySymbol).flatMap(([symbol, bars]) => bars.map(bar => ({ runId: run!.id, symbol, date: bar.date, open: Math.round(bar.open), high: Math.round(bar.high), low: Math.round(bar.low), close: Math.round(bar.close), volume: String(Math.round(bar.volume)), turnover: String(Math.round(bar.turnover)), source: "kiwoom_ka10081_local_snapshot", capturedAt: now })));
      for (let offset = 0; offset < snapshotRows.length; offset += 20) {
        stage = `snapshot_copy_${offset}`;
        await db.insert(autonomousResearchBars).values(snapshotRows.slice(offset, offset + 20)).onConflictDoUpdate({
          target: [autonomousResearchBars.runId, autonomousResearchBars.symbol, autonomousResearchBars.date],
          set: { capturedAt: now },
        });
      }
      const universe = eligibleSymbols.map(symbol => ({ symbol, name: symbol, turnover: 0, price: 0, changeRate: 0 }));
      stage = "candidate_evaluation";
      return await this.evaluateAndPersist({ db, run, now, referenceDate: dataset.endDate, universe, barsBySymbol, sourceRunId: run.id, reusedDataset: true, universeSource: "local_research_snapshot", source: "kiwoom_ka10081_local_snapshot", mode: "historical_backtest_local_snapshot", adjustmentBasis: dataset.adjustmentBasis });
    } catch (error) {
      const message = error instanceof Error ? error.message : "다종목 실제 일봉 자동 연구에 실패했습니다.";
      return this.waitForData(db, run, now, new Error(`${stage}: ${message}`));
    }
  }

  private async runFresh(): Promise<PublicHistoricalBacktestResult> {
    const db = await this.dbFactory();
    if (!db) return { status: "waiting", runId: null, message: "백테스트 저장소를 사용할 수 없습니다.", reused: false };
    const now = this.now();
    const referenceDate = getKoreaTradingDate(now);
    const runKey = `${AUTONOMOUS_RESEARCH_POLICY.version}:${referenceDate}${historicalMarker}`;
    let run = (await db.select().from(autonomousResearchRuns).where(eq(autonomousResearchRuns.runKey, runKey)).limit(1))[0];
    if (run?.dataStatus === "ready") return { status: "ready", runId: run.id, message: "오늘의 고정 실제 일봉 백테스트 결과를 다시 사용합니다.", reused: true };
    if (!run) {
      try {
        await db.insert(autonomousResearchRuns).values({ tradingDate: referenceDate, runKey, policyVersion: AUTONOMOUS_RESEARCH_POLICY.version, phase: "preparing", dataStatus: "pending", summaryJson: { mode: "historical_backtest", requestedAt: now.toISOString() } });
      } catch {
        // The deterministic daily run absorbs concurrent public requests.
      }
      run = (await db.select().from(autonomousResearchRuns).where(eq(autonomousResearchRuns.runKey, runKey)).limit(1))[0];
    }
    if (!run) return { status: "waiting", runId: null, message: "과거 백테스트 실행 기록을 만들지 못했습니다.", reused: false };

    try {
      const client = this.createClient();
      const token = await client.getAccessToken();
      const ranking = await client.getTurnoverRankings(token.token, { market: "000", exchange: "KRX" });
      const priorHistoricalRuns = await db.select({ universeJson: autonomousResearchRuns.universeJson }).from(autonomousResearchRuns).where(and(eq(autonomousResearchRuns.dataStatus, "ready"), like(autonomousResearchRuns.runKey, `%${historicalMarker}%`))).orderBy(desc(autonomousResearchRuns.updatedAt)).limit(20);
      const selectedUniverse = selectFreshHistoricalUniverse(
        selectAutonomousUniverse(ranking.items, AUTONOMOUS_RESEARCH_POLICY.maxUniverseSize),
        priorHistoricalRuns,
        AUTONOMOUS_RESEARCH_POLICY.maxUniverseSize,
      );
      const universe = selectedUniverse.universe;
      if (!universe.length) throw new Error("과거 백테스트 유니버스에 실제 가격·거래대금 종목이 없습니다.");
      const barsBySymbol: Record<string, DailyBars> = {};
      for (const item of universe) {
        const bars = await client.getDailyBars(token.token, { symbol: item.symbol, adjustedPrice: "1", maxPages: 3 });
        if (bars.length < 85) continue;
        barsBySymbol[item.symbol] = bars;
        await db.insert(autonomousResearchBars).values(bars.map(bar => ({ runId: run!.id, symbol: item.symbol, date: bar.date, open: Math.round(bar.open), high: Math.round(bar.high), low: Math.round(bar.low), close: Math.round(bar.close), volume: String(Math.round(bar.volume)), turnover: String(Math.round(bar.turnover)), source: "kiwoom_ka10081_historical" }))).onConflictDoUpdate({
          target: [autonomousResearchBars.runId, autonomousResearchBars.symbol, autonomousResearchBars.date],
          set: { capturedAt: now },
        });
      }
      return await this.evaluateAndPersist({ db, run, now, referenceDate, universe, barsBySymbol, sourceRunId: run.id, reusedDataset: false, universeSource: selectedUniverse.source });
    } catch (error) {
      return this.waitForData(db, run, now, error);
    }
  }

  private async runReuse(): Promise<PublicHistoricalBacktestResult> {
    const db = await this.dbFactory();
    if (!db) return { status: "waiting", runId: null, message: "저장된 실데이터를 조회할 수 없습니다.", reused: false };
    const now = this.now();
    const historicalRuns = await db.select().from(autonomousResearchRuns).orderBy(desc(autonomousResearchRuns.updatedAt)).limit(40);
    const reuseRecovery = classifyPendingReuseRuns(historicalRuns, now);
    if (reuseRecovery.activeRunId) return { status: "running", runId: reuseRecovery.activeRunId, message: "저장된 실제 일봉 재실행이 진행 중입니다.", reused: true };
    for (const staleRunId of reuseRecovery.staleRunIds) {
      await db.update(autonomousResearchRuns).set({ phase: "incomplete", dataStatus: "incomplete", lastError: "저장 실제 일봉 재실행이 중단되어 다음 요청에서 복구했습니다.", updatedAt: now }).where(eq(autonomousResearchRuns.id, staleRunId));
    }
    const sourceRun = historicalRuns.find(run => run.dataStatus === "ready" && run.runKey.includes(historicalMarker));
    if (!sourceRun) return { status: "waiting", runId: null, message: "먼저 실제 일봉 백테스트를 완료해야 저장 데이터를 재사용할 수 있습니다.", reused: false };
    const sourceRunId = historicalSourceRunId(sourceRun);
    const storedRows = await db.select().from(autonomousResearchBars).where(eq(autonomousResearchBars.runId, sourceRunId)).orderBy(autonomousResearchBars.symbol, autonomousResearchBars.date);
    const barsBySymbol = toBarRecord(storedRows);
    if (!Object.keys(barsBySymbol).length) return { status: "waiting", runId: null, message: "재사용할 고정 실제 일봉 원본이 없습니다.", reused: false };
    const priorReuseCount = historicalRuns.filter(run => run.runKey.includes(`${historicalMarker}:reuse:`)).length;
    const runKey = `${AUTONOMOUS_RESEARCH_POLICY.version}:${sourceRun.tradingDate}${historicalMarker}:reuse:${priorReuseCount + 1}`;
    const [created] = await db.insert(autonomousResearchRuns).values({ tradingDate: sourceRun.tradingDate, runKey, policyVersion: AUTONOMOUS_RESEARCH_POLICY.version, phase: "preparing", dataStatus: "pending", summaryJson: { mode: "historical_backtest_reuse", sourceRunId, requestedAt: now.toISOString() } }).returning();
    const run = (await db.select().from(autonomousResearchRuns).where(eq(autonomousResearchRuns.id, created.id)).limit(1))[0];
    if (!run) return { status: "waiting", runId: null, message: "저장 데이터 재사용 실행을 준비하지 못했습니다.", reused: false };
    const universe = ((sourceRun.universeJson as Array<{ symbol: string; name?: string }> | null) ?? Object.keys(barsBySymbol).map(symbol => ({ symbol, name: symbol }))).map(item => ({ symbol: item.symbol, name: item.name ?? item.symbol, turnover: 0, price: 0, changeRate: 0 }));
    try {
      return await this.evaluateAndPersist({ db, run, now, referenceDate: sourceRun.tradingDate, universe, barsBySymbol, sourceRunId, reusedDataset: true, seedOffset: priorReuseCount + 1, universeSource: "stored_actual_universe" });
    } catch (error) {
      return this.waitForData(db, run, now, error);
    }
  }

  private async evaluateAndPersist(input: { db: NonNullable<Awaited<ReturnType<typeof getDb>>>; run: typeof autonomousResearchRuns.$inferSelect; now: Date; referenceDate: string; universe: AutonomousUniverseItem[]; barsBySymbol: Record<string, DailyBars>; sourceRunId: number; reusedDataset: boolean; universeSource: "kiwoom_ka10032" | "stored_actual_universe" | "local_research_snapshot"; source?: string; mode?: string; adjustmentBasis?: "adjusted" | "unadjusted" | "unknown"; seedOffset?: number }): Promise<PublicHistoricalBacktestResult> {
    const symbols = Object.keys(input.barsBySymbol);
    if (!symbols.length) throw new Error("백테스트에 필요한 실제 일봉 원본을 수집하지 못했습니다.");
    const datasetVersionKey = `${AUTONOMOUS_RESEARCH_POLICY.version}:${input.referenceDate}:adjusted:${symbols.sort().join(",")}`;
    const generated = buildAutonomousInitialCandidates({ seed: Number(input.referenceDate.replaceAll("-", "")) + (input.seedOffset ?? 0), datasetVersionKey });
    const scored = generated.map(candidate => ({ candidate, inSample: evaluateAutonomousCandidate({ root: candidate.root, minimumScore: candidate.minimumScore, barsBySymbol: input.barsBySymbol }), outOfSample: evaluateAutonomousCandidate({ root: candidate.root, minimumScore: candidate.minimumScore, barsBySymbol: input.barsBySymbol, evaluationStartRatio: 0.7 }) }));
    const survivorFingerprints = selectAutonomousSurvivorFingerprints(scored.map(item => ({ fingerprint: item.candidate.fingerprint, fitnessScore: item.inSample.fitnessScore })));
    await input.db.insert(autonomousResearchCandidates).values(scored.map(item => ({ runId: input.run.id, fingerprint: item.candidate.fingerprint, rootGenomeJson: item.candidate.root, minimumScore: item.candidate.minimumScore, status: survivorFingerprints.has(item.candidate.fingerprint) ? "survived" as const : "rejected" as const, inSampleMetricsJson: { metrics: item.inSample.metrics, symbols, assumptions: { adjustmentBasis: input.adjustmentBasis ?? "adjusted", informationCutoffTradingDays: AUTONOMOUS_RESEARCH_POLICY.informationCutoffTradingDays, feeRate: AUTONOMOUS_RESEARCH_POLICY.feeRate, slippageBps: AUTONOMOUS_RESEARCH_POLICY.slippageBps, entryTiming: "next_open", holdingDays: AUTONOMOUS_RESEARCH_POLICY.holdingDays } }, outOfSampleMetricsJson: { metrics: item.outOfSample.metrics, symbols, split: "tail-30-percent" }, fitnessScore: String(item.inSample.fitnessScore), evaluatedAt: input.now }))).onConflictDoUpdate({
      target: [autonomousResearchCandidates.runId, autonomousResearchCandidates.fingerprint],
      set: { updatedAt: input.now },
    });
    const survivors = (await input.db.select().from(autonomousResearchCandidates).where(eq(autonomousResearchCandidates.runId, input.run.id)).orderBy(desc(autonomousResearchCandidates.fitnessScore))).filter(candidate => candidate.status === "survived");
    for (const candidate of survivors) {
      const folds = Object.values(input.barsBySymbol).map(bars => runWalkForward({ bars, expression: candidate.rootGenomeJson as unknown as ConditionExpressionGroup, configuration: { trainingDays: 60, validationDays: 20, stepDays: 20, minScore: candidate.minimumScore, holdingDays: AUTONOMOUS_RESEARCH_POLICY.holdingDays, feeRate: AUTONOMOUS_RESEARCH_POLICY.feeRate + AUTONOMOUS_RESEARCH_POLICY.slippageBps / 10_000, entryDelayDays: AUTONOMOUS_RESEARCH_POLICY.informationCutoffTradingDays, entryTiming: "open" } }));
      const totalReturn = folds.reduce((sum, item) => sum + item.totalReturn, 0) / folds.length;
      const maxDrawdown = folds.reduce((sum, item) => sum + item.worstFoldDrawdown, 0) / folds.length;
      const tradeCount = folds.reduce((sum, item) => sum + item.tradeCount, 0);
      await input.db.update(autonomousResearchCandidates).set({ walkForwardMetricsJson: { configuration: { trainingDays: 60, validationDays: 20, stepDays: 20 }, metrics: { totalReturn, maxDrawdown, tradeCount }, foldCount: folds.length }, updatedAt: input.now }).where(eq(autonomousResearchCandidates.id, candidate.id));
    }
    const allBars = Object.values(input.barsBySymbol).flat();
    const dates = allBars.map(bar => bar.date).sort();
    const summary = { mode: input.mode ?? (input.reusedDataset ? "historical_backtest_reuse" : "historical_backtest"), source: input.source ?? "kiwoom_ka10081", universeSource: input.universeSource, adjustmentBasis: input.adjustmentBasis ?? "adjusted", referenceDate: input.referenceDate, dataWindow: { startDate: dates[0], endDate: dates.at(-1) }, universeSize: symbols.length, barCount: allBars.length, generatedCandidates: generated.length, survivorCount: survivorFingerprints.size, dataset: { versionKey: datasetVersionKey, sourceRunId: input.sourceRunId, reused: input.reusedDataset, storage: "autonomous_research_bars" }, assumptions: { informationCutoffTradingDays: AUTONOMOUS_RESEARCH_POLICY.informationCutoffTradingDays, feeRate: AUTONOMOUS_RESEARCH_POLICY.feeRate, slippageBps: AUTONOMOUS_RESEARCH_POLICY.slippageBps, entryTiming: "next_open", holdingDays: AUTONOMOUS_RESEARCH_POLICY.holdingDays } };
    await input.db.update(autonomousResearchRuns).set({ phase: "completed", dataStatus: "ready", universeJson: input.universe.map(item => ({ symbol: item.symbol, name: item.name })), summaryJson: summary, lastError: null, lastObservedAt: input.now, completedAt: input.now, updatedAt: input.now }).where(eq(autonomousResearchRuns.id, input.run.id));
    return { status: "ready", runId: input.run.id, message: input.mode === "historical_backtest_local_snapshot" ? "로컬 키움 실제 일봉 불변 스냅샷으로 자동 조건식·독립 OOS·워크포워드 분석을 완료했습니다." : input.reusedDataset ? "키움 호출 없이 저장된 실제 일봉으로 새 조건식 실험을 완료했습니다." : `${symbols.length}개 실제 종목의 고정 일봉으로 과거 백테스트를 완료했습니다.`, reused: input.reusedDataset };
  }

  private async waitForData(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, run: typeof autonomousResearchRuns.$inferSelect, now: Date, error: unknown): Promise<PublicHistoricalBacktestResult> {
    const transition = getWaitingForDataTransition(error instanceof Error ? error.message : "과거 백테스트 실데이터 수집에 실패했습니다.");
    await db.update(autonomousResearchRuns).set({ ...transition, updatedAt: now }).where(eq(autonomousResearchRuns.id, run.id));
    return { status: "waiting", runId: run.id, message: transition.lastError, reused: false };
  }
}

export const publicHistoricalBacktest = new PublicHistoricalBacktestRunner();
