/**
 * 모의투자 현황 대시보드
 * 
 * - 현재 보유 포지션 (종목/수량/평단가/현재가/손익)
 * - 활성 자동매매 정책
 * - 오늘 실현 손익
 * - 최근 주문 내역
 * - 30초마다 자동 새로고침
 */

import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Activity, ArrowDownRight, ArrowUpRight, BarChart3, ShieldCheck, TrendingUp, Wallet, X } from "lucide-react";
import { LiveTradingMonitor } from "./LiveTradingMonitor";
import { toast } from "sonner";

export function MockTradingDashboard() {
  const [, setLocation] = useLocation();
  const positions = trpc.mockTrading.positions.useQuery(undefined, { refetchInterval: 30000 });
  const recentOrders = trpc.mockTrading.recentOrders.useQuery(undefined, { refetchInterval: 30000 });
  const policy = trpc.mockTrading.activePolicy.useQuery(undefined, { staleTime: 60000 });
  const todayPnl = trpc.mockTrading.todayPnl.useQuery(undefined, { refetchInterval: 30000 });
  const pendingSells = trpc.mockTrading.pendingSellOrders.useQuery(undefined, { refetchInterval: 10000 });

  const sellMutation = trpc.mockTrading.sellOrder.useMutation({
    onSuccess: (data) => { toast.success(data.message); positions.refetch(); pendingSells.refetch(); },
    onError: (err) => toast.error(err.message),
  });
  const liquidateMutation = trpc.mockTrading.liquidateAll.useMutation({
    onSuccess: (data) => { toast.success(data.message); positions.refetch(); pendingSells.refetch(); },
    onError: (err) => toast.error(err.message),
  });
  const cancelSellMutation = trpc.mockTrading.cancelSellOrder.useMutation({
    onSuccess: (data) => { toast.success(data.message); pendingSells.refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const summary = positions.data?.summary;
  const positionList = positions.data?.positions ?? [];
  const orders = recentOrders.data?.orders ?? [];
  const pendingSellList = pendingSells.data?.orders ?? [];

  return (
    <div className="flex flex-col gap-5 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-white">모의투자 포트폴리오</h1>
          <p className="mt-1 text-[11px] sm:text-xs text-slate-400 leading-relaxed">
            검증된 전략이 키움 모의투자 계좌에서 자동 매매됩니다.
            {positions.data?.lastUpdated && (
              <span className="block sm:inline sm:ml-2 text-slate-500">
                동기화: {new Date(positions.data.lastUpdated).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => setLocation("/execute/performance")}
          className="hidden sm:flex items-center gap-1.5 rounded-lg border border-teal-500/30 bg-teal-500/5 px-3 py-2 text-xs font-medium text-teal-300 transition hover:bg-teal-500/10"
        >
          <BarChart3 size={14} />
          성과 리포트
        </button>
      </div>

      {/* Live Trading Monitor */}
      <LiveTradingMonitor />

      {/* Summary cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          icon={Wallet}
          label="총 평가금액"
          value={summary ? `${summary.totalEvaluation.toLocaleString()}원` : "—"}
          detail={summary ? `매입 ${summary.totalPurchase.toLocaleString()}원` : ""}
          tone="white"
        />
        <SummaryCard
          icon={TrendingUp}
          label="미실현 평가손익"
          value={summary ? `${summary.totalProfitLoss >= 0 ? "+" : ""}${summary.totalProfitLoss.toLocaleString()}원` : "—"}
          detail={summary ? `${summary.totalProfitLossRate >= 0 ? "+" : ""}${summary.totalProfitLossRate.toFixed(2)}% (보유 중 종목)` : ""}
          tone={summary && summary.totalProfitLoss >= 0 ? "green" : "rose"}
        />
        <SummaryCard
          icon={Activity}
          label="오늘 실현손익"
          value={todayPnl.data ? `${todayPnl.data.realizedPnl >= 0 ? "+" : ""}${todayPnl.data.realizedPnl.toLocaleString()}원` : "—"}
          detail={todayPnl.data ? `체결 ${todayPnl.data.filledOrderCount}건 (매수 ${todayPnl.data.buyOrderCount} / 매도 ${todayPnl.data.sellOrderCount})` : ""}
          tone={todayPnl.data && todayPnl.data.realizedPnl >= 0 ? "green" : "rose"}
        />
        <SummaryCard
          icon={ShieldCheck}
          label="자동매매 정책"
          value={policy.data ? `${policy.data.totalCapital.toLocaleString()}원` : "미설정"}
          detail={policy.data ? `${policy.data.maxConcurrentPositions}종목 · SL ${policy.data.stopLossPercent}% · TP ${policy.data.takeProfitPercent}%` : "정책을 설정하세요"}
          tone="violet"
        />
      </div>

      {/* Policy Setup Guide - when no active policy */}
      {!policy.data && !policy.isLoading && (
        <section className="rounded-xl border border-amber-500/20 bg-gradient-to-br from-amber-950/20 to-slate-950/30 p-5">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/10">
              <ShieldCheck size={20} className="text-amber-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-bold text-amber-300">자동매매 정책 미설정</h3>
              <p className="mt-1 text-xs text-slate-400">
                자동매매를 시작하려면 정책을 먼저 설정하세요. 정책은 총 자본금, 최대 동시 보유 종목 수, 
                손절/익절 비율을 정의합니다. 수집기가 이 정책에 따라 자동으로 주문을 실행합니다.
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 px-3 py-2">
                  <p className="text-[10px] text-slate-500">권장 자본금</p>
                  <p className="font-mono text-xs font-medium text-white">10,000,000원</p>
                </div>
                <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 px-3 py-2">
                  <p className="text-[10px] text-slate-500">동시 보유</p>
                  <p className="font-mono text-xs font-medium text-white">최대 5종목</p>
                </div>
                <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 px-3 py-2">
                  <p className="text-[10px] text-slate-500">리스크 관리</p>
                  <p className="font-mono text-xs font-medium text-white">손절 3% · 익절 5%</p>
                </div>
              </div>
              <p className="mt-3 text-[11px] text-slate-500">
                정책은 대시보드의 프로필 설정에서 생성할 수 있습니다. 
                정책이 활성화되면 수집기(mock-trader.mjs)가 자동으로 주문 계획을 수신합니다.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Positions */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-white">보유 포지션 ({positionList.length}개)</h2>
          {positionList.length > 0 && (
            <button
              onClick={() => { if (window.confirm(`보유 ${positionList.length}종목 전체를 매도 대기열에 추가합니다. 계속하시겠습니까?`)) liquidateMutation.mutate(); }}
              disabled={liquidateMutation.isPending}
              className="flex items-center gap-1 rounded-lg bg-rose-500/10 px-3 py-1.5 text-[11px] font-medium text-rose-300 transition hover:bg-rose-500/20 active:scale-95 disabled:opacity-50"
            >
              {liquidateMutation.isPending ? "처리 중..." : "전체 청산"}
            </button>
          )}
        </div>
        {positionList.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-slate-950/30 px-6 py-10 text-center">
            <Wallet className="mx-auto mb-2 text-slate-600" size={24} />
            <p className="text-sm text-slate-400">현재 보유 중인 포지션이 없습니다</p>
            <p className="mt-1 text-xs text-slate-500">로컬 수집기가 모의투자 주문을 실행하면 여기에 표시됩니다</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            {/* Desktop: table */}
            <table className="hidden sm:table w-full text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/50 text-left text-slate-500">
                  <th className="px-4 py-2">종목</th>
                  <th className="px-3 py-2 text-right">수량</th>
                  <th className="px-3 py-2 text-right">평단가</th>
                  <th className="px-3 py-2 text-right">현재가</th>
                  <th className="px-3 py-2 text-right">평가손익</th>
                  <th className="px-3 py-2 text-right">수익률</th>
                  <th className="px-3 py-2 text-center">매도</th>
                </tr>
              </thead>
              <tbody>
                {positionList.map(pos => (
                  <tr key={pos.symbol} className="border-b border-slate-800/50 hover:bg-slate-800/20">
                    <td className="px-4 py-2.5">
                      <span className="font-medium text-white">{pos.name}</span>
                      <span className="ml-2 font-mono text-slate-500">{pos.symbol}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-white">{pos.quantity.toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-slate-300">{pos.averagePrice.toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-white">{pos.currentPrice.toLocaleString()}</td>
                    <td className={`px-3 py-2.5 text-right font-mono font-medium ${pos.profitLoss >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                      {pos.profitLoss >= 0 ? "+" : ""}{pos.profitLoss.toLocaleString()}
                    </td>
                    <td className={`px-3 py-2.5 text-right font-mono font-medium ${pos.profitLossRate >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                      {pos.profitLossRate >= 0 ? "+" : ""}{pos.profitLossRate.toFixed(2)}%
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <button
                        onClick={() => { if (window.confirm(`${pos.name} ${pos.quantity}주를 매도합니까?`)) sellMutation.mutate({ symbol: pos.symbol, name: pos.name, quantity: pos.quantity, price: pos.currentPrice }); }}
                        disabled={sellMutation.isPending}
                        className="rounded bg-rose-500/10 px-2 py-1 text-[10px] font-bold text-rose-300 hover:bg-rose-500/20 active:scale-95 disabled:opacity-50"
                      >
                        매도
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* Mobile: card list */}
            <div className="sm:hidden divide-y divide-slate-800">
              {positionList.map(pos => (
                <div key={pos.symbol} className="px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-medium text-white">{pos.name}</span>
                      <span className="ml-1.5 font-mono text-[10px] text-slate-500">{pos.symbol}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold ${pos.profitLossRate >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                        {pos.profitLossRate >= 0 ? "+" : ""}{pos.profitLossRate.toFixed(2)}%
                      </span>
                      <button
                        onClick={() => { if (window.confirm(`${pos.name} 매도?`)) sellMutation.mutate({ symbol: pos.symbol, name: pos.name, quantity: pos.quantity, price: pos.currentPrice }); }}
                        disabled={sellMutation.isPending}
                        className="rounded bg-rose-500/10 px-2 py-1 text-[9px] font-bold text-rose-300 active:scale-95 disabled:opacity-50"
                      >
                        매도
                      </button>
                    </div>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-400">
                    <span>{pos.quantity}주 · 평단 {pos.averagePrice.toLocaleString()}</span>
                    <span className={pos.profitLoss >= 0 ? "text-emerald-300/80" : "text-rose-300/80"}>
                      {pos.profitLoss >= 0 ? "+" : ""}{pos.profitLoss.toLocaleString()}원
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Recent orders */}
      <section>
        <h2 className="mb-3 text-sm font-bold text-white">최근 주문 ({orders.length}건)</h2>
        {orders.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-slate-950/30 px-6 py-8 text-center">
            <p className="text-sm text-slate-400">주문 내역이 없습니다</p>
          </div>
        ) : (
          <div className="space-y-2">
            {orders.slice(0, 20).map(order => (
              <div key={order.id} className="rounded-lg border border-slate-800 bg-slate-950/30 px-3 sm:px-4 py-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                    {order.side === "buy" ? (
                      <ArrowUpRight className="shrink-0 text-red-400" size={14} />
                    ) : (
                      <ArrowDownRight className="shrink-0 text-blue-400" size={14} />
                    )}
                    <div className="min-w-0">
                      <span className="text-xs font-medium text-white truncate">{order.name}</span>
                      <span className="ml-1.5 font-mono text-[10px] text-slate-500 hidden sm:inline">{order.symbol}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-4 shrink-0">
                    <span className="font-mono text-[11px] text-slate-300">{order.quantity}주×{order.price.toLocaleString()}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-medium ${
                      order.status === "filled" ? "bg-teal-500/10 text-teal-300" :
                      order.status === "submitted" ? "bg-amber-500/10 text-amber-300" :
                      order.status === "rejected" ? "bg-rose-500/10 text-rose-300" :
                      "bg-slate-700 text-slate-400"
                    }`}>
                      {order.status === "filled" ? "체결" :
                       order.status === "submitted" ? "전송" :
                       order.status === "rejected" ? "거부" :
                       order.status}
                    </span>
                    <span className="hidden sm:inline text-[9px] text-slate-500 font-mono">
                      {new Date(order.createdAt).toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 매도 대기열 */}
      {pendingSellList.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-bold text-amber-300">매도 대기열 ({pendingSellList.length}건)</h2>
          <div className="space-y-2">
            {pendingSellList.map(order => (
              <div key={order.id} className="flex items-center justify-between rounded-lg border border-amber-500/20 bg-amber-950/10 px-3 sm:px-4 py-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold text-amber-300">대기</span>
                  <span className="text-xs font-medium text-white truncate">{order.name}</span>
                  <span className="hidden sm:inline font-mono text-[10px] text-slate-500">{order.symbol}</span>
                </div>
                <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                  <span className="font-mono text-[11px] text-slate-300">{order.quantity}주×{order.price.toLocaleString()}</span>
                  <button
                    onClick={() => cancelSellMutation.mutate({ id: order.id })}
                    disabled={cancelSellMutation.isPending}
                    className="flex items-center gap-0.5 rounded bg-slate-700/50 px-2 py-1 text-[10px] text-slate-300 hover:bg-slate-600/50 active:scale-95 disabled:opacity-50"
                  >
                    <X size={10} />
                    취소
                  </button>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-slate-500">수집기 다음 실행 시 매도 주문이 처리됩니다.</p>
        </section>
      )}
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, detail, tone }: {
  icon: typeof Activity;
  label: string;
  value: string;
  detail: string;
  tone: "white" | "green" | "rose" | "violet";
}) {
  const colors = {
    white: "text-white",
    green: "text-emerald-300",
    rose: "text-rose-300",
    violet: "text-violet-300",
  };
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-3 sm:p-4">
      <div className="flex items-center gap-2">
        <Icon size={14} className="shrink-0 text-slate-500" />
        <span className="text-[10px] sm:text-[11px] text-slate-500">{label}</span>
      </div>
      <p className={`mt-1.5 sm:mt-2 font-mono text-base sm:text-lg font-bold ${colors[tone]} truncate`}>{value}</p>
      {detail && <p className="mt-1 text-[9px] sm:text-[10px] text-slate-500 leading-relaxed">{detail}</p>}
    </div>
  );
}
