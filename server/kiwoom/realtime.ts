export const KIWOOM_REALTIME_PATH = "/api/dostk/websocket";

export function getKiwoomRealtimeEndpoint(mode: "live" | "mock"): string {
  return mode === "live"
    ? "wss://api.kiwoom.com:10000/api/dostk/websocket"
    : "wss://mockapi.kiwoom.com:10000/api/dostk/websocket";
}

export type RealtimeExchange = "KRX" | "NXT" | "SOR";
export type RealtimeType = "0A" | "0B" | "0C" | "00" | "04";

export type KiwoomRealtimeRegistration = {
  trnm: "REG";
  grp_no: string;
  refresh: "0" | "1";
  data: Array<{ item: string; type: RealtimeType }>;
};

export type KiwoomRealtimeRemoval = {
  trnm: "REMOVE";
  grp_no: string;
  data: Array<{ item: string; type: RealtimeType }>;
};

export type KiwoomConditionSearchRequest = {
  trnm: "CNSRREQ";
  seq: string;
  search_type: "0";
  stex_tp: "K" | "A";
  cont_yn: "Y" | "N";
  next_key: string;
};

export type KiwoomConditionListRequest = {
  trnm: "CNSRLST";
};

export type HtsConditionDefinition = {
  sequence: string;
  name: string;
};

export type ConditionSearchMatch = {
  symbol: string;
  name: string;
  price: number | null;
  change: number | null;
  changeRate: number | null;
  cumulativeVolume: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
};

export type RealtimeTrade = {
  symbol: string;
  exchange: RealtimeExchange;
  tradeTime: string | null;
  price: number | null;
  change: number | null;
  changeRate: number | null;
  tradeVolume: number | null;
  cumulativeVolume: number | null;
  cumulativeTurnover: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  receivedAt: number;
};

type RealtimePayload = {
  trnm?: string;
  data?: Array<{ item?: string; type?: string; values?: Record<string, string | number | null | undefined> }>;
};

function normalizeGroupNumber(groupNumber: string | number): string {
  const value = String(groupNumber).trim();
  if (!/^\d{1,4}$/.test(value)) throw new Error("실시간 그룹 번호는 1~4자리 숫자여야 합니다.");
  return value.padStart(4, "0");
}

function normalizeItem(symbol: string, exchange: RealtimeExchange): string {
  const normalizedSymbol = symbol.trim().toUpperCase().replace(/_(NX|AL)$/, "");
  if (!/^\d{6}$/.test(normalizedSymbol)) throw new Error("실시간 종목 코드는 6자리 숫자여야 합니다.");
  return exchange === "NXT" ? `${normalizedSymbol}_NX` : exchange === "SOR" ? `${normalizedSymbol}_AL` : normalizedSymbol;
}

function normalizeItems(symbols: string[], exchange: RealtimeExchange, type: RealtimeType) {
  const items = Array.from(new Set(symbols.map(symbol => normalizeItem(symbol, exchange))));
  if (!items.length) throw new Error("최소 한 개의 실시간 종목 코드가 필요합니다.");
  if (items.length > 100) throw new Error("실시간 등록은 한 그룹에 최대 100개 종목만 허용합니다.");
  return items.map(item => ({ item, type }));
}

export function buildRealtimeRegistration(input: { groupNumber: string | number; symbols: string[]; exchange?: RealtimeExchange; type?: RealtimeType; keepExisting?: boolean }): KiwoomRealtimeRegistration {
  return {
    trnm: "REG",
    grp_no: normalizeGroupNumber(input.groupNumber),
    refresh: input.keepExisting === false ? "0" : "1",
    data: normalizeItems(input.symbols, input.exchange ?? "KRX", input.type ?? "0B"),
  };
}

export function buildRealtimeRemoval(input: { groupNumber: string | number; symbols: string[]; exchange?: RealtimeExchange; type?: RealtimeType }): KiwoomRealtimeRemoval {
  return {
    trnm: "REMOVE",
    grp_no: normalizeGroupNumber(input.groupNumber),
    data: normalizeItems(input.symbols, input.exchange ?? "KRX", input.type ?? "0B"),
  };
}

export function buildConditionSearchRequest(input: { sequence: string | number; exchange?: "KRX" | "INTEGRATED"; continuation?: { enabled: boolean; nextKey?: string } }): KiwoomConditionSearchRequest {
  const sequence = String(input.sequence).trim();
  if (!/^\d{1,3}$/.test(sequence)) throw new Error("조건검색식 일련번호는 1~3자리 숫자여야 합니다.");
  return {
    trnm: "CNSRREQ",
    seq: sequence,
    search_type: "0",
    stex_tp: input.exchange === "INTEGRATED" ? "A" : "K",
    cont_yn: input.continuation?.enabled ? "Y" : "N",
    next_key: input.continuation?.nextKey ?? "",
  };
}

export function buildConditionListRequest(): KiwoomConditionListRequest {
  return { trnm: "CNSRLST" };
}

function parseNumber(value: string | number | null | undefined, absolute = false): number | null {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const parsed = Number(String(value).replace(/,/g, "").trim());
  if (!Number.isFinite(parsed)) return null;
  return absolute ? Math.abs(parsed) : parsed;
}

function exchangeFromItem(item: string): RealtimeExchange {
  return item.endsWith("_NX") ? "NXT" : item.endsWith("_AL") ? "SOR" : "KRX";
}

export function parseRealtimeTrades(payload: RealtimePayload, receivedAt = Date.now()): RealtimeTrade[] {
  if (payload.trnm !== "REAL" || !Array.isArray(payload.data)) return [];
  return payload.data.flatMap(entry => {
    if (entry.type !== "0B" || !entry.item || !entry.values) return [];
    const values = entry.values;
    return [{
      symbol: entry.item.replace(/_(NX|AL)$/, ""),
      exchange: exchangeFromItem(entry.item),
      tradeTime: String(values["20"] ?? "").trim() || null,
      price: parseNumber(values["10"], true),
      change: parseNumber(values["11"]),
      changeRate: parseNumber(values["12"]),
      tradeVolume: parseNumber(values["15"]),
      cumulativeVolume: parseNumber(values["13"], true),
      cumulativeTurnover: (() => {
        const millionWon = parseNumber(values["14"], true);
        return millionWon === null ? null : millionWon * 1_000_000;
      })(),
      open: parseNumber(values["16"], true),
      high: parseNumber(values["17"], true),
      low: parseNumber(values["18"], true),
      receivedAt,
    }];
  });
}

export function parseConditionSearchMatches(payload: { trnm?: string; data?: Array<Record<string, string | number | null | undefined>> }): ConditionSearchMatch[] {
  if (payload.trnm !== "CNSRREQ" || !Array.isArray(payload.data)) return [];
  return payload.data.flatMap(row => {
    const rawSymbol = String(row["9001"] ?? "").trim();
    const symbol = rawSymbol.slice(-6);
    if (!/^\d{6}$/.test(symbol)) return [];
    const rateRaw = parseNumber(row["12"]);
    return [{
      symbol,
      name: String(row["302"] ?? "").trim(),
      price: parseNumber(row["10"], true),
      change: parseNumber(row["11"]),
      changeRate: rateRaw === null ? null : rateRaw / 1_000,
      cumulativeVolume: parseNumber(row["13"], true),
      open: parseNumber(row["16"], true),
      high: parseNumber(row["17"], true),
      low: parseNumber(row["18"], true),
    }];
  });
}

export function parseHtsConditionDefinitions(payload: { trnm?: string; return_code?: string | number; return_msg?: string; data?: Array<{ seq?: string | number | null; name?: string | null }> }): HtsConditionDefinition[] {
  if (String(payload.return_code ?? "0") !== "0") throw new Error(payload.return_msg || "키움 HTS 조건식 목록을 불러오지 못했습니다.");
  if (payload.trnm !== "CNSRLST" || !Array.isArray(payload.data)) return [];
  return payload.data.flatMap(item => {
    const sequence = String(item.seq ?? "").trim();
    const name = String(item.name ?? "").trim();
    return /^\d{1,3}$/.test(sequence) && name ? [{ sequence, name }] : [];
  });
}
