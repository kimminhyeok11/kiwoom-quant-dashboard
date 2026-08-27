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
import { BarChart3, Check, Database, FlaskConical, Scale, Shield, Target, TrendingUp, X, Zap } from "lucide-react";

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

  const deletePresetMutation = trpc.mockTrading.deletePreset.useMutation({
    onSuccess: (data) => { toast.success(data.message); adopted.refetch(); },
    onError: (err) => toast.error(err.message),
  });

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
                    <div className="flex items-center gap-1.5">
                      {isSelected && <Check size={14} className="shrink-0 text-teal-400" />}
                      <button
                        onClick={(e) => { e.stopPropagation(); if (window.confirm(`"${s.name}" 전략을 삭제합니까?`)) deletePresetMutation.mutate({ presetId: s.id }); }}
                        className="rounded p-0.5 text-slate-600 hover:text-rose-400 hover:bg-rose-500/10"
                      >
                        <X size={12} />
                      </button>
                    </div>
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

      {/* 데이터 품질 검사 */}
      <DataQualitySection />

      {/* Monte Carlo + 전략 상태 */}
      {selectedStrategies.length >= 1 && (
        <MonteCarloSection strategies={selectedStrategies} />
      )}

      {/* 전략 라이프사이클 관리 */}
      {strategies.length > 0 && (
        <StrategyLifecycleSection strategies={strategies} />
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


// ─── 데이터 품질 섹션 ───

function DataQualitySection() {
  const quality = trpc.oneClickBacktest.dataQuality.useQuery(undefined, { staleTime: 60_000 });
  const data = quality.data;
  if (!data) return null;

  const statusColor = data.status === "clean" ? "text-emerald-300" : data.status === "warning" ? "text-amber-300" : "text-rose-300";
  const statusLabel = data.status === "clean" ? "양호" : data.status === "warning" ? "경고" : "심각";

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-950/30 p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Database size={14} className="text-teal-400" />
          <h3 className="text-sm font-bold text-white">데이터 품질</h3>
        </div>
        <span className={`text-xs font-bold ${statusColor}`}>{statusLabel} ({data.issueCount}건)</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-3 text-[11px]">
        <div className="rounded-lg bg-slate-800/30 px-3 py-2">
          <span className="text-slate-500">검사 봉</span>
          <span className="ml-2 text-white">{data.totalBars.toLocaleString()}개</span>
        </div>
        <div className="rounded-lg bg-slate-800/30 px-3 py-2">
          <span className="text-slate-500">종목</span>
          <span className="ml-2 text-white">{data.checkedSymbols}개</span>
        </div>
        <div className="rounded-lg bg-slate-800/30 px-3 py-2">
          <span className="text-slate-500">이상 항목</span>
          <span className={`ml-2 ${data.issueCount === 0 ? "text-emerald-300" : "text-amber-300"}`}>{data.issueCount}건</span>
        </div>
      </div>
      {data.issues.length > 0 && (
        <div className="mt-3 max-h-32 overflow-y-auto space-y-1">
          {data.issues.slice(0, 10).map((issue, i) => (
            <div key={i} className="flex items-center gap-2 text-[10px]">
              <span className="rounded bg-amber-500/10 px-1 py-0.5 text-amber-300">{issue.type}</span>
              <span className="text-slate-400">{issue.symbol} {issue.date}</span>
              <span className="text-slate-500">{issue.detail}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Monte Carlo 섹션 ───

function MonteCarloSection({ strategies }: { strategies: AdoptedStrategy[] }) {
  const [mcResult, setMcResult] = useState<{ meanFinalEquity: number; medianFinalEquity: number; percentile5: number; percentile95: number; bankruptRate: number; meanMaxDrawdown: number; worstMaxDrawdown: number } | null>(null);
  const [mcTarget, setMcTarget] = useState<string>("");

  const mcMutation = trpc.oneClickBacktest.monteCarloValidation.useMutation({
    onSuccess: (data) => { setMcResult(data.statistics); toast.success(`${data.simulations}회 Monte Carlo 완료`); },
    onError: (err) => toast.error(err.message),
  });

  const runMC = (s: AdoptedStrategy) => {
    const scoring = s.scoringJson as { root?: unknown; minimumScore?: number } | null;
    if (!scoring?.root) { toast.error("조건식 없음"); return; }
    setMcTarget(s.name);
    mcMutation.mutate({ root: scoring.root, minimumScore: scoring.minimumScore ?? 50, simulations: 500 });
  };

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-950/30 p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-3">
        <FlaskConical size={14} className="text-violet-400" />
        <h3 className="text-sm font-bold text-white">Monte Carlo 시뮬레이션</h3>
      </div>
      <p className="text-[10px] text-slate-500 mb-3">거래 순서를 500회 재배열하여 전략의 파산 확률과 MDD 안정성을 분석합니다.</p>
      <div className="flex flex-wrap gap-2 mb-3">
        {strategies.map(s => (
          <button key={s.id} onClick={() => runMC(s)} disabled={mcMutation.isPending}
            className="rounded-lg bg-violet-500/10 px-3 py-1.5 text-[11px] text-violet-300 hover:bg-violet-500/20 active:scale-95 disabled:opacity-50">
            {mcMutation.isPending && mcTarget === s.name ? "분석 중..." : s.name.slice(0, 12)}
          </button>
        ))}
      </div>
      {mcResult && (
        <div className="grid gap-2 sm:grid-cols-4 text-[11px]">
          <div className="rounded-lg bg-slate-800/30 px-3 py-2 text-center">
            <p className="text-slate-500">평균 최종 자산</p>
            <p className="mt-1 font-mono font-bold text-white">{mcResult.meanFinalEquity.toFixed(1)}</p>
          </div>
          <div className="rounded-lg bg-slate-800/30 px-3 py-2 text-center">
            <p className="text-slate-500">5% 하위</p>
            <p className={`mt-1 font-mono font-bold ${mcResult.percentile5 >= 100 ? "text-emerald-300" : "text-rose-300"}`}>{mcResult.percentile5.toFixed(1)}</p>
          </div>
          <div className="rounded-lg bg-slate-800/30 px-3 py-2 text-center">
            <p className="text-slate-500">파산 확률</p>
            <p className={`mt-1 font-mono font-bold ${mcResult.bankruptRate <= 5 ? "text-emerald-300" : "text-rose-300"}`}>{mcResult.bankruptRate}%</p>
          </div>
          <div className="rounded-lg bg-slate-800/30 px-3 py-2 text-center">
            <p className="text-slate-500">최악 MDD</p>
            <p className="mt-1 font-mono font-bold text-rose-300">{mcResult.worstMaxDrawdown.toFixed(1)}%</p>
          </div>
        </div>
      )}
    </section>
  );
}

// ─── 전략 라이프사이클 관리 ───

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  candidate: { label: "후보", color: "bg-slate-500/10 text-slate-300" },
  testing: { label: "검증 중", color: "bg-amber-500/10 text-amber-300" },
  survivor: { label: "생존", color: "bg-emerald-500/10 text-emerald-300" },
  rejected: { label: "탈락", color: "bg-rose-500/10 text-rose-300" },
  retired: { label: "은퇴", color: "bg-slate-500/10 text-slate-500" },
};

function StrategyLifecycleSection({ strategies }: { strategies: AdoptedStrategy[] }) {
  const statusMutation = trpc.oneClickBacktest.updateStrategyStatus.useMutation({
    onSuccess: (data) => toast.success(data.message),
    onError: (err) => toast.error(err.message),
  });

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-950/30 p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-3">
        <Shield size={14} className="text-teal-400" />
        <h3 className="text-sm font-bold text-white">전략 상태 관리</h3>
      </div>
      <p className="text-[10px] text-slate-500 mb-3">각 전략의 라이프사이클 상태를 설정합니다: 후보 → 검증 중 → 생존 → 탈락/은퇴</p>
      <div className="space-y-2">
        {strategies.map(s => {
          const scoring = s.scoringJson as { lifecycleStatus?: string } | null;
          const currentStatus = scoring?.lifecycleStatus ?? "candidate";
          return (
            <div key={s.id} className="flex items-center justify-between rounded-lg border border-slate-700/50 bg-slate-900/30 px-3 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${STATUS_LABELS[currentStatus]?.color ?? STATUS_LABELS.candidate.color}`}>
                  {STATUS_LABELS[currentStatus]?.label ?? "후보"}
                </span>
                <span className="text-xs text-white truncate">{s.name}</span>
              </div>
              <select
                value={currentStatus}
                onChange={e => statusMutation.mutate({ presetId: s.id, status: e.target.value as "candidate" | "testing" | "survivor" | "rejected" | "retired" })}
                disabled={statusMutation.isPending}
                className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-[10px] text-white"
              >
                <option value="candidate">후보</option>
                <option value="testing">검증 중</option>
                <option value="survivor">생존</option>
                <option value="rejected">탈락</option>
                <option value="retired">은퇴</option>
              </select>
            </div>
          );
        })}
      </div>
    </section>
  );
}
