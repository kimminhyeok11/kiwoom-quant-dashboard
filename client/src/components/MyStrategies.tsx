/**
 * 내 조건식 — HTS급 전략 허브
 *
 * 채택된 전략을 한곳에서 관리:
 * - 상태 표시 (후보/검증중/생존/배포중 등)
 * - 상세 조건식 보기
 * - 백테스트 실행
 * - 모의투자/실투 배포
 * - 랜덤 기간 검증
 * - 삭제
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { BookOpen, ChevronDown, ChevronRight, FlaskConical, Play, Rocket, Shield, Trash2, Zap } from "lucide-react";

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  candidate: { label: "후보", color: "text-slate-300", bg: "bg-slate-500/10" },
  testing: { label: "검증 중", color: "text-amber-300", bg: "bg-amber-500/10" },
  survivor: { label: "생존", color: "text-emerald-300", bg: "bg-emerald-500/10" },
  rejected: { label: "탈락", color: "text-rose-300", bg: "bg-rose-500/10" },
  retired: { label: "은퇴", color: "text-slate-500", bg: "bg-slate-500/10" },
  deployed: { label: "배포 중", color: "text-teal-300", bg: "bg-teal-500/10" },
};

export function MyStrategies() {
  const adopted = trpc.oneClickBacktest.adopted.useQuery(undefined, { staleTime: 15_000 });
  const activePolicies = trpc.mockTrading.activePolicies.useQuery(undefined, { staleTime: 30_000 });
  const [expanded, setExpanded] = useState<number | null>(null);
  const [filter, setFilter] = useState<string>("all");

  const deleteMutation = trpc.mockTrading.deletePreset.useMutation({
    onSuccess: (data) => { toast.success(data.message); adopted.refetch(); },
    onError: (err) => toast.error(err.message),
  });
  const deployMutation = trpc.mockTrading.deployStrategy.useMutation({
    onSuccess: (data) => { toast.success(data.message); activePolicies.refetch(); },
    onError: (err) => toast.error(err.message),
  });
  const validateMutation = trpc.oneClickBacktest.randomValidation.useMutation({
    onSuccess: () => toast.success("50회 랜덤 검증 완료"),
    onError: (err) => toast.error(err.message),
  });
  const statusMutation = trpc.oneClickBacktest.updateStrategyStatus.useMutation({
    onSuccess: (data) => { toast.success(data.message); adopted.refetch(); },
    onError: (err) => toast.error(err.message),
  });

  // 전략 목록 + 배포 상태 연결
  const deployedPolicyIds = new Set((activePolicies.data?.policies ?? []).map(p => p.id));
  const strategies = (adopted.data ?? []).map(s => {
    const scoring = s.scoringJson as { lifecycleStatus?: string; root?: unknown; minimumScore?: number; backtestSummary?: { averageReturn?: number; averageWinRate?: number; fitnessScore?: number } } | null;
    const status = scoring?.lifecycleStatus ?? "candidate";
    return { ...s, status, root: scoring?.root, minimumScore: scoring?.minimumScore ?? 50, backtestSummary: scoring?.backtestSummary };
  });

  const filtered = filter === "all" ? strategies : strategies.filter(s => s.status === filter);
  const counts: Record<string, number> = { all: strategies.length };
  for (const s of strategies) counts[s.status] = (counts[s.status] ?? 0) + 1;

  return (
    <div className="flex flex-col gap-5 p-4">
      {/* Header */}
      <div>
        <h1 className="text-lg sm:text-xl font-bold text-white">내 조건식</h1>
        <p className="mt-1 text-[11px] sm:text-xs text-slate-400">
          저장된 조건식을 관리합니다. 상세 보기, 백테스트, 배포, 검증을 한곳에서 실행하세요.
        </p>
      </div>

      {/* 상태 필터 */}
      <div className="flex flex-wrap gap-1.5 sm:gap-2">
        {[
          { key: "all", label: "전체" },
          { key: "survivor", label: "생존" },
          { key: "testing", label: "검증 중" },
          { key: "candidate", label: "후보" },
          { key: "rejected", label: "탈락" },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-lg px-2.5 sm:px-3 py-1.5 text-[11px] font-medium transition ${
              filter === f.key ? "bg-teal-500/20 text-teal-300 border border-teal-500/40" : "bg-slate-800 text-slate-400 border border-slate-700"
            }`}
          >
            {f.label} {counts[f.key] ? `(${counts[f.key]})` : ""}
          </button>
        ))}
      </div>

      {/* 목록 */}
      {adopted.isLoading ? (
        <div className="py-12 text-center text-sm text-slate-500">불러오는 중...</div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center">
          <BookOpen className="mx-auto mb-2 text-slate-600" size={32} />
          <p className="text-sm text-slate-400">{filter === "all" ? "채택된 조건식이 없습니다" : "해당 상태인 전략이 없습니다"}</p>
          <p className="mt-1 text-xs text-slate-500">전략 자동 생성에서 좋은 결과를 채택하세요.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(s => {
            const isExpanded = expanded === s.id;
            const statusInfo = STATUS_MAP[s.status] ?? STATUS_MAP.candidate;
            const bs = s.backtestSummary;
            return (
              <div key={s.id} className={`rounded-xl border ${isExpanded ? "border-teal-500/30 bg-teal-950/5" : "border-slate-800 bg-slate-950/30"} overflow-hidden`}>
                {/* 카드 헤더 */}
                <button
                  onClick={() => setExpanded(isExpanded ? null : s.id)}
                  className="w-full flex items-center justify-between p-4 text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-bold ${statusInfo.bg} ${statusInfo.color}`}>
                      {statusInfo.label}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">{s.name}</p>
                      <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-500">
                        <span>{new Date(s.createdAt).toLocaleDateString("ko-KR")}</span>
                        {bs && <span>수익 {bs.averageReturn}% · 승률 {bs.averageWinRate}%</span>}
                      </div>
                    </div>
                  </div>
                  {isExpanded ? <ChevronDown size={16} className="shrink-0 text-slate-500" /> : <ChevronRight size={16} className="shrink-0 text-slate-500" />}
                </button>

                {/* 확장된 상세 패널 */}
                {isExpanded && (
                  <div className="border-t border-slate-800 px-4 py-4 space-y-4">
                    {/* 액션 버튼 그리드 */}
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => {
                          if (!window.confirm(`"${s.name}" 전략을 모의투자에 배포합니까?`)) return;
                          deployMutation.mutate({ presetId: s.id });
                        }}
                        disabled={deployMutation.isPending}
                        className="flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-3 py-2 text-[11px] font-medium text-emerald-300 hover:bg-emerald-500/20 active:scale-95 disabled:opacity-50"
                      >
                        <Rocket size={12} /> 모투 배포
                      </button>
                      <button
                        onClick={() => {
                          if (!s.root) { toast.error("조건식 데이터 없음"); return; }
                          validateMutation.mutate({ root: s.root, minimumScore: s.minimumScore, iterations: 50 });
                        }}
                        disabled={validateMutation.isPending}
                        className="flex items-center gap-1.5 rounded-lg bg-violet-500/10 px-3 py-2 text-[11px] font-medium text-violet-300 hover:bg-violet-500/20 active:scale-95 disabled:opacity-50"
                      >
                        <FlaskConical size={12} /> {validateMutation.isPending ? "검증 중..." : "랜덤 검증"}
                      </button>
                      <button
                        onClick={() => {
                          if (!window.confirm(`"${s.name}" 삭제합니까?`)) return;
                          deleteMutation.mutate({ presetId: s.id });
                        }}
                        disabled={deleteMutation.isPending}
                        className="flex items-center gap-1.5 rounded-lg bg-rose-500/10 px-3 py-2 text-[11px] font-medium text-rose-300 hover:bg-rose-500/20 active:scale-95 disabled:opacity-50"
                      >
                        <Trash2 size={12} /> 삭제
                      </button>
                    </div>

                    {/* 상태 변경 */}
                    <div className="flex items-center gap-2">
                      <Shield size={12} className="text-slate-500" />
                      <span className="text-[10px] text-slate-500">상태:</span>
                      <select
                        value={s.status}
                        onChange={e => statusMutation.mutate({ presetId: s.id, status: e.target.value as "candidate" | "testing" | "survivor" | "rejected" | "retired" })}
                        disabled={statusMutation.isPending}
                        className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-[10px] text-white"
                      >
                        <option value="candidate">후보</option>
                        <option value="testing">검증 중</option>
                        <option value="survivor">생존</option>
                        <option value="rejected">탈락</option>
                        <option value="retired">은퇴</option>
                      </select>
                    </div>

                    {/* 백테스트 요약 */}
                    {bs && (
                      <div className="grid grid-cols-3 gap-2 text-[10px]">
                        <div className="rounded-lg bg-slate-800/30 px-2 py-1.5 text-center">
                          <p className="text-slate-500">수익률</p>
                          <p className={`font-mono font-bold ${(bs.averageReturn ?? 0) >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{bs.averageReturn ?? 0}%</p>
                        </div>
                        <div className="rounded-lg bg-slate-800/30 px-2 py-1.5 text-center">
                          <p className="text-slate-500">승률</p>
                          <p className="font-mono font-bold text-white">{bs.averageWinRate ?? 0}%</p>
                        </div>
                        <div className="rounded-lg bg-slate-800/30 px-2 py-1.5 text-center">
                          <p className="text-slate-500">적합도</p>
                          <p className="font-mono font-bold text-white">{bs.fitnessScore ?? 0}</p>
                        </div>
                      </div>
                    )}

                    {/* 조건식 상세 */}
                    {Boolean(s.root) && (
                      <details className="rounded-lg border border-slate-700/50 bg-slate-900/30 p-3">
                        <summary className="cursor-pointer text-xs font-medium text-slate-400 hover:text-white">
                          조건식 상세 보기
                        </summary>
                        <div className="mt-2 space-y-1.5">
                          <p className="text-[10px] text-slate-500">최소 점수: {String(s.minimumScore)}점</p>
                          {flattenRules(s.root).map((desc, i) => (
                            <div key={i} className="flex items-start gap-2 text-[11px]">
                              <span className="shrink-0 rounded bg-teal-500/10 px-1.5 py-0.5 text-[9px] font-bold text-teal-300">{i + 1}</span>
                              <span className="text-slate-300">{desc}</span>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── 조건식 한글 변환 ───

const RULE_LABELS: Record<string, string> = {
  macd_rising: "MACD 상승", macd_histogram: "MACD 히스토그램", ma_position: "이평선 배열",
  high_return: "고저 변동률", rsi: "RSI", bollinger: "볼린저밴드", stochastic: "스토캐스틱",
  atr_percent: "ATR", volume_ratio: "거래량 비율", close_change: "종가 등락", gap_percent: "시가 갭",
  intrabar_position: "봉내 위치", disparity: "이격도", envelope: "엔벨로프", williams_r: "Williams%R",
  cci: "CCI", obv: "OBV", turnover_ma: "거래대금이평", bullish_candle_count: "양봉수",
  bearish_candle_count: "음봉수", gap_up: "갭상승", gap_down: "갭하락", turnover: "거래대금",
};

function flattenRules(node: unknown): string[] {
  if (!node || typeof node !== "object") return [];
  const n = node as Record<string, unknown>;
  if (n.type && typeof n.type === "string" && !n.children) {
    const config = (n.config ?? {}) as Record<string, unknown>;
    const label = RULE_LABELS[n.type as string] ?? String(n.type);
    const parts: string[] = [label];
    if (config.period) parts.push(`${config.period}일`);
    if (config.periods) parts.push(`[${config.periods}]`);
    if (config.days) parts.push(`${config.days}봉`);
    if (config.lookback) parts.push(`${config.lookback}봉`);
    if (config.threshold !== undefined) parts.push(`${config.threshold}`);
    if (config.minPercent !== undefined) parts.push(`${config.minPercent}%`);
    if (config.deviation) parts.push(`${config.deviation}σ`);
    if (config.comparator) parts.push(`${config.comparator}`);
    return [parts.join(" ")];
  }
  if (Array.isArray(n.children)) {
    const logic = n.logic ? `[${n.logic}]` : "";
    const childRules = (n.children as unknown[]).flatMap(c => flattenRules(c));
    if (logic && childRules.length > 1) return [`${logic} ${childRules.join(" · ")}`];
    return childRules;
  }
  return [];
}
