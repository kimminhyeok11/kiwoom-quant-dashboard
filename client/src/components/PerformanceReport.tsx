/**
 * 실투 성과 리포트
 *
 * - 전체 성과 요약 (승률, 평균수익, Profit Factor)
 * - 라운드트립 거래 내역 테이블
 * - 백테스트 예측 vs 실투 실제 비교
 * - 슬리피지 분석
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  TrendingUp,
  TrendingDown,
  BarChart3,
  Activity,
  Target,
  AlertTriangle,
  CheckCircle2,
  ArrowUpRight,
  ArrowDownRight,
  Scale,
  Clock,
} from "lucide-react";

export function PerformanceReport() {
  const [selectedPolicyId, setSelectedPolicyId] = useState<number | null>(null);
  const summary = trpc.performanceTracker.summary.useQuery(undefined, { staleTime: 30_000, refetchInterval: 60_000 });
  const comparison = trpc.performanceTracker.backtestVsActual.useQuery(undefined, { staleTime: 60_000 });
  const slippage = trpc.performanceTracker.slippageAnalysis.useQuery(undefined, { staleTime: 60_000 });
  const activePolicies = trpc.mockTrading.activePolicies.useQuery(undefined, { staleTime: 30_000 });
  const policyPerf = trpc.mockTrading.policyPerformance.useQuery(
    { policyId: selectedPolicyId! },
    { enabled: Boolean(selectedPolicyId), staleTime: 30_000 }
  );

  const s = summary.data;
  const hasData = s && s.roundTripCount > 0;
  const policies = activePolicies.data?.policies ?? [];
  const pp = policyPerf.data;

  return (
    <div className="flex flex-col gap-5 p-4">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white">실투 성과 리포트</h1>
        <p className="mt-1 text-xs text-slate-400">
          백테스트 예측과 실제 체결 결과를 비교하여 전략의 실전 신뢰도를 측정합니다.
        </p>
      </div>

      {/* 전략별 필터 */}
      {policies.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setSelectedPolicyId(null)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              !selectedPolicyId ? "bg-teal-500/20 text-teal-300 border border-teal-500/40" : "bg-slate-800 text-slate-400 border border-slate-700 hover:text-white"
            }`}
          >
            전체
          </button>
          {policies.map(p => (
            <button
              key={p.id}
              onClick={() => setSelectedPolicyId(p.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                selectedPolicyId === p.id ? "bg-violet-500/20 text-violet-300 border border-violet-500/40" : "bg-slate-800 text-slate-400 border border-slate-700 hover:text-white"
              }`}
            >
              v{p.version} · {(p.totalCapital / 10000).toFixed(0)}만
            </button>
          ))}
        </div>
      )}

      {/* 전략별 성과 (선택 시) */}
      {selectedPolicyId && pp && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard icon={Target} label="승률" value={pp.winRate !== null ? `${pp.winRate}%` : "—"} detail={`${pp.winCount}승 ${pp.lossCount}패`} tone={pp.winRate !== null && pp.winRate >= 50 ? "green" : "red"} />
          <MetricCard icon={Activity} label="실현 손익" value={`${pp.realizedPnl >= 0 ? "+" : ""}${pp.realizedPnl.toLocaleString()}원`} detail={`매수 ${pp.buyCount} · 매도 ${pp.sellCount}건`} tone={pp.realizedPnl >= 0 ? "green" : "red"} />
          <MetricCard icon={TrendingUp} label="투입 자본" value={`${(pp.capitalDeployed / 10000).toFixed(0)}만원`} detail={`총 ${pp.totalOrders}건 체결`} tone="green" />
          <MetricCard icon={Scale} label="오픈 포지션" value={`${pp.openPositions.length}종목`} detail={pp.openPositions.map(p => p.symbol).join(", ") || "없음"} tone="yellow" />
        </div>
      )}

      {/* 데이터 없을 때 */}
      {!hasData && !summary.isLoading && (
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-800/50">
            <BarChart3 className="text-slate-500" size={32} />
          </div>
          <p className="text-sm font-medium text-slate-300">아직 완결된 거래가 없습니다</p>
          <p className="max-w-md text-xs text-slate-500">
            모의투자에서 매수 → 매도가 완료된 라운드트립이 있어야 성과를 분석할 수 있습니다.
            전략을 배포하고 수집기를 실행하세요.
          </p>
        </div>
      )}

      {/* 로딩 */}
      {summary.isLoading && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-24 animate-pulse rounded-xl border border-slate-800 bg-slate-950/30" />
          ))}
        </div>
      )}

      {/* 성과 요약 카드 */}
      {hasData && s && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              icon={Target}
              label="승률"
              value={`${s.winRate}%`}
              detail={`${s.roundTripCount}건 완결`}
              tone={s.winRate !== null && s.winRate >= 50 ? "green" : "red"}
            />
            <MetricCard
              icon={TrendingUp}
              label="평균 수익률"
              value={`${s.avgReturn >= 0 ? "+" : ""}${s.avgReturn}%`}
              detail={`수익 평균 +${s.avgWin}% / 손실 평균 ${s.avgLoss}%`}
              tone={s.avgReturn >= 0 ? "green" : "red"}
            />
            <MetricCard
              icon={Scale}
              label="Profit Factor"
              value={s.profitFactor !== null ? String(s.profitFactor) : "—"}
              detail="총 수익 / 총 손실 비율"
              tone={s.profitFactor !== null && s.profitFactor >= 1.5 ? "green" : s.profitFactor !== null && s.profitFactor >= 1 ? "yellow" : "red"}
            />
            <MetricCard
              icon={Activity}
              label="실현 손익"
              value={`${s.realizedPnl >= 0 ? "+" : ""}${s.realizedPnl.toLocaleString()}원`}
              detail={`매수 ${s.buyCount}건 / 매도 ${s.sellCount}건`}
              tone={s.realizedPnl >= 0 ? "green" : "red"}
            />
          </div>

          {/* 누적 수익률 차트 */}
          {s.recentTrades.length >= 2 && (
            <CumulativeReturnChart trades={s.recentTrades} />
          )}

          {/* 슬리피지 분석 */}
          {slippage.data && slippage.data.totalMeasured > 0 && (
            <section className="rounded-xl border border-slate-800 bg-slate-950/30 p-5">
              <div className="flex items-center gap-2">
                <AlertTriangle size={14} className="text-amber-400" />
                <h2 className="text-sm font-bold text-white">슬리피지 분석</h2>
                <span className="text-[10px] text-slate-500">(계획가 vs 실제 체결가 차이)</span>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg bg-slate-900/50 p-3 text-center">
                  <p className="text-[10px] text-slate-500">평균 슬리피지</p>
                  <p className={`mt-1 font-mono text-lg font-bold ${slippage.data.avgSlippagePercent > 0.1 ? "text-amber-300" : "text-emerald-300"}`}>
                    {slippage.data.avgSlippagePercent > 0 ? "+" : ""}{slippage.data.avgSlippagePercent}%
                  </p>
                </div>
                <div className="rounded-lg bg-slate-900/50 p-3 text-center">
                  <p className="text-[10px] text-slate-500">최대 슬리피지</p>
                  <p className="mt-1 font-mono text-lg font-bold text-slate-300">{slippage.data.maxSlippagePercent}%</p>
                </div>
                <div className="rounded-lg bg-slate-900/50 p-3 text-center">
                  <p className="text-[10px] text-slate-500">측정 건수</p>
                  <p className="mt-1 font-mono text-lg font-bold text-slate-300">{slippage.data.totalMeasured}건</p>
                </div>
              </div>
              <p className="mt-3 text-[10px] text-slate-500">
                슬리피지가 0.1% 이하면 양호합니다. 0.3% 이상이면 유동성이 낮은 종목을 매매하고 있을 수 있습니다.
              </p>
            </section>
          )}

          {/* 백테스트 vs 실투 비교 */}
          {comparison.data?.comparisons && comparison.data.comparisons.length > 0 ? (
            <section className="rounded-xl border border-slate-800 bg-slate-950/30 p-5">
              <h2 className="mb-3 text-sm font-bold text-white">정책별 백테스트 설정 vs 실투 결과</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-left text-slate-500">
                      <th className="px-3 py-2">정책</th>
                      <th className="px-3 py-2">상태</th>
                      <th className="px-3 py-2 text-right">손절</th>
                      <th className="px-3 py-2 text-right">익절</th>
                      <th className="px-3 py-2 text-right">사이징</th>
                      <th className="px-3 py-2 text-right">실투 거래</th>
                      <th className="px-3 py-2 text-right">실투 승률</th>
                      <th className="px-3 py-2 text-right">실투 수익</th>
                      <th className="px-3 py-2 text-right">실현 손익</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparison.data.comparisons.map(c => (
                      <tr key={c.policyId} className="border-b border-slate-800/50 hover:bg-slate-800/20">
                        <td className="px-3 py-2 font-mono text-white">v{c.version}</td>
                        <td className="px-3 py-2">
                          <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${
                            c.status === "active" ? "bg-emerald-500/10 text-emerald-300" : "bg-slate-500/10 text-slate-400"
                          }`}>
                            {c.status === "active" ? "활성" : "종료"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right text-rose-300">-{c.config.stopLoss}%</td>
                        <td className="px-3 py-2 text-right text-emerald-300">+{c.config.takeProfit}%</td>
                        <td className="px-3 py-2 text-right text-slate-300">{c.config.sizing.replace("_", " ")}</td>
                        <td className="px-3 py-2 text-right text-white">{c.actual.tradeCount}건</td>
                        <td className={`px-3 py-2 text-right font-bold ${
                          c.actual.winRate !== null && c.actual.winRate >= 50 ? "text-emerald-300" : "text-rose-300"
                        }`}>
                          {c.actual.winRate !== null ? `${c.actual.winRate}%` : "—"}
                        </td>
                        <td className={`px-3 py-2 text-right ${c.actual.avgReturn >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                          {c.actual.avgReturn >= 0 ? "+" : ""}{c.actual.avgReturn}%
                        </td>
                        <td className={`px-3 py-2 text-right font-mono font-bold ${c.actual.totalPnl >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                          {c.actual.totalPnl >= 0 ? "+" : ""}{c.actual.totalPnl.toLocaleString()}원
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : comparison.data?.message ? (
            <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-5 text-center">
              <p className="text-xs text-slate-400">{comparison.data.message}</p>
            </div>
          ) : null}

          {/* 최근 라운드트립 거래 내역 */}
          {s.recentTrades.length > 0 && (
            <section className="rounded-xl border border-slate-800 bg-slate-950/30 p-5">
              <h2 className="mb-3 text-sm font-bold text-white">최근 거래 내역</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-left text-slate-500">
                      <th className="px-3 py-2">종목</th>
                      <th className="px-3 py-2 text-right">매수가</th>
                      <th className="px-3 py-2 text-right">매도가</th>
                      <th className="px-3 py-2 text-right">수량</th>
                      <th className="px-3 py-2 text-right">수익률</th>
                      <th className="px-3 py-2">매수일</th>
                      <th className="px-3 py-2">매도일</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.recentTrades.map((t, i) => (
                      <tr key={`${t.symbol}-${i}`} className="border-b border-slate-800/50 hover:bg-slate-800/20">
                        <td className="px-3 py-2">
                          <span className="font-medium text-white">{t.name}</span>
                          <span className="ml-1 font-mono text-[10px] text-slate-500">{t.symbol}</span>
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-slate-300">{t.buyPrice.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right font-mono text-slate-300">{t.sellPrice.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right text-slate-400">{t.quantity}주</td>
                        <td className="px-3 py-2 text-right">
                          <span className={`inline-flex items-center gap-0.5 font-bold ${t.returnPercent >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                            {t.returnPercent >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                            {t.returnPercent >= 0 ? "+" : ""}{t.returnPercent}%
                          </span>
                        </td>
                        <td className="px-3 py-2 text-slate-500">{t.buyDate}</td>
                        <td className="px-3 py-2 text-slate-500">{t.sellDate}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

// ─── 메트릭 카드 컴포넌트 ───
function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: typeof TrendingUp;
  label: string;
  value: string;
  detail: string;
  tone: "green" | "red" | "yellow";
}) {
  const toneColors = {
    green: "border-emerald-500/20 bg-emerald-950/10",
    red: "border-rose-500/20 bg-rose-950/10",
    yellow: "border-amber-500/20 bg-amber-950/10",
  };
  const iconColors = { green: "text-emerald-400", red: "text-rose-400", yellow: "text-amber-400" };
  const valueColors = { green: "text-emerald-300", red: "text-rose-300", yellow: "text-amber-300" };

  return (
    <div className={`rounded-xl border p-4 ${toneColors[tone]}`}>
      <div className="flex items-center gap-2">
        <Icon size={14} className={iconColors[tone]} />
        <span className="text-[11px] text-slate-400">{label}</span>
      </div>
      <p className={`mt-2 font-mono text-xl font-bold ${valueColors[tone]}`}>{value}</p>
      <p className="mt-1 text-[10px] text-slate-500">{detail}</p>
    </div>
  );
}

// ─── 누적 수익률 차트 ───
function CumulativeReturnChart({ trades }: { trades: Array<{ returnPercent: number; sellDate: string; symbol: string; name: string }> }) {
  // 날짜순 정렬 + 누적 수익률 계산
  const sorted = [...trades].sort((a, b) => a.sellDate.localeCompare(b.sellDate));
  const cumulative: Array<{ date: string; value: number; trade: typeof sorted[0] }> = [];
  let cum = 0;
  for (const t of sorted) {
    cum += t.returnPercent;
    cumulative.push({ date: t.sellDate, value: Number(cum.toFixed(2)), trade: t });
  }

  if (cumulative.length < 2) return null;

  const width = 600;
  const height = 180;
  const padding = { top: 20, right: 20, bottom: 30, left: 50 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const values = cumulative.map(d => d.value);
  const minVal = Math.min(0, ...values);
  const maxVal = Math.max(0, ...values);
  const range = maxVal - minVal || 1;

  const xStep = chartW / (cumulative.length - 1);
  const toY = (v: number) => padding.top + chartH - ((v - minVal) / range) * chartH;
  const zeroY = toY(0);

  // SVG path
  const pathD = cumulative
    .map((d, i) => `${i === 0 ? "M" : "L"}${padding.left + i * xStep},${toY(d.value)}`)
    .join(" ");

  // Fill area (path to zero line)
  const areaD = pathD +
    ` L${padding.left + (cumulative.length - 1) * xStep},${zeroY}` +
    ` L${padding.left},${zeroY} Z`;

  const lastValue = cumulative[cumulative.length - 1].value;
  const isPositive = lastValue >= 0;
  const strokeColor = isPositive ? "#34d399" : "#fb7185";
  const fillColor = isPositive ? "rgba(52,211,153,0.08)" : "rgba(251,113,133,0.08)";

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-950/30 p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <TrendingUp size={14} className={isPositive ? "text-emerald-400" : "text-rose-400"} />
          <h2 className="text-sm font-bold text-white">누적 수익률 추이</h2>
        </div>
        <span className={`font-mono text-sm font-bold ${isPositive ? "text-emerald-300" : "text-rose-300"}`}>
          {lastValue >= 0 ? "+" : ""}{lastValue.toFixed(2)}%
        </span>
      </div>

      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[400px] w-full" role="img" aria-label="누적 수익률 차트">
          {/* Grid lines */}
          <line x1={padding.left} x2={width - padding.right} y1={zeroY} y2={zeroY} stroke="#334155" strokeDasharray="4 4" />
          <line x1={padding.left} x2={padding.left} y1={padding.top} y2={height - padding.bottom} stroke="#1e293b" />

          {/* Area fill */}
          <path d={areaD} fill={fillColor} />

          {/* Line */}
          <path d={pathD} fill="none" stroke={strokeColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

          {/* Dots on each trade */}
          {cumulative.map((d, i) => (
            <circle
              key={i}
              cx={padding.left + i * xStep}
              cy={toY(d.value)}
              r="3"
              fill={d.trade.returnPercent >= 0 ? "#34d399" : "#fb7185"}
              stroke="#0f172a"
              strokeWidth="1.5"
            />
          ))}

          {/* Y-axis labels */}
          <text x={padding.left - 5} y={padding.top + 4} textAnchor="end" fill="#64748b" fontSize="10">
            {maxVal.toFixed(1)}%
          </text>
          <text x={padding.left - 5} y={zeroY + 4} textAnchor="end" fill="#94a3b8" fontSize="10">
            0%
          </text>
          {minVal < 0 && (
            <text x={padding.left - 5} y={height - padding.bottom} textAnchor="end" fill="#64748b" fontSize="10">
              {minVal.toFixed(1)}%
            </text>
          )}

          {/* X-axis labels (first and last date) */}
          <text x={padding.left} y={height - 8} fill="#64748b" fontSize="10">
            {cumulative[0].date}
          </text>
          <text x={width - padding.right} y={height - 8} textAnchor="end" fill="#64748b" fontSize="10">
            {cumulative[cumulative.length - 1].date}
          </text>

          {/* Trade count */}
          <text x={width - padding.right} y={padding.top - 4} textAnchor="end" fill="#475569" fontSize="9">
            {cumulative.length}건 거래
          </text>
        </svg>
      </div>

      <p className="mt-2 text-[10px] text-slate-500">
        각 점은 완결된 거래(매수→매도)이며, 수익률을 누적합산한 곡선입니다.
      </p>
    </section>
  );
}
