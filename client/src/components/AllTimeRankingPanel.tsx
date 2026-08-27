/**
 * 역대 Top 50 랭킹 테이블
 *
 * 모든 배틀에서 fitnessScore 기준 상위 50위까지의 전략 카드를 영구 표시.
 * 각 카드의 수익률·승률·낙폭·거래 수·생성일을 보여준다.
 */

import { trpc } from "@/lib/trpc";
import { Crown, Medal, Trophy } from "lucide-react";

const RULE_LABELS: Record<string, string> = {
  macd_rising: "MACD 흐름", macd_level: "MACD 기준선", ma_position: "이동평균", high_return: "고저 변동", new_high: "신고가", turnover: "거래대금",
  rsi: "RSI", bollinger: "볼린저", stochastic: "스토캐스틱", atr_percent: "ATR", volume_ratio: "거래량 비율",
  close_change: "종가 변동", gap_percent: "시가 갭", intrabar_position: "봉 위치", turnover_count: "거래대금 반복", volume_ratio_count: "거래량 반복", bullish_candle_count: "양봉 반복", price_range: "가격 범위",
};

function collectRules(root: unknown): string[] {
  if (!root || typeof root !== "object") return [];
  const node = root as { type?: string; children?: unknown[] };
  if (Array.isArray(node.children)) return node.children.flatMap(collectRules);
  return typeof node.type === "string" ? [node.type] : [];
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-300/20 text-amber-200"><Crown size={14} /></span>;
  if (rank === 2) return <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-300/15 text-slate-200"><Medal size={14} /></span>;
  if (rank === 3) return <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-600/20 text-amber-400"><Medal size={14} /></span>;
  return <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-800 font-mono text-[11px] font-bold text-slate-400">{rank}</span>;
}

export function AllTimeRankingPanel() {
  const ranking = trpc.minuteResearch.allTimeRanking.useQuery(undefined, {
    retry: 2,
    retryDelay: attempt => Math.min(4_000, 750 * (attempt + 1)),
    refetchInterval: 60_000,
  });

  const data = ranking.data;

  return (
    <section className="mt-5 rounded-2xl border border-amber-300/20 bg-slate-900/35 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-300">ALL-TIME RANKING</p>
          <h2 className="mt-1 text-lg font-bold text-white">역대 배틀 Top 50 랭킹</h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            전체 아레나 기록에서 검증 통과한 카드 중 적합도(fitness) 최상위 50위를 영구 보존합니다.
            {data?.totalPromotedCount ? <span className="ml-1 text-teal-200">총 {data.totalPromotedCount}장 통과 중 상위 {Math.min(50, data.ranking.length)}위</span> : null}
          </p>
        </div>
        <Trophy className="text-amber-200" size={21} />
      </div>

      {ranking.isLoading ? (
        <div className="mt-5 flex items-center justify-center py-8 text-xs text-slate-500">랭킹 데이터를 불러오는 중...</div>
      ) : !data?.ranking.length ? (
        <div className="mt-5 flex items-center gap-3 rounded-xl border border-dashed border-slate-700 px-4 py-5 text-xs text-slate-500">
          <Trophy className="text-slate-600" size={18} />
          아직 검증을 통과한 카드가 없습니다. 첫 배틀에서 통과 카드가 생기면 자동으로 랭킹에 등록됩니다.
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <th className="pb-2 pr-2">#</th>
                <th className="pb-2 pr-3">전략</th>
                <th className="pb-2 pr-3">적합도</th>
                <th className="pb-2 pr-3">OOS 수익률</th>
                <th className="pb-2 pr-3">승률</th>
                <th className="pb-2 pr-3">낙폭</th>
                <th className="pb-2 pr-3">거래</th>
                <th className="pb-2 pr-3">사용 지표</th>
                <th className="pb-2">생성일</th>
              </tr>
            </thead>
            <tbody>
              {data.ranking.map(item => {
                const rules = collectRules(item.rootGenomeJson);
                return (
                  <tr key={item.candidateId} className="border-b border-slate-800/50 transition hover:bg-slate-800/30">
                    <td className="py-2.5 pr-2"><RankBadge rank={item.rank} /></td>
                    <td className="py-2.5 pr-3">
                      <p className="font-mono text-[11px] text-slate-200">{item.strategyFingerprint.slice(0, 10)}</p>
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className="font-mono font-semibold text-teal-100">{item.fitnessScore.toFixed(2)}</span>
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className={`font-mono font-semibold ${item.validationReturnPercent >= 0 ? "text-teal-200" : "text-rose-300"}`}>
                        {item.validationReturnPercent >= 0 ? "+" : ""}{item.validationReturnPercent.toFixed(2)}%
                      </span>
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className="font-mono text-slate-200">{item.winRate.toFixed(1)}%</span>
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className="font-mono text-rose-300">{item.validationMaxDrawdownPercent.toFixed(2)}%</span>
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className="text-slate-300">{item.validationTradeCount}회</span>
                    </td>
                    <td className="py-2.5 pr-3">
                      <div className="flex flex-wrap gap-1">
                        {Array.from(new Set(rules)).slice(0, 3).map(r => (
                          <span key={r} className="rounded-full border border-slate-700 bg-slate-800/60 px-1.5 py-0.5 text-[9px] text-slate-400">
                            {RULE_LABELS[r] ?? r}
                          </span>
                        ))}
                        {rules.length > 3 && <span className="text-[9px] text-slate-600">+{rules.length - 3}</span>}
                      </div>
                    </td>
                    <td className="py-2.5 text-[10px] text-slate-500">
                      {new Date(item.createdAt).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
