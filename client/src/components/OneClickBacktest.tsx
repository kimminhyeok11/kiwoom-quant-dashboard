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
import { CommonPatternPanel } from "./CommonPatternPanel";
import { StrategyQualityPanel } from "./StrategyQualityPanel";
import { getKrxSymbolName } from "@shared/krxSymbolNames";
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
  robustnessScore?: number;
  symbolResults: Array<{
    symbol: string;
    totalReturn: number;
    winRate: number;
    tradeCount: number;
    maxDrawdown: number;
    stopLossCount?: number;
    takeProfitCount?: number;
    timeExitCount?: number;
    avgHoldingDays?: number;
    trades: Array<{ entryDate: string; exitDate: string; entryPrice: number; exitPrice: number; returnPercent: number; exitReason?: string }>;
    equityCurve?: Array<{ date: string; equity: number }>;
  }>;
};

export function OneClickBacktest() {
  const [results, setResults] = useState<BacktestResultItem[] | null>(null);
  const [symbols, setSymbols] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [evolving, setEvolving] = useState<string | null>(null);
  const [evolveResults, setEvolveResults] = useState<Record<string, unknown>>({});
  const [adoptedPreset, setAdoptedPreset] = useState<{ id: number; name: string } | null>(null);

  const availableSymbols = trpc.chartData.availableSymbols.useQuery(undefined, { staleTime: 60_000 });
  const hasData = (availableSymbols.data?.length ?? 0) > 0;
  const [timeframe, setTimeframe] = useState<"daily" | "weekly" | "monthly">("daily");
  const [stopLoss, setStopLoss] = useState(3);
  const [takeProfit, setTakeProfit] = useState(5);

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
      setAdoptedPreset({ id: data.presetId, name: data.name });
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const deployMutation = trpc.mockTrading.deployStrategy.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
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
      const mutations = (data as { mutations: Array<{ improvement: number }> }).mutations || [];
      const best = mutations.length ? Math.max(...mutations.map(m => m.improvement)) : 0;
      toast.success(best > 0 ? `${mutations.length}개 변형 중 원본 대비 +${best.toFixed(2)}% 개선 발견!` : `${mutations.length}개 변형 생성 완료 — 원본이 이미 최적입니다.`);
      setEvolving(null);
    },
  });

  const handleRun = () => {
    setResults(null);
    setExpanded(null);
    setEvolveResults({});
    runMutation.mutate({ timeframe, stopLossPercent: stopLoss, takeProfitPercent: takeProfit });
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
          <h1 className="text-xl font-bold text-white">전략 자동 생성</h1>
          <p className="mt-1 text-xs text-slate-400">
            버튼 하나로 매매 조건식을 자동 생성하고, 실제 과거 데이터로 수익성을 검증합니다. 좋은 결과를 채택해서 발전시키세요.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Timeframe selector */}
          <div className="flex rounded-lg border border-slate-700 bg-slate-800/50 p-0.5">
            {([["daily", "일봉"], ["weekly", "주봉"], ["monthly", "월봉"]] as const).map(([tf, label]) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                  timeframe === tf
                    ? "bg-teal-500/20 text-teal-300"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {/* 손절/익절 설정 */}
          <div className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/50 px-2 py-1">
            <span className="text-[10px] text-rose-400">손절</span>
            <input type="number" min={0.5} max={20} step={0.5} value={stopLoss}
              onChange={e => setStopLoss(Math.max(0.5, Math.min(20, Number(e.target.value) || 3)))}
              className="w-12 rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-center text-[10px] text-white" />
            <span className="text-[10px] text-slate-500">%</span>
            <span className="text-[10px] text-emerald-400 ml-1">익절</span>
            <input type="number" min={0.5} max={50} step={0.5} value={takeProfit}
              onChange={e => setTakeProfit(Math.max(0.5, Math.min(50, Number(e.target.value) || 5)))}
              className="w-12 rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-center text-[10px] text-white" />
            <span className="text-[10px] text-slate-500">%</span>
          </div>
          <button
            onClick={handleRun}
            disabled={runMutation.isPending}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-500 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-teal-500/20 transition hover:shadow-teal-500/40 disabled:opacity-50"
          >
            {runMutation.isPending ? (
              <>
                <Zap className="animate-pulse" size={18} />
                전략 생성 + 수익성 검증 중...
              </>
            ) : (
              <>
                <Dices size={18} />
                전략 자동 생성
              </>
            )}
          </button>
        </div>
      </div>

      {/* Loading Skeleton */}
      {runMutation.isPending && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3 px-1">
            <div className="h-4 w-4 animate-pulse rounded bg-teal-500/30" />
            <div className="h-4 w-48 animate-pulse rounded bg-slate-700/50" />
          </div>
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="rounded-xl border border-slate-800 bg-slate-950/30 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 animate-pulse items-center justify-center rounded-full bg-slate-700/50" />
                  <div className="space-y-2">
                    <div className="h-3.5 w-32 animate-pulse rounded bg-slate-700/50" />
                    <div className="h-3 w-56 animate-pulse rounded bg-slate-800/50" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <div className="h-7 w-16 animate-pulse rounded-lg bg-slate-700/30" />
                  <div className="h-7 w-16 animate-pulse rounded-lg bg-slate-700/30" />
                </div>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-3">
                {[1, 2, 3, 4].map(j => (
                  <div key={j} className="h-10 animate-pulse rounded-lg bg-slate-800/40" />
                ))}
              </div>
            </div>
          ))}
          <p className="text-center text-xs text-slate-500">
            10개 랜덤 조건식 × {symbols.length || "?"}종목 백테스트 실행 중...
            <br />
            보유 5일 · 수수료 0.03% + 체결 비용 0.08% · 손절 {stopLoss}% · 익절 {takeProfit}% 적용
          </p>
        </div>
      )}

      {/* Results */}
      {results && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Trophy className="text-amber-400" size={18} />
            <span className="text-sm font-medium text-white">
              {results.length}개 조건식 결과 (종합 점수순)
            </span>
            <span className="text-xs text-slate-500">
              테스트 종목: {symbols.map(s => getKrxSymbolName(s)).join(", ")}
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
              onDeploy={(config) => {
                // First adopt, then deploy
                adoptMutation.mutate({
                  name: `자동매매 #${item.rank} (승률 ${item.averageWinRate}%)`,
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
                }, {
                  onSuccess: (data) => {
                    deployMutation.mutate({
                      presetId: data.presetId,
                      entryTiming: "prev_close_next_open",
                      maxOpenGapPercent: config.maxOpenGapPercent,
                      positionSizingMode: config.positionSizingMode as "kelly" | "half_kelly" | "quarter_kelly" | "fixed_percent",
                      positionSizingFixedPercent: config.positionSizingFixedPercent,
                    });
                  },
                });
              }}
              isEvolving={evolving === item.fingerprint}
              evolveData={evolveResults[item.fingerprint]}
              adoptPending={adoptMutation.isPending}
              deployPending={deployMutation.isPending}
            />
          ))}

          {/* Common Pattern Analysis */}
          {results.length >= 3 && (
            <CommonPatternPanel results={results} />
          )}

          {/* 전략 품질 평가 — 채택된 프리셋이 있을 때 */}
          {adoptedPreset && (
            <StrategyQualityPanel presetId={adoptedPreset.id} presetName={adoptedPreset.name} />
          )}
        </div>
      )}

      {/* Empty state */}
      {!results && !runMutation.isPending && (
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          {hasData ? (
            <>
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500/10 to-cyan-500/10 shadow-inner">
                <Dices className="text-teal-400" size={32} />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-200">준비 완료 — {availableSymbols.data?.length}종목 데이터 확인</p>
                <p className="mt-2 max-w-md text-xs leading-relaxed text-slate-500">
                  "전략 자동 생성" 버튼을 누르면 매매 조건식 10개를 자동 생성하고
                  수집된 과거 데이터에서 수익률·승률·최대 손실을 자동 계산합니다.
                </p>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-4 text-center">
                <div className="rounded-lg border border-slate-800 bg-slate-900/50 px-4 py-2.5">
                  <p className="text-lg font-bold text-teal-300">10</p>
                  <p className="text-[10px] text-slate-500">랜덤 조건식</p>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-900/50 px-4 py-2.5">
                  <p className="text-lg font-bold text-cyan-300">5</p>
                  <p className="text-[10px] text-slate-500">종목 동시 검증</p>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-900/50 px-4 py-2.5">
                  <p className="text-lg font-bold text-violet-300">5일</p>
                  <p className="text-[10px] text-slate-500">보유 기간</p>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-800/50">
                <FlaskConical className="text-slate-500" size={32} />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-300">데이터를 먼저 수집하세요</p>
                <p className="mt-2 max-w-md text-xs leading-relaxed text-slate-500">
                  백테스트를 실행하려면 최소 1종목의 60개 이상 일봉이 필요합니다.
                  로컬 수집기(c:\kiwoom)에서 <code className="rounded bg-slate-800 px-1 text-teal-300">node collector.mjs --mode=daily</code>를 실행하세요.
                </p>
              </div>
            </>
          )}
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
  onDeploy,
  isEvolving,
  evolveData,
  adoptPending,
  deployPending,
}: {
  item: BacktestResultItem;
  isExpanded: boolean;
  onToggle: () => void;
  onAdopt: () => void;
  onEvolve: () => void;
  onDeploy: (config: { maxOpenGapPercent: number; positionSizingMode: string; positionSizingFixedPercent: number }) => void;
  isEvolving: boolean;
  evolveData: unknown;
  adoptPending: boolean;
  deployPending: boolean;
}) {
  const [chartSymbol, setChartSymbol] = useState<string | null>(null);
  const [showDeployPanel, setShowDeployPanel] = useState(false);
  const [deployGapPercent, setDeployGapPercent] = useState(3);
  const [deploySizingMode, setDeploySizingMode] = useState<"kelly" | "half_kelly" | "quarter_kelly" | "fixed_percent">("half_kelly");
  const [deployFixedPercent, setDeployFixedPercent] = useState(10);
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
              <span className="text-slate-500">최대 손실 {item.worstDrawdown}%</span>
              {item.robustnessScore !== undefined && (
                <span className={`font-bold ${item.robustnessScore >= 60 ? "text-emerald-300" : item.robustnessScore >= 40 ? "text-amber-300" : "text-rose-300"}`}>
                  건전성 {item.robustnessScore}점
                </span>
              )}
            </div>
            {/* 청산 비율 요약 */}
            {item.symbolResults.length > 0 && (() => {
              const totalSL = item.symbolResults.reduce((s, sr) => s + (sr.stopLossCount ?? 0), 0);
              const totalTP = item.symbolResults.reduce((s, sr) => s + (sr.takeProfitCount ?? 0), 0);
              const totalTE = item.symbolResults.reduce((s, sr) => s + (sr.timeExitCount ?? 0), 0);
              const total = totalSL + totalTP + totalTE;
              if (total === 0) return null;
              return (
                <div className="mt-1 flex gap-2 text-[9px]">
                  <span className="text-rose-400">손절 {totalSL}건({total ? Math.round(totalSL/total*100) : 0}%)</span>
                  <span className="text-emerald-400">익절 {totalTP}건({total ? Math.round(totalTP/total*100) : 0}%)</span>
                  <span className="text-slate-500">만기 {totalTE}건</span>
                </div>
              );
            })()}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-medium text-slate-400">
            종합 점수 {item.fitnessScore}
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
              {isEvolving ? "최적화 중..." : "조건식 자동 최적화"}
            </button>
            <button
              onClick={() => setShowDeployPanel(!showDeployPanel)}
              disabled={deployPending}
              className="flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-300 transition hover:bg-amber-500/20 disabled:opacity-50"
            >
              <Zap size={14} />
              {deployPending ? "배포 중..." : showDeployPanel ? "배포 설정 닫기" : "모의투자 배포"}
            </button>
          </div>

          {/* Deploy Settings Panel */}
          {showDeployPanel && (
            <div className="mb-4 rounded-xl border border-amber-500/20 bg-amber-500/[0.03] p-4">
              <p className="mb-3 text-xs font-bold text-amber-200">배포 설정</p>
              <div className="grid gap-4 sm:grid-cols-3">
                {/* 시가 갭 방어 */}
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-slate-400">
                    시가 갭 방어 한도
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0.5}
                      max={20}
                      step={0.5}
                      value={deployGapPercent}
                      onChange={e => setDeployGapPercent(Number(e.target.value))}
                      className="w-20 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-white"
                    />
                    <span className="text-[10px] text-slate-500">±% 초과 시 진입 취소</span>
                  </div>
                  <p className="mt-1 text-[9px] text-slate-600">
                    다음날 시가가 전일 종가와 이 비율 이상 차이나면 매수하지 않습니다
                  </p>
                </div>

                {/* 포지션 사이징 */}
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-slate-400">
                    매수 금액 결정 방식
                  </label>
                  <select
                    value={deploySizingMode}
                    onChange={e => setDeploySizingMode(e.target.value as typeof deploySizingMode)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-white"
                  >
                    <option value="half_kelly">Half Kelly (권장)</option>
                    <option value="kelly">Full Kelly (공격적)</option>
                    <option value="quarter_kelly">Quarter Kelly (보수적)</option>
                    <option value="fixed_percent">고정 비율</option>
                  </select>
                  <p className="mt-1 text-[9px] text-slate-600">
                    {deploySizingMode === "half_kelly" && "백테스트 승률 기반 최적 비율의 절반 (안정적 성장)"}
                    {deploySizingMode === "kelly" && "수학적 최적 비율 그대로 (변동성 큼)"}
                    {deploySizingMode === "quarter_kelly" && "최적 비율의 1/4 (매우 보수적)"}
                    {deploySizingMode === "fixed_percent" && "잔여 자본의 고정 비율로 매수"}
                  </p>
                </div>

                {/* 고정 비율 (fixed_percent일 때만) */}
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-slate-400">
                    {deploySizingMode === "fixed_percent" ? "고정 매수 비율" : "최대 배팅 한도"}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={100}
                      step={1}
                      value={deployFixedPercent}
                      onChange={e => setDeployFixedPercent(Number(e.target.value))}
                      className="w-20 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-white"
                    />
                    <span className="text-[10px] text-slate-500">% (잔여 자본 대비)</span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => {
                  onDeploy({
                    maxOpenGapPercent: deployGapPercent,
                    positionSizingMode: deploySizingMode,
                    positionSizingFixedPercent: deployFixedPercent,
                  });
                  setShowDeployPanel(false);
                }}
                disabled={deployPending}
                className="mt-4 flex items-center gap-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 px-5 py-2 text-xs font-bold text-white shadow-lg shadow-amber-500/20 transition hover:shadow-amber-500/40 disabled:opacity-50"
              >
                <Zap size={14} />
                {deployPending ? "배포 중..." : "이 설정으로 모의투자 배포"}
              </button>
            </div>
          )}

          {/* Symbol results */}
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {item.symbolResults.map(sr => (
              <div key={sr.symbol} className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-white">{getKrxSymbolName(sr.symbol)} <span className="text-slate-500">{sr.symbol}</span></span>
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
                  <div><span className="text-slate-500">최대손실</span> <span className="text-white">{sr.maxDrawdown}%</span></div>
                </div>
                {/* 청산 사유 통계 */}
                {(sr.stopLossCount !== undefined || sr.takeProfitCount !== undefined) && (
                  <div className="mt-1.5 flex gap-2 text-[9px]">
                    {sr.stopLossCount !== undefined && sr.stopLossCount > 0 && (
                      <span className="rounded bg-rose-500/10 px-1.5 py-0.5 text-rose-300">손절 {sr.stopLossCount}</span>
                    )}
                    {sr.takeProfitCount !== undefined && sr.takeProfitCount > 0 && (
                      <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-300">익절 {sr.takeProfitCount}</span>
                    )}
                    {sr.timeExitCount !== undefined && sr.timeExitCount > 0 && (
                      <span className="rounded bg-slate-500/10 px-1.5 py-0.5 text-slate-400">만기 {sr.timeExitCount}</span>
                    )}
                    {sr.avgHoldingDays !== undefined && sr.avgHoldingDays > 0 && (
                      <span className="text-slate-500">평균 {sr.avgHoldingDays.toFixed(1)}일</span>
                    )}
                  </div>
                )}
                {sr.trades.length > 0 && (
                  <div className="mt-2 max-h-24 overflow-y-auto">
                    {sr.trades.slice(-5).map((t, i) => (
                      <div key={i} className="flex justify-between text-[9px] text-slate-500">
                        <span>{t.entryDate.slice(5)} → {t.exitDate.slice(5)}</span>
                        <span className={t.returnPercent >= 0 ? "text-emerald-300" : "text-rose-300"}>
                          {t.returnPercent >= 0 ? "+" : ""}{t.returnPercent.toFixed(1)}%
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {/* Equity Curve mini chart */}
                {sr.equityCurve && sr.equityCurve.length >= 2 && (
                  <MiniEquityCurve data={sr.equityCurve} />
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
                strategyLabel={`조건식 ${item.fingerprint.slice(0, 8)}… (종합 점수 ${item.fitnessScore})`}
              />
            </div>
          )}

          {/* Condition rules */}
          <details className="mt-4">
            <summary className="cursor-pointer text-xs font-medium text-slate-400 hover:text-white">
              조건식 상세 규칙 보기
            </summary>
            <pre className="mt-2 max-h-60 overflow-auto rounded-lg bg-slate-950 p-3 text-[10px] text-slate-300">
              {JSON.stringify(item.root, null, 2)}
            </pre>
          </details>

          {/* Evolution results */}
          {evolveData ? (
            <div className="mt-4 rounded-xl border border-violet-500/20 bg-violet-500/[0.03] p-3">
              <p className="text-xs font-bold text-violet-200">자동 최적화 결과</p>
              <p className="mt-1 text-[11px] text-slate-400">
                조건식의 파라미터(기간, 임계값 등)를 랜덤 변형해 백테스트로 비교한 결과입니다.
                {(() => {
                  const mutations = (evolveData as { mutations: Array<{ improvement: number }> }).mutations || [];
                  const bestImprovement = mutations.length ? Math.max(...mutations.map(m => m.improvement)) : 0;
                  return bestImprovement > 0
                    ? ` 원본 대비 최대 +${bestImprovement.toFixed(2)}% 개선된 변형을 찾았습니다.`
                    : " 원본보다 나은 변형을 찾지 못했습니다. 조건식 자체를 변경해보세요.";
                })()}
              </p>
              <div className="mt-2 space-y-1">
                {((evolveData as { mutations: Array<{ rank: number; fingerprint: string; averageReturn: number; improvement: number; mutation?: { key: string; previous: number; next: number } }> }).mutations || []).slice(0, 5).map(m => (
                  <div key={m.fingerprint} className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">
                      #{m.rank} {m.mutation?.key ?? "?"}: {String(m.mutation?.previous ?? "")} → {String(m.mutation?.next ?? "")}
                    </span>
                    <span className={m.improvement > 0 ? "font-bold text-teal-300" : "text-slate-500"}>
                      {m.improvement > 0 ? "+" : ""}{m.improvement.toFixed(2)}% ({m.averageReturn >= 0 ? "+" : ""}{m.averageReturn}%)
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[10px] text-slate-500">
                각 줄: 변경된 파라미터 · 원본 대비 개선 폭(%) · 절대 수익률(%)
              </p>
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

// ─── Equity Curve 미니 차트 ─────────────────────────────────

function MiniEquityCurve({ data }: { data: Array<{ date: string; equity: number }> }) {
  const w = 200, h = 50, pad = 4;
  const values = data.map(d => d.equity);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const lastVal = values[values.length - 1];
  const isPositive = lastVal >= 100;

  const points = data.map((d, i) => {
    const x = pad + (i / (data.length - 1)) * (w - pad * 2);
    const y = h - pad - ((d.equity - min) / range) * (h - pad * 2);
    return `${x},${y}`;
  });

  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"}${p}`).join(" ");
  const stroke = isPositive ? "#34d399" : "#fb7185";

  return (
    <div className="mt-2">
      <div className="flex items-center justify-between text-[9px]">
        <span className="text-slate-500">자산 곡선</span>
        <span className={isPositive ? "text-emerald-300" : "text-rose-300"}>
          {lastVal >= 100 ? "+" : ""}{(lastVal - 100).toFixed(1)}%
        </span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-10 mt-0.5">
        <path d={pathD} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" />
        <line x1={pad} x2={w - pad} y1={h - pad - ((100 - min) / range) * (h - pad * 2)} y2={h - pad - ((100 - min) / range) * (h - pad * 2)} stroke="#475569" strokeDasharray="2 2" strokeWidth="0.5" />
      </svg>
    </div>
  );
}
