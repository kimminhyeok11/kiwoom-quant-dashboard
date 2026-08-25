/**
 * HTS급 차트 컴포넌트 (lightweight-charts v5)
 * 
 * - 캔들스틱 + 거래량
 * - 이동평균선 (5, 20, 60, 120일)
 * - MACD (12, 26, 9)
 * - 볼린저 밴드
 * - 1분봉 → 월봉 타임프레임 전환
 * - 매수/매도 타점 마커
 */

import { useEffect, useRef, useState, useCallback } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  ColorType,
  CrosshairMode,
  type CandlestickData,
  type SingleValueData,
  type Time,
} from "lightweight-charts";
import {
  aggregateBars,
  calculateMA,
  calculateMACD,
  calculateBollinger,
  type OhlcvBar,
  type Timeframe,
  type TradeMarker,
  TIMEFRAME_LABELS,
} from "@/lib/chartUtils";

type Indicator = "ma" | "macd" | "bollinger" | "volume";

type HtsChartProps = {
  bars: OhlcvBar[];
  symbol?: string;
  name?: string;
  defaultTimeframe?: Timeframe;
  markers?: TradeMarker[];
  height?: number;
  availableTimeframes?: Timeframe[];
};

const MA_COLORS: Record<number, string> = {
  5: "#FF6B6B",
  20: "#4ECDC4",
  60: "#45B7D1",
  120: "#FFA07A",
};

export function HtsChart({
  bars,
  symbol,
  name,
  defaultTimeframe = "D",
  markers = [],
  height = 500,
  availableTimeframes = ["1m", "5m", "15m", "30m", "60m", "D", "W", "M"],
}: HtsChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const macdContainerRef = useRef<HTMLDivElement>(null);
  const macdChartRef = useRef<IChartApi | null>(null);

  const [timeframe, setTimeframe] = useState<Timeframe>(defaultTimeframe);
  const [indicators, setIndicators] = useState(new Set<Indicator>(["ma", "volume"]));
  const [crosshairData, setCrosshairData] = useState<{
    open?: number;
    high?: number;
    low?: number;
    close?: number;
    change?: number;
  }>({});

  const toggleIndicator = useCallback((ind: Indicator) => {
    setIndicators(prev => {
      const next = new Set(prev);
      if (next.has(ind)) next.delete(ind);
      else next.add(ind);
      return next;
    });
  }, []);

  // Main chart
  useEffect(() => {
    if (!containerRef.current || !bars.length) return;

    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const container = containerRef.current;
    const chart = createChart(container, {
      width: container.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: "#0f1117" },
        textColor: "#9ca3af",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "#1e2433" },
        horzLines: { color: "#1e2433" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "#4b5563", width: 1, style: 3 },
        horzLine: { color: "#4b5563", width: 1, style: 3 },
      },
      rightPriceScale: {
        borderColor: "#1e2433",
        scaleMargins: { top: 0.05, bottom: indicators.has("volume") ? 0.2 : 0.05 },
      },
      timeScale: {
        borderColor: "#1e2433",
        timeVisible: timeframe.includes("m"),
        secondsVisible: false,
      },
    });
    chartRef.current = chart;

    const aggregated = aggregateBars(bars, timeframe);
    if (!aggregated.length) return;

    // Candlestick
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#ef5350",
      downColor: "#2196F3",
      borderUpColor: "#ef5350",
      borderDownColor: "#2196F3",
      wickUpColor: "#ef5350",
      wickDownColor: "#2196F3",
    });
    const candleData: CandlestickData<Time>[] = aggregated.map(bar => ({
      time: bar.time as Time,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
    }));
    candleSeries.setData(candleData);

    // Markers
    if (markers.length) {
      const validMarkers = markers
        .filter(m => m.time >= aggregated[0].time && m.time <= aggregated[aggregated.length - 1].time)
        .map(m => ({ ...m, time: m.time as Time }));
      if (validMarkers.length) {
        createSeriesMarkers(candleSeries, validMarkers);
      }
    }

    // Volume
    if (indicators.has("volume")) {
      const volumeSeries = chart.addSeries(HistogramSeries, {
        priceFormat: { type: "volume" },
        priceScaleId: "volume",
      });
      chart.priceScale("volume").applyOptions({
        scaleMargins: { top: 0.85, bottom: 0 },
      });
      volumeSeries.setData(aggregated.map(bar => ({
        time: bar.time as Time,
        value: bar.volume,
        color: bar.close >= bar.open ? "rgba(239,83,80,0.3)" : "rgba(33,150,243,0.3)",
      })));
    }

    // Moving Averages
    if (indicators.has("ma")) {
      const periods = [5, 20, 60, 120];
      for (const period of periods) {
        if (aggregated.length < period) continue;
        const maData = calculateMA(aggregated, period);
        const maSeries = chart.addSeries(LineSeries, {
          color: MA_COLORS[period],
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
        });
        maSeries.setData(maData.map(d => ({ time: d.time as Time, value: d.value })));
      }
    }

    // Bollinger Bands
    if (indicators.has("bollinger")) {
      const bb = calculateBollinger(aggregated);
      const upperSeries = chart.addSeries(LineSeries, { color: "#9C27B0", lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
      const middleSeries = chart.addSeries(LineSeries, { color: "#FF9800", lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
      const lowerSeries = chart.addSeries(LineSeries, { color: "#9C27B0", lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
      upperSeries.setData(bb.upper.map(d => ({ time: d.time as Time, value: d.value })));
      middleSeries.setData(bb.middle.map(d => ({ time: d.time as Time, value: d.value })));
      lowerSeries.setData(bb.lower.map(d => ({ time: d.time as Time, value: d.value })));
    }

    // Crosshair
    chart.subscribeCrosshairMove(param => {
      if (!param.time || !param.seriesData) {
        setCrosshairData({});
        return;
      }
      const candle = param.seriesData.get(candleSeries) as CandlestickData<Time> | undefined;
      if (candle && "open" in candle) {
        setCrosshairData({
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          change: ((candle.close - candle.open) / candle.open) * 100,
        });
      }
    });

    chart.timeScale().fitContent();

    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) chart.applyOptions({ width: entry.contentRect.width });
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [bars, timeframe, indicators, markers, height]);

  // MACD sub-chart
  useEffect(() => {
    if (!macdContainerRef.current || !indicators.has("macd") || !bars.length) return;

    if (macdChartRef.current) {
      macdChartRef.current.remove();
      macdChartRef.current = null;
    }

    const aggregated = aggregateBars(bars, timeframe);
    if (aggregated.length < 30) return;

    const container = macdContainerRef.current;
    const chart = createChart(container, {
      width: container.clientWidth,
      height: 120,
      layout: {
        background: { type: ColorType.Solid, color: "#0f1117" },
        textColor: "#9ca3af",
        fontSize: 10,
      },
      grid: {
        vertLines: { color: "#1e2433" },
        horzLines: { color: "#1e2433" },
      },
      rightPriceScale: { borderColor: "#1e2433" },
      timeScale: { borderColor: "#1e2433", timeVisible: timeframe.includes("m"), visible: true },
      crosshair: { mode: CrosshairMode.Normal },
    });
    macdChartRef.current = chart;

    const { macd, signal, histogram } = calculateMACD(aggregated);

    const histSeries = chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false });
    histSeries.setData(histogram.map(d => ({ time: d.time as Time, value: d.value, color: d.color })));

    const macdLine = chart.addSeries(LineSeries, { color: "#2196F3", lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    macdLine.setData(macd.map(d => ({ time: d.time as Time, value: d.value })));

    const signalLine = chart.addSeries(LineSeries, { color: "#FF9800", lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    signalLine.setData(signal.map(d => ({ time: d.time as Time, value: d.value })));

    chart.timeScale().fitContent();

    // Sync scroll with main chart
    if (chartRef.current) {
      chartRef.current.timeScale().subscribeVisibleLogicalRangeChange(range => {
        if (range) chart.timeScale().setVisibleLogicalRange(range);
      });
    }

    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) chart.applyOptions({ width: entry.contentRect.width });
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      macdChartRef.current = null;
    };
  }, [bars, timeframe, indicators]);

  const lastBar = bars.length ? aggregateBars(bars, timeframe).at(-1) : null;

  return (
    <div className="w-full rounded-xl border border-slate-800 bg-[#0f1117] overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-4 py-2">
        <div className="flex items-center gap-3">
          {symbol && (
            <span className="font-mono text-sm font-bold text-white">
              {name && <span className="mr-2 text-slate-300">{name}</span>}
              {symbol}
            </span>
          )}
          {crosshairData.open ? (
            <span className="flex gap-2 text-xs">
              <span className="text-slate-400">시 <span className="text-white">{crosshairData.open?.toLocaleString()}</span></span>
              <span className="text-slate-400">고 <span className="text-red-400">{crosshairData.high?.toLocaleString()}</span></span>
              <span className="text-slate-400">저 <span className="text-blue-400">{crosshairData.low?.toLocaleString()}</span></span>
              <span className="text-slate-400">종 <span className="text-white">{crosshairData.close?.toLocaleString()}</span></span>
              <span className={crosshairData.change !== undefined && crosshairData.change >= 0 ? "text-red-400" : "text-blue-400"}>
                {crosshairData.change !== undefined ? `${crosshairData.change >= 0 ? "+" : ""}${crosshairData.change.toFixed(2)}%` : ""}
              </span>
            </span>
          ) : lastBar ? (
            <span className="flex gap-2 text-xs">
              <span className="text-white">{lastBar.close.toLocaleString()}원</span>
              <span className={lastBar.close >= lastBar.open ? "text-red-400" : "text-blue-400"}>
                {((lastBar.close - lastBar.open) / lastBar.open * 100).toFixed(2)}%
              </span>
            </span>
          ) : null}
        </div>

        {/* Timeframe buttons */}
        <div className="flex gap-1">
          {availableTimeframes.map(tf => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`rounded px-2 py-0.5 text-xs font-medium transition ${
                timeframe === tf
                  ? "bg-teal-500/20 text-teal-300"
                  : "text-slate-500 hover:bg-slate-800 hover:text-slate-300"
              }`}
            >
              {TIMEFRAME_LABELS[tf]}
            </button>
          ))}
        </div>
      </div>

      {/* Indicator toggles */}
      <div className="flex gap-2 border-b border-slate-800 px-4 py-1.5">
        <IndicatorButton label="이평선" active={indicators.has("ma")} onClick={() => toggleIndicator("ma")} colors={Object.values(MA_COLORS)} />
        <IndicatorButton label="거래량" active={indicators.has("volume")} onClick={() => toggleIndicator("volume")} />
        <IndicatorButton label="MACD" active={indicators.has("macd")} onClick={() => toggleIndicator("macd")} />
        <IndicatorButton label="볼린저" active={indicators.has("bollinger")} onClick={() => toggleIndicator("bollinger")} />
      </div>

      {/* Main chart */}
      <div ref={containerRef} className="w-full" />

      {/* MACD sub-chart */}
      {indicators.has("macd") && (
        <div className="border-t border-slate-800">
          <div className="px-4 py-1 text-[10px] text-slate-500">MACD (12, 26, 9)</div>
          <div ref={macdContainerRef} className="w-full" />
        </div>
      )}

      {/* MA Legend */}
      {indicators.has("ma") && (
        <div className="flex gap-3 border-t border-slate-800 px-4 py-1.5">
          {[5, 20, 60, 120].map(p => (
            <span key={p} className="flex items-center gap-1 text-[10px]">
              <span className="inline-block h-0.5 w-3 rounded" style={{ backgroundColor: MA_COLORS[p] }} />
              <span className="text-slate-500">MA{p}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function IndicatorButton({
  label,
  active,
  onClick,
  colors,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  colors?: string[];
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium transition ${
        active ? "bg-slate-700/50 text-white" : "text-slate-500 hover:text-slate-300"
      }`}
    >
      {colors && (
        <span className="flex gap-px">
          {colors.slice(0, 3).map((c, i) => (
            <span key={i} className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: c }} />
          ))}
        </span>
      )}
      {label}
    </button>
  );
}
