/**
 * 상위 조건식 공통 패턴 분석 & 시각화
 *
 * 백테스트 결과에서:
 * - 가장 자주 등장하는 규칙 타입
 * - 상위 전략에서 공통으로 사용되는 규칙 조합
 * - 평균 파라미터 범위
 * - 규칙별 승률 기여도
 */

import { useMemo } from "react";
import { BarChart3, TrendingUp, Layers, Sparkles } from "lucide-react";

type SymbolResult = {
  symbol: string;
  totalReturn: number;
  winRate: number;
  tradeCount: number;
  maxDrawdown: number;
  trades: Array<{ entryDate: string; exitDate: string; entryPrice: number; exitPrice: number; returnPercent: number }>;
};

type BacktestResultItem = {
  rank: number;
  fingerprint: string;
  root: unknown;
  minimumScore: number;
  averageReturn: number;
  averageWinRate: number;
  totalTrades: number;
  worstDrawdown: number;
  fitnessScore: number;
  symbolResults: SymbolResult[];
};

interface CommonPatternPanelProps {
  results: BacktestResultItem[];
}

type RuleFrequency = {
  type: string;
  count: number;
  avgWinRate: number;
  avgReturn: number;
  inTopN: number; // how many top-N strategies use this rule
};

type RulePair = {
  pair: [string, string];
  count: number;
  avgWinRate: number;
  avgReturn: number;
};

const RULE_LABELS: Record<string, string> = {
  macd_rising: "MACD 상승",
  ma_position: "이평선 정배열",
  high_return: "고수익률",
  turnover: "거래대금",
  rsi: "RSI",
  bollinger: "볼린저밴드",
  stochastic: "스토캐스틱",
  atr_percent: "ATR%",
  volume_ratio: "거래량비율",
  close_change: "종가변동",
  gap_percent: "갭비율",
  intrabar_position: "봉내위치",
};

export function CommonPatternPanel({ results }: CommonPatternPanelProps) {
  const analysis = useMemo(() => {
    if (!results.length) return null;

    // Top N for analysis (top 50% or at least top 5)
    const topN = Math.max(5, Math.ceil(results.length * 0.5));
    const topResults = results.slice(0, topN);
    const profitableResults = results.filter(r => r.averageReturn > 0);

    // 1. Rule frequency analysis
    const ruleStats = new Map<string, { count: number; totalWinRate: number; totalReturn: number; inTop: number }>();

    for (const result of results) {
      const rules = ((result.root as { children?: Array<{ type: string }> })?.children ?? []);
      const isTop = result.rank <= topN;
      for (const rule of rules) {
        const stat = ruleStats.get(rule.type) || { count: 0, totalWinRate: 0, totalReturn: 0, inTop: 0 };
        stat.count++;
        stat.totalWinRate += result.averageWinRate;
        stat.totalReturn += result.averageReturn;
        if (isTop) stat.inTop++;
        ruleStats.set(rule.type, stat);
      }
    }

    const ruleFrequencies: RuleFrequency[] = Array.from(ruleStats.entries())
      .map(([type, stat]) => ({
        type,
        count: stat.count,
        avgWinRate: stat.count ? stat.totalWinRate / stat.count : 0,
        avgReturn: stat.count ? stat.totalReturn / stat.count : 0,
        inTopN: stat.inTop,
      }))
      .sort((a, b) => b.inTopN - a.inTopN || b.avgReturn - a.avgReturn);

    // 2. Rule pair frequency (co-occurrence)
    const pairMap = new Map<string, { count: number; totalWinRate: number; totalReturn: number }>();
    for (const result of profitableResults) {
      const rules = ((result.root as { children?: Array<{ type: string }> })?.children ?? []).map(r => r.type).sort();
      for (let i = 0; i < rules.length; i++) {
        for (let j = i + 1; j < rules.length; j++) {
          const key = `${rules[i]}|${rules[j]}`;
          const stat = pairMap.get(key) || { count: 0, totalWinRate: 0, totalReturn: 0 };
          stat.count++;
          stat.totalWinRate += result.averageWinRate;
          stat.totalReturn += result.averageReturn;
          pairMap.set(key, stat);
        }
      }
    }

    const rulePairs: RulePair[] = Array.from(pairMap.entries())
      .map(([key, stat]) => ({
        pair: key.split("|") as [string, string],
        count: stat.count,
        avgWinRate: stat.count ? stat.totalWinRate / stat.count : 0,
        avgReturn: stat.count ? stat.totalReturn / stat.count : 0,
      }))
      .filter(p => p.count >= 2)
      .sort((a, b) => b.avgReturn - a.avgReturn || b.count - a.count)
      .slice(0, 8);

    // 3. Summary stats
    const avgRuleCount = results.reduce((s, r) => s + ((r.root as { children?: unknown[] })?.children?.length ?? 0), 0) / results.length;
    const topAvgRules = topResults.reduce((s, r) => s + ((r.root as { children?: unknown[] })?.children?.length ?? 0), 0) / topResults.length;
    const profitableCount = profitableResults.length;

    return {
      ruleFrequencies,
      rulePairs,
      avgRuleCount,
      topAvgRules,
      profitableCount,
      totalCount: results.length,
      topN,
    };
  }, [results]);

  if (!analysis) return null;

  const maxFreq = Math.max(...analysis.ruleFrequencies.map(r => r.count), 1);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-5">
      <div className="mb-4 flex items-center gap-2">
        <Sparkles size={16} className="text-amber-400" />
        <h3 className="text-sm font-bold text-white">공통 패턴 분석</h3>
        <span className="ml-2 text-[10px] text-slate-500">
          {analysis.totalCount}개 조건식 중 수익 {analysis.profitableCount}개 분석
        </span>
      </div>

      {/* Summary stats */}
      <div className="mb-4 grid grid-cols-3 gap-3">
        <MiniStat label="평균 규칙 수" value={analysis.avgRuleCount.toFixed(1)} sub="전체" />
        <MiniStat label="상위 규칙 수" value={analysis.topAvgRules.toFixed(1)} sub={`Top ${analysis.topN}`} />
        <MiniStat label="수익률 양수" value={`${((analysis.profitableCount / analysis.totalCount) * 100).toFixed(0)}%`} sub={`${analysis.profitableCount}/${analysis.totalCount}`} />
      </div>

      {/* Rule frequency bars */}
      <div className="mb-5">
        <h4 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-slate-300">
          <BarChart3 size={12} />
          규칙별 등장 빈도 & 성과
        </h4>
        <div className="space-y-1.5">
          {analysis.ruleFrequencies.slice(0, 8).map(rule => (
            <div key={rule.type} className="flex items-center gap-2">
              <span className="w-20 shrink-0 text-[11px] text-slate-400">
                {RULE_LABELS[rule.type] || rule.type}
              </span>
              <div className="flex-1">
                <div className="relative h-5 overflow-hidden rounded-md bg-slate-800/50">
                  <div
                    className="absolute inset-y-0 left-0 rounded-md bg-gradient-to-r from-teal-500/40 to-cyan-500/30"
                    style={{ width: `${(rule.count / maxFreq) * 100}%` }}
                  />
                  <div className="relative flex h-full items-center justify-between px-2">
                    <span className="text-[10px] font-medium text-white">{rule.count}회</span>
                    <span className={`text-[10px] font-mono ${rule.avgReturn >= 0 ? "text-red-300" : "text-blue-300"}`}>
                      {rule.avgReturn >= 0 ? "+" : ""}{rule.avgReturn.toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>
              <span className="w-12 shrink-0 text-right text-[10px] text-slate-500">
                승률 {rule.avgWinRate.toFixed(0)}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Best rule pairs */}
      {analysis.rulePairs.length > 0 && (
        <div>
          <h4 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-slate-300">
            <Layers size={12} />
            수익률 높은 규칙 조합 (수익 전략에서 동시 등장)
          </h4>
          <div className="grid gap-2 sm:grid-cols-2">
            {analysis.rulePairs.map((pair, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2"
              >
                <div className="flex items-center gap-1.5">
                  <TrendingUp size={10} className="text-teal-400" />
                  <span className="text-[11px] text-slate-300">
                    {RULE_LABELS[pair.pair[0]] || pair.pair[0]}
                    <span className="mx-1 text-slate-600">+</span>
                    {RULE_LABELS[pair.pair[1]] || pair.pair[1]}
                  </span>
                </div>
                <div className="text-right">
                  <span className={`text-[11px] font-mono font-medium ${pair.avgReturn >= 0 ? "text-red-400" : "text-blue-400"}`}>
                    {pair.avgReturn >= 0 ? "+" : ""}{pair.avgReturn.toFixed(1)}%
                  </span>
                  <span className="ml-2 text-[9px] text-slate-500">{pair.count}회</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2 text-center">
      <p className="text-[10px] text-slate-500">{label}</p>
      <p className="text-sm font-bold text-white">{value}</p>
      <p className="text-[9px] text-slate-600">{sub}</p>
    </div>
  );
}
