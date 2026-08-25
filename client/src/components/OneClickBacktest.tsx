/**
 * 원클릭 백테스트 UI
 * 
 * 버튼 하나로:
 * 1. 랜덤 조건식 생성
 * 2. 랜덤 종목/기간 백테스트
 * 3. 수익률/승률/MDD 결과 표시
 * 4. 채택 → 저장
 * 5. 육성 (파라미터 변형 → 재검증)
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { BacktestChartView } from "./BacktestChartView";
import { Dices, Trophy, Zap, FlaskConical, ChevronDown, ChevronUp, BookmarkPlus, GitBranch, BarChart3 } from "lucide-react";
import { toast } from "sonner";

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
  symbolResults: Array<{
    symbol: string;
    totalReturn: number;
    winRate: number;
    tradeCount: number;
    maxDrawdown: number;
    trades: Array<{ entryDate: string; exitDate: string; entryPrice: number; exitPrice: number; returnPercent: number }>;
  }>;
};

export function OneClickBacktest() {
  const [results, setResults] = useState<BacktestResultItem[] | null>(null);
  const [symbols, setSymbols] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [evolving, setEvolving] = useState<string | null>(null);
  const [evolveResults, setEvolveResults] = useState<Record<string, unknown>>({}); 

  const runMutation = trpc.oneClickBacktest.run.useMutation({
    onSuccess: (data) => {
      setResults(data.results);
      setSymbols(data.symbols);
      toast.success(`${data.results.length}개 조건식 백테스트 완료!`);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const adoptMutation = trpc.oneClickBacktest.adopt.useMutation({
    onSuccess: (data) => {
      toast.success(`"${data.name}" 조건식이 채택되어 저장되었습니다!`);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const evolveMutation = trpc.oneClickBacktest.evolve.useMutation({
    onSuccess: (data, variables) => {
      const key = (variables as { parentRoot: unknown }).parentRoot
        ? JSON.stringify(variables).slice(0, 20)
        : "latest";
      setEvolveResults(prev => ({ ...prev, [evolving || "latest"]: data }));
      toast.success(`${(data as { mutations: unknown[] }).mutations.length}개 변형 생성 완료!`);
      setEvolving(null);
    },
  });

  const handleRun = () => {
    setResults(null);
    setExpanded(null);
    setEvolveResults({});
    runMutation.mutate({});
  };

  const handleAdopt = (item: BacktestResultItem) => {
    const name = `자동생성 #${item.rank} (수익률 ${item.averageReturn}%)`;
    adoptMutation.mutate({
      name,
      root: item.root,
      minimumScore: item.minimumScore,
      fingerprint: item.fingerprint,
      backtestSummary: {
        averageReturn: item.averageReturn,
        averageWinRate: item.averageWinRate,
        totalTrades: item.totalTrades,
        worstDrawdown: item.worstDrawdown,
        fitnessScore: item.fitnessScore,
      },
    });
  };

  const handleEvolve = (item: BacktestResultItem) => {
    setEvolving(item.fingerprint);
    evolveMutation.mutate({
      parentRoot: item.root,
      parentMinimumScore: item.minimumScore,
      mutationCount: 8,
    });
  };

  return (
    <div className="flex flex-col gap-5 p-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white">원클릭 백테스트</h1>
          <p className="mt-1 text-xs text-slate-400">
            버튼 하나로 랜덤 조건식을 생성하고, 누적 데이터에서 자동으로 백테스트합니다. 좋은 결과를 채택해서 키워나가세요.
          </p>
        </div>
        <button
          onClick={handleRun}
          disabled={runMutation.isPending}
          className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-500 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-teal-500/20 transition hover:shadow-teal-500/40 disabled:opacity-50"
        >
          {runMutation.isPending ? (
            <>
              <Zap className="animate-pulse" size={18} />
              조건식 생성 + 백테스트 중...
            </>
          ) : (
            <>
              <Dices size={18} />
              원클릭 백테스트 실행
            </>
          )}
        </button>
      </div>

      {/* Loading */}
      {runMutation.isPending && (
        <div className="flex flex-col items-center gap-3 py-12">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-teal-300/20 border-t-teal-400" />
          <p className="text-sm text-slate-300">10개 랜덤 조건식 × {symbols.length || "?"}개 종목 백테스트 실행 중...</p>
          <p className="text-xs text-slate-500">보유 기간 5일, 수수료 0.03% + 슬리피지 8bp 적용</p>
        </div>
      )}

      {/* Results */}
      {results && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Trophy className="text-amber-400" size={18} />
            <span className="text-sm font-medium text-white">
              {results.length}개 조건식 결과 (적합도순)
            </span>
            <span className="text-xs text-slate-500">
              테스트 종목: {symbols.join(", ")}
            </span>
          </div>

          {results.map(item => (
            <ResultCard
              key={item.fingerprint}
              item={item}
              isExpanded={expanded === item.fingerprint}
              onToggle={() => setExpanded(expanded === item.fingerprint ? null : item.fingerprint)}
              onAdopt={() => handleAdopt(item)}
              onEvolve={() => handleEvolve(item)}
              isEvolving={evolving === item.fingerprint}
              evolveData={evolveResults[item.fingerprint]}
              adoptPending={adoptMutation.isPending}
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!results && !runMutation.isPending && (
        <div className="flex flex-col items-center gap-4 py-20 text-center">
          <FlaskConical className="text-slate-600" size={48} />
          <p className="text-sm text-slate-300">아직 실행 결과가 없습니다</p>
          <p className="max-w-md text-xs leading-relaxed text-slate-500">
            "원클릭 백테스트 실행" 버튼을 누르면 랜덤 조건식 10개를 생성하고,
            수집된 데이터에서 자동으로 수익률·승률·최대낙폭을 계산합니다.
            마음에 드는 조건식을 채택하면 저장되고, "육성" 버튼으로 파라미터를 조금씩 변형해서 더 좋은 결과를 찾을 수 있습니다.
          </p>
        </div>
      )}
    </div>
  );
}

function ResultCard({
  item,
  isExpanded,
  onToggle,
  onAdopt,
  onEvolve,
  isEvolving,
  evolveData,
  adoptPending,
}: {
  item: BacktestResultItem;
  isExpanded: boolean;
  onToggle: () => void;
  onAdopt: () => void;
  onEvolve: () => void;
  isEvolving: boolean;
  evolveData: unknown;
  adoptPending: boolean;
}) {
  const [chartSymbol, setChartSymbol] = useState<string | null>(null);
  const isPositive = item.averageReturn >= 0;
  const borderColor = item.rank <= 3 ? "border-amber-500/30" : "border-slate-800";
  const bgColor = item.rank <= 3 ? "bg-amber-500/[0.03]" : "bg-slate-950/30";

  return (
    <article className={`rounded-xl border ${borderColor} ${bgColor} overflow-hidden`}>
      {/* Summary row */}
      <button
        onClick={onToggle}
        className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-slate-800/30"
      >
        <div className="flex items-center gap-3">
          <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
            item.rank <= 3 ? "bg-amber-500/20 text-amber-300" : "bg-slate-700 text-slate-400"
          }`}>
            {item.rank}
          </span>
          <div>
            <p className="text-xs text-slate-500">조건식 {item.fingerprint.slice(0, 8)}… · 규칙 {countRules(item.root)}개</p>
            <div className="mt-0.5 flex gap-4 text-sm">
              <span className={isPositive ? "font-bold text-red-400" : "font-bold text-blue-400"}>
                {isPositive ? "+" : ""}{item.averageReturn}%
              </span>
              <span className="text-slate-300">승률 {item.averageWinRate}%</span>
              <span className="text-slate-400">거래 {item.totalTrades}건</span>
              <span className="text-slate-500">MDD {item.worstDrawdown}%</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-medium text-slate-400">
            적합도 {item.fitnessScore}
          </span>
          {isExpanded ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />}
        </div>
      </button>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="border-t border-slate-800 px-4 py-4">
          {/* Action buttons */}
          <div className="mb-4 flex gap-2">
            <button
              onClick={onAdopt}
              disabled={adoptPending}
              className="flex items-center gap-1.5 rounded-lg bg-teal-500/10 px-3 py-1.5 text-xs font-medium text-teal-300 transition hover:bg-teal-500/20 disabled:opacity-50"
            >
              <BookmarkPlus size={14} />
              이 조건식 채택
            </button>
            <button
              onClick={onEvolve}
              disabled={isEvolving}
              className="flex items-center gap-1.5 rounded-lg bg-violet-500/10 px-3 py-1.5 text-xs font-medium text-violet-300 transition hover:bg-violet-500/20 disabled:opacity-50"
            >
              <GitBranch size={14} />
              {isEvolving ? "변형 생성 중..." : "파라미터 변형 (육성)"}
            </button>
          </div>

          {/* Symbol results */}
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {item.symbolResults.map(sr => (
              <div key={sr.symbol} className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-white">{sr.symbol}</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setChartSymbol(chartSymbol === sr.symbol ? null : sr.symbol)}
                      className={`rounded px-1.5 py-0.5 text-[10px] transition ${chartSymbol === sr.symbol ? "bg-teal-500/20 text-teal-300" : "text-slate-500 hover:text-teal-300"}`}
                    >
                      <BarChart3 size={12} className="inline" /> 차트
                    </button>
                    <span className={`text-xs font-bold ${sr.totalReturn >= 0 ? "text-red-400" : "text-blue-400"}`}>
                      {sr.totalReturn >= 0 ? "+" : ""}{sr.totalReturn}%
                    </span>
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-1 text-[10px]">
                  <div><span className="text-slate-500">승률</span> <span className="text-white">{sr.winRate}%</span></div>
                  <div><span className="text-slate-500">거래</span> <span className="text-white">{sr.tradeCount}건</span></div>
                  <div><span className="text-slate-500">MDD</span> <span className="text-white">{sr.maxDrawdown}%</span></div>
                </div>
                {sr.trades.length > 0 && (
                  <div className="mt-2 max-h-24 overflow-y-auto">
                    {sr.trades.slice(-5).map((t, i) => (
                      <div key={i} className="flex justify-between text-[9px] text-slate-500">
                        <span>{t.entryDate.slice(5)} → {t.exitDate.slice(5)}</span>
                        <span className={t.returnPercent >= 0 ? "text-red-400" : "text-blue-400"}>
                          {t.returnPercent >= 0 ? "+" : ""}{t.returnPercent.toFixed(1)}%
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Chart overlay for selected symbol */}
          {chartSymbol && (
            <div className="mt-4">
              <BacktestChartView
                symbol={chartSymbol}
                trades={item.symbolResults.find(sr => sr.symbol === chartSymbol)?.trades ?? []}
                strategyLabel={`조건식 ${item.fingerprint.slice(0, 8)}… (적합도 ${item.fitnessScore})`}
              />
            </div>
          )}

          {/* Condition rules */}
          <details className="mt-4">
            <summary className="cursor-pointer text-xs font-medium text-slate-400 hover:text-white">
              전체 조건식 보기
            </summary>
            <pre className="mt-2 max-h-60 overflow-auto rounded-lg bg-slate-950 p-3 text-[10px] text-slate-300">
              {JSON.stringify(item.root, null, 2)}
            </pre>
          </details>

          {/* Evolution results */}
          {evolveData ? (
            <div className="mt-4 rounded-xl border border-violet-500/20 bg-violet-500/[0.03] p-3">
              <p className="text-xs font-bold text-violet-200">파라미터 변형 결과</p>
              <div className="mt-2 space-y-1">
                {((evolveData as { mutations: Array<{ rank: number; fingerprint: string; averageReturn: number; improvement: number; mutation?: { key: string; previous: number; next: number } }> }).mutations || []).slice(0, 5).map(m => (
                  <div key={m.fingerprint} className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">
                      #{m.rank} {m.mutation?.key ?? "?"}: {String(m.mutation?.previous ?? "")} → {String(m.mutation?.next ?? "")}
                    </span>
                    <span className={m.improvement > 0 ? "font-bold text-teal-300" : "text-slate-500"}>
                      {m.improvement > 0 ? "+" : ""}{m.improvement} ({m.averageReturn >= 0 ? "+" : ""}{m.averageReturn}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </article>
  );
}

function countRules(root: unknown): number {
  if (!root || typeof root !== "object") return 0;
  const node = root as { children?: unknown[]; type?: string };
  if (node.type && !node.children) return 1;
  if (Array.isArray(node.children)) return node.children.reduce<number>((sum, child) => sum + countRules(child), 0);
  return 0;
}
