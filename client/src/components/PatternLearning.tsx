/**
 * 패턴 학습 UI
 *
 * 차트 데이터를 학습 데이터로 활용:
 * - 최적 진입점의 공통 기술적 조건을 자동 역추적
 * - 피쳐 중요도 시각화 (상위 진입점 vs 하위 진입점 차이)
 * - 자동 생성된 조건식 + 백테스트 검증 결과
 * - 발견된 패턴을 바로 자동매매에 배포 가능
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Brain, Zap, Trophy, BarChart3, TrendingUp, ArrowRight, Sparkles } from "lucide-react";
import { toast } from "sonner";

type LearnResult = {
  config: { holdingBars: number; topPercentile: number; symbols: string[] };
  totalBars: number;
  symbolResults: Array<{
    symbol: string;
    barCount: number;
    topEntryCount: number;
    avgTopReturn: number;
    patternCount: number;
    bestBacktest: { name: string; totalReturn: number; winRate: number; tradeCount: number } | null;
  }>;
  globalFeatureImportance: Array<{ feature: string; label: string; importance: number; direction: "high" | "low"; appearsIn: number }>;
  bestPatterns: Array<{
    symbol: string;
    patternName: string;
    expression: unknown;
    conditions: Array<{ feature: string; operator: string; threshold: number }> | undefined;
    totalReturn: number;
    winRate: number;
    tradeCount: number;
    maxDrawdown: number;
    trades: Array<{ entryDate: string; exitDate: string; entryPrice: number; exitPrice: number; returnPercent: number }>;
  }>;
};

export function PatternLearning() {
  const [holdingBars, setHoldingBars] = useState(5);
  const [topPercentile, setTopPercentile] = useState(20);
  const [result, setResult] = useState<LearnResult | null>(null);
  const [deployConfig, setDeployConfig] = useState<{ maxOpenGapPercent: number; positionSizingMode: "kelly" | "half_kelly" | "quarter_kelly" | "fixed_percent"; positionSizingFixedPercent: number }>({ maxOpenGapPercent: 3, positionSizingMode: "half_kelly", positionSizingFixedPercent: 10 });

  const learnMutation = trpc.patternLearning.learn.useMutation({
    onSuccess: (data) => {
      setResult(data as LearnResult);
      toast.success(`${data.totalBars}봉 학습 완료! ${data.bestPatterns.length}개 패턴 발견`);
    },
    onError: (err) => toast.error(err.message),
  });

  const deployMutation = trpc.mockTrading.deployStrategy.useMutation({
    onSuccess: (data) => toast.success(data.message),
    onError: (err) => toast.error(err.message),
  });

  const adoptMutation = trpc.oneClickBacktest.adopt.useMutation({
    onSuccess: (data) => {
      deployMutation.mutate({
        presetId: data.presetId,
        entryTiming: "prev_close_next_open",
        maxOpenGapPercent: deployConfig.maxOpenGapPercent,
        positionSizingMode: deployConfig.positionSizingMode,
        positionSizingFixedPercent: deployConfig.positionSizingFixedPercent,
      });
    },
  });

  const handleLearn = () => {
    setResult(null);
    learnMutation.mutate({ holdingBars, topPercentile });
  };

  return (
    <div className="flex flex-col gap-5 p-4">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Brain className="text-violet-400" size={22} />
          패턴 학습
        </h1>
        <p className="mt-1 text-xs text-slate-400">
          차트 데이터에서 "여기서 샀으면 크게 올랐을" 지점을 모두 찾고, 그 지점들의 공통 기술적 조건을 자동으로 역추적합니다.
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-end gap-4 rounded-xl border border-slate-800 bg-slate-950/30 p-4">
        <div>
          <label className="mb-1.5 block text-[11px] font-medium text-slate-400">보유 기간 (봉)</label>
          <input
            type="number" min={1} max={60} value={holdingBars}
            onChange={e => setHoldingBars(Math.max(1, Math.min(60, parseInt(e.target.value) || 5)))}
            className="w-20 rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-1.5 text-xs text-white"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-[11px] font-medium text-slate-400">상위 진입점 비율 (%)</label>
          <input
            type="number" min={5} max={50} value={topPercentile}
            onChange={e => setTopPercentile(Math.max(5, Math.min(50, parseInt(e.target.value) || 20)))}
            className="w-20 rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-1.5 text-xs text-white"
          />
        </div>
        <button
          onClick={handleLearn}
          disabled={learnMutation.isPending}
          className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-violet-500/20 transition hover:shadow-violet-500/40 disabled:opacity-50"
        >
          {learnMutation.isPending ? (
            <><Zap className="animate-pulse" size={16} /> 학습 중...</>
          ) : (
            <><Brain size={16} /> 패턴 학습 시작</>
          )}
        </button>
      </div>

      {/* Loading */}
      {learnMutation.isPending && (
        <div className="flex flex-col items-center gap-3 py-10">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-violet-300/20 border-t-violet-400" />
          <p className="text-sm text-slate-300">모든 봉에서 미래 수익률을 계산하고 공통 패턴을 찾는 중...</p>
          <p className="text-xs text-slate-500">수집된 모든 종목의 일봉 데이터를 학습합니다</p>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="flex flex-col gap-5">
          {/* Summary */}
          <div className="grid gap-3 sm:grid-cols-4">
            <SummaryCard label="학습 데이터" value={`${result.totalBars.toLocaleString()}봉`} sub={`${result.config.symbols.length}종목`} />
            <SummaryCard label="상위 진입점" value={`${result.symbolResults.reduce((s, r) => s + r.topEntryCount, 0)}개`} sub={`상위 ${result.config.topPercentile}%`} />
            <SummaryCard label="발견된 패턴" value={`${result.bestPatterns.length}개`} sub="자동 생성된 조건식" />
            <SummaryCard label="최고 수익률" value={result.bestPatterns[0] ? `+${result.bestPatterns[0].totalReturn}%` : "—"} sub={result.bestPatterns[0] ? `승률 ${result.bestPatterns[0].winRate}%` : ""} positive />
          </div>

          {/* Feature Importance */}
          <section className="rounded-xl border border-slate-800 bg-slate-950/30 p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-white">
              <BarChart3 size={16} className="text-violet-400" />
              피쳐 중요도 — "수익 큰 진입점 vs 손실 큰 진입점" 차이
            </h2>
            <p className="mb-4 text-[11px] text-slate-500">
              값이 높을수록 해당 기술적 지표가 수익성 있는 진입점을 구별하는 데 중요합니다.
            </p>
            <div className="space-y-2">
              {result.globalFeatureImportance.map((fi, i) => {
                const maxImp = result.globalFeatureImportance[0]?.importance || 1;
                return (
                  <div key={fi.feature} className="flex items-center gap-3">
                    <span className="w-5 text-right text-[10px] text-slate-500">{i + 1}</span>
                    <span className="w-28 shrink-0 text-xs text-slate-300">{fi.label}</span>
                    <div className="flex-1">
                      <div className="relative h-6 overflow-hidden rounded-md bg-slate-800/50">
                        <div
                          className={`absolute inset-y-0 left-0 rounded-md ${fi.direction === "high" ? "bg-gradient-to-r from-red-500/40 to-red-400/20" : "bg-gradient-to-r from-blue-500/40 to-blue-400/20"}`}
                          style={{ width: `${(fi.importance / maxImp) * 100}%` }}
                        />
                        <div className="relative flex h-full items-center justify-between px-2">
                          <span className="text-[10px] font-medium text-white">{fi.importance.toFixed(3)}</span>
                          <span className={`text-[10px] ${fi.direction === "high" ? "text-red-300" : "text-blue-300"}`}>
                            {fi.direction === "high" ? "↑ 높을수록 좋음" : "↓ 낮을수록 좋음"}
                          </span>
                        </div>
                      </div>
                    </div>
                    <span className="w-12 shrink-0 text-right text-[10px] text-slate-500">{fi.appearsIn}종목</span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Best Patterns with Backtest */}
          <section className="rounded-xl border border-slate-800 bg-slate-950/30 p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-white">
              <Trophy size={16} className="text-amber-400" />
              자동 생성된 조건식 — 백테스트 검증 결과
            </h2>
            <p className="mb-4 text-[11px] text-slate-500">
              학습된 패턴으로 실제 백테스트를 실행한 결과입니다. 바로 자동매매에 배포할 수 있습니다.
            </p>

            {/* 배포 설정 */}
            <div className="mb-4 rounded-lg border border-violet-500/20 bg-violet-500/[0.03] p-3">
              <p className="mb-2 text-[10px] font-bold text-violet-200">배포 시 적용될 정책</p>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="mb-1 block text-[9px] text-slate-500">갭 방어</label>
                  <div className="flex items-center gap-1">
                    <input type="number" min={0.5} max={20} step={0.5} value={deployConfig.maxOpenGapPercent}
                      onChange={e => setDeployConfig(c => ({ ...c, maxOpenGapPercent: Number(e.target.value) || 3 }))}
                      className="w-14 rounded border border-slate-700 bg-slate-900 px-1.5 py-1 text-[10px] text-white" />
                    <span className="text-[9px] text-slate-500">±%</span>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-[9px] text-slate-500">포지션 사이징</label>
                  <select value={deployConfig.positionSizingMode}
                    onChange={e => setDeployConfig(c => ({ ...c, positionSizingMode: e.target.value as typeof c.positionSizingMode }))}
                    className="rounded border border-slate-700 bg-slate-900 px-1.5 py-1 text-[10px] text-white">
                    <option value="half_kelly">Half Kelly</option>
                    <option value="kelly">Full Kelly</option>
                    <option value="quarter_kelly">Quarter Kelly</option>
                    <option value="fixed_percent">고정 비율</option>
                  </select>
                </div>
                {deployConfig.positionSizingMode === "fixed_percent" && (
                  <div>
                    <label className="mb-1 block text-[9px] text-slate-500">고정 비율</label>
                    <div className="flex items-center gap-1">
                      <input type="number" min={1} max={100} value={deployConfig.positionSizingFixedPercent}
                        onChange={e => setDeployConfig(c => ({ ...c, positionSizingFixedPercent: Number(e.target.value) || 10 }))}
                        className="w-14 rounded border border-slate-700 bg-slate-900 px-1.5 py-1 text-[10px] text-white" />
                      <span className="text-[9px] text-slate-500">%</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-3">
              {result.bestPatterns.map((bp, i) => (
                <div key={i} className={`rounded-xl border p-4 ${i === 0 ? "border-amber-500/30 bg-amber-500/[0.03]" : "border-slate-800 bg-slate-900/30"}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${i < 3 ? "bg-amber-500/20 text-amber-300" : "bg-slate-700 text-slate-400"}`}>{i + 1}</span>
                      <div>
                        <p className="text-xs font-medium text-white">{bp.patternName}</p>
                        <p className="text-[10px] text-slate-500">{bp.symbol} · {bp.tradeCount}거래 · MDD {bp.maxDrawdown}%</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className={`text-sm font-bold ${bp.totalReturn >= 0 ? "text-red-400" : "text-blue-400"}`}>
                          {bp.totalReturn >= 0 ? "+" : ""}{bp.totalReturn}%
                        </p>
                        <p className="text-[10px] text-slate-500">승률 {bp.winRate}%</p>
                      </div>
                      <button
                        onClick={() => {
                          if (!bp.expression) return;
                          adoptMutation.mutate({
                            name: `학습패턴: ${bp.patternName} (${bp.symbol})`,
                            root: bp.expression,
                            minimumScore: 50,
                            fingerprint: `learned-${bp.symbol}-${bp.patternName}-${Date.now()}`,
                            backtestSummary: { averageReturn: bp.totalReturn, averageWinRate: bp.winRate, totalTrades: bp.tradeCount, worstDrawdown: bp.maxDrawdown, fitnessScore: bp.totalReturn * 0.5 + bp.winRate * 0.3 },
                          });
                        }}
                        disabled={adoptMutation.isPending || deployMutation.isPending}
                        className="rounded-lg bg-amber-500/10 px-3 py-1.5 text-[11px] font-medium text-amber-300 transition hover:bg-amber-500/20 disabled:opacity-50"
                      >
                        <Sparkles size={12} className="mr-1 inline" />
                        배포
                      </button>
                    </div>
                  </div>

                  {/* Conditions */}
                  {bp.conditions && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {bp.conditions.map((cond, ci) => (
                        <span key={ci} className="inline-flex items-center rounded-md border border-slate-700 bg-slate-800/50 px-2 py-0.5 text-[10px] text-slate-300">
                          {cond.feature} {cond.operator} {typeof cond.threshold === "number" ? cond.threshold.toFixed(2) : cond.threshold}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Recent trades */}
                  {bp.trades.length > 0 && (
                    <div className="mt-3 max-h-28 overflow-y-auto">
                      {bp.trades.slice(-6).map((t, ti) => (
                        <div key={ti} className="flex items-center justify-between text-[10px] text-slate-500 py-0.5">
                          <span>{t.entryDate.slice(5)} <ArrowRight size={8} className="inline text-slate-600" /> {t.exitDate.slice(5)}</span>
                          <span className="font-mono">
                            {t.entryPrice.toLocaleString()} → {t.exitPrice.toLocaleString()}
                          </span>
                          <span className={t.returnPercent >= 0 ? "text-red-400" : "text-blue-400"}>
                            {t.returnPercent >= 0 ? "+" : ""}{t.returnPercent.toFixed(2)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Per-symbol summary */}
          <section className="rounded-xl border border-slate-800 bg-slate-950/30 p-5">
            <h2 className="mb-3 text-sm font-bold text-white">종목별 학습 결과</h2>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {result.symbolResults.map(sr => (
                <div key={sr.symbol} className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-white">{sr.symbol}</span>
                    <span className="text-[10px] text-slate-500">{sr.barCount}봉</span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-1 text-[10px]">
                    <div><span className="text-slate-500">상위 진입점</span> <span className="text-white">{sr.topEntryCount}개</span></div>
                    <div><span className="text-slate-500">평균 수익</span> <span className="text-red-400">+{sr.avgTopReturn}%</span></div>
                    <div><span className="text-slate-500">발견 패턴</span> <span className="text-white">{sr.patternCount}개</span></div>
                    <div>
                      <span className="text-slate-500">최고 전략</span>{" "}
                      <span className="text-teal-300">{sr.bestBacktest ? `${sr.bestBacktest.winRate}%` : "—"}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* Empty state */}
      {!result && !learnMutation.isPending && (
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500/10 to-purple-500/10">
            <Brain className="text-violet-400" size={32} />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-200">차트 데이터로 최적 매수점 학습</p>
            <p className="mt-2 max-w-lg text-xs leading-relaxed text-slate-500">
              모든 봉에서 "여기서 샀으면 N일 후 얼마나 올랐을까?"를 계산하고,
              수익이 큰 진입점들의 기술적 공통 조건을 자동으로 찾아냅니다.
              RSI, MACD, 볼린저, 이평선, 거래량 등 16개 지표를 분석합니다.
            </p>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-4 text-center">
            <div className="rounded-lg border border-slate-800 bg-slate-900/50 px-4 py-2.5">
              <p className="text-lg font-bold text-violet-300">16</p>
              <p className="text-[10px] text-slate-500">기술적 지표</p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/50 px-4 py-2.5">
              <p className="text-lg font-bold text-purple-300">자동</p>
              <p className="text-[10px] text-slate-500">조건식 생성</p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/50 px-4 py-2.5">
              <p className="text-lg font-bold text-fuchsia-300">검증</p>
              <p className="text-[10px] text-slate-500">백테스트 포함</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, sub, positive }: { label: string; value: string; sub: string; positive?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <p className="text-[10px] text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-bold ${positive ? "text-red-400" : "text-white"}`}>{value}</p>
      <p className="mt-0.5 text-[10px] text-slate-500">{sub}</p>
    </div>
  );
}
