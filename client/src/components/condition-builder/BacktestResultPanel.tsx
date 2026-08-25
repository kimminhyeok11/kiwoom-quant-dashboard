import { useState } from "react";

type BacktestSymbolResult = {
  symbol: string;
  totalReturn: number;
  winRate: number;
  tradeCount: number;
  maxDrawdown: number;
};

type BacktestResult = {
  symbols: string[];
  results: BacktestSymbolResult[];
  averageReturn: number;
  averageWinRate: number;
};

type BacktestResultPanelProps = {
  result: BacktestResult | null;
  isLoading: boolean;
  error: string | null;
  onRun: () => void;
  onRetry: () => void;
  holdingDays: number;
  feeRate: number;
  slippageBps: number;
  onParamsChange: (params: {
    holdingDays?: number;
    feeRate?: number;
    slippageBps?: number;
  }) => void;
};

export function BacktestResultPanel({
  result,
  isLoading,
  error,
  onRun,
  onRetry,
  holdingDays,
  feeRate,
  slippageBps,
  onParamsChange,
}: BacktestResultPanelProps) {
  return (
    <div className="flex flex-col gap-3 rounded-lg bg-zinc-900 p-3 text-sm">
      <h3 className="text-zinc-200 font-semibold">백테스트</h3>

      {/* Params form */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-zinc-400">보유기간 (일)</label>
          <input
            type="number"
            min={1}
            max={60}
            value={holdingDays}
            onChange={(e) =>
              onParamsChange({ holdingDays: Number(e.target.value) })
            }
            className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-zinc-200 focus:border-teal-500 focus:outline-none"
            disabled={isLoading}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-zinc-400">수수료율</label>
          <input
            type="number"
            min={0}
            max={0.01}
            step={0.0001}
            value={feeRate}
            onChange={(e) =>
              onParamsChange({ feeRate: Number(e.target.value) })
            }
            className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-zinc-200 focus:border-teal-500 focus:outline-none"
            disabled={isLoading}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-zinc-400">슬리피지 (bps)</label>
          <input
            type="number"
            min={0}
            max={100}
            step={1}
            value={slippageBps}
            onChange={(e) =>
              onParamsChange({ slippageBps: Number(e.target.value) })
            }
            className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-zinc-200 focus:border-teal-500 focus:outline-none"
            disabled={isLoading}
          />
        </div>
      </div>

      {/* Run button */}
      <button
        type="button"
        onClick={onRun}
        disabled={isLoading}
        className="flex items-center justify-center gap-2 rounded bg-teal-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isLoading ? (
          <>
            <svg
              className="h-4 w-4 animate-spin"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            실행 중...
          </>
        ) : (
          "백테스트 실행"
        )}
      </button>

      {/* Error state */}
      {error && (
        <div className="flex flex-col gap-2 rounded border border-red-500/40 bg-red-500/10 p-3">
          <p className="text-xs text-red-400">{error}</p>
          <button
            type="button"
            onClick={onRetry}
            className="self-start rounded bg-red-600/80 px-2 py-1 text-xs text-white hover:bg-red-600"
          >
            재시도
          </button>
        </div>
      )}

      {/* Result metrics */}
      {result && !error && (
        <div className="flex flex-col gap-3">
          {/* 4 metric cards */}
          <div className="grid grid-cols-2 gap-2">
            <MetricCard
              label="수익률"
              value={`${result.averageReturn >= 0 ? "+" : ""}${result.averageReturn}%`}
              color={result.averageReturn >= 0 ? "text-teal-400" : "text-red-400"}
            />
            <MetricCard
              label="승률"
              value={`${result.averageWinRate}%`}
              color={result.averageWinRate >= 50 ? "text-teal-400" : "text-amber-400"}
            />
            <MetricCard
              label="MDD"
              value={`${Math.min(...result.results.map((r) => r.maxDrawdown))}%`}
              color="text-red-400"
            />
            <MetricCard
              label="거래 수"
              value={`${result.results.reduce((s, r) => s + r.tradeCount, 0)}`}
              color="text-zinc-200"
            />
          </div>

          {/* Symbol breakdown */}
          <div className="flex flex-col gap-1">
            <span className="text-xs text-zinc-400">종목별 결과</span>
            <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
              {result.results.map((r) => (
                <div
                  key={r.symbol}
                  className="flex items-center justify-between rounded bg-zinc-800 px-2 py-1.5"
                >
                  <span className="text-xs text-zinc-300">{r.symbol}</span>
                  <span
                    className={`text-xs font-medium ${r.totalReturn >= 0 ? "text-teal-400" : "text-red-400"}`}
                  >
                    {r.totalReturn >= 0 ? "+" : ""}{r.totalReturn}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="flex flex-col items-center rounded bg-zinc-800 px-2 py-2">
      <span className="text-xs text-zinc-400">{label}</span>
      <span className={`text-sm font-bold ${color}`}>{value}</span>
    </div>
  );
}
