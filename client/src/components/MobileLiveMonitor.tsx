/**
 * 모바일 실시간 매매 모니터
 *
 * /live 경로로 접속하면 표시되는 전용 페이지.
 * 10초 자동 새로고침, 모바일 최적화 레이아웃.
 * 포지션 현황, 실시간 손익, 최근 주문, 수집기 상태를 한 화면에 표시.
 */

import { trpc } from "@/lib/trpc";
import { Activity, ArrowDownRight, ArrowUpRight, RefreshCw, TrendingUp, Wifi, WifiOff } from "lucide-react";
import { useState } from "react";

export function MobileLiveMonitor() {
  const positions = trpc.mockTrading.positions.useQuery(undefined, { refetchInterval: 10_000 });
  const todayPnl = trpc.mockTrading.todayPnl.useQuery(undefined, { refetchInterval: 10_000 });
  const recentOrders = trpc.mockTrading.recentOrders.useQuery({ limit: 10 }, { refetchInterval: 10_000 });
  const policy = trpc.mockTrading.activePolicy.useQuery(undefined, { refetchInterval: 30_000 });
  const safety = trpc.mockTrading.safetyStatus.useQuery(undefined, { refetchInterval: 10_000 });

  const [lastRefresh, setLastRefresh] = useState(Date.now());

  const positionList = positions.data?.positions ?? [];
  const summary = positions.data?.summary;
  const pnl = todayPnl.data;
  const orders = recentOrders.data?.orders ?? [];
  const isActive = Boolean(policy.data);
  const safetyTriggered = safety.data?.safetyTriggered ?? false;

  const refresh = () => {
    positions.refetch();
    todayPnl.refetch();
    recentOrders.refetch();
    setLastRefresh(Date.now());
  };

  return (
    <div className="min-h-screen bg-[#0a0e17] px-4 py-5 text-white">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">실시간 매매</h1>
          <p className="text-[11px] text-slate-500">10초 자동 갱신</p>
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold ${isActive ? "bg-emerald-500/15 text-emerald-300" : "bg-slate-700/50 text-slate-400"}`}>
            {isActive ? <><Wifi size={10} /> 자동매매 ON</> : <><WifiOff size={10} /> OFF</>}
          </div>
          <button onClick={refresh} className="rounded-lg bg-slate-800 p-2 active:bg-slate-700">
            <RefreshCw size={14} className={positions.isRefetching ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* 안전장치 경고 */}
      {safetyTriggered && (
        <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-950/30 px-3 py-2 text-xs text-rose-300">
          ⛔ 안전장치 발동 — 자동매매 중지됨
        </div>
      )}

      {/* 오늘 손익 카드 */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
          <p className="text-[10px] text-slate-500">오늘 실현 P&L</p>
          <p className={`mt-1 text-lg font-bold ${(pnl?.realizedPnl ?? 0) >= 0 ? "text-red-400" : "text-blue-400"}`}>
            {pnl ? `${pnl.realizedPnl >= 0 ? "+" : ""}${pnl.realizedPnl.toLocaleString()}원` : "—"}
          </p>
          <p className="mt-0.5 text-[10px] text-slate-500">
            {pnl ? `매수 ${pnl.buyOrderCount} / 매도 ${pnl.sellOrderCount}` : ""}
          </p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
          <p className="text-[10px] text-slate-500">평가 손익</p>
          <p className={`mt-1 text-lg font-bold ${(summary?.totalProfitLoss ?? 0) >= 0 ? "text-red-400" : "text-blue-400"}`}>
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
          자본 {policy.data.totalCapital.toLocaleString()}원 · {policy.data.maxConcurrentPositions}종목 · SL {policy.data.stopLossPercent}% · TP {policy.data.takeProfitPercent}%
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
                    <p className={`text-[11px] font-bold ${p.profitLossRate >= 0 ? "text-red-400" : "text-blue-400"}`}>
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
                  <p className="text-[9px] text-slate-500">{o.quantity}주 · {o.status}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 푸터 */}
      <div className="mt-6 text-center text-[10px] text-slate-600">
        마지막 갱신: {new Date(lastRefresh).toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul" })}
      </div>
    </div>
  );
}
