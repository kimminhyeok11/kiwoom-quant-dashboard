/**
 * 1분봉 → N분봉 가공 유틸리티
 *
 * 1분봉 원본에서 5분봉, 10분봉, 15분봉 등을 생성한다.
 * 키움 API에서 5분봉을 별도로 받을 필요 없이, 1분봉만 수집하면 모든 타임프레임을 가공 가능.
 */

export type MinuteBar = {
  tradingDate: string;
  symbol: string;
  minuteAt: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type AggregatedBar = {
  tradingDate: string;
  symbol: string;
  periodStart: Date;
  periodEnd: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  barCount: number; // 실제 합쳐진 1분봉 수
};

/**
 * 1분봉 배열을 N분봉으로 합친다.
 *
 * @param bars - 1분봉 배열 (같은 종목·같은 날짜, 시간순 정렬된 상태)
 * @param intervalMinutes - 합칠 간격 (5, 10, 15, 30, 60)
 */
export function aggregateToNMinuteBars(bars: MinuteBar[], intervalMinutes: number): AggregatedBar[] {
  if (!bars.length || intervalMinutes < 2) return bars.map(b => ({ ...b, periodStart: b.minuteAt, periodEnd: b.minuteAt, barCount: 1 }));

  // Sort by time
  const sorted = [...bars].sort((a, b) => a.minuteAt.getTime() - b.minuteAt.getTime());

  const result: AggregatedBar[] = [];
  let bucket: MinuteBar[] = [];
  let bucketStartMinute = -1;

  for (const bar of sorted) {
    // 장 시작 기준으로 몇 분째인지 계산 (09:00 = 0분)
    const hours = bar.minuteAt.getUTCHours() + 9; // UTC → KST (간이)
    const kstHours = bar.minuteAt.getHours(); // 로컬이 KST라면 이것 사용
    const minuteOfDay = getMinuteOfTradingDay(bar.minuteAt);
    const bucketIdx = Math.floor(minuteOfDay / intervalMinutes);

    if (bucket.length === 0 || bucketIdx !== bucketStartMinute) {
      // Flush previous bucket
      if (bucket.length > 0) {
        result.push(flushBucket(bucket));
      }
      bucket = [bar];
      bucketStartMinute = bucketIdx;
    } else {
      bucket.push(bar);
    }
  }

  // Flush last bucket
  if (bucket.length > 0) {
    result.push(flushBucket(bucket));
  }

  return result;
}

/**
 * 같은 종목의 여러 날짜 1분봉을 한꺼번에 N분봉으로 변환
 */
export function aggregateMultiDay(bars: MinuteBar[], intervalMinutes: number): AggregatedBar[] {
  // Group by (tradingDate, symbol)
  const groups = new Map<string, MinuteBar[]>();
  for (const bar of bars) {
    const key = `${bar.tradingDate}|${bar.symbol}`;
    const arr = groups.get(key) ?? [];
    arr.push(bar);
    groups.set(key, arr);
  }

  const result: AggregatedBar[] = [];
  for (const group of Array.from(groups.values())) {
    result.push(...aggregateToNMinuteBars(group, intervalMinutes));
  }

  return result.sort((a, b) => a.periodStart.getTime() - b.periodStart.getTime());
}

// ─────────────────────────────────────────────
// Internal
// ─────────────────────────────────────────────

function getMinuteOfTradingDay(date: Date): number {
  // KST 기준 09:00을 0분으로
  // minuteAt은 이미 KST timestamp로 저장되어 있음
  const kstDate = new Date(date.getTime() + 9 * 60 * 60 * 1000); // UTC → KST
  const hours = kstDate.getUTCHours();
  const minutes = kstDate.getUTCMinutes();
  return (hours - 9) * 60 + minutes; // 09:00 = 0, 09:05 = 5, 15:30 = 390
}

function flushBucket(bucket: MinuteBar[]): AggregatedBar {
  return {
    tradingDate: bucket[0].tradingDate,
    symbol: bucket[0].symbol,
    periodStart: bucket[0].minuteAt,
    periodEnd: bucket[bucket.length - 1].minuteAt,
    open: bucket[0].open,
    high: Math.max(...bucket.map(b => b.high)),
    low: Math.min(...bucket.map(b => b.low)),
    close: bucket[bucket.length - 1].close,
    volume: bucket.reduce((s, b) => s + b.volume, 0),
    barCount: bucket.length,
  };
}
