/**
 * 누적 공통 지표 통계 패널
 *
 * 역대 전체 promoted 카드에서 어떤 지표(규칙 타입)가 가장 자주 등장했고,
 * 어떤 조합이 가장 좋은 성과를 냈는지 누적 통계를 보여준다.
 */

import { trpc } from "@/lib/trpc";
import { BarChart3, Layers, Sparkles, TrendingUp } from "lucide-react";

const RULE_LABELS: Record<string, string> = {
  macd_rising: "MACD 흐름", macd_level: "MACD 기준선", ma_position: "이동평균", high_return: "고저 변동", new_high: "신고가", turnover: "거래대금",
  rsi: "RSI", bollinger: "볼린저", stochastic: "스토캐스틱", atr_percent: "ATR", volume_ratio: "거래량 비율",
  close_change: "종가 변동", gap_percent: "시가 갭", intrabar_position: "봉 위치", turnover_count: "거래대금 반복", volume_ratio_count: "거래량 반복", bullish_candle_count: "양봉 반복", price_range: "가격 범위",
};

export function CumulativeIndicatorStatsPanel() {
  const stats = trpc.minuteResearch.cumulativeIndicatorStats.useQuery(undefined, {
    retry: 2,
    retryDelay: attempt => Math.min(4_000, 750 * (attempt + 1)),
    refetchInterval: 60_000,
  });

  const data = stats.data;
  const maxCount = Math.max(1, ...(data?.indicators.map(i => i.count) ?? [1]));

  return (
    <section className="mt-5 rounded-2xl border border-emerald-300/20 bg-slate-900/35 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-300">CUMULATIVE INDICATOR STATS</p>
          <h2 className="mt-1 text-lg font-bold text-white">누적 지표 통계</h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            역대 전체 검증 통과 카드에서 어떤 지표가 가장 많이 등장했고, 어떤 조합이 가장 좋았는지 분석합니다.
            {data?.totalCandidates ? <span className="ml-1 text-emerald-200">총 {data.totalCandidates}장 분석 기준</span> : null}
          </p>
        </div>
        <Sparkles className="text-emerald-200" size={21} />
      </div>

      {stats.isLoading ? (
        <div className="mt-5 flex items-center justify-center py-8 text-xs text-slate-500">통계를 계산하는 중...</div>
      ) : !data?.indicators.length ? (
        <div className="mt-5 flex items-center gap-3 rounded-xl border border-dashed border-slate-700 px-4 py-5 text-xs text-slate-500">
          <BarChart3 className="text-slate-600" size={18} />
          검증 통과 카드가 쌓이면 어떤 지표가 공통적으로 좋은지 누적 분석이 표시됩니다.
        </div>
      ) : (
        <>
          {/* Summary metrics */}
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <MiniStat
              label="가장 자주 등장한 지표"
              value={RULE_LABELS[data.indicators[0]?.type ?? ""] ?? data.indicators[0]?.type ?? "-"}
              sub={`${data.indicators[0]?.count ?? 0}회 (${data.indicators[0]?.frequency ?? 0}%)`}
            />
            <MiniStat
              label="최고 평균 수익률 지표"
              value={RULE_LABELS[bestReturn(data.indicators)?.type ?? ""] ?? bestReturn(data.indicators)?.type ?? "-"}
              sub={`+${bestReturn(data.indicators)?.avgReturnPercent.toFixed(2) ?? "0"}%`}
            />
            <MiniStat
              label="분석 대상 카드"
              value={`${data.totalCandidates}장`}
              sub="역대 promoted 전체"
            />
          </div>

          {/* Indicator frequency bars */}
          <div className="mt-5">
            <h4 className="mb-3 flex items-center gap-1.5 text-xs font-medium text-slate-300">
              <BarChart3 size={13} />
              지표별 등장 빈도 & 평균 성과 (누적)
            </h4>
            <div className="space-y-2">
              {data.indicators.slice(0, 10).map(indicator => (
                <div key={indicator.type} className="flex items-center gap-2">
                  <span className="w-20 shrink-0 text-[11px] font-medium text-slate-300">
                    {RULE_LABELS[indicator.type] ?? indicator.type}
                  </span>
                  <div className="flex-1">
                    <div className="relative h-6 overflow-hidden rounded-lg bg-slate-800/50">
                      <div
                        className="absolute inset-y-0 left-0 rounded-lg bg-gradient-to-r from-emerald-500/40 to-teal-500/30"
                        style={{ width: `${(indicator.count / maxCount) * 100}%` }}
                      />
                      <div className="relative flex h-full items-center justify-between px-2.5">
                        <span className="text-[10px] font-bold text-white">{indicator.count}회 · {indicator.frequency}%</span>
                        <span className={`font-mono text-[10px] font-semibold ${indicator.avgReturnPercent >= 0 ? "text-teal-200" : "text-rose-300"}`}>
                          {indicator.avgReturnPercent >= 0 ? "+" : ""}{indicator.avgReturnPercent.toFixed(2)}%
                        </span>
                      </div>
                    </div>
                  </div>
                  <span className="w-16 shrink-0 text-right text-[10px] text-slate-500">
                    승률 {indicator.avgWinRate.toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Best rule pairs */}
          {data.pairs.length > 0 && (
            <div className="mt-5">
              <h4 className="mb-3 flex items-center gap-1.5 text-xs font-medium text-slate-300">
                <Layers size={13} />
                누적 최고 수익률 지표 조합 (promoted 카드에서 동시 사용)
              </h4>
              <div className="grid gap-2 sm:grid-cols-2">
                {data.pairs.map((pair, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2.5"
                  >
                    <div className="flex items-center gap-1.5">
                      <TrendingUp size={11} className="text-emerald-400" />
                      <span className="text-[11px] text-slate-200">
                        {RULE_LABELS[pair.pair[0]] ?? pair.pair[0]}
                        <span className="mx-1 text-slate-600">+</span>
                        {RULE_LABELS[pair.pair[1]] ?? pair.pair[1]}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className={`font-mono text-[11px] font-bold ${pair.avgReturnPercent >= 0 ? "text-teal-200" : "text-rose-300"}`}>
                        {pair.avgReturnPercent >= 0 ? "+" : ""}{pair.avgReturnPercent.toFixed(2)}%
                      </span>
                      <span className="ml-2 text-[9px] text-slate-500">{pair.count}회</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function MiniStat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/35 p-3">
      <p className="text-[10px] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-bold text-white">{value}</p>
      <p className="mt-0.5 text-[10px] text-slate-500">{sub}</p>
    </div>
  );
}

function bestReturn(indicators: Array<{ type: string; avgReturnPercent: number }>) {
  if (!indicators.length) return null;
  return indicators.reduce((best, current) => current.avgReturnPercent > best.avgReturnPercent ? current : best, indicators[0]);
}
