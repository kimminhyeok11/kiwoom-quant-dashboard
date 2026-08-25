export type DisplayRuleNode = {
  id?: string;
  type?: string;
  config?: Record<string, unknown>;
  enabled?: boolean;
  weight?: number;
  logic?: "AND" | "OR" | "NOT";
  children?: DisplayRuleNode[];
};

const labelByType: Record<string, string> = {
  macd_rising: "MACD 흐름",
  macd_level: "MACD 기준선",
  ma_position: "이동평균선 위치",
  high_return: "최근 고저 변동률",
  new_high: "신고가",
  turnover: "거래대금",
  rsi: "RSI",
  bollinger: "볼린저 밴드",
  stochastic: "스토캐스틱",
  atr_percent: "ATR 변동성",
  volume_ratio: "거래량 비율",
};

function numberFrom(value: unknown, fallback: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function formatNumber(value: number) {
  return value.toLocaleString("ko-KR", { maximumFractionDigits: 4 });
}

function comparison(value: unknown) {
  const text = String(value ?? "이상");
  const symbol = { 이상: "≥", 초과: ">", 이하: "≤", 미만: "<" }[text as "이상" | "초과" | "이하" | "미만"];
  return symbol ? `${text} (${symbol})` : text;
}

function formatTurnover(value: number, unit: unknown) {
  if (String(unit) === "억원") return `${formatNumber(value)}억 원`;
  const inEok = value / 100_000_000;
  if (Number.isFinite(inEok) && inEok >= 1) return `${formatNumber(value)}원 (${formatNumber(inEok)}억 원)`;
  return `${formatNumber(value)}원`;
}

export function humanRule(node: DisplayRuleNode) {
  const config = node.config ?? {};
  const comparator = comparison(config.comparator);
  if (node.type === "ma_position") return `종가가 ${String(config.periods ?? config.period ?? "5·21·60")}일 이동평균선보다 ${comparator}`;
  if (node.type === "macd_rising") return `MACD 흐름이 최근 ${formatNumber(numberFrom(config.lookback, 3))}거래일 ${comparator}`;
  if (node.type === "macd_level") return `MACD 히스토그램이 ${formatNumber(numberFrom(config.threshold, 0))} ${comparator}`;
  if (node.type === "high_return") return `최근 ${formatNumber(numberFrom(config.days, 11))}일 고저 변동률이 ${formatNumber(numberFrom(config.minPercent, 20))}% ${comparator}`;
  if (node.type === "new_high") return `최근 ${formatNumber(numberFrom(config.period, 5))}봉 기준 신고가`;
  if (node.type === "turnover") {
    const days = numberFrom(config.days, 5);
    const threshold = numberFrom(config.threshold, 0);
    return `최근 ${formatNumber(days)}일 내 최대 거래대금이 ${formatTurnover(threshold, config.unit)} ${comparator}`;
  }
  if (node.type === "rsi") return `RSI(${formatNumber(numberFrom(config.period, 14))})가 ${formatNumber(numberFrom(config.threshold, 70))} ${comparator}`;
  if (node.type === "bollinger") return `볼린저 ${String(config.band ?? "upper")} 밴드 기준 ${comparator}`;
  if (node.type === "stochastic") return `스토캐스틱 %K(${formatNumber(numberFrom(config.period, 14))})가 ${formatNumber(numberFrom(config.threshold, 80))} ${comparator}`;
  if (node.type === "atr_percent") return `ATR 변동성(${formatNumber(numberFrom(config.period, 14))})이 ${formatNumber(numberFrom(config.threshold, 3))}% ${comparator}`;
  if (node.type === "volume_ratio") return `거래량 비율(${formatNumber(numberFrom(config.period, 20))})이 ${formatNumber(numberFrom(config.threshold, 1.5))}배 ${comparator}`;
  return labelByType[node.type ?? ""] ?? "조건 규칙";
}
