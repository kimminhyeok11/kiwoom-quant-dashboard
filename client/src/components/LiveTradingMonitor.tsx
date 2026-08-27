/**
 * 장중 실시간 모니터링 패널
 *
 * - 활성 자동매매 정책 상태 + 킬 스위치
 * - 수집기 마지막 연결 시각
 * - 최근 자동 주문 실행 현황 (10초 폴링)
 * - 오늘 실현 손익 실시간 업데이트
 */

import { trpc } from "@/lib/trpc";
import { Activity, AlertTriangle, CheckCircle2, Clock, Power, Shield, Zap } from "lucide-react";
import { toast } from "sonner";

export function LiveTradingMonitor() {
  const policy = trpc.mockTrading.activePolicy.useQuery(undefined, { refetchInterval: 10_000 });
  const todayPnl = trpc.mockTrading.todayPnl.useQuery(undefined, { refetchInterval: 10_000 });
  const recentOrders = trpc.mockTrading.recentOrders.useQuery({ limit: 5 }, { refetchInterval: 10_000 });
  const collector = trpc.network.collectorStatus.useQuery(undefined, { refetchInterval: 15_000 });
  const safety = trpc.mockTrading.safetyStatus.useQuery(undefined, { refetchInterval: 10_000 });
  const stopMutation = trpc.mockTrading.stopAutoTrade.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      policy.refetch();
      safety.refetch();
    },
  });
  const resetKillMutation = trpc.mockTrading.resetKillSwitch.useMutation({
    onSuccess: (data) => { toast.success(data.message); safety.refetch(); },
  });

  const isActive = Boolean(policy.data);
  const isConnected = collector.data?.connected ?? false;
  const lastSync = collector.data?.lastSyncAt ? new Date(collector.data.lastSyncAt) : null;
  const safetyData = safety.data;
  const safetyTriggered = safetyData?.safetyTriggered ?? false;
  const orders = recentOrders.data?.orders ?? [];
  const pnl = todayPnl.data;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-5">
      {/* Header with status indicator */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`h-2.5 w-2.5 rounded-full ${isActive ? "animate-pulse bg-emerald-400" : "bg-slate-600"}`} />
          <h3 className="text-sm font-bold text-white">자동매매 실시간 현황</h3>
        </div>
        {isActive && (
          <button
            onClick={() => stopMutation.mutate()}
            disabled={stopMutation.isPending}
            className="flex items-center gap-1.5 rounded-lg bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-300 transition hover:bg-rose-500/20 active:scale-95 disabled:opacity-50"
          >
            <Power size={12} />
            {stopMutation.isPending ? "중지 중..." : "자동매매 중지"}
          </button>
        )}
      </div>

      {/* Safety Alert */}
      {safetyTriggered && (
        <div className="mb-4 rounded-lg border border-rose-500/30 bg-rose-950/20 p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-rose-400" />
              <span className="text-xs font-bold text-rose-300">안전장치 발동 — 자동매매 중지됨</span>
            </div>
            <button
              onClick={() => resetKillMutation.mutate()}
              disabled={resetKillMutation.isPending}
              className="rounded-md bg-rose-500/10 px-3 py-1.5 text-[11px] text-rose-300 hover:bg-rose-500/20 active:scale-95 disabled:opacity-50"
            >
              킬스위치 해제
            </button>
          </div>
          {safetyData?.triggers && (
            <div className="mt-2 flex flex-wrap gap-2 text-[10px]">
              {safetyData.triggers.dailyLoss.triggered && (
                <span className="rounded bg-rose-500/10 px-2 py-0.5 text-rose-300">
                  일일 손실 한도 초과: {safetyData.triggers.dailyLoss.current}% (한도 {safetyData.triggers.dailyLoss.limit}%)
                </span>
              )}
              {safetyData.triggers.positionLimit.triggered && (
                <span className="rounded bg-amber-500/10 px-2 py-0.5 text-amber-300">
                  포지션 한도: {safetyData.triggers.positionLimit.current}/{safetyData.triggers.positionLimit.limit}종목
                </span>
              )}
              {safetyData.triggers.concentration.triggered && (
                <span className="rounded bg-amber-500/10 px-2 py-0.5 text-amber-300">
                  집중도 초과: {safetyData.triggers.concentration.current}% (한도 {safetyData.triggers.concentration.limit}%)
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Status Grid */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Policy Status */}
        <StatusCard
          icon={Shield}
          label="정책 상태"
          value={isActive ? "활성" : "비활성"}
          detail={isActive ? `${policy.data!.totalCapital.toLocaleString()}원 · ${policy.data!.maxConcurrentPositions}종목` : "배포된 정책 없음"}
          active={isActive}
        />

        {/* Collector Connection */}
        <StatusCard
          icon={Zap}
          label="수집기 연결"
          value={isConnected ? "연결됨" : "미연결"}
          detail={lastSync ? `${getTimeAgo(lastSync)}` : "기록 없음"}
          active={isConnected}
        />

        {/* Today's Trades */}
        <StatusCard
          icon={Activity}
          label="오늘 체결"
          value={`${pnl?.filledOrderCount ?? 0}건`}
          detail={pnl ? `매수 ${pnl.buyOrderCount} · 매도 ${pnl.sellOrderCount}` : "—"}
          active={(pnl?.filledOrderCount ?? 0) > 0}
        />

        {/* Today's PnL */}
        <StatusCard
          icon={CheckCircle2}
          label="실현 손익"
          value={pnl ? `${pnl.realizedPnl >= 0 ? "+" : ""}${pnl.realizedPnl.toLocaleString()}원` : "—"}
          detail={pnl?.tradingDate ?? ""}
          active={Boolean(pnl && pnl.realizedPnl > 0)}
          negative={Boolean(pnl && pnl.realizedPnl < 0)}
        />
      </div>

      {/* Risk Parameters (when active) */}
      {isActive && (
        <div className="mb-4 flex flex-wrap gap-2">
          <RiskBadge label="손절" value={`${policy.data!.stopLossPercent}%`} />
          <RiskBadge label="익절" value={`${policy.data!.takeProfitPercent}%`} />
          <RiskBadge label="일일한도" value={`${policy.data!.dailyLossLimitPercent}%`} />
          <RiskBadge label="버전" value={`v${policy.data!.version}`} />
        </div>
      )}

      {/* Recent Orders Feed */}
      {orders.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-medium text-slate-400">최근 주문</h4>
          <div className="space-y-1.5">
            {orders.map(order => (
              <div
                key={order.id}
                className="flex items-center justify-between rounded-lg bg-slate-900/50 px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold ${order.side === "buy" ? "text-red-400" : "text-blue-400"}`}>
                    {order.side === "buy" ? "매수" : "매도"}
                  </span>
                  <span className="text-xs text-white">{order.name || order.symbol}</span>
                  <span className="font-mono text-[10px] text-slate-500">{order.symbol}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[11px] text-slate-300">
                    {order.quantity}주 × {order.price.toLocaleString()}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[9px] font-medium ${
                    order.status === "filled" ? "bg-emerald-500/10 text-emerald-300" :
                    order.status === "submitted" ? "bg-amber-500/10 text-amber-300" :
                    "bg-slate-700 text-slate-400"
                  }`}>
                    {order.status === "filled" ? "체결" : order.status === "submitted" ? "전송" : order.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Inactive state */}
      {!isActive && orders.length === 0 && (
        <div className="flex items-center gap-3 rounded-lg bg-slate-800/30 px-4 py-3">
          <AlertTriangle size={16} className="text-slate-500" />
          <div>
            <p className="text-xs text-slate-400">자동매매가 비활성 상태입니다</p>
            <p className="text-[11px] text-slate-500">백테스트 결과에서 "모의투자 배포" 버튼으로 전략을 활성화하세요</p>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusCard({ icon: Icon, label, value, detail, active, negative }: {
  icon: typeof Activity;
  label: string;
  value: string;
  detail: string;
  active: boolean;
  negative?: boolean;
}) {
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${active ? "border-emerald-500/20 bg-emerald-950/10" : negative ? "border-rose-500/20 bg-rose-950/10" : "border-slate-800 bg-slate-900/30"}`}>
      <div className="flex items-center gap-1.5">
        <Icon size={12} className={active ? "text-emerald-400" : negative ? "text-rose-400" : "text-slate-500"} />
        <span className="text-[10px] text-slate-500">{label}</span>
      </div>
      <p className={`mt-1 text-sm font-bold ${active ? "text-emerald-300" : negative ? "text-rose-300" : "text-slate-300"}`}>{value}</p>
      <p className="text-[10px] text-slate-500">{detail}</p>
    </div>
  );
}

function RiskBadge({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800/50 px-2 py-1 text-[10px]">
      <span className="text-slate-500">{label}</span>
      <span className="font-mono font-medium text-slate-300">{value}</span>
    </span>
  );
}

function getTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "방금 전";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}
