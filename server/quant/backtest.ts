import type { ConditionExpressionGroup, ConditionRule } from "../../shared/trading";
import { evaluateExpression, evaluateStrategy, type ConditionEvaluationContext, type DailyBar } from "./conditions";

export type ExitReason = "stop_loss" | "take_profit" | "time_exit";

export type BacktestTrade = {
  entryDate: string;
  exitDate: string;
  entryPrice: number;
  exitPrice: number;
  returnPercent: number;
  /** 청산 사유 */
  exitReason: ExitReason;
  /** 실제 보유 일수 */
  holdingDays: number;
};

export type BacktestResult = {
  totalReturn: number;
  winRate: number;
  tradeCount: number;
  maxDrawdown: number;
  trades: BacktestTrade[];
  /** 시가 갭 방어로 스킵된 진입 횟수 */
  gapSkipCount?: number;
  /** 손절 청산 횟수 */
  stopLossCount: number;
  /** 익절 청산 횟수 */
  takeProfitCount: number;
  /** 만기(보유기간) 청산 횟수 */
  timeExitCount: number;
  /** 평균 보유 일수 */
  avgHoldingDays: number;
};

function tradingDate(value: string) {
  return value.slice(0, 10);
}

function aggregateCompletedBars(bars: DailyBar[], barsPerInterval: number) {
  const aggregated: Array<{ bar: DailyBar; completedAtIndex: number }> = [];
  let currentDate = "";
  let bucket: DailyBar[] = [];
  bars.forEach((bar, index) => {
    const date = tradingDate(bar.date);
    if (date !== currentDate) { currentDate = date; bucket = []; }
    bucket.push(bar);
    if (bucket.length === barsPerInterval) {
      aggregated.push({ bar: { date: bar.date, open: bucket[0]!.open, high: Math.max(...bucket.map(item => item.high)), low: Math.min(...bucket.map(item => item.low)), close: bar.close, volume: bucket.reduce((sum, item) => sum + item.volume, 0), turnover: bucket.reduce((sum, item) => sum + item.turnover, 0) }, completedAtIndex: index });
      bucket = [];
    }
  });
  return aggregated;
}

/**
 * 5분봉 시점마다 이미 끝난 상위 시간축만 노출한다. 당일 일봉의 종가·고가는
 * 평가 시점에 확정되지 않으므로 daily에는 전 거래일까지의 원본만 포함한다.
 */
export function createFiveMinuteContextProvider(activeBars: DailyBar[], dailyBars: DailyBar[]) {
  const tenMinute = aggregateCompletedBars(activeBars, 2);
  const sixtyMinute = aggregateCompletedBars(activeBars, 12);
  const completedCountAt = (items: Array<{ completedAtIndex: number }>, index: number) => {
    let low = 0; let high = items.length;
    while (low < high) { const middle = Math.floor((low + high) / 2); if (items[middle]!.completedAtIndex <= index) low = middle + 1; else high = middle; }
    return low;
  };
  return (index: number, history: DailyBar[]): ConditionEvaluationContext => {
    const date = tradingDate(activeBars[index]!.date);
    return {
      activeBars: history,
      timeframeBars: {
        active: history,
        five_minute: history,
        ten_minute: tenMinute.slice(0, completedCountAt(tenMinute, index)).map(item => item.bar),
        sixty_minute: sixtyMinute.slice(0, completedCountAt(sixtyMinute, index)).map(item => item.bar),
        daily: dailyBars.filter(bar => tradingDate(bar.date) < date),
      },
    };
  };
}

export function runDailyBacktest(input: {
  bars: DailyBar[];
  rules?: ConditionRule[];
  expression?: ConditionExpressionGroup;
  minScore: number;
  holdingDays: number;
  feeRate?: number;
  entryDelayDays?: number;
  entryTiming?: "open" | "close";
  /** 시가 갭 방어: 시가가 전일 종가 대비 ±N% 초과하면 진입 취소 (0이면 비활성) */
  maxOpenGapPercent?: number;
  /** 손절 비율 (ex: 3 = 진입가 대비 -3%에서 손절). 0이면 비활성 */
  stopLossPercent?: number;
  /** 익절 비율 (ex: 5 = 진입가 대비 +5%에서 익절). 0이면 비활성 */
  takeProfitPercent?: number;
  evaluationStartIndex?: number;
  conditionContextAtIndex?: (index: number, activeHistory: DailyBar[]) => ConditionEvaluationContext;
}): BacktestResult {
  const feeRate = input.feeRate ?? 0;
  const entryDelayDays = input.entryDelayDays ?? 0;
  const entryTiming = input.entryTiming ?? "close";
  const maxOpenGapPercent = input.maxOpenGapPercent ?? 0;
  const stopLossPercent = input.stopLossPercent ?? 0;
  const takeProfitPercent = input.takeProfitPercent ?? 0;
  const evaluationStartIndex = input.evaluationStartIndex ?? 0;
  const trades: BacktestTrade[] = [];
  let position: { entryIndex: number; entryPrice: number; entryDate: string } | null = null;
  let pendingEntryIndex: number | null = null;
  let pendingSignalIndex: number | null = null;
  let equity = 1;
  let highWaterMark = 1;
  let maxDrawdown = 0;
  let gapSkipCount = 0;

  for (let index = 0; index < input.bars.length; index += 1) {
    const bar = input.bars[index];
    if (index < evaluationStartIndex) continue;

    // ─── 포지션 보유 중: 손절/익절/만기 체크 ───
    if (position) {
      let exitTriggered = false;
      let exitPrice = bar.close;
      let exitReason: ExitReason = "time_exit";

      // 장중 손절 체크: 당일 저가가 손절가 이하
      const stopPrice = stopLossPercent > 0 ? position.entryPrice * (1 - stopLossPercent / 100) : 0;
      const targetPrice = takeProfitPercent > 0 ? position.entryPrice * (1 + takeProfitPercent / 100) : Infinity;

      const hitStop = stopLossPercent > 0 && bar.low <= stopPrice;
      const hitTarget = takeProfitPercent > 0 && bar.high >= targetPrice;

      if (hitStop || hitTarget) {
        // 같은 봉에서 둘 다 도달하면 손절 우선 (보수적)
        exitTriggered = true;
        if (hitStop) {
          exitPrice = stopPrice;
          exitReason = "stop_loss";
        } else {
          exitPrice = targetPrice;
          exitReason = "take_profit";
        }
      } else if (index - position.entryIndex >= input.holdingDays) {
        // 보유 기간 만료
        exitTriggered = true;
        exitPrice = bar.close;
        exitReason = "time_exit";
      }

      if (exitTriggered) {
        const grossReturn = (exitPrice - position.entryPrice) / position.entryPrice;
        const netReturn = grossReturn - feeRate * 2;
        equity *= 1 + netReturn;
        highWaterMark = Math.max(highWaterMark, equity);
        maxDrawdown = Math.min(maxDrawdown, (equity - highWaterMark) / highWaterMark);
        trades.push({
          entryDate: position.entryDate,
          exitDate: bar.date,
          entryPrice: position.entryPrice,
          exitPrice,
          returnPercent: netReturn * 100,
          exitReason,
          holdingDays: index - position.entryIndex,
        });
        position = null;
      }
    }

    // ─── 대기 중인 진입 처리 ───
    if (!position && pendingEntryIndex !== null && index >= pendingEntryIndex) {
      let gapBlocked = false;
      if (maxOpenGapPercent > 0 && entryTiming === "open" && pendingSignalIndex !== null) {
        const prevClose = input.bars[pendingSignalIndex].close;
        const gapPercent = Math.abs((bar.open - prevClose) / prevClose) * 100;
        if (gapPercent > maxOpenGapPercent) {
          gapBlocked = true;
          gapSkipCount += 1;
        }
      }
      if (gapBlocked) {
        pendingEntryIndex = null;
        pendingSignalIndex = null;
      } else {
        position = { entryIndex: index, entryPrice: entryTiming === "open" ? bar.open : bar.close, entryDate: bar.date };
        pendingEntryIndex = null;
        pendingSignalIndex = null;
      }
    }

    // ─── 새 신호 탐색 ───
    if (!position && pendingEntryIndex === null) {
      const history = input.bars.slice(0, index + 1);
      const conditionInput = input.conditionContextAtIndex?.(index, history) ?? history;
      const signal = input.expression ? evaluateExpression(input.expression, conditionInput) : evaluateStrategy(input.rules ?? [], conditionInput);
      if (signal.score >= input.minScore) {
        if (entryDelayDays === 0) position = { entryIndex: index, entryPrice: bar.close, entryDate: bar.date };
        else {
          pendingEntryIndex = index + entryDelayDays;
          pendingSignalIndex = index;
        }
      }
    }
  }

  const wins = trades.filter(trade => trade.returnPercent > 0).length;
  const stopLossCount = trades.filter(t => t.exitReason === "stop_loss").length;
  const takeProfitCount = trades.filter(t => t.exitReason === "take_profit").length;
  const timeExitCount = trades.filter(t => t.exitReason === "time_exit").length;
  const avgHoldingDays = trades.length ? trades.reduce((s, t) => s + t.holdingDays, 0) / trades.length : 0;

  return {
    totalReturn: (equity - 1) * 100,
    winRate: trades.length ? (wins / trades.length) * 100 : 0,
    tradeCount: trades.length,
    maxDrawdown: maxDrawdown * 100,
    trades,
    gapSkipCount,
    stopLossCount,
    takeProfitCount,
    timeExitCount,
    avgHoldingDays,
  };
}

/**
 * 분봉 백테스트 엔진 (데이트레이딩/스윙)
 *
 * 1분봉 원본 → N분봉 변환 → 조건식 평가 → 매매 시뮬레이션
 * holdingBars: 보유할 봉 수 (예: 5분봉 기준 6봉 = 30분 보유)
 * allowOvernight: false면 당일 장마감 전 강제 청산
 */
export type IntradayBacktestInput = {
  /** 1분봉 원본 데이터 (여러 날 가능) */
  minuteBars: DailyBar[];
  /** N분봉 변환 (1=원본, 3, 5, 10, 15, 30, 60) */
  intervalMinutes: number;
  /** 조건식 */
  expression?: ConditionExpressionGroup;
  rules?: ConditionRule[];
  /** 최소 점수 */
  minScore: number;
  /** 보유 봉 수 */
  holdingBars: number;
  /** 수수료율 (편도) */
  feeRate?: number;
  /** 진입 타이밍 */
  entryTiming?: "open" | "close";
  /** 당일 청산 강제 여부 */
  allowOvernight?: boolean;
  /** 장 마감 시각 (기본 15:20 = 380분 이후 강제 청산) */
  marketCloseMinute?: number;
  /** 일봉 데이터 (상위 시간축 컨텍스트용) */
  dailyBars?: DailyBar[];
  /** 청산 전략 */
  exitStrategy?: {
    mode: "time" | "fixed" | "trailing";
    /** 고정 손절 % (예: 2 = -2% 시 청산) */
    stopLossPercent?: number;
    /** 고정 익절 % (예: 3 = +3% 시 청산) */
    takeProfitPercent?: number;
    /** 트레일링 스탑 % (고점 대비 하락 시 청산) */
    trailingStopPercent?: number;
  };
};

export type IntradayBacktestResult = {
  totalReturn: number;
  winRate: number;
  tradeCount: number;
  maxDrawdown: number;
  avgHoldingMinutes: number;
  trades: IntradayTrade[];
  byDate: Record<string, { tradeCount: number; pnl: number; winRate: number }>;
};

export type IntradayTrade = {
  entryTime: string;
  exitTime: string;
  entryPrice: number;
  exitPrice: number;
  returnPercent: number;
  holdingMinutes: number;
  tradingDate: string;
};

export function runIntradayBacktest(input: IntradayBacktestInput): IntradayBacktestResult {
  const feeRate = input.feeRate ?? 0.0003;
  const entryTiming = input.entryTiming ?? "close";
  const allowOvernight = input.allowOvernight ?? false;
  const marketCloseMinute = input.marketCloseMinute ?? 380; // 15:20 from 09:00
  const exitStrategy = input.exitStrategy ?? { mode: "time" as const };

  // 1분봉 → N분봉 변환
  const converted = aggregateMinuteBars(input.minuteBars, input.intervalMinutes);
  if (converted.length < 20) {
    return { totalReturn: 0, winRate: 0, tradeCount: 0, maxDrawdown: 0, avgHoldingMinutes: 0, trades: [], byDate: {} };
  }

  // 일봉 context (상위 시간축)
  const dailyBars = input.dailyBars ?? [];

  const trades: IntradayTrade[] = [];
  let position: { entryIndex: number; entryPrice: number; entryTime: string; tradingDate: string; highPrice?: number } | null = null;
  let equity = 1;
  let highWaterMark = 1;
  let maxDrawdown = 0;

  for (let i = 0; i < converted.length; i++) {
    const bar = converted[i];
    const barDate = bar.date.slice(0, 10);
    const barMinuteOfDay = getMinuteOfDay(bar.date);

    // 강제 청산: 보유 기간 초과
    if (position && i - position.entryIndex >= input.holdingBars) {
      closeTrade(i, bar.close);
      continue;
    }

    // 청산 전략: 손절/익절/트레일링 (봉 내 가격으로 체크)
    if (position && exitStrategy.mode !== "time") {
      const currentReturn = (bar.close - position.entryPrice) / position.entryPrice * 100;
      const highReturn = (bar.high - position.entryPrice) / position.entryPrice * 100;
      const lowReturn = (bar.low - position.entryPrice) / position.entryPrice * 100;

      if (exitStrategy.mode === "fixed") {
        // 손절: 저가가 손절선 이하
        if (exitStrategy.stopLossPercent && lowReturn <= -exitStrategy.stopLossPercent) {
          const slPrice = Math.round(position.entryPrice * (1 - exitStrategy.stopLossPercent / 100));
          closeTrade(i, slPrice);
          continue;
        }
        // 익절: 고가가 익절선 이상
        if (exitStrategy.takeProfitPercent && highReturn >= exitStrategy.takeProfitPercent) {
          const tpPrice = Math.round(position.entryPrice * (1 + exitStrategy.takeProfitPercent / 100));
          closeTrade(i, tpPrice);
          continue;
        }
      }

      if (exitStrategy.mode === "trailing") {
        // 트레일링 스탑: 고점 대비 N% 하락 시 청산
        position.highPrice = Math.max(position.highPrice ?? position.entryPrice, bar.high);
        const drawdownFromHigh = (bar.low - position.highPrice) / position.highPrice * 100;
        if (exitStrategy.trailingStopPercent && drawdownFromHigh <= -exitStrategy.trailingStopPercent) {
          const tsPrice = Math.round(position.highPrice * (1 - exitStrategy.trailingStopPercent / 100));
          closeTrade(i, tsPrice);
          continue;
        }
      }
    }

    // 강제 청산: 장 마감 (당일 청산 모드)
    if (position && !allowOvernight && barMinuteOfDay >= marketCloseMinute) {
      closeTrade(i, bar.close);
      continue;
    }

    // 강제 청산: 날짜 변경 (당일 청산 모드)
    if (position && !allowOvernight && barDate !== position.tradingDate) {
      closeTrade(i, bar.open); // 다음날 시가로 청산
      continue;
    }

    // 신호 평가 (포지션 없을 때만)
    if (!position) {
      // 장 마감 직전이면 진입 안 함
      if (!allowOvernight && barMinuteOfDay >= marketCloseMinute - input.holdingBars * input.intervalMinutes) {
        continue;
      }

      const history = converted.slice(0, i + 1);
      const conditionContext = buildIntradayContext(history, dailyBars, barDate, converted, i, input.intervalMinutes);
      const signal = input.expression
        ? evaluateExpression(input.expression, conditionContext)
        : evaluateStrategy(input.rules ?? [], conditionContext);

      if (signal.score >= input.minScore) {
        const entryPrice = entryTiming === "open" && i + 1 < converted.length
          ? converted[i + 1].open
          : bar.close;
        position = {
          entryIndex: entryTiming === "open" ? i + 1 : i,
          entryPrice,
          entryTime: entryTiming === "open" && i + 1 < converted.length ? converted[i + 1].date : bar.date,
          tradingDate: barDate,
        };
      }
    }
  }

  // 미청산 포지션 처리
  if (position) {
    const lastBar = converted[converted.length - 1];
    closeTrade(converted.length - 1, lastBar.close);
  }

  function closeTrade(exitIndex: number, exitPrice: number) {
    if (!position) return;
    const grossReturn = (exitPrice - position.entryPrice) / position.entryPrice;
    const netReturn = grossReturn - feeRate * 2;
    equity *= 1 + netReturn;
    highWaterMark = Math.max(highWaterMark, equity);
    maxDrawdown = Math.min(maxDrawdown, (equity - highWaterMark) / highWaterMark);

    const exitTime = converted[exitIndex].date;
    const holdingMinutes = (exitIndex - position.entryIndex) * input.intervalMinutes;

    trades.push({
      entryTime: position.entryTime,
      exitTime,
      entryPrice: position.entryPrice,
      exitPrice,
      returnPercent: netReturn * 100,
      holdingMinutes,
      tradingDate: position.tradingDate,
    });
    position = null;
  }

  // 날짜별 통계
  const byDate: Record<string, { tradeCount: number; pnl: number; winRate: number }> = {};
  for (const trade of trades) {
    const existing = byDate[trade.tradingDate] || { tradeCount: 0, pnl: 0, winRate: 0 };
    existing.tradeCount++;
    existing.pnl += trade.returnPercent;
    byDate[trade.tradingDate] = existing;
  }
  for (const [date, stat] of Object.entries(byDate)) {
    const dayTrades = trades.filter(t => t.tradingDate === date);
    stat.winRate = dayTrades.length ? (dayTrades.filter(t => t.returnPercent > 0).length / dayTrades.length) * 100 : 0;
  }

  const wins = trades.filter(t => t.returnPercent > 0).length;
  const avgHolding = trades.length ? trades.reduce((s, t) => s + t.holdingMinutes, 0) / trades.length : 0;

  return {
    totalReturn: (equity - 1) * 100,
    winRate: trades.length ? (wins / trades.length) * 100 : 0,
    tradeCount: trades.length,
    maxDrawdown: maxDrawdown * 100,
    avgHoldingMinutes: avgHolding,
    trades,
    byDate,
  };
}

/** 1분봉 → N분봉 변환 (시간 순 정렬된 입력 필요) */
function aggregateMinuteBars(bars: DailyBar[], intervalMinutes: number): DailyBar[] {
  if (intervalMinutes <= 1) return bars;

  const result: DailyBar[] = [];
  let bucket: DailyBar[] = [];
  let currentSlot = -1;

  for (const bar of bars) {
    const minuteOfDay = getMinuteOfDay(bar.date);
    const slot = Math.floor(minuteOfDay / intervalMinutes);
    const barDate = bar.date.slice(0, 10);
    const slotKey = `${barDate}:${slot}`;
    const slotNum = hashSlot(slotKey);

    if (slotNum !== currentSlot && bucket.length > 0) {
      result.push(mergeBucket(bucket));
      bucket = [];
    }
    currentSlot = slotNum;
    bucket.push(bar);
  }
  if (bucket.length > 0) result.push(mergeBucket(bucket));

  return result;
}

function mergeBucket(bucket: DailyBar[]): DailyBar {
  return {
    date: bucket[bucket.length - 1].date, // 마지막 봉의 시각
    open: bucket[0].open,
    high: Math.max(...bucket.map(b => b.high)),
    low: Math.min(...bucket.map(b => b.low)),
    close: bucket[bucket.length - 1].close,
    volume: bucket.reduce((s, b) => s + b.volume, 0),
    turnover: bucket.reduce((s, b) => s + b.turnover, 0),
  };
}

function getMinuteOfDay(dateStr: string): number {
  // Parse "YYYY-MM-DDTHH:MM:SS" or "YYYY-MM-DD HH:MM"
  const timePart = dateStr.includes("T") ? dateStr.split("T")[1] : dateStr.split(" ")[1];
  if (!timePart) return 0;
  const [h, m] = timePart.split(":").map(Number);
  return (h - 9) * 60 + m; // minutes from 09:00
}

function hashSlot(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i++) { hash = ((hash << 5) - hash) + key.charCodeAt(i); hash |= 0; }
  return hash;
}

function buildIntradayContext(
  history: DailyBar[],
  dailyBars: DailyBar[],
  currentDate: string,
  allConverted: DailyBar[],
  currentIndex: number,
  intervalMinutes: number,
): ConditionEvaluationContext {
  // 상위 시간축: 현재까지 변환된 봉들 중 완결된 것들
  const thirtyMin = aggregateMinuteBarsFromConverted(history, Math.ceil(30 / intervalMinutes));
  const sixtyMin = aggregateMinuteBarsFromConverted(history, Math.ceil(60 / intervalMinutes));

  return {
    activeBars: history,
    timeframeBars: {
      active: history,
      five_minute: history, // 현재 타임프레임이 이미 변환됨
      ten_minute: thirtyMin, // 30분봉 근사
      sixty_minute: sixtyMin,
      daily: dailyBars.filter(b => b.date.slice(0, 10) < currentDate),
    },
  };
}

function aggregateMinuteBarsFromConverted(bars: DailyBar[], barsPerGroup: number): DailyBar[] {
  if (barsPerGroup <= 1) return bars;
  const result: DailyBar[] = [];
  for (let i = barsPerGroup - 1; i < bars.length; i += barsPerGroup) {
    const slice = bars.slice(i - barsPerGroup + 1, i + 1);
    result.push(mergeBucket(slice));
  }
  return result;
}
