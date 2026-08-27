/**
 * 전략 비교 화면
 *
 * 채택된 전략들을 나란히 비교합니다.
 * - 수익률, 승률, MDD, Profit Factor, 거래수
 * - 랜덤 기간 검증 실행 + 결과 비교
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { BarChart3, Check, FlaskConical, Scale, Target, TrendingUp, Zap } from "lucide-react";

type AdoptedStrategy = {
  id: number;
  name: string;
  scoringJson: unknown;
  createdAt: Date | string;
};

type ValidationResult = {
  strategyId: number;
  statistics: {
    meanReturn: number;
    medianReturn: number;
    stdDevReturn: number;
    bestReturn: number;
    worstReturn: number;
    positiveRate: number;
    meanWinRate: number;
    meanDrawdown: number;
    worstDrawdown: number;
    meanTrades: number;
  };
};

export function StrategyCompare() {
  const adopted = trpc.oneClickBacktest.adopted.useQuery(undefined, { staleTime: 30_000 });
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [validationResults, setValidationResults] = useState<Map<number, ValidationResult["statistics"]>>(new Map());
  const [validating, setValidating] = useState<number | null>(null);

  const validateMutation = trpc.oneClickBacktest.randomValidation.useMutation({
    onSuccess: (data, variables) => {
      const id = (variables as { _strategyId?: number })._strategyId;
      if (id) setValidationResults(prev => new Map(prev).set(id, data.statistics));
      toast.success(`${data.iterations}회 랜덤 검증 완료`);
      setValidating(null);
    },
    onError: (err) => { toast.error(err.message); setValidating(null); },
  });

  const strategies = adopted.data ?? [];
  const selectedStrategies = strategies.filter(s => selected.has(s.id));

  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else if (next.size < 5) next.add(id);
      return next;
    });
  };

  const runValidation = (s: AdoptedStrategy) => {
    const scoring = s.scoringJson as { root?: unknown; minimumScore?: number } | null;
    if (!scoring?.root) { toast.error("조건식 데이터가 없습니다."); return; }
    setValidating(s.id);
    validateMutation.mutate({
      root: scoring.root,
      minimumScore: scoring.minimumScore ?? 50,
      iterations: 50,
      _strategyId: s.id,
    } as any);
  };

  return (
    <div className="flex flex-col gap-5 p-4">
      {/* Header */}
      <div>
        <h1 className="text-lg sm:text-xl font-bold text-white">전략 비교</h1>
        <p className="mt-1 text-[11px] sm:text-xs text-slate-400">
          채택된 전략을 나란히 비교하고, 랜덤 기간 검증으로 과최적화 여부를 판단합니다. 최대 5개 선택 가능.
        </p>
      </div>

      {/* Strategy selection */}
      <section>
        <h2 className="mb-2 text-sm font-bold text-slate-200">전략 선택</h2>
        {strategies.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-slate-950/30 px-6 py-8 text-center">
            <FlaskConical className="mx-auto mb-2 text-slate-600" size={24} />
            <p className="text-sm text-slate-400">채택된 전략이 없습니다</p>
            <p className="mt-1 text-xs text-slate-500">전략 자동 생성에서 좋은 결과를 채택하세요.</p>
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {strategies.map(s => {
              const isSelected = selected.has(s.id);
              return (
                <button
                  key={s.id}
                  onClick={() => toggleSelect(s.id)}
                  className={`rounded-lg border p-3 text-left transition active:scale-[0.98] ${
                    isSelected
                      ? "border-teal-500/40 bg-teal-500/5"
                      : "border-slate-700 bg-slate-900/30 hover:border-slate-600"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-white truncate">{s.name}</span>
                    {isSelected && <Check size={14} className="shrink-0 text-teal-400" />}
                  </div>
                  <p className="mt-1 text-[10px] text-slate-500">
                    {new Date(s.createdAt).toLocaleDateString("ko-KR")}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Comparison table */}
      {selectedStrategies.length >= 2 && (
        <section className="rounded-xl border border-slate-800 bg-slate-950/30 p-4 sm:p-5">
          <div className="mb-4 flex items-center gap-2">
            <Scale size={16} className="text-teal-400" />
            <h2 className="text-sm font-bold text-white">비교 결과</h2>
            <span className="text-[10px] text-slate-500">{selectedStrategies.length}개 전략</span>
          </div>

          {/* Run validations */}
          <div className="mb-4 flex flex-wrap gap-2">
            {selectedStrategies.map(s => (
              <button
                key={s.id}
                onClick={() => runValidation(s)}
                disabled={validating === s.id || validateMutation.isPending}
                className="flex items-center gap-1 rounded-lg bg-violet-500/10 px-3 py-1.5 text-[11px] font-medium text-violet-300 hover:bg-violet-500/20 active:scale-95 disabled:opacity-50"
              >
                <Zap size={11} className={validating === s.id ? "animate-pulse" : ""} />
                {validating === s.id ? "검증 중..." : `"${s.name.slice(0, 10)}" 랜덤 검증`}
              </button>
            ))}
          </div>

          {/* Comparison grid */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-left text-slate-500">
                  <th className="px-3 py-2">지표</th>
                  {selectedStrategies.map(s => (
                    <th key={s.id} className="px-3 py-2 text-center">{s.name.slice(0, 15)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <CompareRow label="평균 수익률" values={selectedStrategies.map(s => {
                  const v = validationResults.get(s.id);
                  return v ? `${v.meanReturn >= 0 ? "+" : ""}${v.meanReturn}%` : "—";
                })} highlight="max" />
                <CompareRow label="중앙값 수익률" values={selectedStrategies.map(s => {
                  const v = validationResults.get(s.id);
                  return v ? `${v.medianReturn >= 0 ? "+" : ""}${v.medianReturn}%` : "—";
                })} highlight="max" />
                <CompareRow label="양성률 (수익 비율)" values={selectedStrategies.map(s => {
                  const v = validationResults.get(s.id);
                  return v ? `${v.positiveRate}%` : "—";
                })} highlight="max" />
                <CompareRow label="평균 승률" values={selectedStrategies.map(s => {
                  const v = validationResults.get(s.id);
                  return v ? `${v.meanWinRate}%` : "—";
                })} highlight="max" />
                <CompareRow label="수익률 표준편차" values={selectedStrategies.map(s => {
                  const v = validationResults.get(s.id);
                  return v ? `${v.stdDevReturn}%` : "—";
                })} highlight="min" />
                <CompareRow label="최악 수익률" values={selectedStrategies.map(s => {
                  const v = validationResults.get(s.id);
                  return v ? `${v.worstReturn}%` : "—";
                })} highlight="max" />
                <CompareRow label="최고 수익률" values={selectedStrategies.map(s => {
                  const v = validationResults.get(s.id);
                  return v ? `+${v.bestReturn}%` : "—";
                })} highlight="max" />
                <CompareRow label="평균 MDD" values={selectedStrategies.map(s => {
                  const v = validationResults.get(s.id);
                  return v ? `${v.meanDrawdown}%` : "—";
                })} highlight="max" />
                <CompareRow label="최악 MDD" values={selectedStrategies.map(s => {
                  const v = validationResults.get(s.id);
                  return v ? `${v.worstDrawdown}%` : "—";
                })} highlight="max" />
                <CompareRow label="평균 거래수" values={selectedStrategies.map(s => {
                  const v = validationResults.get(s.id);
                  return v ? `${v.meanTrades}건` : "—";
                })} highlight="max" />
              </tbody>
            </table>
          </div>

          {validationResults.size === 0 && (
            <p className="mt-3 text-[10px] text-slate-500 text-center">
              위 버튼으로 각 전략의 랜덤 기간 검증을 실행하면 비교 지표가 채워집니다.
            </p>
          )}
        </section>
      )}

      {selectedStrategies.length === 1 && (
        <p className="text-xs text-slate-500 text-center py-4">비교하려면 전략을 2개 이상 선택하세요.</p>
      )}
    </div>
  );
}

function CompareRow({ label, values, highlight }: { label: string; values: string[]; highlight: "max" | "min" }) {
  // Find best value index for highlighting
  const numericValues = values.map(v => {
    const n = parseFloat(v.replace(/[^0-9.\-]/g, ""));
    return Number.isFinite(n) ? n : null;
  });
  const validNums = numericValues.filter((n): n is number => n !== null);
  const bestVal = highlight === "max" ? Math.max(...validNums) : Math.min(...validNums);
  const bestIdx = validNums.length ? numericValues.indexOf(bestVal) : -1;

  return (
    <tr className="border-b border-slate-800/50">
      <td className="px-3 py-2 text-slate-400">{label}</td>
      {values.map((v, i) => (
        <td key={i} className={`px-3 py-2 text-center font-mono ${i === bestIdx && v !== "—" ? "font-bold text-teal-300" : "text-slate-300"}`}>
          {v}
        </td>
      ))}
    </tr>
  );
}
