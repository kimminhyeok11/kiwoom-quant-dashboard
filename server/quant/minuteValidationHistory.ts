import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { autonomousResearchCandidates, dayTradeExperimentPositions, dayTradeExperiments, intradayMinuteBars } from "../../drizzle/schema";
import type { ConditionExpressionGroup } from "../../shared/trading";
import { getDb } from "../db";
import { evaluateMinuteExpression } from "./minuteValidation";

export async function getLatestMinuteValidationHistory() {
  const db = await getDb();
  if (!db) return { experiment: null, assumptions: null, results: [] };
  const experiment = (await db.select().from(dayTradeExperiments).where(eq(dayTradeExperiments.status, "tracking")).orderBy(desc(dayTradeExperiments.updatedAt)).limit(1))[0] ?? null;
  if (!experiment) return { experiment: null, assumptions: null, results: [] };
  const positions = await db.select({ candidateId: dayTradeExperimentPositions.candidateId, symbol: dayTradeExperimentPositions.symbol, name: dayTradeExperimentPositions.name }).from(dayTradeExperimentPositions).where(eq(dayTradeExperimentPositions.experimentId, experiment.id));
  const candidateIds = Array.from(new Set(positions.map(position => position.candidateId)));
  const symbols = Array.from(new Set(positions.map(position => position.symbol)));
  if (!candidateIds.length || !symbols.length) return { experiment, assumptions: null, results: [] };
  const [candidates, bars] = await Promise.all([
    db.select({ id: autonomousResearchCandidates.id, fingerprint: autonomousResearchCandidates.fingerprint, rootGenomeJson: autonomousResearchCandidates.rootGenomeJson, minimumScore: autonomousResearchCandidates.minimumScore }).from(autonomousResearchCandidates).where(inArray(autonomousResearchCandidates.id, candidateIds)),
    db.select().from(intradayMinuteBars).where(and(eq(intradayMinuteBars.tradingDate, experiment.tradingDate), inArray(intradayMinuteBars.symbol, symbols))).orderBy(asc(intradayMinuteBars.symbol), asc(intradayMinuteBars.minuteAt)),
  ]);
  const candidateById = new Map(candidates.map(candidate => [candidate.id, candidate]));
  const barsBySymbol = bars.reduce<Record<string, Array<{ minuteAt: Date; open: number; high: number; low: number; close: number; volume: number }>>>((result, bar) => {
    (result[bar.symbol] ??= []).push({ minuteAt: bar.minuteAt, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: Number(bar.volume) });
    return result;
  }, {});
  const assumptions = { feeRate: Number(experiment.buyFeeRate), stopLossPercent: 2, takeProfitPercent: 4, maxHoldingBars: 30, entryTiming: "다음 완결 1분봉 시가", sameBarPriority: "손절 우선", turnoverBasis: "종가×거래량" };
  const results = positions.flatMap(position => {
    const candidate = candidateById.get(position.candidateId);
    const minuteBars = barsBySymbol[position.symbol] ?? [];
    if (!candidate || !minuteBars.length) return [];
    const validation = evaluateMinuteExpression({ expression: candidate.rootGenomeJson as ConditionExpressionGroup, minimumScore: candidate.minimumScore, bars: minuteBars, policy: assumptions });
    const minuteState = minuteBars.length < 60 ? "learning" as const : validation.tradeCount < 2 ? "watching" as const : validation.netPnl > 0 && validation.winRate >= 50 ? "surviving" as const : "rejected" as const;
    const minuteFitness = Math.round(validation.netPnl + validation.winRate * 100 + validation.tradeCount * 10);
    return [{ candidateId: candidate.id, candidateFingerprint: candidate.fingerprint, symbol: position.symbol, name: position.name, barCount: minuteBars.length, firstMinuteAt: minuteBars[0]?.minuteAt ?? null, lastMinuteAt: minuteBars.at(-1)?.minuteAt ?? null, minuteState, minuteFitness, ...validation }];
  });
  const ranked = [...results].sort((left, right) => right.minuteFitness - left.minuteFitness || right.netPnl - left.netPnl || left.symbol.localeCompare(right.symbol));
  const selection = {
    evaluatedCandidateCount: ranked.length,
    learningCandidateCount: ranked.filter(item => item.minuteState === "learning").length,
    watchingCandidateCount: ranked.filter(item => item.minuteState === "watching").length,
    survivingCandidateCount: ranked.filter(item => item.minuteState === "surviving").length,
    rejectedCandidateCount: ranked.filter(item => item.minuteState === "rejected").length,
    nextGenerationRule: "분 단위 선발 결과는 당일 데이트레이딩 후보 순위에 반영되고, 다음 일일 유전자 탐색은 저장된 실제 데이터의 장기 검증 결과를 함께 사용합니다.",
  };
  return { experiment, assumptions, results: ranked, selection };
}
