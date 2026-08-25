/**
 * 차트 유틸리티: 1분봉 → 다양한 타임프레임 변환 + 기술 지표 계산
 */

export type OhlcvBar = {
  time: number; // Unix timestamp (seconds)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type Timeframe = "1m" | "5m" | "15m" | "30m" | "60m" | "D" | "W" | "M";

export const TIMEFRAME_LABELS: Record<Timeframe, string> = {
  "1m": "1분",
  "5m": "5분",
  "15m": "15분",
  "30m": "30분",
  "60m": "60분",
  "D": "일",
  "W": "주",
  "M": "월",
};

/**
 * 1분봉 배열을 원하는 타임프레임으로 변환
 */
export function aggregateBars(bars: OhlcvBar[], timeframe: Timeframe): OhlcvBar[] {
  if (timeframe === "1m") return bars;
  if (!bars.length) return [];

  const getGroupKey = (timestamp: number): number => {
    const date = new Date(timestamp * 1000);

    switch (timeframe) {
      case "5m":
        return Math.floor(timestamp / 300) * 300;
      case "15m":
        return Math.floor(timestamp / 900) * 900;
      case "30m":
        return Math.floor(timestamp / 1800) * 1800;
      case "60m":
        return Math.floor(timestamp / 3600) * 3600;
      case "D":
        // KST day boundary
        const kstOffset = 9 * 3600;
        return Math.floor((timestamp + kstOffset) / 86400) * 86400 - kstOffset;
      case "W": {
        const kst = new Date((timestamp + 9 * 3600) * 1000);
        const dayOfWeek = kst.getUTCDay();
        const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        return Math.floor((timestamp + 9 * 3600) / 86400 - mondayOffset) * 86400 - 9 * 3600;
      }
      case "M": {
        const kst = new Date((timestamp + 9 * 3600) * 1000);
        return new Date(kst.getUTCFullYear(), kst.getUTCMonth(), 1).getTime() / 1000 - 9 * 3600;
      }
      default:
        return timestamp;
    }
  };

  const grouped = new Map<number, OhlcvBar>();
  for (const bar of bars) {
    const key = getGroupKey(bar.time);
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, { ...bar, time: key });
    } else {
      existing.high = Math.max(existing.high, bar.high);
      existing.low = Math.min(existing.low, bar.low);
      existing.close = bar.close;
      existing.volume += bar.volume;
    }
  }

  return Array.from(grouped.values()).sort((a, b) => a.time - b.time);
}

/**
 * 이동평균선 계산
 */
export function calculateMA(bars: OhlcvBar[], period: number): Array<{ time: number; value: number }> {
  const result: Array<{ time: number; value: number }> = [];
  for (let i = period - 1; i < bars.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += bars[j].close;
    result.push({ time: bars[i].time, value: sum / period });
  }
  return result;
}

/**
 * MACD 계산 (12, 26, 9)
 */
export function calculateMACD(
  bars: OhlcvBar[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9
): {
  macd: Array<{ time: number; value: number }>;
  signal: Array<{ time: number; value: number }>;
  histogram: Array<{ time: number; value: number; color: string }>;
} {
  const closes = bars.map(b => b.close);
  const fastEMA = ema(closes, fastPeriod);
  const slowEMA = ema(closes, slowPeriod);

  // MACD line = fastEMA - slowEMA
  const macdValues: number[] = [];
  const startIdx = slowPeriod - 1;
  for (let i = startIdx; i < closes.length; i++) {
    macdValues.push(fastEMA[i] - slowEMA[i]);
  }

  // Signal line = EMA of MACD
  const signalValues = ema(macdValues, signalPeriod);

  const macd: Array<{ time: number; value: number }> = [];
  const signal: Array<{ time: number; value: number }> = [];
  const histogram: Array<{ time: number; value: number; color: string }> = [];

  for (let i = 0; i < macdValues.length; i++) {
    const barIdx = startIdx + i;
    if (barIdx >= bars.length) break;
    const time = bars[barIdx].time;
    macd.push({ time, value: macdValues[i] });

    if (i >= signalPeriod - 1) {
      const sigVal = signalValues[i];
      signal.push({ time, value: sigVal });
      const histVal = macdValues[i] - sigVal;
      histogram.push({
        time,
        value: histVal,
        color: histVal >= 0 ? "#26a69a" : "#ef5350",
      });
    }
  }

  return { macd, signal, histogram };
}

/**
 * 볼린저 밴드 계산
 */
export function calculateBollinger(
  bars: OhlcvBar[],
  period = 20,
  deviation = 2
): {
  upper: Array<{ time: number; value: number }>;
  middle: Array<{ time: number; value: number }>;
  lower: Array<{ time: number; value: number }>;
} {
  const upper: Array<{ time: number; value: number }> = [];
  const middle: Array<{ time: number; value: number }> = [];
  const lower: Array<{ time: number; value: number }> = [];

  for (let i = period - 1; i < bars.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += bars[j].close;
    const avg = sum / period;

    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) variance += (bars[j].close - avg) ** 2;
    const std = Math.sqrt(variance / period);

    const time = bars[i].time;
    upper.push({ time, value: avg + deviation * std });
    middle.push({ time, value: avg });
    lower.push({ time, value: avg - deviation * std });
  }

  return { upper, middle, lower };
}

/**
 * RSI 계산
 */
export function calculateRSI(bars: OhlcvBar[], period = 14): Array<{ time: number; value: number }> {
  const result: Array<{ time: number; value: number }> = [];
  if (bars.length <= period) return result;

  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 1; i <= period; i++) {
    const change = bars[i].close - bars[i - 1].close;
    if (change > 0) avgGain += change;
    else avgLoss += Math.abs(change);
  }
  avgGain /= period;
  avgLoss /= period;

  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  result.push({ time: bars[period].time, value: 100 - 100 / (1 + rs) });

  for (let i = period + 1; i < bars.length; i++) {
    const change = bars[i].close - bars[i - 1].close;
    if (change > 0) {
      avgGain = (avgGain * (period - 1) + change) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.abs(change)) / period;
    }
    const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    result.push({ time: bars[i].time, value: rsi });
  }
  return result;
}

// ===== Helpers =====
function ema(data: number[], period: number): number[] {
  const result: number[] = new Array(data.length).fill(0);
  const multiplier = 2 / (period + 1);

  // First value is SMA
  let sum = 0;
  for (let i = 0; i < Math.min(period, data.length); i++) sum += data[i];
  result[period - 1] = sum / period;

  for (let i = period; i < data.length; i++) {
    result[i] = (data[i] - result[i - 1]) * multiplier + result[i - 1];
  }
  return result;
}

/**
 * 매수/매도 타점 마커 생성
 */
export type TradeMarker = {
  time: number;
  position: "belowBar" | "aboveBar";
  color: string;
  shape: "arrowUp" | "arrowDown";
  text: string;
};

export function createTradeMarkers(
  trades: Array<{ entryTime: number; exitTime?: number; entryPrice: number; exitPrice?: number; returnPercent?: number }>
): TradeMarker[] {
  const markers: TradeMarker[] = [];
  for (const trade of trades) {
    markers.push({
      time: trade.entryTime,
      position: "belowBar",
      color: "#2196F3",
      shape: "arrowUp",
      text: `매수 ${trade.entryPrice.toLocaleString()}`,
    });
    if (trade.exitTime && trade.exitPrice) {
      const pnl = trade.returnPercent ?? ((trade.exitPrice - trade.entryPrice) / trade.entryPrice * 100);
      markers.push({
        time: trade.exitTime,
        position: "aboveBar",
        color: pnl >= 0 ? "#4CAF50" : "#F44336",
        shape: "arrowDown",
        text: `매도 ${pnl >= 0 ? "+" : ""}${pnl.toFixed(1)}%`,
      });
    }
  }
  return markers.sort((a, b) => a.time - b.time);
}
