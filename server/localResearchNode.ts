import { timingSafeEqual } from "crypto";
import { createHash } from "node:crypto";
import type { Express, Request } from "express";
import { and, asc, count, desc, eq, inArray, like, ne, sql } from "drizzle-orm";
import { autoTradePolicies, autonomousResearchBars, autonomousResearchCandidates, autonomousResearchRuns, dayTradeExperimentPositions, dayTradeExperiments, intradayMinuteBars, kiwoomTerminalConnectionChecks, localMinuteCollectionRequests, localResearchDailyBars, localResearchNodeSyncEvents, orderExecutions, orderIntents, positionSnapshots, researchDailyBars, researchDatasets, researchFiveMinuteBars, sharedDatasetCollectionRequests, tradingProfiles, users } from "../drizzle/schema";
import { calculateDayTradePortfolio } from "../shared/dayTradePortfolio";
import { getDb } from "./db";
import { publicHistoricalBacktest } from "./quant/publicHistoricalBacktest";
import { evaluateExpression } from "./quant/conditions";
import { persistDayTradeExperiment } from "./quant/dayTradeHistory";
import type { ConditionExpressionGroup } from "../shared/trading";

const RESEARCH_NODE_TOKEN_HEADER = "x-research-node-token";
const TERMINAL_CONNECTION_HANDLER_VERSION = "terminal-sync-owner-fallback-v2";

type TerminalConnectionVerification = {
  oauth: "passed" | "failed" | "not_run";
  apiRead: "passed" | "failed" | "not_run";
  serviceSync: "passed" | "failed" | "pending" | "not_run";
  serviceReadBack: "passed" | "failed" | "pending" | "not_run";
  apiId?: string;
  responseRows?: number;
};

function normalizeTerminalConnectionVerification(value: unknown): TerminalConnectionVerification | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const oauth = String(record.oauth ?? ""); const apiRead = String(record.apiRead ?? ""); const serviceSync = String(record.serviceSync ?? ""); const serviceReadBack = String(record.serviceReadBack ?? "");
  if (!["passed", "failed", "not_run"].includes(oauth) || !["passed", "failed", "not_run"].includes(apiRead) || !["passed", "failed", "pending", "not_run"].includes(serviceSync) || !["passed", "failed", "pending", "not_run"].includes(serviceReadBack)) return null;
  return { oauth: oauth as TerminalConnectionVerification["oauth"], apiRead: apiRead as TerminalConnectionVerification["apiRead"], serviceSync: serviceSync as TerminalConnectionVerification["serviceSync"], serviceReadBack: serviceReadBack as TerminalConnectionVerification["serviceReadBack"], apiId: typeof record.apiId === "string" && /^[a-z0-9]{2,32}$/i.test(record.apiId) ? record.apiId : undefined, responseRows: Number.isInteger(record.responseRows) && Number(record.responseRows) >= 0 ? Number(record.responseRows) : undefined };
}

function isTerminalRoundTripVerified(verification: TerminalConnectionVerification | null) {
  return Boolean(verification && verification.oauth === "passed" && verification.apiRead === "passed" && verification.serviceSync === "passed" && verification.serviceReadBack === "passed");
}

export type LocalAutoOrderSource = {
  candidateId: number;
  candidateFingerprint: string;
  symbol: string;
  name: string;
  referencePrice: number;
  signalCount: number;
  fitnessScore: number;
  dedupeKey?: string;
};

export type LocalIntradayQuote = {
  symbol: string;
  price: number;
  observedAt: Date;
};

export type LocalIntradayMinuteBar = {
  symbol: string;
  minuteAt: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type LocalDailyBar = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  turnover: number;
};

function koreanTradingDate(value: Date) {
  return new Date(value.getTime() + 9 * 60 * 60 * 1_000).toISOString().slice(0, 10);
}

export function shouldCloseIntradayExperiment(input: { tradingDate: string; capturedAt: Date }) {
  if (koreanTradingDate(input.capturedAt) !== input.tradingDate) return false;
  const koreanTime = new Date(input.capturedAt.getTime() + 9 * 60 * 60 * 1_000);
  const minuteOfDay = koreanTime.getUTCHours() * 60 + koreanTime.getUTCMinutes();
  return minuteOfDay >= 15 * 60 + 31;
}

export function selectClosedIntradayMinuteBars(input: { bars: LocalIntradayMinuteBar[]; tradingDate: string; capturedAt: Date }) {
  const closedBefore = new Date(input.capturedAt);
  closedBefore.setUTCSeconds(0, 0);
  const unique = new Map<string, LocalIntradayMinuteBar>();
  let rejected = 0;
  const rejectedReasons = { symbol: 0, price: 0, ohlc: 0, minuteAt: 0, unfinished: 0, tradingDate: 0 };
  input.bars.forEach(bar => {
    if (!/^\d{6}$/.test(bar.symbol)) { rejected += 1; rejectedReasons.symbol += 1; return; }
    if (!Number.isInteger(bar.open) || !Number.isInteger(bar.high) || !Number.isInteger(bar.low) || !Number.isInteger(bar.close) || !Number.isFinite(bar.volume) || bar.open < 1 || bar.high < 1 || bar.low < 1 || bar.close < 1 || bar.volume < 0) { rejected += 1; rejectedReasons.price += 1; return; }
    if (bar.low > Math.min(bar.open, bar.close) || bar.high < Math.max(bar.open, bar.close)) { rejected += 1; rejectedReasons.ohlc += 1; return; }
    if (Number.isNaN(bar.minuteAt.getTime()) || bar.minuteAt.getUTCSeconds() !== 0) { rejected += 1; rejectedReasons.minuteAt += 1; return; }
    if (bar.minuteAt >= closedBefore) { rejected += 1; rejectedReasons.unfinished += 1; return; }
    if (koreanTradingDate(bar.minuteAt) !== input.tradingDate) { rejected += 1; rejectedReasons.tradingDate += 1; return; }
    unique.set(`${bar.symbol}:${bar.minuteAt.toISOString()}`, bar);
  });
  return { bars: Array.from(unique.values()).sort((left, right) => left.symbol.localeCompare(right.symbol) || left.minuteAt.getTime() - right.minuteAt.getTime()), rejected, rejectedReasons };
}

function minuteBarFingerprint(bar: LocalIntradayMinuteBar) {
  return createHash("sha256").update(JSON.stringify({ symbol: bar.symbol, minuteAt: bar.minuteAt.toISOString(), open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume, source: "kiwoom_ka10080" })).digest("hex");
}

export function selectValidLocalDailyBars(input: { bars: LocalDailyBar[] }) {
  const unique = new Map<string, LocalDailyBar>();
  let rejected = 0;
  for (const bar of input.bars) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(bar.date)
      || ![bar.open, bar.high, bar.low, bar.close, bar.volume, bar.turnover].every(Number.isSafeInteger)
      || bar.open < 1 || bar.high < 1 || bar.low < 1 || bar.close < 1 || bar.volume < 0 || bar.turnover < 0
      || bar.low > Math.min(bar.open, bar.close) || bar.high < Math.max(bar.open, bar.close)) {
      rejected += 1;
      continue;
    }
    unique.set(bar.date, bar);
  }
  return {
    bars: Array.from(unique.values()).sort((left, right) => left.date.localeCompare(right.date)),
    rejected,
    deduplicated: Math.max(0, input.bars.length - rejected - unique.size),
  };
}

function dailyBarFingerprint(input: { symbol: string; adjustmentBasis: "adjusted" | "unadjusted"; bar: LocalDailyBar }) {
  return createHash("sha256").update(JSON.stringify({ symbol: input.symbol, adjustmentBasis: input.adjustmentBasis, ...input.bar, source: "kiwoom_ka10081" })).digest("hex");
}

function sharedDatasetDate(value: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
}

function selectSharedDatasetWindow(dates: string[], sampleDays: number, randomSeed: number) {
  const uniqueDates = Array.from(new Set(dates)).sort();
  const warmupBars = 60;
  const latestStart = uniqueDates.length - sampleDays;
  if (latestStart <= warmupBars) return null;
  const evaluationStartIndex = warmupBars + (randomSeed % (latestStart - warmupBars + 1));
  return { warmupBars, startDate: uniqueDates[evaluationStartIndex - warmupBars]!, evaluationStartDate: uniqueDates[evaluationStartIndex]!, endDate: uniqueDates[evaluationStartIndex + sampleDays - 1]! };
}

export function selectSharedCollectionPayload(input: { universe: Array<{ symbol: string; name: string }>; dailyBars: unknown[]; fiveMinuteBars: unknown[]; sampleDays: number; randomSeed: number }) {
  const allowedSymbols = new Set(input.universe.map(item => item.symbol));
  const dailyByKey = new Map<string, LocalDailyBar & { symbol: string }>();
  for (const raw of input.dailyBars) {
    const item = raw as Record<string, unknown>;
    const symbol = typeof item.symbol === "string" ? item.symbol.trim() : "";
    const candidate: LocalDailyBar = { date: typeof item.date === "string" ? item.date.trim() : "", open: Number(item.open), high: Number(item.high), low: Number(item.low), close: Number(item.close), volume: Number(item.volume), turnover: Number(item.turnover) };
    const bar = allowedSymbols.has(symbol) ? selectValidLocalDailyBars({ bars: [candidate] }).bars[0] : null;
    if (bar) dailyByKey.set(`${symbol}:${bar.date}`, { symbol, ...bar });
  }
  const dailyRows = Array.from(dailyByKey.values()).sort((left, right) => left.symbol.localeCompare(right.symbol) || left.date.localeCompare(right.date));
  const commonDates = input.universe.reduce<string[] | null>((shared, item) => {
    const dates = new Set(dailyRows.filter(bar => bar.symbol === item.symbol).map(bar => bar.date));
    return shared === null ? Array.from(dates) : shared.filter(date => dates.has(date));
  }, null) ?? [];
  const window = selectSharedDatasetWindow(commonDates, input.sampleDays, input.randomSeed);
  if (!window) return { error: "공용 데이터셋에는 모든 종목에서 60일 지표 구간과 평가 기간의 실제 일봉이 필요합니다." } as const;
  const selectedDailyBars = dailyRows.filter(bar => bar.date >= window.startDate && bar.date <= window.endDate);
  if (selectedDailyBars.length < input.universe.length * (window.warmupBars + input.sampleDays)) return { error: "선택된 공용 기간의 실제 일봉이 종목별로 충분하지 않습니다." } as const;
  const minuteByKey = new Map<string, { symbol: string; tradingDate: string; intervalAt: Date; open: number; high: number; low: number; close: number; volume: number }>();
  for (const raw of input.fiveMinuteBars) {
    const item = raw as Record<string, unknown>;
    const symbol = typeof item.symbol === "string" ? item.symbol.trim() : "";
    const intervalAt = typeof item.intervalAt === "string" ? new Date(item.intervalAt) : new Date(NaN);
    const open = Number(item.open); const high = Number(item.high); const low = Number(item.low); const close = Number(item.close); const volume = Number(item.volume);
    const tradingDate = Number.isNaN(intervalAt.getTime()) ? "" : sharedDatasetDate(intervalAt);
    if (!allowedSymbols.has(symbol) || !/^\d{4}-\d{2}-\d{2}$/.test(tradingDate) || tradingDate < window.evaluationStartDate || tradingDate > window.endDate || ![open, high, low, close, volume].every(Number.isSafeInteger) || open < 1 || high < 1 || low < 1 || close < 1 || volume < 0 || low > Math.min(open, close) || high < Math.max(open, close)) continue;
    minuteByKey.set(`${symbol}:${intervalAt.toISOString()}`, { symbol, tradingDate, intervalAt, open, high, low, close, volume });
  }
  const selectedFiveMinuteBars = Array.from(minuteByKey.values()).sort((left, right) => left.symbol.localeCompare(right.symbol) || left.intervalAt.getTime() - right.intervalAt.getTime());
  if (!selectedFiveMinuteBars.length) return { error: "선택된 평가 기간의 실제 5분봉이 없습니다." } as const;
  return { window, selectedDailyBars, selectedFiveMinuteBars } as const;
}

export function buildLocalDailyDatasetVersion(input: { symbol: string; adjustmentBasis: "adjusted" | "unadjusted"; bars: Array<{ date: string; rawFingerprint: string }> }) {
  const material = input.bars.slice().sort((left, right) => left.date.localeCompare(right.date)).map(bar => `${bar.date}:${bar.rawFingerprint}`).join("|");
  const sourceFingerprint = createHash("sha256").update(`${input.symbol}:${input.adjustmentBasis}:${material}`).digest("hex");
  const startDate = input.bars.map(bar => bar.date).sort()[0] ?? "unknown";
  const endDate = input.bars.map(bar => bar.date).sort().at(-1) ?? "unknown";
  return { sourceFingerprint, versionKey: `local-ka10081:${input.adjustmentBasis}:${input.symbol}:${startDate}:${endDate}:${sourceFingerprint.slice(0, 16)}` };
}

export function buildLocalDailyUniverseDatasetVersion(input: { symbols: string[]; adjustmentBasis: "adjusted" | "unadjusted"; bars: Array<{ symbol: string; date: string; rawFingerprint: string }> }) {
  const material = input.bars.slice().sort((left, right) => left.symbol.localeCompare(right.symbol) || left.date.localeCompare(right.date)).map(bar => `${bar.symbol}:${bar.date}:${bar.rawFingerprint}`).join("|");
  const sourceFingerprint = createHash("sha256").update(`${input.symbols.slice().sort().join(",")}:${input.adjustmentBasis}:${material}`).digest("hex");
  const dates = input.bars.map(bar => bar.date).sort();
  return { sourceFingerprint, versionKey: `local-ka10081:${input.adjustmentBasis}:universe:${dates[0] ?? "unknown"}:${dates.at(-1) ?? "unknown"}:${sourceFingerprint.slice(0, 16)}` };
}

export function selectLocalDailyCollectionUniverse(runs: Array<{ universeJson: unknown }>, limit = 20) {
  for (const run of runs) {
    let raw: unknown = run.universeJson;
    if (typeof raw === "string") {
      try { raw = JSON.parse(raw) as unknown; } catch { raw = []; }
    }
    if (!Array.isArray(raw)) continue;
    const unique = new Map<string, { symbol: string; name: string }>();
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const record = item as { symbol?: unknown; name?: unknown };
      const symbol = typeof record.symbol === "string" ? record.symbol.trim() : "";
      if (!/^\d{6}$/.test(symbol) || unique.has(symbol)) continue;
      unique.set(symbol, { symbol, name: typeof record.name === "string" && record.name.trim() ? record.name.trim() : symbol });
    }
    if (unique.size >= 2) return Array.from(unique.values()).slice(0, limit);
  }
  return [];
}

export function selectLiquidMinuteBackfillUniverse(input: {
  bars: Array<{ symbol: string; date: string; turnover: string | number }>;
  knownNames: Array<{ symbol: string; name: string }>;
  thresholdWon: number;
  maxSymbols: number;
  lookbackDays?: number;
}) {
  const lookbackDays = Math.max(1, Math.min(60, input.lookbackDays ?? 30));
  const recentDates = Array.from(new Set(input.bars.map(bar => bar.date).filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date)))).sort((left, right) => right.localeCompare(left)).slice(0, lookbackDays);
  const selectedDates = new Set(recentDates);
  const turnoverBySymbol = new Map<string, { total: number; observedDays: Set<string> }>();
  for (const bar of input.bars) {
    if (!selectedDates.has(bar.date) || !/^\d{6}$/.test(bar.symbol)) continue;
    const turnover = Number(bar.turnover);
    if (!Number.isFinite(turnover) || turnover < 0) continue;
    const prior = turnoverBySymbol.get(bar.symbol) ?? { total: 0, observedDays: new Set<string>() };
    prior.total += turnover;
    prior.observedDays.add(bar.date);
    turnoverBySymbol.set(bar.symbol, prior);
  }
  const nameBySymbol = new Map(input.knownNames.map(item => [item.symbol, item.name]));
  return Array.from(turnoverBySymbol.entries())
    .map(([symbol, value]) => ({ symbol, name: nameBySymbol.get(symbol) ?? symbol, observedDays: value.observedDays.size, averageTurnover: Math.round(value.total / Math.max(1, value.observedDays.size)) }))
    .filter(item => item.observedDays >= Math.min(20, recentDates.length) && item.averageTurnover >= input.thresholdWon)
    .sort((left, right) => right.averageTurnover - left.averageTurnover || left.symbol.localeCompare(right.symbol))
    .slice(0, Math.max(1, Math.min(120, input.maxSymbols)));
}

export function buildIntradayMinuteCollectionPlan(input: {
  tradingDate: string;
  experiment: { id: number; tradingDate: string; status: "tracking" | "closed" } | null;
  quotes: Array<{ symbol: string; name: string }>;
  request: { id: number; requestedAt: Date } | null;
}) {
  if (input.experiment?.status === "closed") {
    return {
      status: "market_closed" as const,
      message: "장 마감으로 당일 모의 실험이 종료되어 추가 1분봉 수집을 계획하지 않습니다.",
      experimentId: input.experiment.id,
      tradingDate: input.experiment.tradingDate,
    };
  }
  if (!input.quotes.length) {
    return {
      status: "waiting_for_data" as const,
      message: "장중 수집에 사용할 저장된 실제 유동성 유니버스가 아직 없습니다.",
    };
  }
  return {
    status: "ready" as const,
    mode: input.experiment ? (input.request ? "manual_refresh" : "scheduled_collection") : "scheduled_collection_bootstrap",
    request: input.request ? { id: input.request.id, requestedAt: input.request.requestedAt } : null,
    experimentId: input.experiment?.id ?? null,
    tradingDate: input.tradingDate,
    quotes: input.quotes,
  };
}

export function selectFreshIntradayQuotes(input: {
  quotes: LocalIntradayQuote[];
  lastObservedAtBySymbol: Map<string, Date | null>;
}) {
  const latestBySymbol = new Map<string, LocalIntradayQuote>();
  let ignored = 0;
  for (const quote of input.quotes) {
    const knownObservedAt = input.lastObservedAtBySymbol.get(quote.symbol);
    const prior = latestBySymbol.get(quote.symbol);
    if (knownObservedAt && quote.observedAt.getTime() <= knownObservedAt.getTime()) {
      ignored += 1;
      continue;
    }
    if (prior && quote.observedAt.getTime() <= prior.observedAt.getTime()) {
      ignored += 1;
      continue;
    }
    latestBySymbol.set(quote.symbol, quote);
  }
  return { latestBySymbol, ignored };
}

export function buildLocalAutoOrderPlan(input: {
  experimentId: number;
  tradingDate: string;
  policyVersion: string;
  totalCapital: number;
  policyId?: number;
  positions: Array<{ candidateId: number; candidateFingerprint: string; symbol: string; name: string; entryPrice: number; lastPrice: number | null; signalCount: number }>;
  fitnessByCandidateId: Map<number, number>;
  maxPositions: number;
}) {
  const orders = input.positions
    .map(position => ({
      candidateId: position.candidateId,
      candidateFingerprint: position.candidateFingerprint,
      symbol: position.symbol,
      name: position.name,
      referencePrice: position.lastPrice ?? position.entryPrice,
      signalCount: position.signalCount,
      fitnessScore: input.fitnessByCandidateId.get(position.candidateId) ?? Number.NEGATIVE_INFINITY,
    }))
    .filter(item => item.referencePrice > 0)
    .sort((left, right) => right.fitnessScore - left.fitnessScore || right.signalCount - left.signalCount || left.symbol.localeCompare(right.symbol))
    .slice(0, input.maxPositions)
    .map(item => ({ ...item, dedupeKey: `auto:${input.tradingDate}:${input.policyVersion}:${item.candidateId}:${item.symbol}:buy` }));

  return {
    status: "ready" as const,
    mode: "automatic_trading" as const,
    experimentId: input.experimentId,
    tradingDate: input.tradingDate,
    policyVersion: input.policyVersion,
    totalCapital: input.totalCapital,
    policyId: input.policyId,
    selectedPositionCount: orders.length,
    orders,
    quotes: input.positions.map(position => ({ symbol: position.symbol, name: position.name, price: position.lastPrice ?? position.entryPrice })).filter(item => item.price > 0),
  };
}

function getStoredUniverseNames(value: unknown) {
  let raw = value;
  if (typeof raw === "string") {
    try { raw = JSON.parse(raw) as unknown; } catch { raw = []; }
  }
  const names = new Map<string, string>();
  if (!Array.isArray(raw)) return names;
  raw.forEach(item => {
    if (!item || typeof item !== "object") return;
    const record = item as { symbol?: unknown; name?: unknown };
    if (typeof record.symbol === "string") names.set(record.symbol, typeof record.name === "string" && record.name ? record.name : record.symbol);
  });
  return names;
}

export function getLocalIntradayBootstrapState(input: { minuteBarCount: number; sourceCandidateCount: number; dailySymbolCount: number }) {
  if (input.minuteBarCount < 1) return "waiting_for_minute_bars" as const;
  if (input.sourceCandidateCount < 1) return "waiting_for_survivors" as const;
  if (input.dailySymbolCount < 1) return "waiting_for_daily_bars" as const;
  return "ready" as const;
}

export function closeIntradayCandidateSimulation(simulationJson: unknown, capturedAt: Date) {
  if (!simulationJson || typeof simulationJson !== "object" || Array.isArray(simulationJson)) return simulationJson;
  const simulation = simulationJson as Record<string, unknown>;
  const entries = Array.isArray(simulation.entries) ? simulation.entries : [];
  return {
    ...simulation,
    status: "closed",
    closedAt: capturedAt.toISOString(),
    updatedAt: capturedAt.toISOString(),
    entries: entries.map(entry => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return entry;
      const record = entry as Record<string, unknown>;
      const lastPrice = Number(record.lastPrice);
      if (!Number.isFinite(lastPrice) || lastPrice < 1) return record;
      const observedAt = typeof record.lastObservedAt === "string" && !Number.isNaN(new Date(record.lastObservedAt).getTime())
        ? record.lastObservedAt
        : capturedAt.toISOString();
      return { ...record, exitPrice: lastPrice, exitAt: observedAt };
    }),
  };
}

async function ensureLocalIntradayExperiment(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, tradingDate: string) {
  await db.update(dayTradeExperiments).set({ status: "closed", closedAt: new Date() }).where(and(eq(dayTradeExperiments.status, "tracking"), ne(dayTradeExperiments.tradingDate, tradingDate)));
  const [closed] = await db.select().from(dayTradeExperiments).where(and(eq(dayTradeExperiments.status, "closed"), eq(dayTradeExperiments.tradingDate, tradingDate))).orderBy(desc(dayTradeExperiments.updatedAt)).limit(1);
  if (closed) return closed;
  const [existing] = await db.select().from(dayTradeExperiments).where(and(eq(dayTradeExperiments.status, "tracking"), eq(dayTradeExperiments.tradingDate, tradingDate))).orderBy(desc(dayTradeExperiments.updatedAt)).limit(1);
  const minuteRows = await db.select().from(intradayMinuteBars).where(eq(intradayMinuteBars.tradingDate, tradingDate)).orderBy(asc(intradayMinuteBars.minuteAt));
  if (getLocalIntradayBootstrapState({ minuteBarCount: minuteRows.length, sourceCandidateCount: 1, dailySymbolCount: 1 }) !== "ready") return null;
  const sourceRun = (await db.select().from(autonomousResearchRuns).where(and(eq(autonomousResearchRuns.dataStatus, "ready"), like(autonomousResearchRuns.runKey, "%:historical%"))).orderBy(desc(autonomousResearchRuns.updatedAt)).limit(1))[0];
  if (!sourceRun) return null;
  const sourceCandidates = await db.select().from(autonomousResearchCandidates).where(and(eq(autonomousResearchCandidates.runId, sourceRun.id), eq(autonomousResearchCandidates.status, "survived"))).orderBy(desc(autonomousResearchCandidates.fitnessScore));
  if (getLocalIntradayBootstrapState({ minuteBarCount: minuteRows.length, sourceCandidateCount: sourceCandidates.length, dailySymbolCount: 1 }) !== "ready") return null;
  const dailyRows = await db.select().from(autonomousResearchBars).where(eq(autonomousResearchBars.runId, sourceRun.id)).orderBy(asc(autonomousResearchBars.symbol), asc(autonomousResearchBars.date));
  const dailyBySymbol = dailyRows.reduce<Record<string, Array<{ date: string; open: number; high: number; low: number; close: number; volume: number; turnover: number }>>>((all, bar) => {
    (all[bar.symbol] ??= []).push({ date: bar.date, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: Number(bar.volume), turnover: Number(bar.turnover) });
    return all;
  }, {});
  if (getLocalIntradayBootstrapState({ minuteBarCount: minuteRows.length, sourceCandidateCount: sourceCandidates.length, dailySymbolCount: Object.keys(dailyBySymbol).length }) !== "ready") return null;
  const minuteBySymbol = minuteRows.reduce<Map<string, typeof minuteRows>>((all, bar) => { const bars = all.get(bar.symbol) ?? []; bars.push(bar); all.set(bar.symbol, bars); return all; }, new Map());
  const runKey = `autonomous-v1:${tradingDate}:local-intraday`;
  let run = existing ? (await db.select().from(autonomousResearchRuns).where(eq(autonomousResearchRuns.id, existing.runId)).limit(1))[0] : (await db.select().from(autonomousResearchRuns).where(eq(autonomousResearchRuns.runKey, runKey)).limit(1))[0];
  if (!run) {
    await db.insert(autonomousResearchRuns).values({ tradingDate, runKey, policyVersion: sourceRun.policyVersion, phase: "intraday", dataStatus: "ready", universeJson: sourceRun.universeJson, summaryJson: { mode: "local_intraday_from_historical_survivors", sourceRunId: sourceRun.id, minuteSource: "kiwoom_ka10080" }, lastObservedAt: new Date() });
    run = (await db.select().from(autonomousResearchRuns).where(eq(autonomousResearchRuns.runKey, runKey)).limit(1))[0];
  }
  if (!run) return null;
  const names = getStoredUniverseNames(sourceRun.universeJson);
  const now = new Date();
  for (const source of sourceCandidates) {
    const entries = Array.from(minuteBySymbol.entries()).flatMap(([symbol, minutes]) => {
      const bars = dailyBySymbol[symbol];
      if (!bars?.length) return [];
      const evaluation = evaluateExpression(source.rootGenomeJson as ConditionExpressionGroup, bars);
      if (!evaluation.eligible || evaluation.score < source.minimumScore) return [];
      const first = minutes[0]!;
      const latest = minutes.at(-1)!;
      return [{ symbol, name: names.get(symbol) ?? symbol, entryPrice: first.close, entryAt: first.minuteAt.toISOString(), evidence: { score: evaluation.score, matchedRuleCount: evaluation.evaluations.filter(item => item.matched).length, details: evaluation.evaluations.filter(item => item.matched).slice(0, 5).map(item => item.detail) }, lastPrice: latest.close, lastObservedAt: latest.minuteAt.toISOString(), returnPercent: (latest.close - first.close) / first.close * 100 }];
    });
    const simulation = { status: entries.length ? "tracking" as const : "not_entered" as const, entries, updatedAt: now.toISOString(), source: "local_ka10081_and_ka10080" };
    await db.insert(autonomousResearchCandidates).values({ runId: run.id, fingerprint: source.fingerprint, rootGenomeJson: source.rootGenomeJson, minimumScore: source.minimumScore, generationNumber: source.generationNumber, status: "survived", inSampleMetricsJson: source.inSampleMetricsJson, outOfSampleMetricsJson: source.outOfSampleMetricsJson, walkForwardMetricsJson: source.walkForwardMetricsJson, simulationJson: simulation, fitnessScore: source.fitnessScore, evaluatedAt: now }).onConflictDoUpdate({
      target: autonomousResearchCandidates.fingerprint,
      set: { simulationJson: simulation, updatedAt: now },
    });
  }
  const candidates = await db.select().from(autonomousResearchCandidates).where(and(eq(autonomousResearchCandidates.runId, run.id), eq(autonomousResearchCandidates.status, "survived")));
  await persistDayTradeExperiment({ run, candidates, isClosing: false });
  return (await db.select().from(dayTradeExperiments).where(and(eq(dayTradeExperiments.runId, run.id), eq(dayTradeExperiments.status, "tracking"))).limit(1))[0] ?? null;
}

async function closeLocalIntradayExperimentAtMarketClose(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, input: { tradingDate: string; capturedAt: Date }) {
  if (!shouldCloseIntradayExperiment(input)) return null;
  const [experiment] = await db.select().from(dayTradeExperiments).where(and(eq(dayTradeExperiments.status, "tracking"), eq(dayTradeExperiments.tradingDate, input.tradingDate))).orderBy(desc(dayTradeExperiments.updatedAt)).limit(1);
  if (!experiment) return null;
  const [run] = await db.select().from(autonomousResearchRuns).where(eq(autonomousResearchRuns.id, experiment.runId)).limit(1);
  if (!run) return null;
  const candidates = await db.select().from(autonomousResearchCandidates).where(and(eq(autonomousResearchCandidates.runId, run.id), eq(autonomousResearchCandidates.status, "survived")));
  for (const candidate of candidates) {
    await db.update(autonomousResearchCandidates).set({ simulationJson: closeIntradayCandidateSimulation(candidate.simulationJson, input.capturedAt), updatedAt: input.capturedAt }).where(eq(autonomousResearchCandidates.id, candidate.id));
  }
  const closedCandidates = await db.select().from(autonomousResearchCandidates).where(and(eq(autonomousResearchCandidates.runId, run.id), eq(autonomousResearchCandidates.status, "survived")));
  await db.update(autonomousResearchRuns).set({ phase: "completed", lastObservedAt: input.capturedAt }).where(eq(autonomousResearchRuns.id, run.id));
  await persistDayTradeExperiment({ run, candidates: closedCandidates, isClosing: true });
  return (await db.select().from(dayTradeExperiments).where(eq(dayTradeExperiments.id, experiment.id)).limit(1))[0] ?? null;
}

export function isLocalResearchNodeAuthorized(request: Request) {
  const expected = process.env.LOCAL_RESEARCH_NODE_TOKEN?.trim();
  const supplied = request.header(RESEARCH_NODE_TOKEN_HEADER)?.trim();
  if (!expected || !supplied) return false;
  const expectedBytes = Buffer.from(expected, "utf8");
  const suppliedBytes = Buffer.from(supplied, "utf8");
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}

type SharedDatasetStreamWindow = { startDate: string; evaluationStartDate: string; endDate: string };

function normalizeSharedDatasetStreamWindow(value: unknown): SharedDatasetStreamWindow | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const startDate = typeof record.startDate === "string" ? record.startDate : "";
  const evaluationStartDate = typeof record.evaluationStartDate === "string" ? record.evaluationStartDate : "";
  const endDate = typeof record.endDate === "string" ? record.endDate : "";
  if (![startDate, evaluationStartDate, endDate].every(date => /^\d{4}-\d{2}-\d{2}$/.test(date)) || startDate > evaluationStartDate || evaluationStartDate > endDate) return null;
  return { startDate, evaluationStartDate, endDate };
}

function normalizeSharedDatasetStreamUniverse(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap(raw => {
    const item = raw as Record<string, unknown>;
    const symbol = typeof item.symbol === "string" ? item.symbol.trim() : "";
    const name = typeof item.name === "string" && item.name.trim() ? item.name.trim().slice(0, 120) : symbol;
    return /^\d{6}$/.test(symbol) ? [{ symbol, name }] : [];
  });
}

export function registerLocalResearchNodeRoutes(app: Express) {
  app.get("/api/local-research-node/health", (request, response) => {
    response.setHeader("Cache-Control", "no-store, private, max-age=0");
    if (!isLocalResearchNodeAuthorized(request)) {
      return response.status(401).json({ status: "unauthorized" });
    }
    return response.json({
      status: "ready",
      mode: "local_automatic_execution",
      allowed: ["oauth_token", "daily_bar_collection", "daily_bar_collection_plan", "daily_bar_sync", "daily_dataset_promote", "daily_dataset_research", "research_dataset_upload", "shared_dataset_collection_plan", "shared_dataset_collection_sync", "shared_dataset_collection_status", "auto_order_plan", "execution_sync", "position_sync", "intraday_price_plan", "intraday_price_sync", "intraday_price_status", "intraday_minute_collection_plan", "intraday_minute_sync", "intraday_minute_backfill_plan", "intraday_minute_backfill_sync", "intraday_minute_collection_status"],
      blocked: ["manual_web_order_transmission"],
    });
  });

  app.post("/api/local-research-node/kiwoom-terminal-connection", async (request, response) => {
    response.setHeader("Cache-Control", "no-store, private, max-age=0");
    if (!isLocalResearchNodeAuthorized(request)) return response.status(401).json({ status: "unauthorized" });
    const body = request.body as { terminalIp?: unknown; status?: unknown; errorCode?: unknown; message?: unknown; verification?: unknown } | undefined;
    const terminalIp = typeof body?.terminalIp === "string" ? body.terminalIp.trim() : "";
    const status = body?.status === "connected" || body?.status === "failed" ? (body.status as "connected" | "failed") : null;
    const errorCode = typeof body?.errorCode === "string" && /^[a-z0-9_]{1,80}$/i.test(body.errorCode) ? body.errorCode : null;
    const message = typeof body?.message === "string" ? body.message.replace(/bearer\s+\S+|secretkey\s*[:=]\s*\S+|appkey\s*[:=]\s*\S+/gi, "[redacted]").slice(0, 500) : "키움 REST 단말 인증 결과를 받았습니다.";
    const verification = normalizeTerminalConnectionVerification(body?.verification);
    if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(terminalIp) || !status) return response.status(400).json({ status: "invalid_payload", message: "terminalIp과 인증 상태가 필요합니다." });
    const db = await getDb();
    if (!db) return response.status(503).json({ status: "unavailable", message: "연구 데이터베이스를 사용할 수 없습니다." });
    const ownerOpenId = process.env.OWNER_OPEN_ID?.trim();
    let owner = ownerOpenId ? (await db.select({ id: users.id }).from(users).where(eq(users.openId, ownerOpenId)).limit(1))[0] : null;
    if (!owner) {
      const adminCandidates = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin")).limit(2);
      owner = adminCandidates.length === 1 ? adminCandidates[0] : null;
    }
    if (!owner) return response.status(409).json({ status: "owner_not_ready", handlerVersion: TERMINAL_CONNECTION_HANDLER_VERSION, message: "단말 인증 결과를 연결할 소유자 계정을 찾을 수 없습니다. 소유자 설정 또는 단일 운영자 계정을 확인하세요." });
    await db.insert(kiwoomTerminalConnectionChecks).values({ userId: owner.id, terminalIp, status, errorCode, message, verificationJson: verification, checkedAt: new Date() });
    const roundTripVerified = status === "connected" && isTerminalRoundTripVerified(verification);
    return response.json({ status: "recorded", handlerVersion: TERMINAL_CONNECTION_HANDLER_VERSION, terminalIp, connection: status, roundTripVerified, verification, nextAction: roundTripVerified ? "키움 API·서비스 왕복이 확인되었습니다. 공용 데이터 수집을 시작할 수 있습니다." : status === "connected" ? "OAuth 또는 일부 단계만 기록되었습니다. 키움 API 읽기·서비스 저장 결과 재확인을 완료하세요." : "키움 단말 등록 IP와 OAuth 자격 증명을 다시 확인하세요." });
  });

  app.get("/api/local-research-node/kiwoom-terminal-connection", async (request, response) => {
    response.setHeader("Cache-Control", "no-store, private, max-age=0");
    if (!isLocalResearchNodeAuthorized(request)) return response.status(401).json({ status: "unauthorized" });
    const terminalIp = typeof request.query.terminalIp === "string" ? request.query.terminalIp.trim() : "";
    if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(terminalIp)) return response.status(400).json({ status: "invalid_request", message: "terminalIp이 필요합니다." });
    const db = await getDb();
    if (!db) return response.status(503).json({ status: "unavailable", message: "연구 데이터베이스를 사용할 수 없습니다." });
    const ownerOpenId = process.env.OWNER_OPEN_ID?.trim();
    let owner = ownerOpenId ? (await db.select({ id: users.id }).from(users).where(eq(users.openId, ownerOpenId)).limit(1))[0] : null;
    if (!owner) {
      const adminCandidates = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin")).limit(2);
      owner = adminCandidates.length === 1 ? adminCandidates[0] : null;
    }
    if (!owner) return response.status(409).json({ status: "owner_not_ready", handlerVersion: TERMINAL_CONNECTION_HANDLER_VERSION });
    const check = (await db.select({ terminalIp: kiwoomTerminalConnectionChecks.terminalIp, status: kiwoomTerminalConnectionChecks.status, errorCode: kiwoomTerminalConnectionChecks.errorCode, message: kiwoomTerminalConnectionChecks.message, verificationJson: kiwoomTerminalConnectionChecks.verificationJson, checkedAt: kiwoomTerminalConnectionChecks.checkedAt }).from(kiwoomTerminalConnectionChecks).where(and(eq(kiwoomTerminalConnectionChecks.userId, owner.id), eq(kiwoomTerminalConnectionChecks.terminalIp, terminalIp))).orderBy(desc(kiwoomTerminalConnectionChecks.checkedAt)).limit(1))[0] ?? null;
    if (!check) return response.status(404).json({ status: "not_found", terminalIp });
    const verification = normalizeTerminalConnectionVerification(check.verificationJson);
    return response.json({ status: "recorded", handlerVersion: TERMINAL_CONNECTION_HANDLER_VERSION, terminalIp: check.terminalIp, connection: check.status, verification, roundTripVerified: check.status === "connected" && isTerminalRoundTripVerified(verification), checkedAt: check.checkedAt });
  });

  app.get("/api/local-research-node/intraday-price-plan", async (request, response) => {
    response.setHeader("Cache-Control", "no-store, private, max-age=0");
    if (!isLocalResearchNodeAuthorized(request)) return response.status(401).json({ status: "unauthorized" });
    const db = await getDb();
    if (!db) return response.status(503).json({ status: "unavailable", message: "연구 데이터베이스를 사용할 수 없습니다." });
    const [experiment] = await db.select().from(dayTradeExperiments).where(eq(dayTradeExperiments.status, "tracking")).orderBy(desc(dayTradeExperiments.updatedAt)).limit(1);
    if (!experiment) return response.status(409).json({ status: "waiting_for_data", message: "추적 중인 장중 모의투자 기록이 아직 없습니다." });
    const positions = await db.select({ symbol: dayTradeExperimentPositions.symbol, name: dayTradeExperimentPositions.name }).from(dayTradeExperimentPositions).where(eq(dayTradeExperimentPositions.experimentId, experiment.id));
    return response.json({ status: "ready", mode: "read_only_intraday_price_collection", experimentId: experiment.id, tradingDate: experiment.tradingDate, quotes: positions.map(position => ({ symbol: position.symbol, name: position.name })) });
  });

  app.get("/api/local-research-node/daily-bar-collection-plan", async (request, response) => {
    response.setHeader("Cache-Control", "no-store, private, max-age=0");
    if (!isLocalResearchNodeAuthorized(request)) return response.status(401).json({ status: "unauthorized" });
    const db = await getDb();
    if (!db) return response.status(503).json({ status: "unavailable", message: "연구 데이터베이스를 사용할 수 없습니다." });
    const runs = await db.select({ universeJson: autonomousResearchRuns.universeJson }).from(autonomousResearchRuns).where(eq(autonomousResearchRuns.dataStatus, "ready")).orderBy(desc(autonomousResearchRuns.updatedAt)).limit(40);
    const symbols = selectLocalDailyCollectionUniverse(runs, 20);
    if (!symbols.length) return response.status(409).json({ status: "waiting_for_universe", message: "실제 일봉 수집에 사용할 저장 연구 유니버스가 없습니다." });
    return response.json({ status: "ready", mode: "scheduled_daily_collection", adjustmentBasis: "adjusted", symbols });
  });

  app.get("/api/local-research-node/shared-dataset-collection-plan", async (request, response) => {
    response.setHeader("Cache-Control", "no-store, private, max-age=0");
    if (!isLocalResearchNodeAuthorized(request)) return response.status(401).json({ status: "unauthorized" });
    const db = await getDb();
    if (!db) return response.status(503).json({ status: "unavailable", message: "연구 데이터베이스를 사용할 수 없습니다." });
    const queued = (await db.select().from(sharedDatasetCollectionRequests).where(eq(sharedDatasetCollectionRequests.status, "queued")).orderBy(desc(sharedDatasetCollectionRequests.requestedAt)).limit(1))[0];
    if (!queued) return response.status(409).json({ status: "idle", message: "연결 시 처리할 공용 데이터셋 수집 요청이 없습니다." });
    await db.update(sharedDatasetCollectionRequests).set({ status: "running", startedAt: new Date(), lastError: null, progressJson: { stage: "accepted", message: "지정 단말 수집기가 요청을 접수했습니다.", totalSymbols: queued.symbolCount, updatedAt: new Date().toISOString() } }).where(eq(sharedDatasetCollectionRequests.id, queued.id));
    return response.json({ status: "ready", mode: "manual_shared_dataset_read_only_collection", request: { id: queued.id, randomSeed: queued.randomSeed, symbolCount: queued.symbolCount, sampleDays: queued.sampleDays, requestFingerprint: queued.requestFingerprint, resumeCount: queued.resumeCount, requestedByUserId: queued.requestedByUserId } });
  });

  app.post("/api/local-research-node/shared-dataset-collection-sync", async (request, response) => {
    response.setHeader("Cache-Control", "no-store, private, max-age=0");
    if (!isLocalResearchNodeAuthorized(request)) return response.status(401).json({ status: "unauthorized" });
    const body = request.body as { requestId?: unknown; universe?: unknown; dailyBars?: unknown; fiveMinuteBars?: unknown } | undefined;
    const requestId = Number(body?.requestId);
    const universe = Array.isArray(body?.universe) ? body!.universe.flatMap(raw => {
      const item = raw as Record<string, unknown>; const symbol = typeof item.symbol === "string" ? item.symbol.trim() : ""; const name = typeof item.name === "string" && item.name.trim() ? item.name.trim().slice(0, 120) : symbol;
      return /^\d{6}$/.test(symbol) ? [{ symbol, name }] : [];
    }) : [];
    if (!Number.isInteger(requestId) || requestId < 1 || !Array.isArray(body?.dailyBars) || !Array.isArray(body?.fiveMinuteBars) || !universe.length) return response.status(400).json({ status: "invalid_request", message: "requestId, universe, dailyBars, fiveMinuteBars가 필요합니다." });
    const db = await getDb();
    if (!db) return response.status(503).json({ status: "unavailable", message: "연구 데이터베이스를 사용할 수 없습니다." });
    const collection = (await db.select().from(sharedDatasetCollectionRequests).where(eq(sharedDatasetCollectionRequests.id, requestId)).limit(1))[0];
    if (!collection || collection.status !== "running") return response.status(409).json({ status: "invalid_request_state", message: "실행 중인 공용 데이터셋 수집 요청을 찾을 수 없습니다." });
    if (new Set(universe.map(item => item.symbol)).size !== universe.length || universe.length !== collection.symbolCount) return response.status(400).json({ status: "invalid_universe", message: "수집 요청의 종목 수와 동기화 유니버스가 일치하지 않습니다." });
    const selected = selectSharedCollectionPayload({ universe, dailyBars: body.dailyBars, fiveMinuteBars: body.fiveMinuteBars, sampleDays: collection.sampleDays, randomSeed: collection.randomSeed });
    if ("error" in selected) return response.status(400).json({ status: "invalid_source_data", message: selected.error });
    const sourceFingerprint = createHash("sha256").update(JSON.stringify({ source: ["kiwoom_ka10081", "kiwoom_ka10080"], universe, window: selected.window, daily: selected.selectedDailyBars, fiveMinute: selected.selectedFiveMinuteBars.map(bar => ({ ...bar, intervalAt: bar.intervalAt.toISOString() })) })).digest("hex");
    const existing = (await db.select().from(researchDatasets).where(and(eq(researchDatasets.sourceFingerprint, sourceFingerprint), eq(researchDatasets.visibility, "shared_public"), eq(researchDatasets.qualityStatus, "ready"))).limit(1))[0];
    if (existing) {
      await db.update(sharedDatasetCollectionRequests).set({ status: "completed", datasetId: existing.id, plannedUniverseJson: universe, acceptedDailyBarCount: existing.barCount, acceptedFiveMinuteBarCount: existing.minuteBarCount, progressJson: { stage: "completed", message: "같은 원본을 찾아 기존 공용 데이터셋을 재사용했습니다.", totalSymbols: universe.length, completedDailySymbols: universe.length, completedFiveMinuteSymbols: universe.length, updatedAt: new Date().toISOString() }, completedAt: new Date() }).where(eq(sharedDatasetCollectionRequests.id, collection.id));
      return response.json({ status: "reused", requestId: collection.id, datasetId: existing.id, versionKey: existing.versionKey, sourceFingerprint });
    }
    const now = new Date();
    const versionKey = `shared-local-ka10081-ka10080:${selected.window.startDate}:${selected.window.endDate}:${sourceFingerprint.slice(0, 16)}`;
    const [created] = await db.insert(researchDatasets).values({ userId: collection.requestedByUserId, name: `공용 랜덤 아레나 · ${universe.length}종목 · ${selected.window.evaluationStartDate}~${selected.window.endDate}`, source: "kiwoom_daily_five_minute", versionKey, visibility: "shared_public", randomSeed: collection.randomSeed, sourceFingerprint, universeJson: universe, startDate: selected.window.startDate, endDate: selected.window.endDate, barCount: selected.selectedDailyBars.length, minuteBarCount: selected.selectedFiveMinuteBars.length, adjustmentBasis: "adjusted", qualityStatus: "collecting", sourceCapturedAt: now, qualityReportJson: { state: "collecting", source: ["kiwoom_ka10081", "kiwoom_ka10080"], randomSeed: collection.randomSeed, sampleDays: collection.sampleDays, ...selected.window, universe, collectionRequestId: collection.id, fixedIpSource: true } }).returning();
    try {
      for (let offset = 0; offset < selected.selectedDailyBars.length; offset += 200) await db.insert(researchDailyBars).values(selected.selectedDailyBars.slice(offset, offset + 200).map(bar => ({ datasetId: created.id, symbol: bar.symbol, date: bar.date, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: String(bar.volume), turnover: String(bar.turnover), source: "kiwoom_ka10081_local_shared_snapshot" })));
      for (let offset = 0; offset < selected.selectedFiveMinuteBars.length; offset += 200) await db.insert(researchFiveMinuteBars).values(selected.selectedFiveMinuteBars.slice(offset, offset + 200).map(bar => ({ datasetId: created.id, symbol: bar.symbol, tradingDate: bar.tradingDate, intervalAt: bar.intervalAt, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: String(bar.volume), source: "kiwoom_ka10080_local_shared_snapshot", rawFingerprint: createHash("sha256").update(JSON.stringify({ ...bar, intervalAt: bar.intervalAt.toISOString() })).digest("hex") })));
      await db.update(researchDatasets).set({ qualityStatus: "ready", readyAt: now, qualityReportJson: { state: "ready", source: ["kiwoom_ka10081", "kiwoom_ka10080"], sourceFingerprint, randomSeed: collection.randomSeed, sampleDays: collection.sampleDays, ...selected.window, universe, dailyBarCount: selected.selectedDailyBars.length, fiveMinuteBarCount: selected.selectedFiveMinuteBars.length, immutable: true, fixedIpSource: true, collectionRequestId: collection.id } }).where(eq(researchDatasets.id, created.id));
      await db.update(sharedDatasetCollectionRequests).set({ status: "completed", datasetId: created.id, plannedUniverseJson: universe, acceptedDailyBarCount: selected.selectedDailyBars.length, acceptedFiveMinuteBarCount: selected.selectedFiveMinuteBars.length, progressJson: { stage: "completed", message: "일봉·5분봉 원본을 검증해 공용 데이터셋 보관소에 고정했습니다.", totalSymbols: universe.length, completedDailySymbols: universe.length, completedFiveMinuteSymbols: universe.length, updatedAt: now.toISOString() }, completedAt: now }).where(eq(sharedDatasetCollectionRequests.id, collection.id));
      return response.json({ status: "ready", requestId: collection.id, datasetId: created.id, versionKey, sourceFingerprint, acceptedDailyBarCount: selected.selectedDailyBars.length, acceptedFiveMinuteBarCount: selected.selectedFiveMinuteBars.length });
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 500) : "공용 원본 스냅샷 저장 실패";
      await db.update(researchDatasets).set({ qualityStatus: "error", qualityReportJson: { state: "error", sourceFingerprint, error: message } }).where(eq(researchDatasets.id, created.id));
      await db.update(sharedDatasetCollectionRequests).set({ status: "failed", lastError: message, completedAt: new Date() }).where(eq(sharedDatasetCollectionRequests.id, collection.id));
      return response.status(500).json({ status: "snapshot_failed", message });
    }
  });

  app.post("/api/local-research-node/shared-dataset-collection-stream-start", async (request, response) => {
    response.setHeader("Cache-Control", "no-store, private, max-age=0");
    if (!isLocalResearchNodeAuthorized(request)) return response.status(401).json({ status: "unauthorized" });
    const body = request.body as { requestId?: unknown; universe?: unknown; window?: unknown; sourceFingerprint?: unknown; expectedDailyBarCount?: unknown; expectedFiveMinuteBarCount?: unknown } | undefined;
    const requestId = Number(body?.requestId);
    const universe = normalizeSharedDatasetStreamUniverse(body?.universe);
    const window = normalizeSharedDatasetStreamWindow(body?.window);
    const sourceFingerprint = typeof body?.sourceFingerprint === "string" && /^[a-f0-9]{64}$/i.test(body.sourceFingerprint) ? body.sourceFingerprint : "";
    const expectedDailyBarCount = Number(body?.expectedDailyBarCount);
    const expectedFiveMinuteBarCount = Number(body?.expectedFiveMinuteBarCount);
    if (!Number.isInteger(requestId) || requestId < 1 || !window || !sourceFingerprint || !Number.isInteger(expectedDailyBarCount) || expectedDailyBarCount < universe.length || expectedDailyBarCount > 10_000 || !Number.isInteger(expectedFiveMinuteBarCount) || expectedFiveMinuteBarCount < universe.length || expectedFiveMinuteBarCount > 150_000 || !universe.length) return response.status(400).json({ status: "invalid_request", message: "requestId, universe, window, sourceFingerprint, 예상 원본 행 수가 필요합니다." });
    const db = await getDb();
    if (!db) return response.status(503).json({ status: "unavailable", message: "연구 데이터베이스를 사용할 수 없습니다." });
    const collection = (await db.select().from(sharedDatasetCollectionRequests).where(eq(sharedDatasetCollectionRequests.id, requestId)).limit(1))[0];
    if (!collection || collection.status !== "running") return response.status(409).json({ status: "invalid_request_state", message: "실행 중인 공용 데이터셋 수집 요청을 찾을 수 없습니다." });
    if (new Set(universe.map(item => item.symbol)).size !== universe.length || universe.length !== collection.symbolCount) return response.status(400).json({ status: "invalid_universe", message: "수집 요청의 종목 수와 동기화 유니버스가 일치하지 않습니다." });
    const existingReady = (await db.select().from(researchDatasets).where(and(eq(researchDatasets.sourceFingerprint, sourceFingerprint), eq(researchDatasets.visibility, "shared_public"), eq(researchDatasets.qualityStatus, "ready"))).limit(1))[0];
    if (existingReady) {
      await db.update(sharedDatasetCollectionRequests).set({ status: "completed", datasetId: existingReady.id, plannedUniverseJson: universe, acceptedDailyBarCount: existingReady.barCount, acceptedFiveMinuteBarCount: existingReady.minuteBarCount, progressJson: { stage: "completed", message: "같은 원본을 찾아 기존 공용 데이터셋을 재사용했습니다.", totalSymbols: universe.length, completedDailySymbols: universe.length, completedFiveMinuteSymbols: universe.length, updatedAt: new Date().toISOString() }, completedAt: new Date() }).where(eq(sharedDatasetCollectionRequests.id, collection.id));
      return response.json({ status: "reused", requestId: collection.id, datasetId: existingReady.id, versionKey: existingReady.versionKey, sourceFingerprint });
    }
    const attached = collection.datasetId ? (await db.select().from(researchDatasets).where(and(eq(researchDatasets.id, collection.datasetId), eq(researchDatasets.qualityStatus, "collecting"))).limit(1))[0] : null;
    if (attached) return response.json({ status: "uploading", requestId: collection.id, datasetId: attached.id, versionKey: attached.versionKey, sourceFingerprint });
    const now = new Date();
    const versionKey = `shared-local-ka10081-ka10080:${window.startDate}:${window.endDate}:${sourceFingerprint.slice(0, 16)}`;
    const [created] = await db.insert(researchDatasets).values({ userId: collection.requestedByUserId, name: `공용 랜덤 아레나 · ${universe.length}종목 · ${window.evaluationStartDate}~${window.endDate}`, source: "kiwoom_daily_five_minute", versionKey, visibility: "shared_public", randomSeed: collection.randomSeed, sourceFingerprint, universeJson: universe, startDate: window.startDate, endDate: window.endDate, barCount: 0, minuteBarCount: 0, adjustmentBasis: "adjusted", qualityStatus: "collecting", sourceCapturedAt: now, qualityReportJson: { state: "streaming", protocol: "chunked_v1", source: ["kiwoom_ka10081", "kiwoom_ka10080"], randomSeed: collection.randomSeed, sampleDays: collection.sampleDays, ...window, universe, expectedDailyBarCount, expectedFiveMinuteBarCount, collectionRequestId: collection.id, fixedIpSource: true } }).returning();
    await db.update(sharedDatasetCollectionRequests).set({ datasetId: created.id, plannedUniverseJson: universe, progressJson: { stage: "stream_upload_start", message: "대용량 원본을 재개 가능한 청크로 보관소에 적재합니다.", totalSymbols: universe.length, completedDailySymbols: universe.length, completedFiveMinuteSymbols: universe.length, updatedAt: now.toISOString() } }).where(eq(sharedDatasetCollectionRequests.id, collection.id));
    return response.json({ status: "uploading", requestId: collection.id, datasetId: created.id, versionKey, sourceFingerprint });
  });

  app.post("/api/local-research-node/shared-dataset-collection-stream-chunk", async (request, response) => {
    response.setHeader("Cache-Control", "no-store, private, max-age=0");
    if (!isLocalResearchNodeAuthorized(request)) return response.status(401).json({ status: "unauthorized" });
    const body = request.body as { requestId?: unknown; datasetId?: unknown; kind?: unknown; bars?: unknown } | undefined;
    const requestId = Number(body?.requestId); const datasetId = Number(body?.datasetId); const kind = body?.kind === "daily" || body?.kind === "five_minute" ? body.kind : null; const submitted = Array.isArray(body?.bars) ? body.bars : [];
    if (!Number.isInteger(requestId) || requestId < 1 || !Number.isInteger(datasetId) || datasetId < 1 || !kind || !submitted.length || submitted.length > 800) return response.status(400).json({ status: "invalid_request", message: "requestId, datasetId, kind, 최대 800개 bars 배열이 필요합니다." });
    const db = await getDb();
    if (!db) return response.status(503).json({ status: "unavailable", message: "연구 데이터베이스를 사용할 수 없습니다." });
    const collection = (await db.select().from(sharedDatasetCollectionRequests).where(and(eq(sharedDatasetCollectionRequests.id, requestId), eq(sharedDatasetCollectionRequests.datasetId, datasetId), eq(sharedDatasetCollectionRequests.status, "running"))).limit(1))[0];
    const dataset = (await db.select().from(researchDatasets).where(and(eq(researchDatasets.id, datasetId), eq(researchDatasets.qualityStatus, "collecting"))).limit(1))[0];
    if (!collection || !dataset) return response.status(409).json({ status: "invalid_request_state", message: "재개 가능한 대용량 원본 적재 상태를 찾을 수 없습니다." });
    const report = dataset.qualityReportJson && typeof dataset.qualityReportJson === "object" ? dataset.qualityReportJson as Record<string, unknown> : {};
    const universe = normalizeSharedDatasetStreamUniverse(dataset.universeJson);
    const symbols = new Set(universe.map(item => item.symbol));
    const window = normalizeSharedDatasetStreamWindow(report);
    if (!window) return response.status(409).json({ status: "invalid_dataset_state", message: "대용량 원본의 날짜 창 메타데이터를 찾을 수 없습니다." });
    if (kind === "daily") {
      const bars = submitted.flatMap(raw => {
        const item = raw as Record<string, unknown>; const symbol = typeof item.symbol === "string" ? item.symbol.trim() : "";
        const candidate: LocalDailyBar = { date: typeof item.date === "string" ? item.date.trim() : "", open: Number(item.open), high: Number(item.high), low: Number(item.low), close: Number(item.close), volume: Number(item.volume), turnover: Number(item.turnover) };
        const bar = symbols.has(symbol) ? selectValidLocalDailyBars({ bars: [candidate] }).bars[0] : null;
        return bar && bar.date >= window.startDate && bar.date <= window.endDate ? [{ datasetId, symbol, date: bar.date, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: String(bar.volume), turnover: String(bar.turnover), source: "kiwoom_ka10081_local_shared_snapshot" }] : [];
      });
      if (bars.length !== submitted.length) return response.status(400).json({ status: "invalid_source_data", message: "일봉 청크에 유효하지 않은 원본이 포함되어 있습니다." });
      await db.insert(researchDailyBars).values(bars).onConflictDoUpdate({
        target: [researchDailyBars.datasetId, researchDailyBars.symbol, researchDailyBars.date],
        set: { open: sql`excluded.open`, high: sql`excluded.high`, low: sql`excluded.low`, close: sql`excluded.close`, volume: sql`excluded.volume`, turnover: sql`excluded.turnover`, source: sql`excluded.source` },
      });
    } else {
      const bars = submitted.flatMap(raw => {
        const item = raw as Record<string, unknown>; const symbol = typeof item.symbol === "string" ? item.symbol.trim() : ""; const intervalAt = typeof item.intervalAt === "string" ? new Date(item.intervalAt) : new Date(NaN);
        const open = Number(item.open); const high = Number(item.high); const low = Number(item.low); const close = Number(item.close); const volume = Number(item.volume); const tradingDate = Number.isNaN(intervalAt.getTime()) ? "" : sharedDatasetDate(intervalAt);
        if (!symbols.has(symbol) || !/^\d{4}-\d{2}-\d{2}$/.test(tradingDate) || tradingDate < window.evaluationStartDate || tradingDate > window.endDate || ![open, high, low, close, volume].every(Number.isSafeInteger) || open < 1 || high < 1 || low < 1 || close < 1 || volume < 0 || low > Math.min(open, close) || high < Math.max(open, close)) return [];
        const rawFingerprint = createHash("sha256").update(JSON.stringify({ symbol, tradingDate, intervalAt: intervalAt.toISOString(), open, high, low, close, volume })).digest("hex");
        return [{ datasetId, symbol, tradingDate, intervalAt, open, high, low, close, volume: String(volume), source: "kiwoom_ka10080_local_shared_snapshot", rawFingerprint }];
      });
      if (bars.length !== submitted.length) return response.status(400).json({ status: "invalid_source_data", message: "5분봉 청크에 유효하지 않은 원본이 포함되어 있습니다." });
      await db.insert(researchFiveMinuteBars).values(bars).onConflictDoUpdate({
        target: [researchFiveMinuteBars.datasetId, researchFiveMinuteBars.symbol, researchFiveMinuteBars.tradingDate, researchFiveMinuteBars.intervalAt],
        set: { open: sql`excluded.open`, high: sql`excluded.high`, low: sql`excluded.low`, close: sql`excluded.close`, volume: sql`excluded.volume`, source: sql`excluded.source`, rawFingerprint: sql`excluded.rawFingerprint` },
      });
    }
    return response.json({ status: "chunk_recorded", requestId, datasetId, kind, acceptedBarCount: submitted.length });
  });

  app.post("/api/local-research-node/shared-dataset-collection-stream-finalize", async (request, response) => {
    response.setHeader("Cache-Control", "no-store, private, max-age=0");
    if (!isLocalResearchNodeAuthorized(request)) return response.status(401).json({ status: "unauthorized" });
    const body = request.body as { requestId?: unknown; datasetId?: unknown } | undefined;
    const requestId = Number(body?.requestId); const datasetId = Number(body?.datasetId);
    if (!Number.isInteger(requestId) || requestId < 1 || !Number.isInteger(datasetId) || datasetId < 1) return response.status(400).json({ status: "invalid_request", message: "requestId와 datasetId가 필요합니다." });
    const db = await getDb();
    if (!db) return response.status(503).json({ status: "unavailable", message: "연구 데이터베이스를 사용할 수 없습니다." });
    const collection = (await db.select().from(sharedDatasetCollectionRequests).where(and(eq(sharedDatasetCollectionRequests.id, requestId), eq(sharedDatasetCollectionRequests.datasetId, datasetId), eq(sharedDatasetCollectionRequests.status, "running"))).limit(1))[0];
    const dataset = (await db.select().from(researchDatasets).where(and(eq(researchDatasets.id, datasetId), eq(researchDatasets.qualityStatus, "collecting"))).limit(1))[0];
    if (!collection || !dataset) return response.status(409).json({ status: "invalid_request_state", message: "완료할 대용량 원본 적재 상태를 찾을 수 없습니다." });
    const report = dataset.qualityReportJson && typeof dataset.qualityReportJson === "object" ? dataset.qualityReportJson as Record<string, unknown> : {};
    const expectedDailyBarCount = Number(report.expectedDailyBarCount); const expectedFiveMinuteBarCount = Number(report.expectedFiveMinuteBarCount);
    const [daily] = await db.select({ total: count() }).from(researchDailyBars).where(eq(researchDailyBars.datasetId, datasetId));
    const [minute] = await db.select({ total: count() }).from(researchFiveMinuteBars).where(eq(researchFiveMinuteBars.datasetId, datasetId));
    const dailyBarCount = Number(daily?.total ?? 0); const fiveMinuteBarCount = Number(minute?.total ?? 0);
    if (dailyBarCount !== expectedDailyBarCount || fiveMinuteBarCount !== expectedFiveMinuteBarCount) return response.status(409).json({ status: "incomplete_upload", message: "대용량 원본 청크가 모두 저장되지 않았습니다. 같은 요청을 재개하세요.", dailyBarCount, fiveMinuteBarCount, expectedDailyBarCount, expectedFiveMinuteBarCount });
    const now = new Date();
    await db.update(researchDatasets).set({ barCount: dailyBarCount, minuteBarCount: fiveMinuteBarCount, qualityStatus: "ready", readyAt: now, qualityReportJson: { ...report, state: "ready", dailyBarCount, fiveMinuteBarCount, immutable: true, completedAt: now.toISOString() } }).where(eq(researchDatasets.id, datasetId));
    await db.update(sharedDatasetCollectionRequests).set({ status: "completed", acceptedDailyBarCount: dailyBarCount, acceptedFiveMinuteBarCount: fiveMinuteBarCount, progressJson: { stage: "completed", message: "대용량 일봉·5분봉 원본을 청크 검증 후 공용 보관소에 고정했습니다.", totalSymbols: collection.symbolCount, completedDailySymbols: collection.symbolCount, completedFiveMinuteSymbols: collection.symbolCount, updatedAt: now.toISOString() }, completedAt: now }).where(eq(sharedDatasetCollectionRequests.id, requestId));
    return response.json({ status: "ready", requestId, datasetId, versionKey: dataset.versionKey, sourceFingerprint: dataset.sourceFingerprint, acceptedDailyBarCount: dailyBarCount, acceptedFiveMinuteBarCount: fiveMinuteBarCount });
  });

  app.post("/api/local-research-node/shared-dataset-collection-progress", async (request, response) => {
    response.setHeader("Cache-Control", "no-store, private, max-age=0");
    if (!isLocalResearchNodeAuthorized(request)) return response.status(401).json({ status: "unauthorized" });
    const body = request.body as { requestId?: unknown; message?: unknown; stage?: unknown; completedDailySymbols?: unknown; completedFiveMinuteSymbols?: unknown; totalSymbols?: unknown } | undefined;
    const requestId = Number(body?.requestId);
    if (!Number.isInteger(requestId) || requestId < 1) return response.status(400).json({ status: "invalid_request", message: "유효한 requestId가 필요합니다." });
    const db = await getDb();
    if (!db) return response.status(503).json({ status: "unavailable", message: "연구 데이터베이스를 사용할 수 없습니다." });
    const stage = typeof body?.stage === "string" ? body.stage.slice(0, 48) : "collecting";
    const message = typeof body?.message === "string" ? body.message.slice(0, 500) : "키움 원본을 읽고 있습니다.";
    const totalSymbols = Number.isInteger(body?.totalSymbols) ? Math.max(0, Math.min(20, Number(body!.totalSymbols))) : 0;
    const completedDailySymbols = Number.isInteger(body?.completedDailySymbols) ? Math.max(0, Math.min(totalSymbols || 20, Number(body!.completedDailySymbols))) : 0;
    const completedFiveMinuteSymbols = Number.isInteger(body?.completedFiveMinuteSymbols) ? Math.max(0, Math.min(totalSymbols || 20, Number(body!.completedFiveMinuteSymbols))) : 0;
    await db.update(sharedDatasetCollectionRequests).set({ progressJson: { stage, message, totalSymbols, completedDailySymbols, completedFiveMinuteSymbols, updatedAt: new Date().toISOString() } }).where(and(eq(sharedDatasetCollectionRequests.id, requestId), eq(sharedDatasetCollectionRequests.status, "running")));
    return response.json({ status: "progress_recorded" });
  });

  app.post("/api/local-research-node/shared-dataset-collection-status", async (request, response) => {
    response.setHeader("Cache-Control", "no-store, private, max-age=0");
    if (!isLocalResearchNodeAuthorized(request)) return response.status(401).json({ status: "unauthorized" });
    const body = request.body as { requestId?: unknown; message?: unknown; kind?: unknown; stage?: unknown; completedDailySymbols?: unknown; completedFiveMinuteSymbols?: unknown; totalSymbols?: unknown } | undefined;
    const requestId = Number(body?.requestId); const message = typeof body?.message === "string" ? body.message.slice(0, 500) : "고정 IP 원본 수집에 실패했습니다.";
    if (!Number.isInteger(requestId) || requestId < 1) return response.status(400).json({ status: "invalid_request", message: "유효한 requestId가 필요합니다." });
    const db = await getDb();
    if (!db) return response.status(503).json({ status: "unavailable", message: "연구 데이터베이스를 사용할 수 없습니다." });
    await db.update(sharedDatasetCollectionRequests).set({ status: "failed", lastError: message, progressJson: { stage: "failed", message, updatedAt: new Date().toISOString() }, completedAt: new Date() }).where(and(eq(sharedDatasetCollectionRequests.id, requestId), eq(sharedDatasetCollectionRequests.status, "running")));
    return response.json({ status: "recorded" });
  });

  app.get("/api/local-research-node/intraday-minute-backfill-plan", async (request, response) => {
    response.setHeader("Cache-Control", "no-store, private, max-age=0");
    if (!isLocalResearchNodeAuthorized(request)) return response.status(401).json({ status: "unauthorized" });
    const db = await getDb();
    if (!db) return response.status(503).json({ status: "unavailable", message: "연구 데이터베이스를 사용할 수 없습니다." });
    const rawYear = Number(request.query.year);
    const currentYear = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric" }).format(new Date()));
    const year = Number.isInteger(rawYear) && rawYear >= 2020 && rawYear <= currentYear ? rawYear : currentYear;
    const rawMaxSymbols = Number(request.query.maxSymbols);
    const maxSymbols = Number.isInteger(rawMaxSymbols) ? Math.max(1, Math.min(120, rawMaxSymbols)) : 60;
    const rawThreshold = Number(request.query.minAverageTurnoverWon);
    const minAverageTurnoverWon = Number.isSafeInteger(rawThreshold) && rawThreshold >= 0 ? rawThreshold : 10_000_000_000;
    const dailyBars = await db.select({ symbol: localResearchDailyBars.symbol, date: localResearchDailyBars.date, turnover: localResearchDailyBars.turnover }).from(localResearchDailyBars).where(eq(localResearchDailyBars.adjustmentBasis, "adjusted")).orderBy(desc(localResearchDailyBars.date)).limit(20_000);
    const runs = await db.select({ universeJson: autonomousResearchRuns.universeJson }).from(autonomousResearchRuns).where(eq(autonomousResearchRuns.dataStatus, "ready")).orderBy(desc(autonomousResearchRuns.updatedAt)).limit(40);
    const symbols = selectLiquidMinuteBackfillUniverse({ bars: dailyBars, knownNames: selectLocalDailyCollectionUniverse(runs, 120), thresholdWon: minAverageTurnoverWon, maxSymbols });
    if (!symbols.length) return response.status(409).json({ status: "waiting_for_liquid_universe", message: "최근 30거래일 평균 거래대금 기준을 충족하는 실제 일봉 유니버스가 없습니다.", minAverageTurnoverWon });
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
    const endDate = year === currentYear ? today : `${year}-12-31`;
    return response.json({ status: "ready", mode: "historical_multi_symbol_minute_backfill", year, startDate: `${year}-01-01`, endDate, source: "local_ka10081_recent_30_trading_days", minAverageTurnoverWon, universeCount: symbols.length, symbols, storage: { rawFormat: "gzip_json", retention: "local_research_node", serverFormat: "intraday_minute_bars", resume: "per_symbol" } });
  });

  app.get("/api/local-research-node/intraday-minute-collection-plan", async (request, response) => {
    response.setHeader("Cache-Control", "no-store, private, max-age=0");
    if (!isLocalResearchNodeAuthorized(request)) return response.status(401).json({ status: "unauthorized" });
    const db = await getDb();
    if (!db) return response.status(503).json({ status: "unavailable", message: "연구 데이터베이스를 사용할 수 없습니다." });
    const tradingDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
    const experiment = await ensureLocalIntradayExperiment(db, tradingDate);
    if (!experiment && shouldCloseIntradayExperiment({ tradingDate, capturedAt: new Date() })) {
      return response.status(409).json({ status: "market_closed", message: "장 마감으로 당일 모의 실험이 종료되어 추가 1분봉 수집을 계획하지 않습니다.", experimentId: null, tradingDate });
    }
    const positions = experiment?.status === "tracking"
      ? await db.select({ symbol: dayTradeExperimentPositions.symbol, name: dayTradeExperimentPositions.name }).from(dayTradeExperimentPositions).where(eq(dayTradeExperimentPositions.experimentId, experiment.id))
      : [];
    const runs = await db.select({ universeJson: autonomousResearchRuns.universeJson }).from(autonomousResearchRuns).where(eq(autonomousResearchRuns.dataStatus, "ready")).orderBy(desc(autonomousResearchRuns.updatedAt)).limit(40);
    const knownNames = selectLocalDailyCollectionUniverse(runs, 120);
    const recentDailyBars = await db.select({ symbol: localResearchDailyBars.symbol, date: localResearchDailyBars.date, turnover: localResearchDailyBars.turnover }).from(localResearchDailyBars).where(eq(localResearchDailyBars.adjustmentBasis, "adjusted")).orderBy(desc(localResearchDailyBars.date)).limit(20_000);
    const bootstrapQuotes = selectLiquidMinuteBackfillUniverse({ bars: recentDailyBars, knownNames, thresholdWon: 10_000_000_000, maxSymbols: 60 }).map(item => ({ symbol: item.symbol, name: item.name }));
    const quotes = positions.length ? positions : bootstrapQuotes;
    const [requestRow] = await db.select().from(localMinuteCollectionRequests).where(and(eq(localMinuteCollectionRequests.tradingDate, tradingDate), eq(localMinuteCollectionRequests.status, "queued"))).orderBy(desc(localMinuteCollectionRequests.requestedAt)).limit(1);
    if (requestRow) await db.update(localMinuteCollectionRequests).set({ status: "running", startedAt: new Date(), lastSeenAt: new Date() }).where(eq(localMinuteCollectionRequests.id, requestRow.id));
    const plan = buildIntradayMinuteCollectionPlan({
      tradingDate,
      experiment: experiment ? { id: experiment.id, tradingDate: experiment.tradingDate, status: experiment.status === "closed" ? "closed" : "tracking" } : null,
      quotes,
      request: requestRow ? { id: requestRow.id, requestedAt: requestRow.requestedAt } : null,
    });
    return response.status(plan.status === "ready" ? 200 : 409).json(plan);
  });

  app.post("/api/local-research-node/intraday-minute-sync", async (request, response) => {
    response.setHeader("Cache-Control", "no-store, private, max-age=0");
    if (!isLocalResearchNodeAuthorized(request)) return response.status(401).json({ status: "unauthorized" });
    const body = request.body as { tradingDate?: unknown; capturedAt?: unknown; bars?: unknown } | undefined;
    const tradingDate = typeof body?.tradingDate === "string" ? body.tradingDate : "";
    const capturedAt = typeof body?.capturedAt === "string" ? new Date(body.capturedAt) : new Date(NaN);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tradingDate) || Number.isNaN(capturedAt.getTime()) || !Array.isArray(body?.bars)) return response.status(400).json({ status: "invalid_request", message: "tradingDate, capturedAt, bars 배열이 필요합니다." });
    const submitted: LocalIntradayMinuteBar[] = [];
    for (const raw of body.bars) {
      const item = raw as Record<string, unknown>;
      const minuteAt = typeof item.minuteAt === "string" ? new Date(item.minuteAt) : new Date(NaN);
      submitted.push({ symbol: typeof item.symbol === "string" ? item.symbol.trim() : "", minuteAt, open: Number(item.open), high: Number(item.high), low: Number(item.low), close: Number(item.close), volume: Number(item.volume) });
    }
    const selected = selectClosedIntradayMinuteBars({ bars: submitted, tradingDate, capturedAt });
    if (!selected.bars.length) return response.status(400).json({ status: "invalid_request", message: "완결된 유효 1분봉이 없습니다.", rejectedBarCount: selected.rejected, diagnostics: { submittedBarCount: submitted.length, rejectedReasons: selected.rejectedReasons, tradingDate, capturedAt: capturedAt.toISOString() } });
    const db = await getDb();
    if (!db) return response.status(503).json({ status: "unavailable", message: "연구 데이터베이스를 사용할 수 없습니다." });
    const values = selected.bars.map(bar => ({ tradingDate, symbol: bar.symbol, minuteAt: bar.minuteAt, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: String(Math.trunc(bar.volume)), source: "kiwoom_ka10080", rawFingerprint: minuteBarFingerprint(bar), capturedAt }));
    await db.insert(intradayMinuteBars).values(values).onConflictDoUpdate({
      target: [intradayMinuteBars.tradingDate, intradayMinuteBars.symbol, intradayMinuteBars.minuteAt],
      set: { open: sql`excluded.open`, high: sql`excluded.high`, low: sql`excluded.low`, close: sql`excluded.close`, volume: sql`excluded.volume`, rawFingerprint: sql`excluded.rawFingerprint`, capturedAt: sql`excluded.capturedAt` },
    });
    const ensuredExperiment = await ensureLocalIntradayExperiment(db, tradingDate);
    const closedExperiment = await closeLocalIntradayExperimentAtMarketClose(db, { tradingDate, capturedAt });
    const experiment = closedExperiment ?? ensuredExperiment;
    return response.json({ status: "synced", tradingDate, acceptedBarCount: values.length, rejectedBarCount: selected.rejected, capturedAt: capturedAt.toISOString(), experimentId: experiment?.id ?? null, experimentStatus: experiment?.status ?? "waiting_for_historical_signals" });
  });

  app.post("/api/local-research-node/intraday-minute-backfill-sync", async (request, response) => {
    response.setHeader("Cache-Control", "no-store, private, max-age=0");
    if (!isLocalResearchNodeAuthorized(request)) return response.status(401).json({ status: "unauthorized" });
    const body = request.body as { year?: unknown; capturedAt?: unknown; bars?: unknown } | undefined;
    const year = Number(body?.year);
    const capturedAt = typeof body?.capturedAt === "string" ? new Date(body.capturedAt) : new Date(NaN);
    const currentYear = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric" }).format(new Date()));
    if (!Number.isInteger(year) || year < 2020 || year > currentYear || Number.isNaN(capturedAt.getTime()) || !Array.isArray(body?.bars) || body.bars.length < 1 || body.bars.length > 10_000) return response.status(400).json({ status: "invalid_request", message: "유효한 year, capturedAt, 최대 10,000개 bars 배열이 필요합니다." });
    const submitted: LocalIntradayMinuteBar[] = [];
    for (const raw of body.bars) {
      const item = raw as Record<string, unknown>;
      const minuteAt = typeof item.minuteAt === "string" ? new Date(item.minuteAt) : new Date(NaN);
      submitted.push({ symbol: typeof item.symbol === "string" ? item.symbol.trim() : "", minuteAt, open: Number(item.open), high: Number(item.high), low: Number(item.low), close: Number(item.close), volume: Number(item.volume) });
    }
    const byTradingDate = new Map<string, LocalIntradayMinuteBar[]>();
    for (const bar of submitted) {
      const tradingDate = Number.isNaN(bar.minuteAt.getTime()) ? "invalid" : koreanTradingDate(bar.minuteAt);
      if (!tradingDate.startsWith(`${year}-`)) continue;
      const items = byTradingDate.get(tradingDate) ?? [];
      items.push(bar);
      byTradingDate.set(tradingDate, items);
    }
    const selectedBars: Array<LocalIntradayMinuteBar & { tradingDate: string }> = [];
    let rejectedBarCount = submitted.length - Array.from(byTradingDate.values()).reduce((total, bars) => total + bars.length, 0);
    for (const [tradingDate, bars] of Array.from(byTradingDate.entries())) {
      const selected = selectClosedIntradayMinuteBars({ bars, tradingDate, capturedAt });
      rejectedBarCount += selected.rejected;
      selectedBars.push(...selected.bars.map(bar => ({ ...bar, tradingDate })));
    }
    if (!selectedBars.length) return response.status(400).json({ status: "invalid_request", message: "유효한 과거 완결 1분봉이 없습니다.", rejectedBarCount });
    const db = await getDb();
    if (!db) return response.status(503).json({ status: "unavailable", message: "연구 데이터베이스를 사용할 수 없습니다." });
    for (let offset = 0; offset < selectedBars.length; offset += 1_000) {
      const values = selectedBars.slice(offset, offset + 1_000).map(bar => ({ tradingDate: bar.tradingDate, symbol: bar.symbol, minuteAt: bar.minuteAt, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: String(Math.trunc(bar.volume)), source: "kiwoom_ka10080", rawFingerprint: minuteBarFingerprint(bar), capturedAt }));
      await db.insert(intradayMinuteBars).values(values).onConflictDoUpdate({
        target: [intradayMinuteBars.tradingDate, intradayMinuteBars.symbol, intradayMinuteBars.minuteAt],
        set: { open: sql`excluded.open`, high: sql`excluded.high`, low: sql`excluded.low`, close: sql`excluded.close`, volume: sql`excluded.volume`, rawFingerprint: sql`excluded.rawFingerprint`, capturedAt: sql`excluded.capturedAt` },
      });
    }
    return response.json({ status: "synced", year, acceptedBarCount: selectedBars.length, rejectedBarCount, tradingDateCount: byTradingDate.size, capturedAt: capturedAt.toISOString() });
  });

  app.post("/api/local-research-node/daily-bar-sync", async (request, response) => {
    response.setHeader("Cache-Control", "no-store, private, max-age=0");
    if (!isLocalResearchNodeAuthorized(request)) return response.status(401).json({ status: "unauthorized" });
    const body = request.body as { symbol?: unknown; adjustmentBasis?: unknown; bars?: unknown } | undefined;
    const symbol = typeof body?.symbol === "string" ? body.symbol.trim() : "";
    const adjustmentBasis: "adjusted" | "unadjusted" | null = body?.adjustmentBasis === "adjusted" || body?.adjustmentBasis === "unadjusted" ? body.adjustmentBasis : null;
    if (!/^\d{6}$/.test(symbol) || !adjustmentBasis || !Array.isArray(body?.bars)) return response.status(400).json({ status: "invalid_request", message: "6자리 symbol, adjustmentBasis, bars 배열이 필요합니다." });
    const submitted = body.bars.map(raw => {
      const item = raw as Record<string, unknown>;
      return {
        date: typeof item.date === "string" ? item.date.trim() : "",
        open: Number(item.open),
        high: Number(item.high),
        low: Number(item.low),
        close: Number(item.close),
        volume: Number(item.volume),
        turnover: Number(item.turnover),
      } satisfies LocalDailyBar;
    });
    const selected = selectValidLocalDailyBars({ bars: submitted });
    if (!selected.bars.length) return response.status(400).json({ status: "invalid_request", message: "유효한 실제 일봉이 없습니다.", submittedBarCount: submitted.length, rejectedBarCount: selected.rejected });
    const db = await getDb();
    if (!db) return response.status(503).json({ status: "unavailable", message: "연구 데이터베이스를 사용할 수 없습니다." });
    const capturedAt = new Date();
    const values = selected.bars.map(bar => ({
      symbol,
      date: bar.date,
      adjustmentBasis,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: String(bar.volume),
      turnover: String(bar.turnover),
      source: "kiwoom_ka10081",
      rawFingerprint: dailyBarFingerprint({ symbol, adjustmentBasis, bar }),
      capturedAt,
    }));
    await db.insert(localResearchDailyBars).values(values).onConflictDoUpdate({
      target: [localResearchDailyBars.symbol, localResearchDailyBars.date, localResearchDailyBars.adjustmentBasis],
      set: {
        open: sql`excluded.open`, high: sql`excluded.high`, low: sql`excluded.low`, close: sql`excluded.close`, volume: sql`excluded.volume`, turnover: sql`excluded.turnover`, rawFingerprint: sql`excluded.rawFingerprint`, capturedAt: sql`excluded.capturedAt`,
      },
    });
    return response.json({ status: "synced", symbol, adjustmentBasis, acceptedBarCount: values.length, rejectedBarCount: selected.rejected, deduplicatedBarCount: selected.deduplicated, capturedAt: capturedAt.toISOString() });
  });

  app.post("/api/local-research-node/daily-dataset-promote", async (request, response) => {
    response.setHeader("Cache-Control", "no-store, private, max-age=0");
    if (!isLocalResearchNodeAuthorized(request)) return response.status(401).json({ status: "unauthorized" });
    const body = request.body as { symbol?: unknown; symbols?: unknown; adjustmentBasis?: unknown } | undefined;
    const requestedSymbols = Array.from(new Set([
      ...(typeof body?.symbol === "string" ? [body.symbol] : []),
      ...(Array.isArray(body?.symbols) ? body.symbols.filter((item): item is string => typeof item === "string") : []),
    ].map(symbol => symbol.trim()).filter(symbol => /^\d{6}$/.test(symbol)))).sort();
    const adjustmentBasis: "adjusted" | "unadjusted" | null = body?.adjustmentBasis === "adjusted" || body?.adjustmentBasis === "unadjusted" ? body.adjustmentBasis : null;
    if (!requestedSymbols.length || !adjustmentBasis) return response.status(400).json({ status: "invalid_request", message: "6자리 symbol 또는 symbols 배열과 adjustmentBasis가 필요합니다." });
    const db = await getDb();
    if (!db) return response.status(503).json({ status: "unavailable", message: "연구 데이터베이스를 사용할 수 없습니다." });
    const bars = await db.select().from(localResearchDailyBars).where(and(inArray(localResearchDailyBars.symbol, requestedSymbols), eq(localResearchDailyBars.adjustmentBasis, adjustmentBasis))).orderBy(asc(localResearchDailyBars.symbol), asc(localResearchDailyBars.date));
    const barCountBySymbol = new Map<string, number>();
    for (const bar of bars) barCountBySymbol.set(bar.symbol, (barCountBySymbol.get(bar.symbol) ?? 0) + 1);
    const insufficientSymbols = requestedSymbols.filter(symbol => (barCountBySymbol.get(symbol) ?? 0) < 85);
    if (insufficientSymbols.length) return response.status(409).json({ status: "insufficient_source_data", message: "불변 데이터셋에는 종목별 최소 85개의 실제 일봉이 필요합니다.", insufficientSymbols, acceptedBarCountBySymbol: Object.fromEntries(barCountBySymbol) });
    const owner = (await db.select().from(users).where(eq(users.role, "admin")).orderBy(asc(users.id)).limit(1))[0];
    if (!owner) return response.status(409).json({ status: "owner_missing", message: "리서치 데이터셋 소유 운영자를 찾을 수 없습니다." });
    const version = requestedSymbols.length === 1
      ? buildLocalDailyDatasetVersion({ symbol: requestedSymbols[0]!, adjustmentBasis, bars })
      : buildLocalDailyUniverseDatasetVersion({ symbols: requestedSymbols, adjustmentBasis, bars });
    const existing = (await db.select().from(researchDatasets).where(and(eq(researchDatasets.userId, owner.id), eq(researchDatasets.versionKey, version.versionKey))).limit(1))[0];
    if (existing?.qualityStatus === "ready") return response.json({ status: "ready", datasetId: existing.id, versionKey: existing.versionKey, barCount: existing.barCount, sourceFingerprint: version.sourceFingerprint, reused: true });
    const now = new Date();
    const dates = bars.map(bar => bar.date).sort();
    let datasetId = existing?.id;
    if (datasetId) {
      await db.update(researchDatasets).set({ qualityStatus: "collecting", qualityReportJson: { state: "collecting", source: "local_research_daily_bars", rawSource: "kiwoom_ka10081", sourceFingerprint: version.sourceFingerprint, immutable: true, symbols: requestedSymbols, symbolCount: requestedSymbols.length } }).where(eq(researchDatasets.id, datasetId));
    } else {
      const [created] = await db.insert(researchDatasets).values({
        userId: owner.id,
        name: `로컬 키움 실제 일봉 ${requestedSymbols.length}종목 ${dates[0]}~${dates.at(-1)}`,
        source: "kiwoom_daily",
        versionKey: version.versionKey,
        universeJson: requestedSymbols.map(symbol => ({ symbol, name: symbol })),
        startDate: dates[0]!,
        endDate: dates.at(-1)!,
        barCount: bars.length,
        adjustmentBasis,
        qualityStatus: "collecting",
        qualityReportJson: { state: "collecting", source: "local_research_daily_bars", rawSource: "kiwoom_ka10081", sourceFingerprint: version.sourceFingerprint, immutable: true, symbols: requestedSymbols, symbolCount: requestedSymbols.length },
        sourceCapturedAt: now,
      }).returning();
      datasetId = created.id;
    }
    try {
      const snapshotRows = bars.map(bar => ({ datasetId: datasetId!, symbol: bar.symbol, date: bar.date, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: String(bar.volume), turnover: String(bar.turnover), source: "kiwoom_ka10081_local_snapshot", capturedAt: now }));
      for (let offset = 0; offset < snapshotRows.length; offset += 100) {
        await db.insert(researchDailyBars).values(snapshotRows.slice(offset, offset + 100)).onConflictDoUpdate({
          target: [researchDailyBars.datasetId, researchDailyBars.symbol, researchDailyBars.date],
          set: { capturedAt: now },
        });
      }
      await db.update(researchDatasets).set({ qualityStatus: "ready", readyAt: now, qualityReportJson: { state: "ready", source: "local_research_daily_bars", rawSource: "kiwoom_ka10081", sourceFingerprint: version.sourceFingerprint, immutable: true, symbols: requestedSymbols, symbolCount: requestedSymbols.length, adjustmentBasis, barCount: bars.length, startDate: dates[0], endDate: dates.at(-1), barCountBySymbol: Object.fromEntries(barCountBySymbol) } }).where(eq(researchDatasets.id, datasetId!));
      return response.json({ status: "ready", datasetId, versionKey: version.versionKey, barCount: bars.length, symbolCount: requestedSymbols.length, sourceFingerprint: version.sourceFingerprint, reused: false });
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 500) : "원본 스냅샷 저장에 실패했습니다.";
      await db.update(researchDatasets).set({ qualityStatus: "error", qualityReportJson: { state: "error", source: "local_research_daily_bars", sourceFingerprint: version.sourceFingerprint, error: message } }).where(eq(researchDatasets.id, datasetId!));
      return response.status(500).json({ status: "snapshot_failed", message });
    }
  });

  app.post("/api/local-research-node/daily-dataset-research", async (request, response) => {
    response.setHeader("Cache-Control", "no-store, private, max-age=0");
    if (!isLocalResearchNodeAuthorized(request)) return response.status(401).json({ status: "unauthorized" });
    const datasetId = Number((request.body as { datasetId?: unknown } | undefined)?.datasetId);
    if (!Number.isInteger(datasetId) || datasetId < 1) return response.status(400).json({ status: "invalid_request", message: "유효한 datasetId가 필요합니다." });
    const result = await publicHistoricalBacktest.runLocalSnapshot(datasetId);
    return response.status(result.status === "waiting" ? 409 : 200).json({ ...result, datasetId, source: "kiwoom_ka10081_local_snapshot" });
  });

  app.post("/api/local-research-node/intraday-minute-collection-status", async (request, response) => {
    response.setHeader("Cache-Control", "no-store, private, max-age=0");
    if (!isLocalResearchNodeAuthorized(request)) return response.status(401).json({ status: "unauthorized" });
    const body = request.body as { requestId?: unknown; status?: unknown; acceptedBarCount?: unknown; rejectedBarCount?: unknown; message?: unknown } | undefined;
    const requestId = Number(body?.requestId);
    const status = body?.status === "completed" ? "completed" : body?.status === "failed" ? "failed" : null;
    const acceptedBarCount = Math.max(0, Math.floor(Number(body?.acceptedBarCount ?? 0)));
    const rejectedBarCount = Math.max(0, Math.floor(Number(body?.rejectedBarCount ?? 0)));
    const message = typeof body?.message === "string" ? body.message.trim().slice(0, 500) : null;
    if (!Number.isInteger(requestId) || requestId < 1 || !status || !Number.isFinite(acceptedBarCount) || !Number.isFinite(rejectedBarCount)) return response.status(400).json({ status: "invalid_request", message: "요청 ID와 완료·실패 상태가 올바르지 않습니다." });
    const db = await getDb();
    if (!db) return response.status(503).json({ status: "unavailable", message: "연구 데이터베이스를 사용할 수 없습니다." });
    await db.update(localMinuteCollectionRequests).set({ status, acceptedBarCount, rejectedBarCount, lastError: status === "failed" ? message ?? "1분봉 수집 실패" : null, completedAt: new Date(), lastSeenAt: new Date() }).where(eq(localMinuteCollectionRequests.id, requestId));
    return response.json({ status: "recorded" });
  });

  app.post("/api/local-research-node/intraday-price-sync", async (request, response) => {
    response.setHeader("Cache-Control", "no-store, private, max-age=0");
    if (!isLocalResearchNodeAuthorized(request)) return response.status(401).json({ status: "unauthorized" });
    const body = request.body as { tradingDate?: unknown; quotes?: unknown } | undefined;
    if (!body || typeof body.tradingDate !== "string" || !Array.isArray(body.quotes)) return response.status(400).json({ status: "invalid_request", message: "tradingDate와 quotes 배열이 필요합니다." });
    const parsedQuotes: LocalIntradayQuote[] = [];
    let rejected = 0;
    for (const raw of body.quotes) {
      const item = raw as Record<string, unknown>;
      const symbol = typeof item.symbol === "string" ? item.symbol.trim() : "";
      const price = Number(item.price);
      const observedAt = typeof item.observedAt === "string" ? new Date(item.observedAt) : new Date(NaN);
      if (!symbol || symbol.length > 24 || !Number.isInteger(price) || price < 1 || Number.isNaN(observedAt.getTime())) {
        rejected += 1;
        continue;
      }
      parsedQuotes.push({ symbol, price, observedAt });
    }
    if (!parsedQuotes.length) return response.status(400).json({ status: "invalid_request", message: "유효한 실제 시세가 없습니다.", rejected });
    const db = await getDb();
    if (!db) return response.status(503).json({ status: "unavailable", message: "연구 데이터베이스를 사용할 수 없습니다." });
    const [experiment] = await db.select().from(dayTradeExperiments).where(and(eq(dayTradeExperiments.status, "tracking"), eq(dayTradeExperiments.tradingDate, body.tradingDate))).orderBy(desc(dayTradeExperiments.updatedAt)).limit(1);
    if (!experiment) return response.status(409).json({ status: "waiting_for_data", message: "해당 거래일의 추적 중인 장중 모의투자 기록이 없습니다." });
    const positions = await db.select().from(dayTradeExperimentPositions).where(eq(dayTradeExperimentPositions.experimentId, experiment.id));
    const { latestBySymbol, ignored } = selectFreshIntradayQuotes({ quotes: parsedQuotes, lastObservedAtBySymbol: new Map(positions.map(position => [position.symbol, position.lastObservedAt])) });
    if (!latestBySymbol.size) {
      await db.insert(localResearchNodeSyncEvents).values({ experimentId: experiment.id, tradingDate: experiment.tradingDate, status: "partial", quoteCount: 0, rejectedQuoteCount: rejected + ignored, message: "저장된 실제 시세보다 새로운 값이 없습니다." });
      return response.json({ status: "synced", experimentId: experiment.id, acceptedQuoteCount: 0, rejectedQuoteCount: rejected + ignored, message: "저장된 실제 시세보다 새로운 값이 없습니다." });
    }
    const portfolio = calculateDayTradePortfolio(positions.map(position => ({ id: String(position.id), entryPrice: position.entryPrice, currentPrice: latestBySymbol.get(position.symbol)?.price ?? position.lastPrice ?? undefined })), experiment.totalCapital, Number(experiment.buyFeeRate));
    const ledgerById = new Map(portfolio.positions.map(ledger => [ledger.id, ledger]));
    for (const position of positions) {
      const quote = latestBySymbol.get(position.symbol);
      const ledger = ledgerById.get(String(position.id));
      if (!ledger) continue;
      await db.update(dayTradeExperimentPositions).set({ lastPrice: quote?.price ?? position.lastPrice, lastObservedAt: quote?.observedAt ?? position.lastObservedAt, buyFee: ledger.buyFee, estimatedExitFee: ledger.estimatedExitFee, netValue: Math.round(ledger.netValue), netPnl: Math.round(ledger.netPnl), netReturnPercent: ledger.netReturnPercent.toFixed(4) }).where(eq(dayTradeExperimentPositions.id, position.id));
    }
    await db.update(dayTradeExperiments).set({ netValue: Math.round(portfolio.netValue), netPnl: Math.round(portfolio.netPnl), netReturnPercent: portfolio.netReturnPercent.toFixed(4) }).where(eq(dayTradeExperiments.id, experiment.id));
    const latestObservedAt = Array.from(latestBySymbol.values()).reduce((latest, quote) => !latest || quote.observedAt > latest ? quote.observedAt : latest, null as Date | null);
    await db.insert(localResearchNodeSyncEvents).values({ experimentId: experiment.id, tradingDate: experiment.tradingDate, status: rejected ? "partial" : "success", quoteCount: latestBySymbol.size, rejectedQuoteCount: rejected + ignored, message: rejected ? "일부 시세 입력이 거부되었습니다." : null, observedAt: latestObservedAt });
    return response.json({ status: "synced", experimentId: experiment.id, acceptedQuoteCount: latestBySymbol.size, rejectedQuoteCount: rejected + ignored, latestObservedAt: latestObservedAt?.toISOString() ?? null, netValue: Math.round(portfolio.netValue), netPnl: Math.round(portfolio.netPnl), netReturnPercent: portfolio.netReturnPercent });
  });

  app.post("/api/local-research-node/intraday-price-status", async (request, response) => {
    response.setHeader("Cache-Control", "no-store, private, max-age=0");
    if (!isLocalResearchNodeAuthorized(request)) return response.status(401).json({ status: "unauthorized" });
    const body = request.body as { tradingDate?: unknown; experimentId?: unknown; status?: unknown; quoteCount?: unknown; rejectedQuoteCount?: unknown; message?: unknown; observedAt?: unknown } | undefined;
    const tradingDate = typeof body?.tradingDate === "string" ? body.tradingDate : "";
    const status = body?.status === "partial" ? "partial" : body?.status === "failed" ? "failed" : null;
    const experimentId = Number(body?.experimentId);
    const quoteCount = Math.max(0, Math.floor(Number(body?.quoteCount ?? 0)));
    const rejectedQuoteCount = Math.max(0, Math.floor(Number(body?.rejectedQuoteCount ?? 0)));
    const message = typeof body?.message === "string" ? body.message.trim().slice(0, 500) : null;
    const observedAt = typeof body?.observedAt === "string" ? new Date(body.observedAt) : null;
    if (!tradingDate || !status || !message || !Number.isFinite(quoteCount) || !Number.isFinite(rejectedQuoteCount) || (observedAt && Number.isNaN(observedAt.getTime()))) return response.status(400).json({ status: "invalid_request", message: "실패·부분 실패 상태 기록에 필요한 값이 올바르지 않습니다." });
    const db = await getDb();
    if (!db) return response.status(503).json({ status: "unavailable", message: "연구 데이터베이스를 사용할 수 없습니다." });
    await db.insert(localResearchNodeSyncEvents).values({ experimentId: Number.isInteger(experimentId) && experimentId > 0 ? experimentId : null, tradingDate, status, quoteCount, rejectedQuoteCount, message, observedAt });
    return response.json({ status: "recorded" });
  });

  app.get("/api/local-research-node/auto-order-plan", async (request, response) => {
    response.setHeader("Cache-Control", "no-store, private, max-age=0");
    if (!isLocalResearchNodeAuthorized(request)) return response.status(401).json({ status: "unauthorized" });
    const db = await getDb();
    if (!db) return response.status(503).json({ status: "unavailable", message: "연구 데이터베이스를 사용할 수 없습니다." });

    const tradingDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
    const experiment = await ensureLocalIntradayExperiment(db, tradingDate);
    if (!experiment) return response.status(409).json({ status: "waiting_for_data", message: "장중 실시간 모의투자 조건식 기록이 아직 없습니다." });
    if (experiment.status !== "tracking") return response.status(409).json({ status: "market_closed", message: "장 마감으로 당일 모의 실험이 종료되어 새 자동 주문 계획을 만들지 않습니다.", experimentId: experiment.id, tradingDate: experiment.tradingDate });
    const [policy] = await db.select().from(autoTradePolicies).where(eq(autoTradePolicies.status, "active")).orderBy(desc(autoTradePolicies.updatedAt)).limit(1);
    if (!policy) return response.status(409).json({ status: "waiting_for_policy", message: "활성 자동 실투 정책이 아직 없습니다." });
    const profile = (await db.select().from(tradingProfiles).where(eq(tradingProfiles.userId, policy.userId)).limit(1))[0];
    if (!profile || profile.killSwitch || !profile.autoTradeEnabled) return response.status(409).json({ status: "automatic_execution_paused", message: "자동매매 활성화와 킬 스위치 해제가 필요합니다." });
    const positions = await db.select().from(dayTradeExperimentPositions).where(eq(dayTradeExperimentPositions.experimentId, experiment.id));
    const candidateIds = Array.from(new Set(positions.map(position => position.candidateId)));
    const candidates = candidateIds.length
      ? await db.select({ id: autonomousResearchCandidates.id, fitnessScore: autonomousResearchCandidates.fitnessScore }).from(autonomousResearchCandidates).where(inArray(autonomousResearchCandidates.id, candidateIds))
      : [];
    const fitnessByCandidateId = new Map(candidates.map(candidate => [candidate.id, Number(candidate.fitnessScore ?? 0)]));
    const plan = buildLocalAutoOrderPlan({
      experimentId: experiment.id,
      tradingDate: experiment.tradingDate,
      policyVersion: String(policy.version),
      totalCapital: policy.totalCapital,
      policyId: policy.id,
      positions,
      fitnessByCandidateId,
      maxPositions: policy.maxConcurrentPositions,
    });
    return response.json({ ...plan, totalCapital: policy.totalCapital, policy: {
      id: policy.id,
      version: policy.version,
      totalCapital: policy.totalCapital,
      maxConcurrentPositions: policy.maxConcurrentPositions,
      stopLossPercent: Number(policy.stopLossPercent),
      takeProfitPercent: Number(policy.takeProfitPercent),
      dailyLossLimitPercent: Number(policy.dailyLossLimitPercent),
    } });
  });

  app.post("/api/local-research-node/execution-sync", async (request, response) => {
    response.setHeader("Cache-Control", "no-store, private, max-age=0");
    if (!isLocalResearchNodeAuthorized(request)) return response.status(401).json({ status: "unauthorized" });
    const body = request.body as { policyId?: unknown; policyVersion?: unknown; orders?: unknown; positions?: unknown } | undefined;
    if (!body || !Array.isArray(body.orders) || !Array.isArray(body.positions)) return response.status(400).json({ status: "invalid_request", message: "주문과 포지션 배열이 필요합니다." });
    const db = await getDb();
    if (!db) return response.status(503).json({ status: "unavailable", message: "연구 데이터베이스를 사용할 수 없습니다." });
    const policyId = Number(body.policyId);
    const policyVersion = Number(body.policyVersion);
    const [policy] = await db.select().from(autoTradePolicies).where(and(eq(autoTradePolicies.id, policyId), eq(autoTradePolicies.version, policyVersion))).limit(1);
    if (!policy) return response.status(409).json({ status: "policy_missing", message: "실행 시작 시점의 자동 실투 정책 기록을 찾을 수 없습니다." });
    const policySnapshot = { id: policy.id, version: policy.version, totalCapital: policy.totalCapital, maxConcurrentPositions: policy.maxConcurrentPositions, stopLossPercent: Number(policy.stopLossPercent), takeProfitPercent: Number(policy.takeProfitPercent), dailyLossLimitPercent: Number(policy.dailyLossLimitPercent) };
    const accepted: number[] = [];
    for (const raw of body.orders) {
      const item = raw as Record<string, unknown>;
      const side = item.side === "sell" ? "sell" : item.side === "buy" ? "buy" : null;
      const status = item.status === "rejected" ? "rejected" : item.status === "filled" ? "filled" : item.status === "submitted" ? "submitted" : null;
      const candidateId = Number(item.candidateId);
      const hasCandidateId = Number.isInteger(candidateId) && candidateId > 0;
      const quantity = Number(item.quantity);
      const price = Number(item.price);
      const symbol = typeof item.symbol === "string" ? item.symbol.trim() : "";
      const name = typeof item.name === "string" && item.name.trim() ? item.name.trim() : symbol;
      const dedupeKey = typeof item.dedupeKey === "string" ? item.dedupeKey.trim() : "";
      if (!side || !status || (side === "buy" && !hasCandidateId) || !Number.isInteger(quantity) || quantity < 1 || !Number.isInteger(price) || price < 1 || !symbol || !dedupeKey || dedupeKey.length > 160) continue;
      let intent = (await db.select().from(orderIntents).where(and(eq(orderIntents.userId, policy.userId), eq(orderIntents.dedupeKey, dedupeKey))).limit(1))[0];
      if (!intent) {
        const [created] = await db.insert(orderIntents).values({ userId: policy.userId, sourceCandidateId: hasCandidateId ? candidateId : null, symbol, name, side, orderType: "limit", quantity, price, amount: quantity * price, status, riskReasonsJson: status === "rejected" ? [String(item.message ?? "로컬 실행기에서 주문이 거부되었습니다.")] : [], autoPolicyId: policy.id, autoPolicyVersion: policy.version, autoPolicySnapshotJson: policySnapshot, executionOrigin: "local_node", dedupeKey, brokerOrderId: typeof item.brokerOrderId === "string" ? item.brokerOrderId : null }).returning();
        intent = (await db.select().from(orderIntents).where(eq(orderIntents.id, created.id)).limit(1))[0];
      } else if (["submitted", "filled"].includes(status) && intent.status !== "filled") {
        await db.update(orderIntents).set({ status, brokerOrderId: typeof item.brokerOrderId === "string" ? item.brokerOrderId : intent.brokerOrderId }).where(eq(orderIntents.id, intent.id));
      }
      if (!intent) continue;
      const prior = await db.select({ id: orderExecutions.id }).from(orderExecutions).where(and(eq(orderExecutions.orderIntentId, intent.id), eq(orderExecutions.executionStatus, status))).limit(1);
      if (!prior.length) await db.insert(orderExecutions).values({ orderIntentId: intent.id, brokerOrderId: typeof item.brokerOrderId === "string" ? item.brokerOrderId : null, executionStatus: status, filledQuantity: status === "filled" ? quantity : 0, filledPrice: status === "filled" ? price : null, responseJson: { source: "local_research_node", message: item.message ?? null } });
      accepted.push(intent.id);
    }
    for (const raw of body.positions) {
      const item = raw as Record<string, unknown>;
      const symbol = typeof item.symbol === "string" ? item.symbol.trim() : "";
      const name = typeof item.name === "string" && item.name.trim() ? item.name.trim() : symbol;
      const quantity = Number(item.quantity); const averagePrice = Number(item.averagePrice); const currentPrice = Number(item.currentPrice); const profitLoss = Number(item.profitLoss); const profitLossRate = Number(item.profitLossRate);
      if (!symbol || ![quantity, averagePrice, currentPrice, profitLoss, profitLossRate].every(Number.isFinite) || quantity < 0 || averagePrice < 0 || currentPrice < 0) continue;
      await db.insert(positionSnapshots).values({ userId: policy.userId, symbol, name, quantity: Math.floor(quantity), averagePrice: Math.floor(averagePrice), currentPrice: Math.floor(currentPrice), profitLoss: Math.floor(profitLoss), profitLossRate: String(profitLossRate) });
    }
    return response.json({ status: "synced", orderIntentIds: accepted, policyVersion: policy.version });
  });
}
