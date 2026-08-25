/**
 * 차트 페이지 - HTS급 종목 차트
 * 
 * 종목 선택 → 일봉/분봉 차트 표시
 * 타임프레임 전환: 1분 ~ 월봉
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { HtsChart } from "./HtsChart";
import { BarChart3, Search, TrendingUp } from "lucide-react";
import type { OhlcvBar, Timeframe, TradeMarker } from "@/lib/chartUtils";

type ChartSource = "daily" | "minute";

export function ChartPage({ tradeMarkers }: { tradeMarkers?: TradeMarker[] }) {
  const [selectedSymbol, setSelectedSymbol] = useState<string>("");
  const [source, setSource] = useState<ChartSource>("daily");
  const [searchQuery, setSearchQuery] = useState("");
  const [minuteDays, setMinuteDays] = useState(5);

  const symbols = trpc.chartData.availableSymbols.useQuery(undefined, { staleTime: 60000 });

  const dailyBars = trpc.chartData.dailyBars.useQuery(
    { symbol: selectedSymbol, limit: 600 },
    { enabled: Boolean(selectedSymbol) && source === "daily", staleTime: 30000 }
  );

  const minuteBars = trpc.chartData.minuteBars.useQuery(
    { symbol: selectedSymbol, days: minuteDays },
    { enabled: Boolean(selectedSymbol) && source === "minute", staleTime: 30000 }
  );

  const bars: OhlcvBar[] = source === "daily"
    ? (dailyBars.data?.bars ?? [])
    : (minuteBars.data?.bars ?? []);

  const isLoading = source === "daily" ? dailyBars.isLoading : minuteBars.isLoading;

  const filteredSymbols = (symbols.data ?? []).filter(s =>
    !searchQuery || s.symbol.includes(searchQuery)
  );

  // Determine available timeframes based on source
  const availableTimeframes: Timeframe[] = source === "minute"
    ? ["1m", "5m", "15m", "30m", "60m", "D"]
    : ["D", "W", "M"];

  const defaultTimeframe: Timeframe = source === "minute" ? "5m" : "D";

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Symbol search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-2 text-slate-500" size={14} />
          <input
            type="text"
            placeholder="종목코드 검색"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="h-8 w-32 rounded-lg border border-slate-700 bg-slate-900 pl-8 pr-2 text-xs text-white placeholder-slate-500 focus:border-teal-500 focus:outline-none"
          />
        </div>

        {/* Symbol list */}
        <div className="flex flex-wrap gap-1">
          {filteredSymbols.slice(0, 15).map(s => (
            <button
              key={s.symbol}
              onClick={() => setSelectedSymbol(s.symbol)}
              className={`rounded-md px-2 py-1 text-xs font-mono transition ${
                selectedSymbol === s.symbol
                  ? "bg-teal-500/20 text-teal-300 border border-teal-500/40"
                  : "bg-slate-800 text-slate-400 hover:text-white border border-slate-700"
              }`}
            >
              {s.symbol}
              {s.hasMinute && <span className="ml-1 text-[9px] text-violet-400">M</span>}
            </button>
          ))}
          {filteredSymbols.length > 15 && (
            <span className="px-2 py-1 text-xs text-slate-500">+{filteredSymbols.length - 15}개</span>
          )}
        </div>

        {/* Source toggle */}
        <div className="ml-auto flex items-center gap-2">
          <div className="flex rounded-lg border border-slate-700 overflow-hidden">
            <button
              onClick={() => setSource("daily")}
              className={`px-3 py-1.5 text-xs font-medium ${source === "daily" ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white"}`}
            >
              일봉
            </button>
            <button
              onClick={() => setSource("minute")}
              className={`px-3 py-1.5 text-xs font-medium ${source === "minute" ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white"}`}
            >
              분봉
            </button>
          </div>

          {source === "minute" && (
            <select
              value={minuteDays}
              onChange={e => setMinuteDays(Number(e.target.value))}
              className="h-8 rounded-lg border border-slate-700 bg-slate-900 px-2 text-xs text-white"
            >
              <option value={1}>1일</option>
              <option value={3}>3일</option>
              <option value={5}>5일</option>
              <option value={10}>10일</option>
              <option value={20}>20일</option>
            </select>
          )}
        </div>
      </div>

      {/* Chart */}
      {!selectedSymbol ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <BarChart3 className="text-slate-600" size={48} />
          <p className="text-sm font-medium text-slate-300">종목을 선택하세요</p>
          <p className="max-w-md text-xs text-slate-500">
            수집된 종목의 일봉과 1분봉을 캔들스틱 차트로 볼 수 있습니다.
            타임프레임 전환(1분~월봉), 이동평균선, MACD, 볼린저밴드를 지원합니다.
          </p>
        </div>
      ) : isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <TrendingUp className="animate-pulse" size={18} />
            차트 데이터를 불러오는 중...
          </div>
        </div>
      ) : !bars.length ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
          <p className="text-sm text-slate-300">
            {selectedSymbol}의 {source === "daily" ? "일봉" : "분봉"} 데이터가 없습니다
          </p>
          <p className="text-xs text-slate-500">
            로컬 수집기로 데이터를 먼저 수집하세요.
          </p>
        </div>
      ) : (
        <HtsChart
          bars={bars}
          symbol={selectedSymbol}
          defaultTimeframe={defaultTimeframe}
          availableTimeframes={availableTimeframes}
          markers={tradeMarkers}
          height={Math.max(400, window.innerHeight - 250)}
        />
      )}
    </div>
  );
}
