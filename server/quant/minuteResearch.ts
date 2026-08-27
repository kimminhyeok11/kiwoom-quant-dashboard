import { createHash } from "node:crypto";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
  intradayMinuteBars,
  minuteResearchCandidates,
  minuteResearchDailyMetrics,
  minuteResearchPrograms,
  minuteResearchSymbolMetrics,
  minuteResearchSweeps,
  strategyPresets,
} from "../../drizzle/schema";
import type { ConditionExpressionGroup } from "../../shared/trading";
import { getDb } from "../db";
import type { IntradayMinuteBar } from "../kiwoom/minuteBars";
import { fingerprintResearchGenome, generateUniqueGenomes, type EvolutionRuleType } from "./evolution";
import { evaluateMinuteExpression, type MinuteValidationTrade } from "./minuteValidation";

export type MinuteResearchConfiguration = {
  combinationsPerSweep: number;
  maxUniverseSymbols: number;
  lookbackTradingDays: number;
  validationTradingDays: number;
  minimumTrades: number;
  minimumValidationTrades: number;
  maxDrawdownPercent: number;
  stopLossPercent: number;
  takeProfitPercent: number;
  maxHoldingBars: number;
  feeRate: number;
  slippageBps: number;
  explorationMode: "survivor_core" | "diverse_random";
};

export const DEFAULT_MINUTE_RESEARCH_CONFIGURATION: MinuteResearchConfiguration = {
  combinationsPerSweep: 3_000,
  maxUniverseSymbols: 20,
  lookbackTradingDays: 20,
  validationTradingDays: 5,
  minimumTrades: 24,
  minimumValidationTrades: 8,
  maxDrawdownPercent: -4,
  stopLossPercent: 1.5,
  takeProfitPercent: 3,
  maxHoldingBars: 45,
  feeRate: 0.0003,
  slippageBps: 8,
  explorationMode: "survivor_core",
};

const MINUTE_RULE_TYPES: EvolutionRuleType[] = ["macd_rising", "ma_position", "high_return", "turnover", "rsi", "bollinger", "stochastic", "atr_percent", "volume_ratio", "close_change", "gap_percent", "intrabar_position"];
const STALE_SWEEP_AFTER_MS = 10 * 60 * 1_000;
export const MINUTE_RESEARCH_EVALUATION_BATCH_SIZE = 1;

export function summarizeMinuteResearchError(error: unknown, maxLength = 480) {
  const fallback = error instanceof Error ? error.message : String(error);
  const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : "";
  const message = (cause || fallback).replace(/\s+/g, " ").trim() || "1분봉 연구 실행 중 알 수 없는 오류가 발생했습니다.";
  const limit = Math.max(80, Math.floor(maxLength));
  return message.length <= limit ? message : `${message.slice(0, limit - 1)}…`;
}

function yieldMinuteResearchEventLoop() {
  return new Promise<void>(resolve => setImmediate(resolve));
}

export function isMinuteResearchSweepStale(input: { status: string; startedAt: Date; updatedAt: Date }, now = new Date()) {
  if (input.status !== "running") return false;
  const latestActivity = Math.max(input.startedAt.getTime(), input.updatedAt.getTime());
  return now.getTime() - latestActivity >= STALE_SWEEP_AFTER_MS;
}

function collectRuleTypes(root: unknown): EvolutionRuleType[] {
  if (!root || typeof root !== "object") return [];
  if ("children" in root && Array.isArray((root as { children?: unknown[] }).children)) return (root as { children: unknown[] }).children.flatMap(collectRuleTypes);
  const type = (root as { type?: unknown }).type;
  return typeof type === "string" && MINUTE_RULE_TYPES.includes(type as EvolutionRuleType) ? [type as EvolutionRuleType] : [];
}

function commonSurvivorRuleTypes(candidates: Array<{ rootGenomeJson: unknown }>): EvolutionRuleType[] {
  const counts = new Map<EvolutionRuleType, number>();
  for (const candidate of candidates) for (const type of Array.from(new Set(collectRuleTypes(candidate.rootGenomeJson)))) counts.set(type, (counts.get(type) ?? 0) + 1);
  const ranked = Array.from(counts.entries()).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])).map(([type]) => type);
  return ranked.length ? ranked.slice(0, Math.min(3, ranked.length)) : ["macd_rising", "ma_position", "rsi"];
}

function flattenStrategyRules(root: unknown): unknown[] {
  if (!root || typeof root !== "object") return [];
  const node = root as { type?: unknown; children?: unknown[] };
  if (Array.isArray(node.children)) return node.children.flatMap(flattenStrategyRules);
  return typeof node.type === "string" ? [node] : [];
}

export type MinuteResearchMetrics = {
  tradeCount: number;
  winRate: number;
  netReturnPercent: number;
  expectancyPercent: number;
  maxDrawdownPercent: number;
  profitFactor: number | null;
  positiveDayRate?: number;
  dailyReturnStdDev?: number;
};

type DailyMetric = MinuteResearchMetrics & { tradingDate: string; symbolCount: number };
type SymbolMetric = MinuteResearchMetrics & { tradingDate: string; symbol: string; regime: "trend_up" | "trend_down" | "range" | "volatile" };
export type StoredMinuteResearchBar = Pick<typeof intradayMinuteBars.$inferSelect, "tradingDate" | "symbol" | "minuteAt" | "open" | "high" | "low" | "close" | "volume">;

function mean(values: number[]) {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
}

function round(value: number) {
  return Number(value.toFixed(6));
}

function standardDeviation(values: number[]) {
  if (values.length < 2) return 0;
  const average = mean(values);
  return Math.sqrt(mean(values.map(value => (value - average) ** 2)));
}

export function summarizeMinuteTrades(trades: MinuteValidationTrade[]): MinuteResearchMetrics {
  const returns = trades.map(trade => trade.netReturnPercent);
  const wins = returns.filter(value => value > 0);
  const losses = returns.filter(value => value < 0);
  let cumulative = 0;
  let peak = 0;
  let maxDrawdown = 0;
  for (const value of returns) {
    cumulative += value;
    peak = Math.max(peak, cumulative);
    maxDrawdown = Math.min(maxDrawdown, cumulative - peak);
  }
  const grossProfit = wins.reduce((total, value) => total + value, 0);
  const grossLoss = Math.abs(losses.reduce((total, value) => total + value, 0));
  return {
    tradeCount: trades.length,
    winRate: trades.length ? round(wins.length / trades.length * 100) : 0,
    netReturnPercent: round(cumulative),
    expectancyPercent: round(mean(returns)),
    maxDrawdownPercent: round(maxDrawdown),
    profitFactor: grossLoss ? round(grossProfit / grossLoss) : grossProfit > 0 ? null : 0,
  };
}

function conditionBars(rows: StoredMinuteResearchBar[]): Record<string, Record<string, IntradayMinuteBar[]>> {
  return rows.reduce<Record<string, Record<string, IntradayMinuteBar[]>>>((all, row) => {
    const byDate = (all[row.tradingDate] ??= {});
    const bars = (byDate[row.symbol] ??= []);
    bars.push({ minuteAt: row.minuteAt, open: row.open, high: row.high, low: row.low, close: row.close, volume: Number(row.volume) });
    return all;
  }, {});
}

function pickLiquidSymbols(byDate: Record<string, Record<string, IntradayMinuteBar[]>>, maxSymbols: number): string[] {
  const turnover = new Map<string, number>();
  for (const barsBySymbol of Object.values(byDate)) {
    for (const [symbol, bars] of Object.entries(barsBySymbol)) {
      turnover.set(symbol, (turnover.get(symbol) ?? 0) + bars.reduce((total, bar) => total + bar.close * bar.volume, 0));
    }
  }
  return Array.from(turnover.entries()).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])).slice(0, maxSymbols).map(([symbol]) => symbol);
}

export function prepareStoredMinuteResearchDataset(rows: StoredMinuteResearchBar[], maxUniverseSymbols: number) {
  const byDate = conditionBars(rows);
  return {
    byDate,
    dates: Object.keys(byDate).sort(),
    symbols: pickLiquidSymbols(byDate, maxUniverseSymbols),
  };
}

function classifyMarketRegime(bars: IntradayMinuteBar[]): SymbolMetric["regime"] {
  if (!bars.length || bars[0]!.open <= 0) return "range";
  const open = bars[0]!.open;
  const close = bars.at(-1)!.close;
  const high = Math.max(...bars.map(bar => bar.high));
  const low = Math.min(...bars.map(bar => bar.low));
  const intradayRange = (high - low) / open * 100;
  const change = (close - open) / open * 100;
  if (intradayRange >= 5) return "volatile";
  if (change >= 1) return "trend_up";
  if (change <= -1) return "trend_down";
  return "range";
}

function evaluateDates(input: {
  expression: ConditionExpressionGroup;
  minimumScore: number;
  byDate: Record<string, Record<string, IntradayMinuteBar[]>>;
  dates: string[];
  symbols: string[];
  configuration: MinuteResearchConfiguration;
}): { metrics: MinuteResearchMetrics; daily: DailyMetric[]; symbols: SymbolMetric[] } {
  const symbols: SymbolMetric[] = [];
  const daily: DailyMetric[] = input.dates.map(tradingDate => {
    const trades = input.symbols.flatMap(symbol => {
      const bars = input.byDate[tradingDate]?.[symbol] ?? [];
      if (bars.length < 60) return [];
      const result = evaluateMinuteExpression({
        expression: input.expression,
        bars,
        minimumScore: input.minimumScore,
        policy: {
          stopLossPercent: input.configuration.stopLossPercent,
          takeProfitPercent: input.configuration.takeProfitPercent,
          maxHoldingBars: input.configuration.maxHoldingBars,
          feeRate: input.configuration.feeRate,
          slippageBps: input.configuration.slippageBps,
        },
      });
      symbols.push({ tradingDate, symbol, regime: classifyMarketRegime(bars), ...summarizeMinuteTrades(result.trades) });
      return result.trades;
    });
    return { tradingDate, symbolCount: input.symbols.length, ...summarizeMinuteTrades(trades) };
  });
  const allTradesMetrics: MinuteResearchMetrics = {
    tradeCount: daily.reduce((total, item) => total + item.tradeCount, 0),
    winRate: 0,
    netReturnPercent: round(daily.reduce((total, item) => total + item.netReturnPercent, 0)),
    expectancyPercent: 0,
    maxDrawdownPercent: 0,
    profitFactor: null as number | null,
  };
  const weighted = (field: "winRate" | "expectancyPercent") => allTradesMetrics.tradeCount
    ? round(daily.reduce((total, item) => total + item[field] * item.tradeCount, 0) / allTradesMetrics.tradeCount)
    : 0;
  allTradesMetrics.winRate = weighted("winRate");
  allTradesMetrics.expectancyPercent = weighted("expectancyPercent");
  let cumulative = 0;
  let peak = 0;
  for (const item of daily) {
    cumulative += item.netReturnPercent;
    peak = Math.max(peak, cumulative);
    allTradesMetrics.maxDrawdownPercent = Math.min(allTradesMetrics.maxDrawdownPercent, cumulative - peak);
  }
  const profitableDays = daily.filter(item => item.netReturnPercent > 0).reduce((total, item) => total + item.netReturnPercent, 0);
  const losingDays = Math.abs(daily.filter(item => item.netReturnPercent < 0).reduce((total, item) => total + item.netReturnPercent, 0));
  allTradesMetrics.profitFactor = losingDays ? round(profitableDays / losingDays) : profitableDays > 0 ? null : 0;
  allTradesMetrics.maxDrawdownPercent = round(allTradesMetrics.maxDrawdownPercent);
  const dailyReturns = daily.map(item => item.netReturnPercent);
  allTradesMetrics.positiveDayRate = daily.length ? round(daily.filter(item => item.netReturnPercent > 0).length / daily.length * 100) : 0;
  allTradesMetrics.dailyReturnStdDev = round(standardDeviation(dailyReturns));
  return { metrics: allTradesMetrics, daily, symbols };
}

function researchFitness(training: MinuteResearchMetrics, validation: MinuteResearchMetrics | null): number {
  const stability = training.tradeCount ? Math.min(1, training.tradeCount / 100) * 10 + (training.positiveDayRate ?? 0) * 0.12 - (training.dailyReturnStdDev ?? 0) * 4 - Math.abs(training.maxDrawdownPercent) * 4 : 0;
  const trainingProfitFactor = training.profitFactor ?? 3;
  const validationContribution = validation ? validation.expectancyPercent * 90 + validation.netReturnPercent * 0.2 + (validation.profitFactor ?? 3) * 6 - Math.abs(validation.maxDrawdownPercent) * 12 : -30;
  return round(training.expectancyPercent * 55 + training.winRate * 0.25 + training.netReturnPercent * 0.1 + trainingProfitFactor * 5 + stability + validationContribution);
}

export function qualificationReasons(input: { training: MinuteResearchMetrics; validation: MinuteResearchMetrics | null; config: MinuteResearchConfiguration }) {
  const reasons: string[] = [];
  if (!input.validation) reasons.push("독립 검증일이 부족합니다.");
  if (input.training.tradeCount < input.config.minimumTrades) reasons.push(`학습 거래 수 ${input.config.minimumTrades}건 미만입니다.`);
  if (input.training.expectancyPercent <= 0) reasons.push("학습 기대값이 0 이하입니다.");
  if ((input.training.profitFactor ?? 3) < 1) reasons.push("학습 손익비가 1 미만입니다.");
  if (input.training.maxDrawdownPercent < input.config.maxDrawdownPercent) reasons.push("학습 최대 낙폭 한도를 초과했습니다.");
  if ((input.training.positiveDayRate ?? 0) < 45) reasons.push("학습 양(+) 일수 비율이 45% 미만입니다.");
  if (input.validation) {
    if (input.validation.tradeCount < input.config.minimumValidationTrades) reasons.push(`독립 검증 거래 수 ${input.config.minimumValidationTrades}건 미만입니다.`);
    if (input.validation.expectancyPercent <= 0) reasons.push("독립 검증 기대값이 0 이하입니다.");
    if ((input.validation.profitFactor ?? 3) < 1) reasons.push("독립 검증 손익비가 1 미만입니다.");
    if (input.validation.netReturnPercent <= 0) reasons.push("독립 검증 누적 수익률이 0 이하입니다.");
    if (input.validation.maxDrawdownPercent < input.config.maxDrawdownPercent) reasons.push("독립 검증 최대 낙폭 한도를 초과했습니다.");
    if ((input.validation.positiveDayRate ?? 0) < 45) reasons.push("독립 검증 양(+) 일수 비율이 45% 미만입니다.");
  }
  return reasons;
}

function datasetFingerprint(rows: Array<typeof intradayMinuteBars.$inferSelect>) {
  const material = rows.map(row => `${row.tradingDate}|${row.symbol}|${row.minuteAt.toISOString()}|${row.rawFingerprint}`).join("\n");
  return createHash("sha256").update(material).digest("hex");
}

export async function runMinuteResearchSweep(programId: number) {
  const db = await getDb();
  if (!db) throw new Error("1분봉 연구 데이터베이스를 사용할 수 없습니다.");
  const program = (await db.select().from(minuteResearchPrograms).where(eq(minuteResearchPrograms.id, programId)).limit(1))[0];
  if (!program) throw new Error("1분봉 연구 프로그램을 찾을 수 없습니다.");
  if (program.status !== "active") return { status: "paused" as const, programId: program.id };
  const configuration = { ...DEFAULT_MINUTE_RESEARCH_CONFIGURATION, ...(program.configurationJson as Partial<MinuteResearchConfiguration>) };
  const dateRows = await db.selectDistinct({ tradingDate: intradayMinuteBars.tradingDate }).from(intradayMinuteBars).orderBy(desc(intradayMinuteBars.tradingDate)).limit(configuration.lookbackTradingDays);
  const dates = dateRows.map(row => row.tradingDate).sort();
  if (!dates.length) {
    await db.update(minuteResearchPrograms).set({ lastError: "수집된 1분봉 데이터가 없어 연구를 시작하지 않았습니다." }).where(eq(minuteResearchPrograms.id, program.id));
    return { status: "waiting_for_data" as const, programId: program.id };
  }
  const rows = await db.select().from(intradayMinuteBars).where(inArray(intradayMinuteBars.tradingDate, dates)).orderBy(asc(intradayMinuteBars.tradingDate), asc(intradayMinuteBars.symbol), asc(intradayMinuteBars.minuteAt));
  const fingerprint = datasetFingerprint(rows);
  const configurationFingerprint = createHash("sha256").update(JSON.stringify(configuration)).digest("hex").slice(0, 16);
  const runKey = `minute-v1:${program.id}:${dates.at(-1)}:${fingerprint.slice(0, 16)}:${configurationFingerprint}`;
  let existing = (await db.select().from(minuteResearchSweeps).where(eq(minuteResearchSweeps.runKey, runKey)).limit(1))[0];
  if (existing?.status === "completed") return { status: "reused" as const, programId: program.id, sweepId: existing.id, generatedCount: existing.generatedCount, promotedCount: existing.promotedCount };
  if (existing?.status === "running") {
    if (!isMinuteResearchSweepStale(existing)) return { status: "running" as const, programId: program.id, sweepId: existing.id, generatedCount: existing.generatedCount, promotedCount: existing.promotedCount };
    const staleMessage = "분석 실행이 10분 이상 갱신되지 않아 중단 처리했습니다. 배틀을 다시 시작하면 같은 실제 데이터로 재검증합니다.";
    await db.update(minuteResearchSweeps).set({ status: "failed", lastError: staleMessage, completedAt: new Date() }).where(eq(minuteResearchSweeps.id, existing.id));
    existing = { ...existing, status: "failed", lastError: staleMessage, completedAt: new Date(), updatedAt: new Date() };
  }
  let sweep = existing;
  if (!sweep) {
    const [created] = await db.insert(minuteResearchSweeps).values({ programId: program.id, runKey, tradingDatesJson: dates, datasetFingerprint: fingerprint, configurationJson: configuration, status: "running" }).returning();
    sweep = (await db.select().from(minuteResearchSweeps).where(eq(minuteResearchSweeps.id, created.id)).limit(1))[0];
  }
  if (!sweep) throw new Error("1분봉 연구 실행 기록을 만들지 못했습니다.");
  try {
    const dataset = prepareStoredMinuteResearchDataset(rows, configuration.maxUniverseSymbols);
    const { byDate, symbols } = dataset;
    if (!symbols.length) throw new Error("평가 가능한 1분봉 종목이 없습니다.");
    const validationCount = dates.length >= 4 ? Math.min(configuration.validationTradingDays, Math.max(1, Math.floor(dates.length / 3))) : 0;
    const validationDates = validationCount ? dates.slice(-validationCount) : [];
    const trainingDates = validationCount ? dates.slice(0, -validationCount) : dates;
    const seed = Number.parseInt(createHash("sha256").update(runKey).digest("hex").slice(0, 8), 16) || 1;
    const previousSurvivors = program.lastSweepId
      ? await db.select().from(minuteResearchCandidates).where(and(eq(minuteResearchCandidates.sweepId, program.lastSweepId), eq(minuteResearchCandidates.status, "promoted"))).limit(1_000)
      : [];
    const commonRuleTypes = commonSurvivorRuleTypes(previousSurvivors);
    const diverseRandom = configuration.explorationMode === "diverse_random";
    const genomes = generateUniqueGenomes({
      seed,
      populationSize: configuration.combinationsPerSweep,
      minRules: diverseRandom ? 10 : Math.max(2, commonRuleTypes.length),
      maxRules: diverseRandom ? 12 : 5,
      maxDepth: 3,
      allowedRuleTypes: MINUTE_RULE_TYPES,
      requiredRuleTypes: diverseRandom ? [] : commonRuleTypes,
      requireUniqueRuleTypes: diverseRandom,
    });
    await db.update(minuteResearchSweeps).set({ generatedCount: genomes.length, evaluatedCount: 0, promotedCount: 0, rejectedCount: 0, lastError: null }).where(eq(minuteResearchSweeps.id, sweep.id));
    let promotedCount = 0;
    let rejectedCount = 0;
    let autoCollectedCount = 0;
    const promotedEvidence: Array<{ candidateId: number; daily: DailyMetric[]; symbols: SymbolMetric[] }> = [];
    for (let offset = 0; offset < genomes.length; offset += MINUTE_RESEARCH_EVALUATION_BATCH_SIZE) {
      const evaluated = genomes.slice(offset, offset + MINUTE_RESEARCH_EVALUATION_BATCH_SIZE).map(genome => {
        const expression = genome.root as unknown as ConditionExpressionGroup;
        const training = evaluateDates({ expression, minimumScore: genome.minimumScore, byDate, dates: trainingDates, symbols, configuration });
        const validation = validationDates.length ? evaluateDates({ expression, minimumScore: genome.minimumScore, byDate, dates: validationDates, symbols, configuration }) : null;
        const reasons = qualificationReasons({ training: training.metrics, validation: validation?.metrics ?? null, config: configuration });
        const status = !validation ? "insufficient_validation" as const : reasons.length ? "rejected" as const : "promoted" as const;
        if (status === "promoted") promotedCount += 1; else rejectedCount += 1;
        const strategyFingerprint = genome.fingerprint;
        const resultFingerprint = fingerprintResearchGenome({ root: genome.root, minimumScore: genome.minimumScore, datasetVersionKey: fingerprint, assumptions: configuration });
        return { genome, training, validation, reasons, status, strategyFingerprint, resultFingerprint, fitnessScore: researchFitness(training.metrics, validation?.metrics ?? null) };
      });
      const inserted = await db.insert(minuteResearchCandidates).values(evaluated.map(item => ({
        sweepId: sweep!.id,
        strategyFingerprint: item.strategyFingerprint,
        fingerprint: item.resultFingerprint,
        rootGenomeJson: item.genome.root,
        minimumScore: item.genome.minimumScore,
        status: item.status,
        fitnessScore: String(item.fitnessScore),
        tradeCount: item.training.metrics.tradeCount,
        winRate: String(item.training.metrics.winRate),
        netReturnPercent: String(item.training.metrics.netReturnPercent),
        expectancyPercent: String(item.training.metrics.expectancyPercent),
        maxDrawdownPercent: String(item.training.metrics.maxDrawdownPercent),
        validationTradeCount: item.validation?.metrics.tradeCount ?? 0,
        validationReturnPercent: String(item.validation?.metrics.netReturnPercent ?? 0),
        validationExpectancyPercent: String(item.validation?.metrics.expectancyPercent ?? 0),
        validationMaxDrawdownPercent: String(item.validation?.metrics.maxDrawdownPercent ?? 0),
        inSampleMetricsJson: { dates: trainingDates, symbols, metrics: item.training.metrics },
        outOfSampleMetricsJson: item.validation ? { dates: validationDates, symbols, metrics: item.validation.metrics } : null,
        qualificationJson: { eligible: item.status === "promoted", reasons: item.reasons, requirements: { minimumTrades: configuration.minimumTrades, minimumValidationTrades: configuration.minimumValidationTrades, maxDrawdownPercent: configuration.maxDrawdownPercent, minimumProfitFactor: 1, slippageBps: configuration.slippageBps } },
      }))).returning();
      evaluated.forEach((item, index) => {
        if (item.status === "promoted" && inserted[index]) promotedEvidence.push({
          candidateId: inserted[index]!.id,
          daily: [...item.training.daily, ...(item.validation?.daily ?? [])],
          symbols: [...item.training.symbols, ...(item.validation?.symbols ?? [])],
        });
      });
      for (const [index, item] of Array.from(evaluated.entries())) {
        const candidateId = inserted[index]?.id;
        if (item.status !== "promoted" || !candidateId) continue;
        const [preset] = await db.insert(strategyPresets).values({
          userId: program.userId,
          name: `아레나 생존 카드 · ${item.strategyFingerprint.slice(0, 8)}`,
          description: `스윕 ${sweep!.id}의 실제 1분봉 독립 검증을 통과해 자동 수집된 전략 카드`,
          rulesJson: flattenStrategyRules(item.genome.root),
          scoringJson: item.genome.root,
          isActive: false,
        }).returning();
        await db.update(minuteResearchCandidates).set({ collectedPresetId: preset.id }).where(eq(minuteResearchCandidates.id, candidateId));
        autoCollectedCount += 1;
      }
      await db.update(minuteResearchSweeps).set({
        generatedCount: genomes.length,
        evaluatedCount: Math.min(genomes.length, offset + evaluated.length),
        promotedCount,
        rejectedCount,
      }).where(eq(minuteResearchSweeps.id, sweep.id));
      await yieldMinuteResearchEventLoop();
    }
    const dailyRows = promotedEvidence.flatMap(item => item.daily.map(day => ({
        sweepId: sweep!.id,
        candidateId: item.candidateId,
        tradingDate: day.tradingDate,
        symbolCount: day.symbolCount,
        tradeCount: day.tradeCount,
        winRate: String(day.winRate),
        netReturnPercent: String(day.netReturnPercent),
        expectancyPercent: String(day.expectancyPercent),
        maxDrawdownPercent: String(day.maxDrawdownPercent),
        metricsJson: day,
      })));
    for (let offset = 0; offset < dailyRows.length; offset += 1_000) {
      await db.insert(minuteResearchDailyMetrics).values(dailyRows.slice(offset, offset + 1_000));
    }
    const symbolRows = promotedEvidence.flatMap(item => item.symbols.map(symbolMetric => ({
      sweepId: sweep!.id,
      candidateId: item.candidateId,
      tradingDate: symbolMetric.tradingDate,
      symbol: symbolMetric.symbol,
      regime: symbolMetric.regime,
      tradeCount: symbolMetric.tradeCount,
      winRate: String(symbolMetric.winRate),
      netReturnPercent: String(symbolMetric.netReturnPercent),
      expectancyPercent: String(symbolMetric.expectancyPercent),
      maxDrawdownPercent: String(symbolMetric.maxDrawdownPercent),
      metricsJson: symbolMetric,
    })));
    for (let offset = 0; offset < symbolRows.length; offset += 1_000) {
      await db.insert(minuteResearchSymbolMetrics).values(symbolRows.slice(offset, offset + 1_000));
    }
    const summary = { tradingDates: dates, trainingDates, validationDates, symbolCount: symbols.length, symbols, generatedCount: genomes.length, promotedCount, rejectedCount, autoCollectedCount, slippageBps: configuration.slippageBps, explorationMode: configuration.explorationMode, commonRuleTypes, qualificationRule: "독립 검증 기대값·누적 수익률·손익비가 양수이고, 표본·낙폭·안정성 기준을 통과한 조건식만 승격" };
    await db.update(minuteResearchSweeps).set({ status: "completed", generatedCount: genomes.length, evaluatedCount: genomes.length, promotedCount, rejectedCount, summaryJson: summary, lastError: null, completedAt: new Date() }).where(eq(minuteResearchSweeps.id, sweep.id));
    await db.update(minuteResearchPrograms).set({ lastSweepId: sweep.id, lastError: null }).where(eq(minuteResearchPrograms.id, program.id));
    return { status: "completed" as const, programId: program.id, sweepId: sweep.id, ...summary };
  } catch (error) {
    const message = summarizeMinuteResearchError(error);
    await db.update(minuteResearchSweeps).set({ status: "failed", lastError: message, completedAt: new Date() }).where(eq(minuteResearchSweeps.id, sweep.id));
    await db.update(minuteResearchPrograms).set({ lastError: message }).where(eq(minuteResearchPrograms.id, program.id));
    throw error;
  }
}

export async function getMinuteResearchDashboard(userId: number) {
  const db = await getDb();
  if (!db) return { program: null, sweeps: [], promoted: [], cumulative: [], commonRuleTypes: [], distribution: null, failureReasons: [], regimePerformance: [], symbolPerformance: [], dataCoverage: null };
  const program = (await db.select().from(minuteResearchPrograms).where(eq(minuteResearchPrograms.userId, userId)).limit(1))[0] ?? null;
  const sweeps = program ? await db.select().from(minuteResearchSweeps).where(eq(minuteResearchSweeps.programId, program.id)).orderBy(desc(minuteResearchSweeps.updatedAt)).limit(12) : [];
  const candidateRows = sweeps.length ? await db.select().from(minuteResearchCandidates).where(inArray(minuteResearchCandidates.sweepId, sweeps.map(item => item.id))).orderBy(desc(minuteResearchCandidates.fitnessScore)).limit(500) : [];
  const latestSweep = sweeps[0] ?? null;
  const latestCandidates = latestSweep ? await db.select().from(minuteResearchCandidates).where(eq(minuteResearchCandidates.sweepId, latestSweep.id)).orderBy(desc(minuteResearchCandidates.fitnessScore)).limit(10_000) : [];
  type MinuteResearchCandidate = typeof minuteResearchCandidates.$inferSelect;
  const promoted: MinuteResearchCandidate[] = candidateRows.filter(item => item.status === "promoted").slice(0, 40);
  const grouped = new Map<string, MinuteResearchCandidate[]>();
  for (const candidate of candidateRows.filter(item => item.status === "promoted")) {
    const records = grouped.get(candidate.strategyFingerprint) ?? [];
    records.push(candidate);
    grouped.set(candidate.strategyFingerprint, records);
  }
  const cumulative = Array.from(grouped.entries()).map(([strategyFingerprint, records]) => ({
    strategyFingerprint,
    verifiedSweepCount: records.length,
    averageFitness: round(mean(records.map(item => Number(item.fitnessScore)))),
    averageValidationReturnPercent: round(mean(records.map(item => Number(item.validationReturnPercent)))),
    averageValidationExpectancyPercent: round(mean(records.map(item => Number(item.validationExpectancyPercent)))),
    worstValidationMaxDrawdownPercent: round(Math.min(...records.map(item => Number(item.validationMaxDrawdownPercent)))),
    totalValidationTrades: records.reduce((total, item) => total + item.validationTradeCount, 0),
    representative: records[0]!,
  })).sort((left, right) => right.verifiedSweepCount - left.verifiedSweepCount || right.averageFitness - left.averageFitness).slice(0, 20);
  const statusCounts = latestCandidates.reduce<Record<string, number>>((all, candidate) => ({ ...all, [candidate.status]: (all[candidate.status] ?? 0) + 1 }), {});
  const buckets = [
    { label: "≤ -2%", match: (value: number) => value <= -2 },
    { label: "-2% ~ 0%", match: (value: number) => value > -2 && value <= 0 },
    { label: "0% ~ 2%", match: (value: number) => value > 0 && value <= 2 },
    { label: "2% 초과", match: (value: number) => value > 2 },
  ].map(bucket => ({ label: bucket.label, count: latestCandidates.filter(candidate => bucket.match(Number(candidate.validationReturnPercent))).length }));
  const reasonCounts = new Map<string, number>();
  for (const candidate of latestCandidates.filter(candidate => candidate.status !== "promoted")) {
    const reasons = ((candidate.qualificationJson as { reasons?: unknown } | null)?.reasons ?? []) as unknown[];
    for (const reason of reasons) if (typeof reason === "string") reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
  }
  const failureReasons = Array.from(reasonCounts.entries()).map(([reason, count]) => ({ reason, count })).sort((left, right) => right.count - left.count).slice(0, 6);
  const symbolMetrics = promoted.length ? await db.select().from(minuteResearchSymbolMetrics).where(inArray(minuteResearchSymbolMetrics.candidateId, promoted.map(candidate => candidate.id))).limit(10_000) : [];
  const regimePerformance = ["trend_up", "trend_down", "range", "volatile"].map(regime => {
    const rows = symbolMetrics.filter(row => row.regime === regime);
    return {
      regime,
      observationCount: rows.length,
      tradeCount: rows.reduce((total, row) => total + row.tradeCount, 0),
      averageReturnPercent: round(mean(rows.map(row => Number(row.netReturnPercent)))),
      averageExpectancyPercent: round(mean(rows.map(row => Number(row.expectancyPercent)))),
      worstDrawdownPercent: rows.length ? round(Math.min(...rows.map(row => Number(row.maxDrawdownPercent)))) : null,
    };
  });
  const symbolGroups = new Map<string, typeof symbolMetrics>();
  for (const row of symbolMetrics) {
    const records = symbolGroups.get(row.symbol) ?? [];
    records.push(row);
    symbolGroups.set(row.symbol, records);
  }
  const symbolPerformance = Array.from(symbolGroups.entries()).map(([symbol, rows]) => ({
    symbol,
    observationCount: rows.length,
    tradeCount: rows.reduce((total, row) => total + row.tradeCount, 0),
    averageReturnPercent: round(mean(rows.map(row => Number(row.netReturnPercent)))),
    averageExpectancyPercent: round(mean(rows.map(row => Number(row.expectancyPercent)))),
    worstDrawdownPercent: round(Math.min(...rows.map(row => Number(row.maxDrawdownPercent)))),
  })).sort((left, right) => right.observationCount - left.observationCount || right.averageReturnPercent - left.averageReturnPercent).slice(0, 20);
  const coverage = await db.selectDistinct({ tradingDate: intradayMinuteBars.tradingDate }).from(intradayMinuteBars).orderBy(desc(intradayMinuteBars.tradingDate)).limit(30);
  const commonRuleTypes = commonSurvivorRuleTypes(promoted);
  return { program, sweeps, promoted, cumulative, commonRuleTypes, distribution: latestSweep ? { statusCounts, buckets, candidateCount: latestCandidates.length } : null, failureReasons, regimePerformance, symbolPerformance, dataCoverage: coverage.length ? { tradingDateCount: coverage.length, firstDate: coverage.at(-1)?.tradingDate ?? null, lastDate: coverage[0]?.tradingDate ?? null } : null };
}

export async function getPublicMinuteResearchDashboard() {
  const db = await getDb();
  if (!db) return { program: null, sweeps: [], promoted: [], cumulative: [], commonRuleTypes: [], distribution: null, failureReasons: [], regimePerformance: [], symbolPerformance: [], dataCoverage: null };
  const program = (await db.select().from(minuteResearchPrograms).orderBy(desc(minuteResearchPrograms.updatedAt)).limit(1))[0];
  return program ? getMinuteResearchDashboard(program.userId) : { program: null, sweeps: [], promoted: [], cumulative: [], commonRuleTypes: [], distribution: null, failureReasons: [], regimePerformance: [], symbolPerformance: [], dataCoverage: null };
}

export async function getMinuteResearchProgramByTaskUid(taskUid: string) {
  const db = await getDb();
  if (!db) return null;
  return (await db.select().from(minuteResearchPrograms).where(and(eq(minuteResearchPrograms.scheduleCronTaskUid, taskUid), eq(minuteResearchPrograms.status, "active"))).limit(1))[0] ?? null;
}

const queuedMinuteResearchSweeps = new Map<number, Promise<void>>();

/**
 * 대량 조건식 검증은 tRPC 응답을 먼저 반환한 뒤 다음 이벤트 루프에서 시작한다.
 * 같은 프로그램의 중복 클릭은 이미 접수된 작업을 재사용한다.
 */
export function enqueueMinuteResearchSweep(programId: number, runner: (id: number) => Promise<unknown> = runMinuteResearchSweep) {
  if (queuedMinuteResearchSweeps.has(programId)) return { status: "queued" as const, programId, reused: true };
  const task = new Promise<void>(resolve => setTimeout(resolve, 0))
    .then(() => runner(programId))
    .catch(error => console.error(`[MinuteResearch] background sweep ${programId} failed`, error))
    .then(() => undefined)
    .finally(() => { queuedMinuteResearchSweeps.delete(programId); });
  queuedMinuteResearchSweeps.set(programId, task);
  return { status: "queued" as const, programId, reused: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// 역대 Top 50 랭킹 + 누적 지표 통계
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 역대 전체 배틀에서 fitnessScore가 가장 높은 상위 50개 후보를 반환한다.
 * promoted 상태인 후보만 집계한다 (검증 통과 결과만 의미가 있으므로).
 */
export async function getAllTimeTopRanking(userId: number, limit = 50) {
  const db = await getDb();
  if (!db) return { ranking: [], totalPromotedCount: 0 };

  const program = (await db.select().from(minuteResearchPrograms).where(eq(minuteResearchPrograms.userId, userId)).limit(1))[0];
  if (!program) return { ranking: [], totalPromotedCount: 0 };

  const sweepIds = (await db.select({ id: minuteResearchSweeps.id }).from(minuteResearchSweeps).where(eq(minuteResearchSweeps.programId, program.id))).map(s => s.id);
  if (!sweepIds.length) return { ranking: [], totalPromotedCount: 0 };

  const allPromoted = await db.select().from(minuteResearchCandidates)
    .where(and(
      inArray(minuteResearchCandidates.sweepId, sweepIds),
      eq(minuteResearchCandidates.status, "promoted"),
    ))
    .orderBy(desc(minuteResearchCandidates.fitnessScore))
    .limit(limit);

  // Total count for stats
  const totalPromotedRows = await db.select({ id: minuteResearchCandidates.id }).from(minuteResearchCandidates)
    .where(and(
      inArray(minuteResearchCandidates.sweepId, sweepIds),
      eq(minuteResearchCandidates.status, "promoted"),
    ));

  const ranking = allPromoted.map((candidate, index) => ({
    rank: index + 1,
    candidateId: candidate.id,
    sweepId: candidate.sweepId,
    strategyFingerprint: candidate.strategyFingerprint,
    fitnessScore: Number(candidate.fitnessScore),
    winRate: Number(candidate.winRate),
    netReturnPercent: Number(candidate.netReturnPercent),
    validationReturnPercent: Number(candidate.validationReturnPercent),
    validationExpectancyPercent: Number(candidate.validationExpectancyPercent),
    validationMaxDrawdownPercent: Number(candidate.validationMaxDrawdownPercent),
    tradeCount: candidate.tradeCount,
    validationTradeCount: candidate.validationTradeCount,
    rootGenomeJson: candidate.rootGenomeJson,
    createdAt: candidate.createdAt,
  }));

  return { ranking, totalPromotedCount: totalPromotedRows.length };
}

/**
 * 역대 promoted 후보의 rootGenomeJson에서 규칙 타입별 등장 빈도·평균 성과를 집계한다.
 * "어떤 지표(RSI, MACD 등)가 상위 조건식에 가장 많이 등장했는가" 질문에 답한다.
 */
export async function getCumulativeIndicatorStats(userId: number) {
  const db = await getDb();
  if (!db) return { indicators: [], pairs: [], totalCandidates: 0 };

  const program = (await db.select().from(minuteResearchPrograms).where(eq(minuteResearchPrograms.userId, userId)).limit(1))[0];
  if (!program) return { indicators: [], pairs: [], totalCandidates: 0 };

  const sweepIds = (await db.select({ id: minuteResearchSweeps.id }).from(minuteResearchSweeps).where(eq(minuteResearchSweeps.programId, program.id))).map(s => s.id);
  if (!sweepIds.length) return { indicators: [], pairs: [], totalCandidates: 0 };

  // Get all promoted candidates across all sweeps
  const promoted = await db.select().from(minuteResearchCandidates)
    .where(and(
      inArray(minuteResearchCandidates.sweepId, sweepIds),
      eq(minuteResearchCandidates.status, "promoted"),
    ))
    .orderBy(desc(minuteResearchCandidates.fitnessScore))
    .limit(500);

  if (!promoted.length) return { indicators: [], pairs: [], totalCandidates: 0 };

  // Rule type frequency and performance
  const ruleStats = new Map<string, { count: number; totalWinRate: number; totalReturn: number; totalFitness: number }>();

  for (const candidate of promoted) {
    const rules = collectRuleTypes(candidate.rootGenomeJson);
    for (const ruleType of rules) {
      const stat = ruleStats.get(ruleType) ?? { count: 0, totalWinRate: 0, totalReturn: 0, totalFitness: 0 };
      stat.count += 1;
      stat.totalWinRate += Number(candidate.winRate);
      stat.totalReturn += Number(candidate.validationReturnPercent);
      stat.totalFitness += Number(candidate.fitnessScore);
      ruleStats.set(ruleType, stat);
    }
  }

  const indicators = Array.from(ruleStats.entries())
    .map(([type, stat]) => ({
      type,
      count: stat.count,
      frequency: round(stat.count / promoted.length * 100),
      avgWinRate: round(stat.totalWinRate / stat.count),
      avgReturnPercent: round(stat.totalReturn / stat.count),
      avgFitnessScore: round(stat.totalFitness / stat.count),
    }))
    .sort((a, b) => b.count - a.count);

  // Rule pair co-occurrence in top performers
  const pairMap = new Map<string, { count: number; totalReturn: number; totalWinRate: number }>();
  for (const candidate of promoted) {
    const rules = Array.from(new Set(collectRuleTypes(candidate.rootGenomeJson))).sort();
    for (let i = 0; i < rules.length; i++) {
      for (let j = i + 1; j < rules.length; j++) {
        const key = `${rules[i]}|${rules[j]}`;
        const stat = pairMap.get(key) ?? { count: 0, totalReturn: 0, totalWinRate: 0 };
        stat.count += 1;
        stat.totalReturn += Number(candidate.validationReturnPercent);
        stat.totalWinRate += Number(candidate.winRate);
        pairMap.set(key, stat);
      }
    }
  }

  const pairs = Array.from(pairMap.entries())
    .map(([key, stat]) => ({
      pair: key.split("|") as [string, string],
      count: stat.count,
      avgReturnPercent: round(stat.totalReturn / stat.count),
      avgWinRate: round(stat.totalWinRate / stat.count),
    }))
    .filter(p => p.count >= 3)
    .sort((a, b) => b.avgReturnPercent - a.avgReturnPercent || b.count - a.count)
    .slice(0, 10);

  return { indicators, pairs, totalCandidates: promoted.length };
}
