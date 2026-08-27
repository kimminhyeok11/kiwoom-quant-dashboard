/**
 * 추천 전략 섹션
 *
 * 7년 데이터로 검증된 기본 제공 조건식:
 * - 카드 UI로 전략 표시 (승률, 수익률, 거래수, MDD, 보유기간)
 * - "모의투자 배포" / "실투 배포" 원클릭 버튼
 * - 태그로 전략 유형 구분
 */

import { trpc } from "@/lib/trpc";
import { Shield, Zap, TrendingUp, Clock, Target, Sparkles, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

export function RecommendedStrategies() {
  const defaults = trpc.presets.defaults.useQuery(undefined, { staleTime: 60_000 });
  const deployMutation = trpc.mockTrading.deployStrategy.useMutation({
    onSuccess: (data) => toast.success(data.message),
    onError: (err) => toast.error(err.message),
  });
  const adoptMutation = trpc.oneClickBacktest.adopt.useMutation({
    onSuccess: (data) => {
      // Deploy after adopt
      deployMutation.mutate({ presetId: data.presetId, mode: deployMode });
    },
    onError: (err) => toast.error(err.message),
  });

  const [deployMode, setDeployMode] = useState<"mock" | "live">("mock");
  const [confirmLive, setConfirmLive] = useState<number | null>(null);

  const strategies = defaults.data ?? [];

  const handleDeploy = (strat: typeof strategies[0], mode: "mock" | "live") => {
    if (mode === "live" && confirmLive !== strat.id) {
      setConfirmLive(strat.id);
      return;
    }
    setConfirmLive(null);
    setDeployMode(mode);

    adoptMutation.mutate({
      name: strat.name,
      root: strat.expression,
      minimumScore: 50,
      fingerprint: `default-${strat.id}-${Date.now()}`,
      backtestSummary: {
        averageReturn: strat.backtest?.totalReturn ?? 0,
        averageWinRate: strat.backtest?.winRate ?? 0,
        totalTrades: strat.backtest?.tradeCount ?? 0,
        worstDrawdown: strat.backtest?.maxDrawdown ?? 0,
        fitnessScore: (strat.backtest?.totalReturn ?? 0) * 0.5 + (strat.backtest?.winRate ?? 0) * 0.3,
      },
    });
  };

  if (defaults.isLoading) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-6">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 animate-pulse rounded bg-slate-700" />
          <div className="h-4 w-32 animate-pulse rounded bg-slate-700" />
        </div>
      </div>
    );
  }

  if (!strategies.length) return null;

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Sparkles size={18} className="text-amber-400" />
        <h2 className="text-sm font-bold text-white">추천 전략 — 7년 검증 기본 제공</h2>
        <span className="ml-2 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-300">
          2019~2026 · 40종목 · 70,000봉
        </span>
      </div>

      {/* Strategy Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {strategies.map(strat => (
          <StrategyCard
            key={strat.id}
            strat={strat}
            onDeployMock={() => handleDeploy(strat, "mock")}
            onDeployLive={() => handleDeploy(strat, "live")}
            isDeploying={adoptMutation.isPending || deployMutation.isPending}
            confirmLive={confirmLive === strat.id}
            onCancelConfirm={() => setConfirmLive(null)}
          />
        ))}
      </div>

      {/* Info */}
      <p className="text-[10px] text-slate-500">
        모든 전략은 코로나 폭락(2020), 금리 인상 하락장(2022), 횡보장(2023)을 포함한 7년 전체 기간에서 검증되었습니다.
        실투 전에 반드시 모의투자로 최소 1주일 검증하세요.
      </p>
    </div>
  );
}

function StrategyCard({ strat, onDeployMock, onDeployLive, isDeploying, confirmLive, onCancelConfirm }: {
  strat: { id: number; name: string; description: string | null; backtest?: { winRate: number; totalReturn: number; tradeCount: number; maxDrawdown: number; holdingDays: number; testedPeriod: string }; tags: string[]; holdingDays: number };
  onDeployMock: () => void;
  onDeployLive: () => void;
  isDeploying: boolean;
  confirmLive: boolean;
  onCancelConfirm: () => void;
}) {
  const bt = strat.backtest;
  const isTopWinRate = (bt?.winRate ?? 0) >= 80;

  return (
    <div className={`rounded-xl border p-4 transition ${isTopWinRate ? "border-amber-500/30 bg-gradient-to-br from-amber-950/20 to-slate-950/30" : "border-slate-800 bg-slate-950/30"}`}>
      {/* Name + tags */}
      <div className="mb-3">
        <h3 className="text-sm font-bold text-white">{strat.name}</h3>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {strat.tags.map(tag => (
            <span key={tag} className="rounded-full bg-slate-800 px-2 py-0.5 text-[9px] text-slate-400">{tag}</span>
          ))}
        </div>
      </div>

      {/* Stats */}
      {bt && (
        <div className="mb-3 grid grid-cols-2 gap-2">
          <StatPill icon={Target} label="승률" value={`${bt.winRate}%`} positive={bt.winRate >= 65} />
          <StatPill icon={TrendingUp} label="수익률" value={`+${bt.totalReturn}%`} positive={bt.totalReturn > 0} />
          <StatPill icon={Shield} label="MDD" value={`${bt.maxDrawdown}%`} positive={bt.maxDrawdown > -20} />
          <StatPill icon={Clock} label="보유" value={`${bt.holdingDays}일`} />
        </div>
      )}

      {/* Description */}
      <p className="mb-3 text-[11px] leading-relaxed text-slate-400">{strat.description}</p>

      {/* Deploy buttons */}
      {confirmLive ? (
        <div className="rounded-lg border border-rose-500/30 bg-rose-950/20 p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-rose-400" />
            <div>
              <p className="text-xs font-medium text-rose-300">실투 배포 확인</p>
              <p className="mt-1 text-[10px] text-slate-400">실제 자금으로 자동 매매됩니다. 계속하시겠습니까?</p>
              <div className="mt-2 flex gap-2">
                <button onClick={onDeployLive} disabled={isDeploying} className="rounded-md bg-rose-500/20 px-3 py-1 text-[11px] font-medium text-rose-300 hover:bg-rose-500/30">
                  확인, 실투 시작
                </button>
                <button onClick={onCancelConfirm} className="rounded-md bg-slate-700/50 px-3 py-1 text-[11px] text-slate-400 hover:text-white">
                  취소
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            onClick={onDeployMock}
            disabled={isDeploying}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-teal-500/10 py-2 text-xs font-medium text-teal-300 transition hover:bg-teal-500/20 disabled:opacity-50"
          >
            <Zap size={12} />
            모의투자 배포
          </button>
          <button
            onClick={onDeployLive}
            disabled={isDeploying}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-slate-700/50 py-2 text-xs font-medium text-slate-300 transition hover:bg-slate-700 disabled:opacity-50"
          >
            <TrendingUp size={12} />
            실투 배포
          </button>
        </div>
      )}
    </div>
  );
}

function StatPill({ icon: Icon, label, value, positive }: { icon: typeof Target; label: string; value: string; positive?: boolean }) {
  return (
    <div className="flex items-center gap-1.5 rounded-md bg-slate-800/50 px-2 py-1.5">
      <Icon size={10} className={positive ? "text-emerald-400" : "text-slate-500"} />
      <span className="text-[9px] text-slate-500">{label}</span>
      <span className={`ml-auto text-[11px] font-bold ${positive ? "text-emerald-300" : "text-slate-300"}`}>{value}</span>
    </div>
  );
}
