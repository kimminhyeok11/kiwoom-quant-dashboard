/**
 * 백테스트 차트 뷰
 * 
 * 원클릭 백테스트 결과에서 특정 종목을 선택하면:
 * - HTS급 차트에 캔들스틱 표시
 * - 매수/매도 타점을 화살표 마커로 오버레이
 * - 기간 선택기로 특정 구간 확대
 * - 거래별 수익률 리스트
 */

import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { HtsChart } from "./HtsChart";
import { createTradeMarkers, type OhlcvBar, type Timeframe, type TradeMarker } from "@/lib/chartUtils";
import { Calendar, ChevronLeft, ChevronRight, Target } from "lucide-react";

type Trade = {
  entryDate: string;
  exitDate: string;
  entryPrice: number;
  exitPrice: number;
  returnPercent: number;
  exitReason?: string;
};

type BacktestChartViewProps = {
  /** 6자리 종목코드 */
  symbol: string;
  /** 백테스트 결과 거래 리스트 */
  trades: Trade[];
  /** 조건식 이름/설명 */
  strategyLabel?: string;
};

export function BacktestChartView({ symbol, trades, strategyLabel }: BacktestChartViewProps) {
  const [dateRange, setDateRange] = useState<{ start: string; end: string } | null>(null);

  // 차트 데이터 로드 (일봉)
  const dailyBars = trpc.chartData.dailyBars.useQuery(
    {
      symbol,
      startDate: dateRange?.start,
      endDate: dateRange?.end,
      limit: 600,
    },
    { enabled: Boolean(symbol), staleTime: 30000 }
  );

  const bars: OhlcvBar[] = dailyBars.data?.bars ?? [];

  // 거래를 마커로 변환
  const markers: TradeMarker[] = useMemo(() => {
    if (!trades.length || !bars.length) return [];

    return createTradeMarkers(
      trades.map(t => ({
        entryTime: dateToTimestamp(t.entryDate),
        exitTime: dateToTimestamp(t.exitDate),
        entryPrice: t.entryPrice,
        exitPrice: t.exitPrice,
        returnPercent: t.returnPercent,
      }))
    );
  }, [trades, bars]);

  // 기간 분석
  const dateInfo = useMemo(() => {
    if (!trades.length) return null;
    const dates = trades.flatMap(t => [t.entryDate, t.exitDate]).sort();
    return {
      firstDate: dates[0],
      lastDate: dates[dates.length - 1],
      tradeCount: trades.length,
      winCount: trades.filter(t => t.returnPercent > 0).length,
      totalReturn: trades.reduce((s, t) => s + t.returnPercent, 0),
    };
  }, [trades]);

  // 기간 프리셋
  const presetRanges = useMemo(() => {
    if (!dateInfo) return [];
    const presets: Array<{ label: string; start: string; end: string }> = [];
    presets.push({ label: "전체", start: dateInfo.firstDate, end: dateInfo.lastDate });

    // Split into halves
    const allDates = trades.flatMap(t => [t.entryDate, t.exitDate]).sort();
    const midIdx = Math.floor(allDates.length / 2);
    if (midIdx > 0 && midIdx < allDates.length - 1) {
      presets.push({ label: "전반", start: allDates[0], end: allDates[midIdx] });
      presets.push({ label: "후반", start: allDates[midIdx], end: allDates[allDates.length - 1] });
    }

    // Last 3 months
    if (dateInfo.lastDate) {
      const last = new Date(dateInfo.lastDate);
      const threeMonthsAgo = new Date(last);
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      const start3m = threeMonthsAgo.toISOString().slice(0, 10);
      if (start3m > dateInfo.firstDate) {
        presets.push({ label: "최근 3개월", start: start3m, end: dateInfo.lastDate });
      }
    }

    return presets;
  }, [dateInfo, trades]);

  // 현재 범위의 거래만 필터
  const visibleTrades = useMemo(() => {
    if (!dateRange) return trades;
    return trades.filter(t =>
      t.entryDate >= dateRange.start && t.exitDate <= dateRange.end
    );
  }, [trades, dateRange]);

  const winRate = visibleTrades.length
    ? (visibleTrades.filter(t => t.returnPercent > 0).length / visibleTrades.length * 100)
    : 0;
  const avgReturn = visibleTrades.length
    ? visibleTrades.reduce((s, t) => s + t.returnPercent, 0) / visibleTrades.length
    : 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Header + strategy info */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-white">
            <Target className="mr-1.5 inline text-teal-400" size={14} />
            {symbol} 백테스트 차트
            {strategyLabel && <span className="ml-2 text-xs font-normal text-slate-400">{strategyLabel}</span>}
          </h3>
          {dateInfo && (
            <p className="mt-1 text-[11px] text-slate-500">
              {dateInfo.firstDate} ~ {dateInfo.lastDate} · 거래 {dateInfo.tradeCount}건 · 승률 {(dateInfo.winCount / dateInfo.tradeCount * 100).toFixed(0)}%
            </p>
          )}
        </div>

        {/* Period stats */}
        <div className="flex gap-3 text-xs">
          <Stat label="표시 거래" value={`${visibleTrades.length}건`} />
          <Stat label="평균 수익률" value={`${avgReturn >= 0 ? "+" : ""}${avgReturn.toFixed(2)}%`} positive={avgReturn >= 0} />
          <Stat label="승률" value={`${winRate.toFixed(0)}%`} positive={winRate >= 50} />
        </div>
      </div>

      {/* Period selector */}
      <div className="flex flex-wrap items-center gap-2">
        <Calendar size={14} className="text-slate-500" />
        <span className="text-[11px] text-slate-500">기간:</span>
        {presetRanges.map(preset => (
          <button
            key={preset.label}
            onClick={() => setDateRange(preset.label === "전체" ? null : { start: preset.start, end: preset.end })}
            className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition ${
              (dateRange === null && preset.label === "전체") ||
              (dateRange?.start === preset.start && dateRange?.end === preset.end)
                ? "bg-teal-500/20 text-teal-300"
                : "bg-slate-800 text-slate-400 hover:text-white"
            }`}
          >
            {preset.label}
          </button>
        ))}
        {dateRange && (
          <span className="ml-2 text-[10px] text-slate-500">
            {dateRange.start} ~ {dateRange.end}
          </span>
        )}
      </div>

      {/* Chart with markers */}
      {dailyBars.isLoading ? (
        <div className="flex h-80 items-center justify-center text-sm text-slate-400">
          차트 데이터를 불러오는 중...
        </div>
      ) : bars.length < 10 ? (
        <div className="flex h-60 flex-col items-center justify-center gap-2 text-center">
          <p className="text-sm text-slate-300">{symbol}의 일봉 데이터가 부족합니다</p>
          <p className="text-xs text-slate-500">로컬 수집기로 데이터를 먼저 수집하세요</p>
        </div>
      ) : (
        <HtsChart
          bars={bars}
          symbol={symbol}
          defaultTimeframe="D"
          availableTimeframes={["D", "W", "M"]}
          markers={markers}
          height={420}
        />
      )}

      {/* Trade list */}
      {visibleTrades.length > 0 && (
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          <div className="border-b border-slate-800 bg-slate-950/50 px-4 py-2">
            <span className="text-xs font-medium text-slate-400">거래 내역 (최근 {Math.min(visibleTrades.length, 20)}건)</span>
          </div>
          <div className="max-h-60 overflow-y-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-slate-800/50 text-left text-slate-500">
                  <th className="px-4 py-1.5">진입일</th>
                  <th className="px-3 py-1.5">청산일</th>
                  <th className="px-3 py-1.5 text-right">진입가</th>
                  <th className="px-3 py-1.5 text-right">청산가</th>
                  <th className="px-3 py-1.5 text-right">수익률</th>
                  <th className="px-3 py-1.5 text-right">보유일</th>
                  <th className="px-3 py-1.5">청산 사유</th>
                </tr>
              </thead>
              <tbody>
                {visibleTrades.slice(-20).reverse().map((t, i) => {
                  const holdingDays = Math.round((new Date(t.exitDate).getTime() - new Date(t.entryDate).getTime()) / 86400000);
                  return (
                    <tr key={i} className="border-b border-slate-800/30 hover:bg-slate-800/20">
                      <td className="px-4 py-1.5 font-mono text-slate-300">{t.entryDate.slice(5)}</td>
                      <td className="px-3 py-1.5 font-mono text-slate-300">{t.exitDate.slice(5)}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-slate-300">{t.entryPrice.toLocaleString()}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-slate-300">{t.exitPrice.toLocaleString()}</td>
                      <td className={`px-3 py-1.5 text-right font-mono font-medium ${t.returnPercent >= 0 ? "text-red-400" : "text-blue-400"}`}>
                        {t.returnPercent >= 0 ? "+" : ""}{t.returnPercent.toFixed(2)}%
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono text-slate-500">{holdingDays}일</td>
                      <td className="px-3 py-1.5">
                        {t.exitReason && (
                          <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${
                            t.exitReason === "stop_loss" ? "bg-rose-500/10 text-rose-300"
                            : t.exitReason === "take_profit" ? "bg-emerald-500/10 text-emerald-300"
                            : "bg-slate-500/10 text-slate-400"
                          }`}>
                            {t.exitReason === "stop_loss" ? "손절" : t.exitReason === "take_profit" ? "익절" : "만기"}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/30 px-3 py-1.5">
      <span className="text-[10px] text-slate-500">{label}</span>
      <span className={`ml-2 font-mono text-xs font-medium ${
        positive === undefined ? "text-white" :
        positive ? "text-red-400" : "text-blue-400"
      }`}>{value}</span>
    </div>
  );
}

function dateToTimestamp(dateStr: string): number {
  // Convert YYYY-MM-DD to unix timestamp (KST midnight)
  return Math.floor(new Date(dateStr + "T00:00:00+09:00").getTime() / 1000);
}
