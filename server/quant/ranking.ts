import type { ConditionRule } from "../../shared/trading";
import { evaluateStrategy, type DailyBar } from "./conditions";

export type RankingCandidate = {
  symbol: string;
  name: string;
  bars: DailyBar[];
};

export type RankedCandidate = {
  rank: number;
  symbol: string;
  name: string;
  score: number;
  matchedRuleIds: string[];
  price: number;
  changeRate: number;
};

export function rankCandidates(rules: ConditionRule[], candidates: RankingCandidate[], limit = 200): RankedCandidate[] {
  return candidates.map(candidate => {
    const evaluation = evaluateStrategy(rules, candidate.bars);
    const latest = candidate.bars.at(-1);
    const previous = candidate.bars.at(-2);
    const changeRate = latest && previous ? ((latest.close - previous.close) / previous.close) * 100 : 0;
    return {
      rank: 0,
      symbol: candidate.symbol,
      name: candidate.name,
      score: evaluation.score,
      matchedRuleIds: evaluation.evaluations.filter(item => item.matched).map(item => item.ruleId),
      price: latest?.close ?? 0,
      changeRate,
    };
  }).filter(item => item.score > 0).sort((left, right) => right.score - left.score || right.changeRate - left.changeRate)
    .slice(0, limit).map((item, index) => ({ ...item, rank: index + 1 }));
}
