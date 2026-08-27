/**
 * 내 조건식 — 채택한 전략 전체 목록
 *
 * 저장된 조건식을 한눈에 보고 관리:
 * - 상태별 필터 (전체/생존/검증중/후보/탈락)
 * - 모의투자 배포
 * - 삭제
 * - 조건식 상세 보기
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { BookOpen, Rocket, Trash2, Eye } from "lucide-react";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  candidate: { label: "후보", color: "bg-slate-500/10 text-slate-300" },
  testing: { label: "검증 중", color: "bg-amber-500/10 text-amber-300" },
  survivor: { label: "생존", color: "bg-emerald-500/10 text-emerald-300" },
  rejected: { label: "탈락", color: "bg-rose-500/10 text-rose-300" },
  retired: { label: "은퇴", color: "bg-slate-500/10 text-slate-500" },
};

export function MyStrategies() {
  const adopted = trpc.oneClickBacktest.adopted.useQuery(undefined, { staleTime: 15_000 });
  const deleteMutation = trpc.mockTrading.deletePreset.useMutation({
    onSuccess: (data) => { toast.success(data.message); adopted.refetch(); },
    onError: (err) => toast.error(err.message),
  });
  const deployMutation = trpc.mockTrading.deployStrategy.useMutation({
    onSuccess: (data) => toast.success(data.message),
    onError: (err) => toast.error(err.message),
  });

  const [filter, setFilter] = useState<string>("all");
  const [expanded, setExpanded] = useState<number | null>(null);

  const strategies = (adopted.data ?? []).map(s => {
    const scoring = s.scoringJson as { lifecycleStatus?: string; root?: unknown; minimumScore?: number } | null;
    return { ...s, status: scoring?.lifecycleStatus ?? "candidate", root: scoring?.root, minimumScore: scoring?.minimumScore ?? 50 };
  });

  const filtered = filter === "all" ? strategies : strategies.filter(s => s.status === filter);
  const counts = { all: strategies.length, survivor: strategies.filter(s => s.status === "survivor").length, testing: strategies.filter(s => s.status === "testing").length, candidate: strategies.filter(s => s.status === "candidate").length, rejected: strategies.filter(s => s.status === "rejected").length };

  return (
    <div className="flex flex-col gap-5 p-4">
      <div>
        <h1 className="text-lg sm:text-xl font-bold text-white">내 조건식</h1>
        <p className="mt-1 text-[11px] sm:text-xs text-slate-400">
          채택한 전략을 모아봅니다. 여기서 모의투자 배포, 삭제, 상태 관리를 할 수 있습니다.
        </p>
      </div>

      {/* 상태 필터 */}
      <div className="flex flex-wrap gap-2">
        {[
          { key: "all", label: `전체 (${counts.all})` },
          { key: "survivor", label: `생존 (${counts.survivor})` },
          { key: "testing", label: `검증 중 (${counts.testing})` },
          { key: "candidate", label: `후보 (${counts.candidate})` },
          { key: "rejected", label: `탈락 (${counts.rejected})` },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              filter === f.key ? "bg-teal-500/20 text-teal-300 border border-teal-500/40" : "bg-slate-800 text-slate-400 border border-slate-700"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* 목록 */}
      {adopted.isLoading ? (
        <div className="py-12 text-center text-sm text-slate-500">불러오는 중...</div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center">
          <BookOpen className="mx-auto mb-2 text-slate-600" size={32} />
          <p className="text-sm text-slate-400">{filter === "all" ? "채택된 조건식이 없습니다" : `${STATUS_LABELS[filter]?.label ?? filter} 상태인 전략이 없습니다`}</p>
          <p className="mt-1 text-xs text-slate-500">전략 자동 생성에서 좋은 결과를 채택하세요.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(s => {
            const isExpanded = expanded === s.id;
            const statusInfo = STATUS_LABELS[s.status] ?? STATUS_LABELS.candidate;
            return (
              <div key={s.id} className="rounded-xl border border-slate-800 bg-slate-950/30 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold ${statusInfo.color}`}>{statusInfo.label}</span>
                      <span className="text-sm font-medium text-white truncate">{s.name}</span>
                    </div>
                    <p className="mt-1 text-[10px] text-slate-500">
                      {new Date(s.createdAt).toLocaleDateString("ko-KR")} · ID #{s.id}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => setExpanded(isExpanded ? null : s.id)}
                      className="rounded p-1.5 text-slate-500 hover:text-teal-300 hover:bg-teal-500/10"
                      title="조건식 보기"
                    >
                      <Eye size={14} />
                    </button>
                    <button
                      onClick={() => {
                        if (!window.confirm(`"${s.name}" 전략을 모의투자에 배포합니까?`)) return;
                        deployMutation.mutate({ presetId: s.id });
                      }}
                      disabled={deployMutation.isPending}
                      className="rounded p-1.5 text-slate-500 hover:text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50"
                      title="모의투자 배포"
                    >
                      <Rocket size={14} />
                    </button>
                    <button
                      onClick={() => {
                        if (!window.confirm(`"${s.name}" 전략을 삭제합니까?`)) return;
                        deleteMutation.mutate({ presetId: s.id });
                      }}
                      disabled={deleteMutation.isPending}
                      className="rounded p-1.5 text-slate-500 hover:text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
                      title="삭제"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* 조건식 상세 (확장) */}
                {isExpanded && Boolean(s.root) && (
                  <div className="mt-3 rounded-lg bg-slate-900/50 p-3 space-y-1.5">
                    <p className="text-[10px] text-slate-500 mb-2">최소 점수: {String(s.minimumScore)}점</p>
                    {flattenRules(s.root).map((desc, i) => (
                      <div key={i} className="flex items-start gap-2 text-[11px]">
                        <span className="shrink-0 rounded bg-teal-500/10 px-1.5 py-0.5 text-[9px] font-bold text-teal-300">{i + 1}</span>
                        <span className="text-slate-300">{desc}</span>
                      </div>
                    ))}
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
    if (config.threshold !== undefined) parts.push(`${config.threshold}`);
    if (config.comparator) parts.push(`${config.comparator}`);
    return [parts.join(" ")];
  }
  if (Array.isArray(n.children)) {
    return (n.children as unknown[]).flatMap(c => flattenRules(c));
  }
  return [];
}
