/**
 * 데이트레이딩 백테스트 UI
 *
 * - 타임프레임 선택 (1/3/5/10/15/30/60분)
 * - 보유 봉 수 설정
 * - 랜덤 조건식 생성 + 분봉 백테스트
 * - 결과 테이블 + 거래 내역
 * - "오늘 돌렸다면?" 시뮬레이션
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Dices, Clock, Zap, Trophy, Timer, Calendar, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { CommonPatternPanel } from "./CommonPatternPanel";

const INTERVALS = [
  { value: "1", label: "1분", desc: "극초단기" },
  { value: "3", label: "3분", desc: "초단기" },
  { value: "5", label: "5분", desc: "단기" },
  { value: "10", label: "10분", desc: "중단기" },
  { value: "15", label: "15분", desc: "중기" },
  { value: "30", label: "30분", desc: "중장기" },
  { value: "60", label: "60분", desc: "장기" },
] as const;

type IntradayResult = {
  rank: number;
  fingerprint: string;
  root: unknown;
  minimumScore: number;
  averageReturn: number;
  averageWinRate: number;
  totalTrades: number;
  worstDrawdown: number;
  avgHoldingMinutes: number;
  fitnessScore: number;
  symbolResults: Array<{
    symbol: string;
    totalReturn: number;
    winRate: number;
    tradeCount: number;
    maxDrawdown: number;
    avgHoldingMinutes: number;
    trades: Array<{ entryTime: string; exitTime: string; entryPrice: number; exitPrice: number; returnPercent: number; holdingMinutes: number }>;
    byDate: Record<string, { tradeCount: number; pnl: number; winRate: number }>;
  }>;
};

export function DayTradeBacktest() {
  const [interval, setInterval] = useState<string>("5");
  const [holdingBars, setHoldingBars] = useState(6);
  const [minScore, setMinScore] = useState(50);
  const [exitMode, setExitMode] = useState<"time" | "fixed" | "trailing">("time");
  const [stopLoss, setStopLoss] = useState(2);
  const [takeProfit, setTakeProfit] = useState(3);
  const [trailingStop, setTrailingStop] = useState(1.5);
  const [results, setResults] = useState<IntradayResult[] | null>(null);
  const [symbols, setSymbols] = useState<string[]>([]);
  const [tradingDates, setTradingDates] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  const availableDates = trpc.intradayBacktest.availableDates.useQuery(undefined, { staleTime: 60_000 });

  const runMutation = trpc.intradayBacktest.run.useMutation({
    onSuccess: (data) => {
      setResults(data.results);
      setSymbols(data.symbols);
      setTradingDates(data.tradingDates);
      toast.success(`${data.results.length}개 조건식 분봉 백테스트 완료! (${data.totalMinuteBars.toLocaleString()}봉)`);
    },
    onError: (err) => toast.error(err.message),
  });

  const handleRun = () => {
    setResults(null);
    setExpanded(null);
    const exitStrategy = exitMode === "time" ? undefined
      : exitMode === "fixed" ? { mode: "fixed" as const, stopLossPercent: stopLoss, takeProfitPercent: takeProfit }
      : { mode: "trailing" as const, trailingStopPercent: trailingStop };
    runMutation.mutate({
      count: 10,
      intervalMinutes: interval as "1" | "3" | "5" | "10" | "15" | "30" | "60",
      holdingBars,
      minScore,
      minRules: 3,
      maxRules: 6,
      forceDayClose: true,
      exitStrategy,
    } as any);
  };

  const holdingMinutes = holdingBars * parseInt(interval);
  const hasMinuteData = (availableDates.data?.length ?? 0) > 0;

  return (
    <div className="flex flex-col gap-5 p-4">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white">분봉 성과 검증</h1>
        <p className="mt-1 text-xs text-slate-400">
          1분봉 데이터를 원하는 단위로 변환하여, 장중 단기매매 전략의 수익성을 시뮬레이션합니다.
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-end gap-4 rounded-xl border border-slate-800 bg-slate-950/30 p-4">
        {/* Timeframe */}
        <div>
          <label className="mb-1.5 block text-[11px] font-medium text-slate-400">타임프레임</label>
          <div className="flex rounded-lg border border-slate-700 bg-slate-800/50 p-0.5">
            {INTERVALS.map(item => (
              <button
                key={item.value}
                onClick={() => setInterval(item.value)}
                className={`rounded-md px-2.5 py-1.5 text-[11px] font-medium transition ${
                  interval === item.value
                    ? "bg-teal-500/20 text-teal-300"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Holding bars */}
        <div>
          <label className="mb-1.5 block text-[11px] font-medium text-slate-400">
            보유 봉 수 <span className="text-slate-500">({holdingMinutes}분)</span>
          </label>
          <input
            type="number"
            min={1}
            max={120}
            value={holdingBars}
            onChange={e => setHoldingBars(Math.max(1, Math.min(120, parseInt(e.target.value) || 6)))}
            className="w-20 rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-1.5 text-xs text-white"
          />
        </div>

        {/* Min score */}
        <div>
          <label className="mb-1.5 block text-[11px] font-medium text-slate-400">최소 점수</label>
          <input
            type="number"
            min={20}
            max={95}
            value={minScore}
            onChange={e => setMinScore(Math.max(20, Math.min(95, parseInt(e.target.value) || 50)))}
            className="w-20 rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-1.5 text-xs text-white"
          />
        </div>

        {/* Run button */}
        <button
          onClick={handleRun}
          disabled={runMutation.isPending || !hasMinuteData}
          className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-violet-500/20 transition hover:shadow-violet-500/40 disabled:opacity-50"
        >
          {runMutation.isPending ? (
            <><Zap className="animate-pulse" size={16} /> 실행 중...</>
          ) : (
            <><Dices size={16} /> 분봉 백테스트</>
          )}
        </button>
      </div>

      {/* Exit Strategy Selector */}
      <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-4">
        <label className="mb-2 block text-[11px] font-medium text-slate-400">청산 전략</label>
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex rounded-lg border border-slate-700 bg-slate-800/50 p-0.5">
            {([["time", "시간 청산"], ["fixed", "손절/익절"], ["trailing", "트레일링"]] as const).map(([mode, label]) => (
              <button
                key={mode}
                onClick={() => setExitMode(mode)}
                className={`rounded-md px-3 py-1.5 text-[11px] font-medium transition ${
                  exitMode === mode ? "bg-violet-500/20 text-violet-300" : "text-slate-400 hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {exitMode === "fixed" && (
            <>
              <div>
                <label className="mb-1 block text-[10px] text-slate-500">손절 (%)</label>
                <input type="number" min={0.1} max={10} step={0.1} value={stopLoss}
                  onChange={e => setStopLoss(Math.max(0.1, parseFloat(e.target.value) || 2))}
                  className="w-16 rounded-lg border border-slate-700 bg-slate-800/50 px-2 py-1 text-xs text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] text-slate-500">익절 (%)</label>
                <input type="number" min={0.1} max={20} step={0.1} value={takeProfit}
                  onChange={e => setTakeProfit(Math.max(0.1, parseFloat(e.target.value) || 3))}
                  className="w-16 rounded-lg border border-slate-700 bg-slate-800/50 px-2 py-1 text-xs text-white"
                />
              </div>
            </>
          )}

          {exitMode === "trailing" && (
            <div>
              <label className="mb-1 block text-[10px] text-slate-500">트레일링 스탑 (%)</label>
              <input type="number" min={0.1} max={10} step={0.1} value={trailingStop}
                onChange={e => setTrailingStop(Math.max(0.1, parseFloat(e.target.value) || 1.5))}
                className="w-16 rounded-lg border border-slate-700 bg-slate-800/50 px-2 py-1 text-xs text-white"
              />
            </div>
          )}

          <p className="text-[10px] text-slate-500">
            {exitMode === "time" && "N봉 보유 후 무조건 청산. 중간 변동 무시."}
            {exitMode === "fixed" && `손절 -${stopLoss}% 또는 익절 +${takeProfit}% 도달 시 즉시 청산. 미도달 시 ${holdingBars}봉 후 청산.`}
            {exitMode === "trailing" && `고점 대비 -${trailingStop}% 하락 시 청산. 수익이 나면 따라가고, 빠지면 잘라줌.`}
          </p>
        </div>
      </div>

      {/* Info bar */}
      <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-500">
        <span className="flex items-center gap-1"><Timer size={11} /> {interval}분봉 · 보유 {holdingBars}봉 = {holdingMinutes}분</span>
        <span className="flex items-center gap-1"><Clock size={11} /> 당일 강제 청산 (장마감 15:20)</span>
        {availableDates.data && (
          <span className="flex items-center gap-1">
            <Calendar size={11} /> 분봉 데이터: {availableDates.data.length}일 ·
            {availableDates.data.reduce((s, d) => s + d.symbolCount, 0)}종목
          </span>
        )}
      </div>

      {/* No data warning */}
      {!hasMinuteData && !availableDates.isLoading && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-950/20 px-5 py-4 text-center">
          <p className="text-sm font-medium text-amber-300">분봉 데이터가 없습니다</p>
          <p className="mt-1 text-xs text-slate-400">
            장 시간(09:00~15:30)에 <code className="rounded bg-slate-800 px-1 text-teal-300">node collector.mjs --mode=minute</code>를 실행하세요.
            <br />또는 분봉 백필을 수집기에 요청하세요.
          </p>
        </div>
      )}

      {/* Loading skeleton */}
      {runMutation.isPending && (
        <div className="flex flex-col gap-3">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="rounded-xl border border-slate-800 bg-slate-950/30 p-4">
              <div className="flex items-center gap-3">
                <div className="h-7 w-7 animate-pulse rounded-full bg-slate-700/50" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-40 animate-pulse rounded bg-slate-700/50" />
                  <div className="h-3 w-64 animate-pulse rounded bg-slate-800/50" />
                </div>
              </div>
            </div>
          ))}
          <p className="text-center text-xs text-slate-500">
            {interval}분봉 × 10개 조건식 백테스트 중...
          </p>
        </div>
      )}

      {/* Results */}
      {results && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Trophy className="text-amber-400" size={18} />
            <span className="text-sm font-medium text-white">
              {results.length}개 결과 ({interval}분봉 · {tradingDates.length}일)
            </span>
            <span className="text-xs text-slate-500">종목: {symbols.join(", ")}</span>
          </div>

          {results.map(item => (
            <IntradayResultCard
              key={item.fingerprint}
              item={item}
              interval={parseInt(interval)}
              isExpanded={expanded === item.fingerprint}
              onToggle={() => setExpanded(expanded === item.fingerprint ? null : item.fingerprint)}
            />
          ))}

          {results.length >= 3 && <CommonPatternPanel results={results as any} />}
        </div>
      )}
    </div>
  );
}

function IntradayResultCard({ item, interval, isExpanded, onToggle }: {
  item: IntradayResult;
  interval: number;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const isPositive = item.averageReturn >= 0;
  const borderColor = item.rank <= 3 ? "border-violet-500/30" : "border-slate-800";

  return (
    <article className={`rounded-xl border ${borderColor} bg-slate-950/30 overflow-hidden`}>
      <button onClick={onToggle} className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-slate-800/20">
        <div className="flex items-center gap-3">
          <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
            item.rank <= 3 ? "bg-violet-500/20 text-violet-300" : "bg-slate-700 text-slate-400"
          }`}>{item.rank}</span>
          <div>
            <div className="flex gap-4 text-sm">
              <span className={isPositive ? "font-bold text-red-400" : "font-bold text-blue-400"}>
                {isPositive ? "+" : ""}{item.averageReturn}%
              </span>
              <span className="text-slate-300">승률 {item.averageWinRate}%</span>
              <span className="text-slate-400">{item.totalTrades}거래</span>
              <span className="text-slate-500">평균 {item.avgHoldingMinutes}분 보유</span>
            </div>
            <p className="mt-0.5 text-[10px] text-slate-500">
              MDD {item.worstDrawdown}% · 적합도 {item.fitnessScore}
            </p>
          </div>
        </div>
        {isExpanded ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />}
      </button>

      {isExpanded && (
        <div className="border-t border-slate-800 px-4 py-4">
          {/* Symbol results */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {item.symbolResults.map(sr => (
              <div key={sr.symbol} className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-white">{sr.symbol}</span>
                  <span className={`text-xs font-bold ${sr.totalReturn >= 0 ? "text-red-400" : "text-blue-400"}`}>
                    {sr.totalReturn >= 0 ? "+" : ""}{sr.totalReturn}%
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-1 text-[10px]">
                  <div><span className="text-slate-500">승률</span> <span className="text-white">{sr.winRate}%</span></div>
                  <div><span className="text-slate-500">거래</span> <span className="text-white">{sr.tradeCount}건</span></div>
                  <div><span className="text-slate-500">평균</span> <span className="text-white">{sr.avgHoldingMinutes}분</span></div>
                </div>

                {/* Trades */}
                {sr.trades.length > 0 && (
                  <div className="mt-2 max-h-32 overflow-y-auto border-t border-slate-800 pt-2">
                    {sr.trades.slice(-8).map((t, i) => (
                      <div key={i} className="flex items-center justify-between text-[9px] text-slate-500">
                        <span>{formatTime(t.entryTime)} → {formatTime(t.exitTime)}</span>
                        <span className={t.returnPercent >= 0 ? "text-red-400" : "text-blue-400"}>
                          {t.returnPercent >= 0 ? "+" : ""}{t.returnPercent.toFixed(2)}% ({t.holdingMinutes}분)
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* By-date summary */}
                {Object.keys(sr.byDate).length > 1 && (
                  <div className="mt-2 border-t border-slate-800 pt-2">
                    <p className="text-[9px] text-slate-500">날짜별:</p>
                    {Object.entries(sr.byDate).slice(0, 5).map(([date, stat]) => (
                      <div key={date} className="flex justify-between text-[9px]">
                        <span className="text-slate-500">{date.slice(5)}</span>
                        <span className={stat.pnl >= 0 ? "text-red-400" : "text-blue-400"}>
                          {stat.tradeCount}회 {stat.pnl >= 0 ? "+" : ""}{stat.pnl.toFixed(2)}%
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Condition rules */}
          <details className="mt-4">
            <summary className="cursor-pointer text-xs text-slate-400 hover:text-white">조건식 상세</summary>
            <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-slate-950 p-3 text-[10px] text-slate-300">
              {JSON.stringify(item.root, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </article>
  );
}

function formatTime(isoStr: string): string {
  if (!isoStr) return "";
  const d = new Date(isoStr);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
