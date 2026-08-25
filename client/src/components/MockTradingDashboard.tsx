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
import { trpc } from "@/lib/trpc";
import { Activity, ArrowDownRight, ArrowUpRight, ShieldCheck, TrendingUp, Wallet } from "lucide-react";

export function MockTradingDashboard() {
  const positions = trpc.mockTrading.positions.useQuery(undefined, { refetchInterval: 30000 });
  const recentOrders = trpc.mockTrading.recentOrders.useQuery(undefined, { refetchInterval: 30000 });
  const policy = trpc.mockTrading.activePolicy.useQuery(undefined, { staleTime: 60000 });
  const todayPnl = trpc.mockTrading.todayPnl.useQuery(undefined, { refetchInterval: 30000 });

  const summary = positions.data?.summary;
  const positionList = positions.data?.positions ?? [];
  const orders = recentOrders.data?.orders ?? [];

  return (
    <div className="flex flex-col gap-5 p-4">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white">모의투자 현황</h1>
        <p className="mt-1 text-xs text-slate-400">
          키움 모의투자 API(mockapi.kiwoom.com)로 자동 주문 → 체결 → 잔고를 실시간 동기화합니다.
          {positions.data?.lastUpdated && (
            <span className="ml-2 text-slate-500">
              마지막 동기화: {new Date(positions.data.lastUpdated).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}
            </span>
          )}
        </p>
      </div>

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
          label="총 평가손익"
          value={summary ? `${summary.totalProfitLoss >= 0 ? "+" : ""}${summary.totalProfitLoss.toLocaleString()}원` : "—"}
          detail={summary ? `${summary.totalProfitLossRate >= 0 ? "+" : ""}${summary.totalProfitLossRate.toFixed(2)}%` : ""}
          tone={summary && summary.totalProfitLoss >= 0 ? "red" : "blue"}
        />
        <SummaryCard
          icon={Activity}
          label="오늘 실현손익"
          value={todayPnl.data ? `${todayPnl.data.realizedPnl >= 0 ? "+" : ""}${todayPnl.data.realizedPnl.toLocaleString()}원` : "—"}
          detail={todayPnl.data ? `체결 ${todayPnl.data.filledOrderCount}건 (매수 ${todayPnl.data.buyOrderCount} / 매도 ${todayPnl.data.sellOrderCount})` : ""}
          tone={todayPnl.data && todayPnl.data.realizedPnl >= 0 ? "red" : "blue"}
        />
        <SummaryCard
          icon={ShieldCheck}
          label="자동매매 정책"
          value={policy.data ? `${policy.data.totalCapital.toLocaleString()}원` : "미설정"}
          detail={policy.data ? `최대 ${policy.data.maxConcurrentPositions}종목 · 손절 ${policy.data.stopLossPercent}% · 익절 ${policy.data.takeProfitPercent}%` : "정책을 설정하세요"}
          tone="violet"
        />
      </div>

      {/* Positions */}
      <section>
        <h2 className="mb-3 text-sm font-bold text-white">보유 포지션 ({positionList.length}개)</h2>
        {positionList.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-slate-950/30 px-6 py-10 text-center">
            <Wallet className="mx-auto mb-2 text-slate-600" size={24} />
            <p className="text-sm text-slate-400">현재 보유 중인 포지션이 없습니다</p>
            <p className="mt-1 text-xs text-slate-500">로컬 수집기가 모의투자 주문을 실행하면 여기에 표시됩니다</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/50 text-left text-slate-500">
                  <th className="px-4 py-2">종목</th>
                  <th className="px-3 py-2 text-right">수량</th>
                  <th className="px-3 py-2 text-right">평단가</th>
                  <th className="px-3 py-2 text-right">현재가</th>
                  <th className="px-3 py-2 text-right">평가손익</th>
                  <th className="px-3 py-2 text-right">수익률</th>
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
                    <td className={`px-3 py-2.5 text-right font-mono font-medium ${pos.profitLoss >= 0 ? "text-red-400" : "text-blue-400"}`}>
                      {pos.profitLoss >= 0 ? "+" : ""}{pos.profitLoss.toLocaleString()}
                    </td>
                    <td className={`px-3 py-2.5 text-right font-mono font-medium ${pos.profitLossRate >= 0 ? "text-red-400" : "text-blue-400"}`}>
                      {pos.profitLossRate >= 0 ? "+" : ""}{pos.profitLossRate.toFixed(2)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
              <div key={order.id} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/30 px-4 py-2.5">
                <div className="flex items-center gap-3">
                  {order.side === "buy" ? (
                    <ArrowUpRight className="text-red-400" size={16} />
                  ) : (
                    <ArrowDownRight className="text-blue-400" size={16} />
                  )}
                  <div>
                    <span className="text-xs font-medium text-white">{order.name}</span>
                    <span className="ml-2 font-mono text-[10px] text-slate-500">{order.symbol}</span>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <span className="font-mono text-slate-300">{order.quantity}주 × {order.price.toLocaleString()}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
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
                  <span className="text-[10px] text-slate-500">
                    {new Date(order.createdAt).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, detail, tone }: {
  icon: typeof Activity;
  label: string;
  value: string;
  detail: string;
  tone: "white" | "red" | "blue" | "violet";
}) {
  const colors = {
    white: "text-white",
    red: "text-red-400",
    blue: "text-blue-400",
    violet: "text-violet-300",
  };
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-4">
      <div className="flex items-center gap-2">
        <Icon size={14} className="text-slate-500" />
        <span className="text-[11px] text-slate-500">{label}</span>
      </div>
      <p className={`mt-2 font-mono text-lg font-bold ${colors[tone]}`}>{value}</p>
      {detail && <p className="mt-1 text-[10px] text-slate-500">{detail}</p>}
    </div>
  );
}
