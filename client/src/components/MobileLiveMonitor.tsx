/**
 * 모바일 실시간 매매 모니터
 *
 * /live 경로로 접속하면 표시되는 전용 페이지.
 * 10초 자동 새로고침, 모바일 최적화 레이아웃.
 * 포지션 현황, 실시간 손익, 최근 주문, 수집기 상태를 한 화면에 표시.
 * + 시작/중지 제어, 킬스위치 해제 (완전한 모바일 제어)
 */

import { trpc } from "@/lib/trpc";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Pause,
  Play,
  RefreshCw,
  Shield,
  TrendingUp,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";

export function MobileLiveMonitor() {
  const positions = trpc.mockTrading.positions.useQuery(undefined, { refetchInterval: 10_000 });
  const todayPnl = trpc.mockTrading.todayPnl.useQuery(undefined, { refetchInterval: 10_000 });
  const recentOrders = trpc.mockTrading.recentOrders.useQuery({ limit: 10 }, { refetchInterval: 10_000 });
  const policy = trpc.mockTrading.activePolicy.useQuery(undefined, { refetchInterval: 30_000 });
  const safety = trpc.mockTrading.safetyStatus.useQuery(undefined, { refetchInterval: 10_000 });
  const controlStatus = trpc.mockTrading.controlPanelStatus.useQuery(undefined, { refetchInterval: 5_000 });
  const collector = trpc.network.collectorStatus.useQuery(undefined, { refetchInterval: 15_000 });

  const [lastRefresh, setLastRefresh] = useState(Date.now());

  // Auto-update lastRefresh when data comes in
  useEffect(() => {
    if (positions.dataUpdatedAt) setLastRefresh(positions.dataUpdatedAt);
  }, [positions.dataUpdatedAt]);

  const toggleMutation = trpc.mockTrading.toggleAutoTrade.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      controlStatus.refetch();
      policy.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const resetKillMutation = trpc.mockTrading.resetKillSwitch.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      safety.refetch();
      controlStatus.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const positionList = positions.data?.positions ?? [];
  const summary = positions.data?.summary;
  const pnl = todayPnl.data;
  const orders = recentOrders.data?.orders ?? [];
  const isActive = controlStatus.data?.autoTradeEnabled ?? false;
  const killSwitch = controlStatus.data?.killSwitch ?? false;
  const hasPolicy = controlStatus.data?.hasActivePolicy ?? false;
  const safetyTriggered = safety.data?.safetyTriggered ?? false;
  const isConnected = collector.data?.connected ?? false;
  const lastSyncAt = collector.data?.lastSyncAt ? new Date(collector.data.lastSyncAt) : null;

  const refresh = () => {
    positions.refetch();
    todayPnl.refetch();
    recentOrders.refetch();
    controlStatus.refetch();
    setLastRefresh(Date.now());
  };

  return (
    <div className="min-h-screen bg-[#0a0e17] px-4 py-5 text-white">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">실시간 매매</h1>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`inline-flex h-1.5 w-1.5 rounded-full ${positions.isFetching ? "animate-pulse bg-teal-400" : "bg-slate-600"}`} />
            <p className="text-[10px] text-slate-500">
              {getTimeAgo(new Date(lastRefresh))} 갱신
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* 수집기 연결 상태 */}
          <div className={`flex items-center gap-1 rounded-full px-2 py-1 text-[9px] font-medium ${isConnected ? "bg-emerald-500/10 text-emerald-300" : "bg-slate-700/50 text-slate-500"}`}>
            {isConnected ? <Wifi size={9} /> : <WifiOff size={9} />}
            {isConnected ? "수집기" : "미연결"}
          </div>
          <button onClick={refresh} className="rounded-lg bg-slate-800 p-2 active:bg-slate-700">
            <RefreshCw size={14} className={positions.isRefetching ? "animate-spin text-teal-400" : "text-slate-400"} />
          </button>
        </div>
      </div>

      {/* ─── 제어 버튼 영역 ─── */}
      <div className="mt-4 flex items-center gap-3">
        {/* 시작/중지 토글 */}
        <button
          onClick={() => {
            const action = isActive ? "자동매매를 중지" : "자동매매를 시작";
            if (!window.confirm(`${action}하시겠습니까?`)) return;
            toggleMutation.mutate({ enabled: !isActive });
          }}
          disabled={toggleMutation.isPending || (!hasPolicy && !isActive)}
          className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold transition-all active:scale-95 ${
            isActive
              ? "bg-rose-500/15 text-rose-300 border border-rose-500/30"
              : "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
          } disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          {isActive ? <Pause size={16} /> : <Play size={16} />}
          {toggleMutation.isPending ? "처리 중..." : isActive ? "자동매매 중지" : "자동매매 시작"}
        </button>

        {/* 킬스위치 해제 (발동 시에만 표시) */}
        {(killSwitch || safetyTriggered) && (
          <button
            onClick={() => {
              if (!window.confirm("킬스위치를 해제하면 자동매매가 다시 활성화됩니다. 계속하시겠습니까?")) return;
              resetKillMutation.mutate();
            }}
            disabled={resetKillMutation.isPending}
            className="flex items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs font-bold text-amber-300 active:scale-95 disabled:opacity-50"
          >
            <Shield size={14} />
            해제
          </button>
        )}
      </div>

      {/* 안전장치 경고 */}
      {safetyTriggered && (
        <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-950/30 px-3 py-2">
          <div className="flex items-center gap-1.5">
            <AlertTriangle size={12} className="text-rose-400" />
            <span className="text-xs font-bold text-rose-300">안전장치 발동</span>
          </div>
          {safety.data?.triggers && (
            <div className="mt-1.5 flex flex-wrap gap-1.5 text-[10px]">
              {safety.data.triggers.dailyLoss.triggered && (
                <span className="rounded bg-rose-500/10 px-1.5 py-0.5 text-rose-300">
                  일일손실 {safety.data.triggers.dailyLoss.current}%
                </span>
              )}
              {safety.data.triggers.positionLimit.triggered && (
                <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-amber-300">
                  포지션 {safety.data.triggers.positionLimit.current}/{safety.data.triggers.positionLimit.limit}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* 수집기 연결 상세 */}
      {lastSyncAt && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-slate-800/30 px-3 py-2 text-[10px] text-slate-500">
          <Activity size={10} />
          수집기 마지막 연결: {lastSyncAt.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit" })}
          {collector.data?.terminalIp && <span className="ml-auto font-mono">{collector.data.terminalIp}</span>}
        </div>
      )}

      {/* 오늘 손익 카드 */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
          <p className="text-[10px] text-slate-500">오늘 실현 P&L</p>
          <p className={`mt-1 text-lg font-bold ${(pnl?.realizedPnl ?? 0) >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
            {pnl ? `${pnl.realizedPnl >= 0 ? "+" : ""}${pnl.realizedPnl.toLocaleString()}원` : "—"}
          </p>
          <p className="mt-0.5 text-[10px] text-slate-500">
            {pnl ? `매수 ${pnl.buyOrderCount} / 매도 ${pnl.sellOrderCount}` : ""}
          </p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
          <p className="text-[10px] text-slate-500">평가 손익</p>
          <p className={`mt-1 text-lg font-bold ${(summary?.totalProfitLoss ?? 0) >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
            {summary ? `${summary.totalProfitLoss >= 0 ? "+" : ""}${summary.totalProfitLoss.toLocaleString()}원` : "—"}
          </p>
          <p className="mt-0.5 text-[10px] text-slate-500">
            {summary ? `${positionList.length}종목 보유` : ""}
          </p>
        </div>
      </div>

      {/* 정책 요약 */}
      {policy.data && (
        <div className="mt-3 rounded-lg border border-slate-800 bg-slate-900/30 px-3 py-2 text-[11px] text-slate-400">
          <div className="flex items-center justify-between">
            <span>v{policy.data.version} · {policy.data.totalCapital.toLocaleString()}원</span>
            <span>{policy.data.maxConcurrentPositions}종목 · SL {policy.data.stopLossPercent}% · TP {policy.data.takeProfitPercent}%</span>
          </div>
        </div>
      )}

      {!hasPolicy && (
        <div className="mt-3 rounded-lg border border-dashed border-slate-700 px-3 py-3 text-center text-xs text-slate-500">
          활성 정책 없음 — 데스크톱에서 전략 배포 또는 기본 정책 생성 필요
        </div>
      )}

      {/* 보유 포지션 */}
      <div className="mt-5">
        <h2 className="text-sm font-bold text-slate-200">보유 포지션</h2>
        {positionList.length === 0 ? (
          <div className="mt-3 rounded-lg border border-dashed border-slate-700 px-4 py-6 text-center text-xs text-slate-500">
            보유 종목 없음
          </div>
        ) : (
          <div className="mt-2 space-y-2">
            {positionList.map(p => (
              <div key={p.symbol} className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">{p.name}</p>
                    <p className="text-[10px] text-slate-500">{p.symbol} · {p.quantity}주 · 평단 {p.averagePrice.toLocaleString()}원</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-mono">{p.currentPrice.toLocaleString()}원</p>
                    <p className={`text-[11px] font-bold ${p.profitLossRate >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                      {p.profitLossRate >= 0 ? <ArrowUpRight size={10} className="mr-0.5 inline" /> : <ArrowDownRight size={10} className="mr-0.5 inline" />}
                      {p.profitLossRate >= 0 ? "+" : ""}{p.profitLossRate.toFixed(2)}%
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 최근 주문 */}
      <div className="mt-5">
        <h2 className="text-sm font-bold text-slate-200">최근 주문</h2>
        {orders.length === 0 ? (
          <p className="mt-2 text-xs text-slate-500">오늘 주문 없음</p>
        ) : (
          <div className="mt-2 space-y-1.5">
            {orders.map(o => (
              <div key={o.id} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/30 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${o.side === "buy" ? "bg-red-500/15 text-red-300" : "bg-blue-500/15 text-blue-300"}`}>
                    {o.side === "buy" ? "매수" : "매도"}
                  </span>
                  <span className="text-xs">{o.name}</span>
                </div>
                <div className="text-right">
                  <p className="font-mono text-[11px]">{o.price.toLocaleString()}원</p>
                  <p className="text-[9px] text-slate-500">{o.quantity}주 · {o.status === "filled" ? "체결" : o.status}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 푸터 */}
      <div className="mt-6 pb-4 text-center text-[10px] text-slate-600">
        <div className="flex items-center justify-center gap-1.5">
          <span className={`inline-flex h-1.5 w-1.5 rounded-full ${positions.isFetching ? "animate-pulse bg-teal-400" : "bg-slate-700"}`} />
          마지막 갱신: {new Date(lastRefresh).toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul" })}
        </div>
      </div>
    </div>
  );
}

function getTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 10) return "방금";
  if (seconds < 60) return `${seconds}초 전`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}분 전`;
  return `${Math.floor(minutes / 60)}시간 전`;
}
