/**
 * 모의매매 통합 제어판
 *
 * 사이트에서 모의매매를 완전히 제어합니다:
 * - 시작/중지 토글 (원버튼)
 * - 활성 정책 파라미터 실시간 편집
 * - 현재 포지션 + 오늘 손익
 * - 피드백 루프 결과 이력
 * - 안전장치 상태
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Check,
  History,
  Pause,
  Play,
  RefreshCw,
  Settings2,
  Shield,
  Sliders,
  TrendingUp,
  Zap,
} from "lucide-react";

export function MockTradingControlPanel() {
  return (
    <div className="flex flex-col gap-5 p-4">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white">모의매매 제어판</h1>
        <p className="mt-1 text-xs text-slate-400">
          사이트에서 자동매매를 시작/중지하고, 정책을 설정하고, 성과를 확인합니다.
        </p>
      </div>

      {/* Main Control + Safety */}
      <MainControlSection />

      {/* Performance Summary */}
      <PerformanceSummarySection />

      {/* Two columns: Settings + Positions */}
      <div className="grid gap-5 lg:grid-cols-2">
        <PolicySettingsSection />
        <PositionsSummarySection />
      </div>

      {/* Feedback History */}
      <FeedbackHistorySection />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// 메인 제어 (시작/중지 + 안전장치)
// ═══════════════════════════════════════════════════════════════

function MainControlSection() {
  const status = trpc.mockTrading.controlPanelStatus.useQuery(undefined, { refetchInterval: 5_000 });
  const safety = trpc.mockTrading.safetyStatus.useQuery(undefined, { refetchInterval: 10_000 });
  const todayPnl = trpc.mockTrading.todayPnl.useQuery(undefined, { refetchInterval: 10_000 });
  const collector = trpc.network.collectorStatus.useQuery(undefined, { refetchInterval: 15_000 });

  const toggleMutation = trpc.mockTrading.toggleAutoTrade.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      status.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const resetKillMutation = trpc.mockTrading.resetKillSwitch.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      status.refetch();
      safety.refetch();
    },
  });

  const quickCreateMutation = trpc.mockTrading.quickCreatePolicy.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      status.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const isEnabled = status.data?.autoTradeEnabled ?? false;
  const killSwitch = status.data?.killSwitch ?? false;
  const hasPolicy = status.data?.hasActivePolicy ?? false;
  const safetyTriggered = safety.data?.safetyTriggered ?? false;
  const pnl = todayPnl.data;
  const isConnected = collector.data?.connected ?? false;
  const lastSyncAt = collector.data?.lastSyncAt ? new Date(collector.data.lastSyncAt) : null;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-4 sm:p-5">
      {/* Toggle + Status */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Left: Status + Toggle */}
        <div className="flex items-center gap-3 sm:gap-4">
          {/* Big toggle button */}
          <button
            onClick={() => toggleMutation.mutate({ enabled: !isEnabled })}
            disabled={toggleMutation.isPending || (!hasPolicy && !isEnabled)}
            className={`flex h-12 w-12 sm:h-14 sm:w-14 shrink-0 items-center justify-center rounded-2xl transition-all active:scale-95 ${
              isEnabled
                ? "bg-emerald-500 shadow-lg shadow-emerald-500/30 hover:bg-emerald-600"
                : "bg-slate-700 hover:bg-slate-600"
            } disabled:opacity-50 disabled:cursor-not-allowed`}
            title={isEnabled ? "자동매매 중지" : "자동매매 시작"}
          >
            {isEnabled ? <Pause size={22} className="text-white" /> : <Play size={22} className="text-white" />}
          </button>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className={`h-2.5 w-2.5 shrink-0 rounded-full ${isEnabled ? "animate-pulse bg-emerald-400" : killSwitch ? "bg-rose-400" : "bg-slate-600"}`} />
              <span className="text-sm font-bold text-white truncate">
                {isEnabled ? "자동매매 실행 중" : killSwitch ? "킬스위치 발동" : "자동매매 정지"}
              </span>
            </div>
            <p className="mt-0.5 text-[11px] sm:text-xs text-slate-400">
              {!hasPolicy
                ? "활성 정책 없음"
                : isEnabled
                  ? `정책 v${status.data?.policy?.version} 실행 중`
                  : "정책 대기 중 — ▶ 버튼으로 재시작"}
            </p>
          </div>
        </div>

        {/* Right: Today's PnL summary */}
        <div className="flex items-center gap-4 ml-auto sm:ml-0">
          {pnl && (
            <>
              <div className="text-right">
                <p className="text-[10px] text-slate-500">오늘 실현</p>
                <p className={`text-base sm:text-lg font-bold ${pnl.realizedPnl >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                  {pnl.realizedPnl >= 0 ? "+" : ""}{pnl.realizedPnl.toLocaleString()}원
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-slate-500">체결</p>
                <p className="text-sm font-medium text-slate-300">{pnl.filledOrderCount}건</p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Quick create policy button (no policy) */}
      {!hasPolicy && (
        <div className="mt-4 rounded-lg border border-dashed border-teal-500/30 bg-teal-950/10 p-3 sm:p-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-teal-300">정책이 없어서 자동매매를 시작할 수 없습니다</p>
              <p className="text-[10px] sm:text-[11px] text-slate-500 mt-0.5">
                기본 정책을 생성하면 바로 시작할 수 있습니다 (자본금 1,000만원, SL 3%, TP 5%, 5종목)
              </p>
            </div>
            <button
              onClick={() => quickCreateMutation.mutate()}
              disabled={quickCreateMutation.isPending}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-teal-500 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-teal-600 active:scale-95 disabled:opacity-50 shrink-0"
            >
              <Zap size={13} />
              {quickCreateMutation.isPending ? "생성 중..." : "기본 정책 생성 + 시작"}
            </button>
          </div>
        </div>
      )}

      {/* Collector status bar */}
      <div className="mt-3 flex items-center gap-2 rounded-lg bg-slate-800/30 px-3 py-2">
        <div className={`h-1.5 w-1.5 rounded-full ${isConnected ? "bg-emerald-400" : "bg-slate-600"}`} />
        <span className="text-[10px] sm:text-[11px] text-slate-500">
          수집기 {isConnected ? "연결됨" : "미연결"}
          {lastSyncAt && ` · ${lastSyncAt.toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit" })}`}
        </span>
        {collector.data?.terminalIp && (
          <span className="ml-auto font-mono text-[9px] text-slate-600">{collector.data.terminalIp}</span>
        )}
        {/* Refresh indicator */}
        <span className={`ml-auto inline-flex h-1.5 w-1.5 rounded-full ${status.isFetching ? "animate-pulse bg-teal-400" : "bg-transparent"}`} />
      </div>

      {/* Safety alert */}
      {(safetyTriggered || killSwitch) && (
        <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-950/20 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <AlertTriangle size={14} className="shrink-0 text-rose-400" />
              <span className="text-[11px] sm:text-xs font-bold text-rose-300 truncate">
                {killSwitch ? "킬스위치 발동 — 자동매매 중지됨" : "안전장치 경고"}
              </span>
            </div>
            <button
              onClick={() => resetKillMutation.mutate()}
              disabled={resetKillMutation.isPending}
              className="shrink-0 rounded-md bg-rose-500/10 px-3 py-1.5 text-[11px] text-rose-300 hover:bg-rose-500/20 active:scale-95 disabled:opacity-50"
            >
              해제
            </button>
          </div>
          {safety.data?.triggers && (
            <div className="mt-2 flex flex-wrap gap-1.5 text-[9px] sm:text-[10px]">
              {safety.data.triggers.dailyLoss.triggered && (
                <span className="rounded bg-rose-500/10 px-2 py-0.5 text-rose-300">
                  일일손실 {safety.data.triggers.dailyLoss.current}% / {safety.data.triggers.dailyLoss.limit}%
                </span>
              )}
              {safety.data.triggers.positionLimit.triggered && (
                <span className="rounded bg-amber-500/10 px-2 py-0.5 text-amber-300">
                  포지션 {safety.data.triggers.positionLimit.current}/{safety.data.triggers.positionLimit.limit}
                </span>
              )}
              {safety.data.triggers.concentration.triggered && (
                <span className="rounded bg-amber-500/10 px-2 py-0.5 text-amber-300">
                  집중도 {safety.data.triggers.concentration.current}%/{safety.data.triggers.concentration.limit}%
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// 정책 설정 편집
// ═══════════════════════════════════════════════════════════════

function PolicySettingsSection() {
  const status = trpc.mockTrading.controlPanelStatus.useQuery(undefined, { refetchInterval: 10_000 });
  const updateMutation = trpc.mockTrading.updatePolicyParams.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      status.refetch();
      setEditing(false);
    },
    onError: (err) => toast.error(err.message),
  });

  const [editing, setEditing] = useState(false);
  const policy = status.data?.policy;

  const [form, setForm] = useState({
    totalCapital: 10_000_000,
    maxConcurrentPositions: 5,
    stopLossPercent: 3,
    takeProfitPercent: 5,
    dailyLossLimitPercent: 5,
    maxOpenGapPercent: 3,
    positionSizingMode: "half_kelly" as string,
    positionSizingFixedPercent: 10,
    entryTiming: "prev_close_next_open" as string,
  });

  // Sync form when policy loads
  const syncForm = () => {
    if (policy) {
      setForm({
        totalCapital: policy.totalCapital,
        maxConcurrentPositions: policy.maxConcurrentPositions,
        stopLossPercent: policy.stopLossPercent,
        takeProfitPercent: policy.takeProfitPercent,
        dailyLossLimitPercent: policy.dailyLossLimitPercent,
        maxOpenGapPercent: policy.maxOpenGapPercent,
        positionSizingMode: policy.positionSizingMode,
        positionSizingFixedPercent: policy.positionSizingFixedPercent,
        entryTiming: policy.entryTiming,
      });
    }
  };

  const handleEdit = () => {
    syncForm();
    setEditing(true);
  };

  const handleSave = () => {
    updateMutation.mutate({
      totalCapital: form.totalCapital,
      maxConcurrentPositions: form.maxConcurrentPositions,
      stopLossPercent: form.stopLossPercent,
      takeProfitPercent: form.takeProfitPercent,
      dailyLossLimitPercent: form.dailyLossLimitPercent,
      maxOpenGapPercent: form.maxOpenGapPercent,
      positionSizingMode: form.positionSizingMode as "kelly" | "half_kelly" | "quarter_kelly" | "fixed_percent",
      positionSizingFixedPercent: form.positionSizingFixedPercent,
      entryTiming: form.entryTiming as "prev_close_next_open" | "intraday_realtime",
    });
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings2 size={16} className="text-teal-400" />
          <h3 className="text-sm font-bold text-white">정책 설정</h3>
          {policy && <span className="rounded bg-slate-700 px-1.5 py-0.5 text-[10px] text-slate-400">v{policy.version}</span>}
        </div>
        {policy && !editing && (
          <button
            onClick={handleEdit}
            className="flex items-center gap-1 rounded-lg bg-teal-500/10 px-3 py-1.5 text-xs font-medium text-teal-300 transition hover:bg-teal-500/20"
          >
            <Sliders size={12} />
            수정
          </button>
        )}
      </div>

      {!policy ? (
        <div className="flex items-center gap-3 rounded-lg bg-slate-800/30 px-4 py-6 text-center">
          <AlertTriangle size={16} className="text-slate-500" />
          <p className="text-xs text-slate-400">활성 정책이 없습니다. 백테스트에서 전략을 배포하세요.</p>
        </div>
      ) : editing ? (
        /* Editing form */
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="총 자본금" value={form.totalCapital} onChange={(v) => setForm({ ...form, totalCapital: Number(v) })} suffix="원" type="number" />
            <FormField label="최대 동시 포지션" value={form.maxConcurrentPositions} onChange={(v) => setForm({ ...form, maxConcurrentPositions: Number(v) })} suffix="종목" type="number" />
            <FormField label="손절 %" value={form.stopLossPercent} onChange={(v) => setForm({ ...form, stopLossPercent: Number(v) })} suffix="%" type="number" step="0.5" />
            <FormField label="익절 %" value={form.takeProfitPercent} onChange={(v) => setForm({ ...form, takeProfitPercent: Number(v) })} suffix="%" type="number" step="0.5" />
            <FormField label="일일 손실한도 %" value={form.dailyLossLimitPercent} onChange={(v) => setForm({ ...form, dailyLossLimitPercent: Number(v) })} suffix="%" type="number" step="0.5" />
            <FormField label="시가 갭 한도 %" value={form.maxOpenGapPercent} onChange={(v) => setForm({ ...form, maxOpenGapPercent: Number(v) })} suffix="%" type="number" step="0.5" />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[10px] font-medium text-slate-500">포지션 사이징</label>
              <select
                value={form.positionSizingMode}
                onChange={(e) => setForm({ ...form, positionSizingMode: e.target.value })}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white"
              >
                <option value="kelly">Kelly</option>
                <option value="half_kelly">Half Kelly</option>
                <option value="quarter_kelly">Quarter Kelly</option>
                <option value="fixed_percent">고정 비중</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-medium text-slate-500">진입 타이밍</label>
              <select
                value={form.entryTiming}
                onChange={(e) => setForm({ ...form, entryTiming: e.target.value })}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white"
              >
                <option value="prev_close_next_open">전일종가→다음날시가</option>
                <option value="intraday_realtime">장중 실시간</option>
              </select>
            </div>
          </div>

          {form.positionSizingMode === "fixed_percent" && (
            <FormField label="고정 비중 %" value={form.positionSizingFixedPercent} onChange={(v) => setForm({ ...form, positionSizingFixedPercent: Number(v) })} suffix="%" type="number" />
          )}

          <div className="flex items-center gap-2 pt-2">
            <button
              onClick={handleSave}
              disabled={updateMutation.isPending}
              className="flex items-center gap-1.5 rounded-lg bg-teal-500 px-4 py-2 text-xs font-medium text-white transition hover:bg-teal-600 disabled:opacity-50"
            >
              <Check size={12} />
              {updateMutation.isPending ? "저장 중..." : "저장"}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="rounded-lg bg-slate-700 px-4 py-2 text-xs font-medium text-slate-300 transition hover:bg-slate-600"
            >
              취소
            </button>
          </div>
        </div>
      ) : (
        /* Read-only display */
        <div className="grid gap-2 sm:grid-cols-2">
          <ParamDisplay label="총 자본금" value={`${policy.totalCapital.toLocaleString()}원`} />
          <ParamDisplay label="최대 포지션" value={`${policy.maxConcurrentPositions}종목`} />
          <ParamDisplay label="손절" value={`${policy.stopLossPercent}%`} />
          <ParamDisplay label="익절" value={`${policy.takeProfitPercent}%`} />
          <ParamDisplay label="일일 손실한도" value={`${policy.dailyLossLimitPercent}%`} />
          <ParamDisplay label="시가 갭 한도" value={`${policy.maxOpenGapPercent}%`} />
          <ParamDisplay label="포지션 사이징" value={formatSizing(policy.positionSizingMode)} />
          <ParamDisplay label="진입 타이밍" value={policy.entryTiming === "prev_close_next_open" ? "종가→시가" : "장중 실시간"} />
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// 현재 포지션 요약
// ═══════════════════════════════════════════════════════════════

function PositionsSummarySection() {
  const positions = trpc.mockTrading.positions.useQuery(undefined, { refetchInterval: 15_000 });
  const recentOrders = trpc.mockTrading.recentOrders.useQuery({ limit: 5 }, { refetchInterval: 10_000 });

  const positionList = positions.data?.positions ?? [];
  const summary = positions.data?.summary;
  const orders = recentOrders.data?.orders ?? [];

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-5">
      <div className="mb-4 flex items-center gap-2">
        <Activity size={16} className="text-teal-400" />
        <h3 className="text-sm font-bold text-white">현재 포지션</h3>
        {summary && (
          <span className="ml-auto text-[10px] text-slate-500">{summary.positionCount}종목 보유</span>
        )}
      </div>

      {/* Summary */}
      {summary && summary.positionCount > 0 && (
        <div className="mb-3 flex gap-4 rounded-lg bg-slate-800/30 px-3 py-2">
          <div>
            <p className="text-[10px] text-slate-500">평가금액</p>
            <p className="text-xs font-bold text-white">{summary.totalEvaluation.toLocaleString()}원</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-500">총 손익</p>
            <p className={`text-xs font-bold ${summary.totalProfitLoss >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
              {summary.totalProfitLoss >= 0 ? "+" : ""}{summary.totalProfitLoss.toLocaleString()}원
              <span className="ml-1 text-[10px] font-normal">
                ({summary.totalProfitLossRate >= 0 ? "+" : ""}{summary.totalProfitLossRate.toFixed(2)}%)
              </span>
            </p>
          </div>
        </div>
      )}

      {/* Position list */}
      {positionList.length > 0 ? (
        <div className="max-h-48 space-y-1 overflow-y-auto">
          {positionList.map((p) => (
            <div key={p.symbol} className="flex items-center justify-between rounded-lg bg-slate-900/40 px-3 py-2">
              <div>
                <span className="text-xs font-medium text-white">{p.name || p.symbol}</span>
                <span className="ml-1.5 font-mono text-[10px] text-slate-500">{p.symbol}</span>
              </div>
              <div className="flex items-center gap-3 text-right">
                <span className="font-mono text-[11px] text-slate-300">{p.quantity}주</span>
                <span className={`flex items-center text-[11px] font-medium ${p.profitLossRate >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                  {p.profitLossRate >= 0 ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
                  {p.profitLossRate >= 0 ? "+" : ""}{p.profitLossRate.toFixed(2)}%
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="py-4 text-center text-xs text-slate-500">보유 포지션 없음</p>
      )}

      {/* Recent orders */}
      {orders.length > 0 && (
        <div className="mt-4">
          <h4 className="mb-2 text-[10px] font-medium text-slate-500">최근 주문</h4>
          <div className="space-y-1">
            {orders.map((o) => (
              <div key={o.id} className="flex items-center justify-between rounded bg-slate-900/30 px-2 py-1.5">
                <div className="flex items-center gap-1.5">
                  <span className={`text-[10px] font-bold ${o.side === "buy" ? "text-red-400" : "text-blue-400"}`}>
                    {o.side === "buy" ? "매수" : "매도"}
                  </span>
                  <span className="text-[11px] text-white">{o.name || o.symbol}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] text-slate-400">{o.quantity}×{o.price.toLocaleString()}</span>
                  <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${
                    o.status === "filled" ? "bg-emerald-500/10 text-emerald-300" :
                    o.status === "submitted" ? "bg-amber-500/10 text-amber-300" :
                    "bg-slate-700 text-slate-400"
                  }`}>
                    {o.status === "filled" ? "체결" : o.status === "submitted" ? "전송" : o.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// 투자 성과 한눈에 보기
// ═══════════════════════════════════════════════════════════════

function PerformanceSummarySection() {
  const summary = trpc.mockTrading.tradingSummary.useQuery(undefined, { staleTime: 30_000 });
  const data = summary.data;

  if (!data || !data.hasData) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-5">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp size={16} className="text-teal-400" />
          <h3 className="text-sm font-bold text-white">투자 성과</h3>
        </div>
        <p className="text-xs text-slate-500 py-4 text-center">아직 거래 이력이 없습니다. 자동매매를 시작하면 여기에 성과가 표시됩니다.</p>
      </div>
    );
  }

  const startDateStr = data.startDate ? new Date(data.startDate).toLocaleDateString("ko-KR") : "—";

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <TrendingUp size={16} className="text-teal-400" />
          <h3 className="text-sm font-bold text-white">투자 성과 요약</h3>
        </div>
        <span className="text-[10px] text-slate-500">{startDateStr} ~ 현재 ({data.totalDays}일)</span>
      </div>

      {/* Main metrics row */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-4">
        <div className="rounded-lg border border-slate-700/50 bg-slate-900/40 p-3">
          <p className="text-[10px] text-slate-500 mb-1">누적 실현 손익</p>
          <p className={`text-lg font-bold ${data.realizedPnl >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
            {data.realizedPnl >= 0 ? "+" : ""}{data.realizedPnl.toLocaleString()}원
          </p>
          <p className={`text-[10px] ${data.realizedPnlPercent >= 0 ? "text-emerald-400/70" : "text-rose-400/70"}`}>
            수익률 {data.realizedPnlPercent >= 0 ? "+" : ""}{data.realizedPnlPercent}%
          </p>
        </div>

        <div className="rounded-lg border border-slate-700/50 bg-slate-900/40 p-3">
          <p className="text-[10px] text-slate-500 mb-1">승률</p>
          <p className="text-lg font-bold text-white">{data.winRate}%</p>
          <p className="text-[10px] text-slate-500">
            {data.winCount}승 {data.lossCount}패 ({data.winCount + data.lossCount}건 완결)
          </p>
        </div>

        <div className="rounded-lg border border-slate-700/50 bg-slate-900/40 p-3">
          <p className="text-[10px] text-slate-500 mb-1">투입 자본</p>
          <p className="text-lg font-bold text-white">{(data.totalCapitalDeployed / 10000).toFixed(0)}만원</p>
          <p className="text-[10px] text-slate-500">총 {data.totalTrades}건 거래</p>
        </div>

        <div className="rounded-lg border border-slate-700/50 bg-slate-900/40 p-3">
          <p className="text-[10px] text-slate-500 mb-1">평균 수익/손실</p>
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-bold text-emerald-300">+{data.avgWinPercent}%</span>
            <span className="text-[10px] text-slate-600">/</span>
            <span className="text-sm font-bold text-rose-300">-{data.avgLossPercent}%</span>
          </div>
          <div className="mt-1 flex gap-2 text-[10px]">
            {data.bestTrade && (
              <span className="text-emerald-400/70">최고 +{data.bestTrade.returnPct}%</span>
            )}
            {data.worstTrade && (
              <span className="text-rose-400/70">최저 {data.worstTrade.returnPct}%</span>
            )}
          </div>
        </div>
      </div>

      {/* Progress bar for win rate */}
      <div className="rounded-lg bg-slate-800/30 p-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-slate-500">승패 비율</span>
          <span className="text-[10px] text-slate-400">{data.winCount}W / {data.lossCount}L</span>
        </div>
        <div className="h-2 rounded-full bg-slate-700 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all"
            style={{ width: `${data.winRate}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// 피드백 루프 이력
// ═══════════════════════════════════════════════════════════════

function FeedbackHistorySection() {
  const history = trpc.mockTrading.feedbackHistory.useQuery({ limit: 10 }, { staleTime: 60_000 });
  const triggerMutation = trpc.performanceTracker.triggerFeedbackLoop.useMutation({
    onSuccess: () => {
      toast.success("피드백 루프 실행 완료");
      history.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const data = history.data;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History size={16} className="text-teal-400" />
          <h3 className="text-sm font-bold text-white">피드백 루프 이력</h3>
        </div>
        <div className="flex items-center gap-3">
          {data?.summary && (
            <span className="text-[10px] text-slate-500">
              30일: {data.summary.totalTrades30d}건 거래 · 순손익 {(data.summary.netPnl30d >= 0 ? "+" : "")}{data.summary.netPnl30d.toLocaleString()}원
            </span>
          )}
          <button
            onClick={() => triggerMutation.mutate()}
            disabled={triggerMutation.isPending}
            className="flex items-center gap-1 rounded-lg bg-slate-700 px-3 py-1.5 text-[11px] font-medium text-slate-300 transition hover:bg-slate-600 disabled:opacity-50"
          >
            <RefreshCw size={11} className={triggerMutation.isPending ? "animate-spin" : ""} />
            수동 실행
          </button>
        </div>
      </div>

      {/* Policy version timeline */}
      {data?.history && data.history.length > 0 ? (
        <div className="max-h-64 space-y-2 overflow-y-auto">
          {data.history.map((item) => (
            <div key={item.id} className="rounded-lg border border-slate-800/60 bg-slate-900/30 px-3 py-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                    item.status === "active" ? "bg-emerald-500/10 text-emerald-300" : "bg-slate-700 text-slate-400"
                  }`}>
                    v{item.version}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    SL {item.stopLossPercent}% · TP {item.takeProfitPercent}% · {item.maxConcurrentPositions}종목
                  </span>
                </div>
                <span className="text-[10px] text-slate-600">
                  {item.createdAt ? new Date(item.createdAt).toLocaleDateString("ko-KR") : ""}
                </span>
              </div>

              {/* Changes from previous version */}
              {item.changes.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {item.changes.map((ch, i) => (
                    <span key={i} className="inline-flex items-center rounded bg-teal-500/10 px-1.5 py-0.5 text-[9px] text-teal-300">
                      {ch.param}: {ch.from} → {ch.to}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="py-4 text-center text-xs text-slate-500">정책 이력이 없습니다.</p>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// 공통 하위 컴포넌트
// ═══════════════════════════════════════════════════════════════

function FormField({ label, value, onChange, suffix, type = "text", step }: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  suffix?: string;
  type?: string;
  step?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-[10px] font-medium text-slate-500">{label}</label>
      <div className="flex items-center gap-1">
        <input
          type={type}
          value={value}
          step={step}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:border-teal-500 focus:outline-none"
        />
        {suffix && <span className="shrink-0 text-[10px] text-slate-500">{suffix}</span>}
      </div>
    </div>
  );
}

function ParamDisplay({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-800/30 px-3 py-2">
      <p className="text-[10px] text-slate-500">{label}</p>
      <p className="text-xs font-medium text-white">{value}</p>
    </div>
  );
}

function formatSizing(mode: string) {
  switch (mode) {
    case "kelly": return "Kelly";
    case "half_kelly": return "Half Kelly";
    case "quarter_kelly": return "Quarter Kelly";
    case "fixed_percent": return "고정 비중";
    default: return mode;
  }
}
