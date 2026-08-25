import type { DailyBar } from "../quant/conditions";

type KiwoomDailyBar = {
  dt?: string;
  cur_prc?: string | number;
  open_pric?: string | number;
  high_pric?: string | number;
  low_pric?: string | number;
  trde_qty?: string | number;
  trde_prica?: string | number;
};

const asNumber = (value: string | number | undefined) => {
  const parsed = Number(String(value ?? "0").replace(/,/g, "").replace(/^[+]/, ""));
  return Number.isFinite(parsed) ? Math.abs(parsed) : 0;
};

/** 키움 ka10081 응답의 거래대금(백만원)을 원 단위 DailyBar로 변환한다. */
export function normalizeKiwoomDailyBars(rows: KiwoomDailyBar[]): DailyBar[] {
  return rows.map(row => ({
    date: String(row.dt ?? ""),
    open: asNumber(row.open_pric),
    high: asNumber(row.high_pric),
    low: asNumber(row.low_pric),
    close: asNumber(row.cur_prc),
    volume: asNumber(row.trde_qty),
    turnover: asNumber(row.trde_prica) * 1_000_000,
  })).filter(bar => Boolean(bar.date) && bar.close > 0 && bar.high > 0 && bar.low > 0).sort((left, right) => left.date.localeCompare(right.date));
}
