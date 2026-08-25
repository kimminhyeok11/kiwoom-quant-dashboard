import { fingerprintResearchGenome, generateUniqueGenomes, type EvolutionRuleType } from "./evolution";
import { AUTONOMOUS_RESEARCH_POLICY } from "./autonomousResearch";
import { runDailyBacktest } from "./backtest";
import type { DailyBar } from "./conditions";
import { calculateFitness } from "./evolution";
import type { ConditionExpressionGroup } from "../../shared/trading";

export type AutonomousUniverseItem = { symbol: string; name: string; turnover: number; price: number; changeRate: number };

export const AUTONOMOUS_ALLOWED_RULE_TYPES: EvolutionRuleType[] = ["macd_rising", "ma_position", "high_return", "turnover", "rsi", "bollinger", "stochastic", "atr_percent", "volume_ratio"];

export const AUTONOMOUS_EVOLUTION_CONFIGURATION = {
  populationSize: AUTONOMOUS_RESEARCH_POLICY.populationSize,
  minRules: AUTONOMOUS_RESEARCH_POLICY.minRules,
  maxRules: AUTONOMOUS_RESEARCH_POLICY.maxRules,
  maxDepth: AUTONOMOUS_RESEARCH_POLICY.maxDepth,
  allowedRuleTypes: AUTONOMOUS_ALLOWED_RULE_TYPES,
  eliteCount: 12,
  crossoverRate: 0.72,
  mutationRate: 0.28,
  minimumTrades: AUTONOMOUS_RESEARCH_POLICY.minimumTrades,
  maxDrawdownLimit: AUTONOMOUS_RESEARCH_POLICY.maxDrawdownLimit,
  holdingDays: AUTONOMOUS_RESEARCH_POLICY.holdingDays,
  feeRate: AUTONOMOUS_RESEARCH_POLICY.feeRate,
  slippageBps: AUTONOMOUS_RESEARCH_POLICY.slippageBps,
  informationCutoffTradingDays: AUTONOMOUS_RESEARCH_POLICY.informationCutoffTradingDays,
  entryTiming: "next_open" as const,
};

export function selectAutonomousUniverse(items: AutonomousUniverseItem[], maxSize = AUTONOMOUS_RESEARCH_POLICY.maxUniverseSize): AutonomousUniverseItem[] {
  const seen = new Set<string>();
  return [...items]
    .filter(item => /^\d{6}$/.test(item.symbol) && item.price > 0 && item.turnover > 0 && !seen.has(item.symbol) && (seen.add(item.symbol), true))
    .sort((left, right) => right.turnover - left.turnover || left.symbol.localeCompare(right.symbol))
    .slice(0, maxSize);
}

export function buildAutonomousInitialCandidates(input: { seed: number; datasetVersionKey: string }) {
  const genomes = generateUniqueGenomes({
    seed: input.seed,
    populationSize: AUTONOMOUS_EVOLUTION_CONFIGURATION.populationSize,
    minRules: AUTONOMOUS_EVOLUTION_CONFIGURATION.minRules,
    maxRules: AUTONOMOUS_EVOLUTION_CONFIGURATION.maxRules,
    maxDepth: AUTONOMOUS_EVOLUTION_CONFIGURATION.maxDepth,
    allowedRuleTypes: AUTONOMOUS_ALLOWED_RULE_TYPES,
  });
  return genomes.map(genome => ({
    ...genome,
    fingerprint: fingerprintResearchGenome({ ...genome, datasetVersionKey: input.datasetVersionKey, assumptions: AUTONOMOUS_EVOLUTION_CONFIGURATION }),
  }));
}

export function evaluateAutonomousCandidate(input: { root: unknown; minimumScore: number; barsBySymbol: Record<string, DailyBar[]>; evaluationStartRatio?: number }) {
  const results = Object.entries(input.barsBySymbol)
    .filter(([, bars]) => bars.length >= 60)
    .map(([symbol, bars]) => ({
      symbol,
      result: runDailyBacktest({ bars, expression: input.root as ConditionExpressionGroup, minScore: input.minimumScore, holdingDays: AUTONOMOUS_EVOLUTION_CONFIGURATION.holdingDays, feeRate: AUTONOMOUS_EVOLUTION_CONFIGURATION.feeRate + AUTONOMOUS_EVOLUTION_CONFIGURATION.slippageBps / 10_000, entryDelayDays: AUTONOMOUS_EVOLUTION_CONFIGURATION.informationCutoffTradingDays, entryTiming: "open", evaluationStartIndex: input.evaluationStartRatio ? Math.max(60, Math.floor(bars.length * input.evaluationStartRatio)) : 0 }),
    }));
  if (!results.length) throw new Error("자동 후보 평가에 필요한 실제 일봉이 60개 이상인 종목이 없습니다.");
  const metrics = {
    totalReturn: results.reduce((sum, item) => sum + item.result.totalReturn, 0) / results.length,
    maxDrawdown: results.reduce((sum, item) => sum + item.result.maxDrawdown, 0) / results.length,
    tradeCount: results.reduce((sum, item) => sum + item.result.tradeCount, 0),
    winRate: results.reduce((sum, item) => sum + item.result.winRate, 0) / results.length,
  };
  return { metrics, fitnessScore: calculateFitness(metrics, { minimumTrades: AUTONOMOUS_EVOLUTION_CONFIGURATION.minimumTrades, maxDrawdownLimit: AUTONOMOUS_EVOLUTION_CONFIGURATION.maxDrawdownLimit }), results };
}

export function selectAutonomousSurvivorFingerprints(scored: Array<{ fingerprint: string; fitnessScore: number }>, eliteCount = AUTONOMOUS_EVOLUTION_CONFIGURATION.eliteCount): Set<string> {
  return new Set([...scored].sort((left, right) => right.fitnessScore - left.fitnessScore || left.fingerprint.localeCompare(right.fingerprint)).slice(0, eliteCount).map(candidate => candidate.fingerprint));
}
