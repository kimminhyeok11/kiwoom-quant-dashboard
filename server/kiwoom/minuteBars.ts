export type IntradayMinuteBar = {
  minuteAt: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type KiwoomMinuteBar = {
  cur_prc?: string | number;
  trde_qty?: string | number;
  cntr_tm?: string | number;
  open_pric?: string | number;
  high_pric?: string | number;
  low_pric?: string | number;
};

function asNumber(value: unknown) {
  return Math.abs(Number(String(value ?? "0").replace(/[^0-9.-]/g, "")) || 0);
}

export function parseKiwoomMinuteTimestamp(value: unknown): Date | null {
  const compact = String(value ?? "").replace(/\D/g, "");
  if (!/^\d{14}$/.test(compact)) return null;
  const year = Number(compact.slice(0, 4));
  const month = Number(compact.slice(4, 6));
  const day = Number(compact.slice(6, 8));
  const hour = Number(compact.slice(8, 10));
  const minute = Number(compact.slice(10, 12));
  const second = Number(compact.slice(12, 14));
  const date = new Date(Date.UTC(year, month - 1, day, hour - 9, minute, second));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function normalizeKiwoomMinuteBars(rows: KiwoomMinuteBar[]): IntradayMinuteBar[] {
  const byMinute = new Map<number, IntradayMinuteBar>();
  rows.forEach(row => {
    const minuteAt = parseKiwoomMinuteTimestamp(row.cntr_tm);
    const open = asNumber(row.open_pric);
    const high = asNumber(row.high_pric);
    const low = asNumber(row.low_pric);
    const close = asNumber(row.cur_prc);
    const volume = asNumber(row.trde_qty);
    if (!minuteAt || open < 1 || high < 1 || low < 1 || close < 1 || volume < 0) return;
    byMinute.set(minuteAt.getTime(), { minuteAt, open, high, low, close, volume });
  });
  return Array.from(byMinute.values()).sort((left, right) => left.minuteAt.getTime() - right.minuteAt.getTime());
}
