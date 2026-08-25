import type { OrderCandidate, TradingSafetySettings } from "../../shared/trading";
import { evaluateOrderRisk, mayTransmitOrder } from "../quant/risk";
import { normalizeKiwoomDailyBars } from "./dailyBars";
import { normalizeKiwoomMinuteBars, type IntradayMinuteBar } from "./minuteBars";
import { kiwoomDomesticReadPacer, type TokenRequestPacer } from "./rateLimiter";
import type { DailyBar } from "../quant/conditions";

type KiwoomTokenResponse = {
  token?: string;
  token_type?: string;
  expires_dt?: string;
  return_code?: number | string;
  return_msg?: string;
};

type CachedAccessToken = { token: string; tokenType: string; expiresAt: string; validUntil: number };
const accessTokenCache = new Map<string, CachedAccessToken>();
const accessTokenErrors = new Map<string, string>();

export type OAuthTokenStatus = {
  state: "not_issued" | "cached" | "expiring" | "error";
  expiresAt: string | null;
  error: string | null;
};

function resolveTokenValidity(expiresAt: string): number {
  const compact = expiresAt.replace(/[^0-9]/g, "");
  if (compact.length >= 14) {
    const timestamp = new Date(Number(compact.slice(0, 4)), Number(compact.slice(4, 6)) - 1, Number(compact.slice(6, 8)), Number(compact.slice(8, 10)), Number(compact.slice(10, 12)), Number(compact.slice(12, 14))).getTime();
    if (Number.isFinite(timestamp)) return timestamp;
  }
  return Date.now() + 50 * 60 * 1000;
}

type KiwoomAccountResponse = {
  acctNo?: string | string[];
  return_code?: number | string;
  return_msg?: string;
};

type KiwoomDailyBarsResponse = {
  stk_dt_pole_chart_qry?: Array<Record<string, unknown>>;
  cont_yn?: string;
  next_key?: string;
  return_code?: number | string;
  return_msg?: string;
};

type KiwoomMinuteBarsResponse = {
  stk_min_pole_chart_qry?: Array<Record<string, unknown>>;
  cont_yn?: string;
  next_key?: string;
  return_code?: number | string;
  return_msg?: string;
};

type KiwoomOrderResponse = {
  ord_no?: string;
  dmst_stex_tp?: string;
  return_code?: number | string;
  return_msg?: string;
};

type KiwoomOrderExecutionRow = {
  ord_no?: string;
  stk_cd?: string;
  stk_nm?: string;
  ord_qty?: string;
  ord_uv?: string;
  cntr_qty?: string;
  cntr_uv?: string;
  ord_remnq?: string;
  ord_tm?: string;
};

type KiwoomOrderExecutionResponse = {
  acnt_ord_cntr_prps_dtl?: KiwoomOrderExecutionRow[];
  return_code?: number | string;
  return_msg?: string;
};

type KiwoomAccountEvaluationRow = {
  stk_cd?: string;
  stk_nm?: string;
  rmnd_qty?: string;
  trde_able_qty?: string;
  pur_pric?: string;
  cur_prc?: string;
  evltv_prft?: string;
  prft_rt?: string;
};

type KiwoomAccountEvaluationResponse = {
  tot_pur_amt?: string;
  tot_evlt_amt?: string;
  tot_evlt_pl?: string;
  tot_prft_rt?: string;
  prsm_dpst_aset_amt?: string;
  acnt_evlt_remn_indv_tot?: KiwoomAccountEvaluationRow[];
  return_code?: number | string;
  return_msg?: string;
};

type KiwoomTurnoverRankingRow = {
  stk_cd?: string;
  now_rank?: string;
  pred_rank?: string;
  stk_nm?: string;
  cur_prc?: string;
  pred_pre?: string;
  flu_rt?: string;
  now_trde_qty?: string;
  pred_trde_qty?: string;
  trde_prica?: string;
};

type KiwoomTurnoverRankingResponse = {
  trde_prica_upper?: KiwoomTurnoverRankingRow[];
  return_code?: number | string;
  return_msg?: string;
};

export type BrokerConnectionStatus = {
  mode: "live" | "mock";
  fixedIpRegistered: boolean;
  hasCredentials: boolean;
  mayTransmitOrders: boolean;
};

export type DailyBarsRequest = {
  symbol: string;
  baseDate?: string;
  adjustedPrice?: "0" | "1";
  maxPages?: number;
};

export type FiveMinuteBarsRequest = {
  symbol: string;
  baseDate: string;
  adjustedPrice?: "0" | "1";
  maxPages?: number;
};

export type LiveBuyOrder = {
  symbol: string;
  quantity: number;
  price?: number;
  exchange: "KRX" | "NXT" | "SOR";
  tradeType: string;
  conditionPrice?: number;
};

export type OrderExecutionQuery = {
  orderDate?: string;
  queryType: "1" | "2" | "3" | "4";
  side: "0" | "1" | "2";
  symbol?: string;
  fromOrderNumber?: string;
  exchange: "%" | "KRX" | "NXT" | "SOR";
};

export type BrokerOrderExecution = {
  orderNumber: string;
  symbol: string;
  name: string;
  orderQuantity: number;
  orderPrice: number;
  filledQuantity: number;
  filledPrice: number;
  remainingQuantity: number;
  orderTime: string;
};

export type BrokerPosition = {
  symbol: string;
  name: string;
  quantity: number;
  tradeableQuantity: number;
  averagePrice: number;
  currentPrice: number;
  profitLoss: number;
  profitLossRate: number;
};

export type BrokerAccountEvaluation = {
  totalPurchaseAmount: number;
  totalEvaluationAmount: number;
  totalProfitLoss: number;
  totalProfitLossRate: number;
  estimatedAssets: number;
  positions: BrokerPosition[];
};

export type TurnoverRankingRequest = {
  market?: "000" | "001" | "101";
  includeManagedStocks?: boolean;
  exchange?: "KRX" | "NXT" | "INTEGRATED";
  continuation?: { enabled: boolean; nextKey?: string };
};

export type BrokerTurnoverRankingItem = {
  symbol: string;
  rank: number;
  previousRank: number | null;
  name: string;
  price: number;
  change: number;
  changeRate: number;
  volume: number;
  previousVolume: number;
  turnover: number;
};

export type BrokerTurnoverRanking = {
  items: BrokerTurnoverRankingItem[];
  continuation: { enabled: boolean; nextKey: string | null };
};

export class KiwoomApiError extends Error {
  constructor(message: string, readonly code?: number | string) {
    super(message);
    this.name = "KiwoomApiError";
  }
}

export class KiwoomClient {
  private readonly mode: "live" | "mock";
  private readonly baseUrl: string;
  private readonly appKey: string;
  private readonly appSecret: string;

  private readonly readPacer: Pick<TokenRequestPacer, "wait">;
  private readonly readRetryDelay: (milliseconds: number) => Promise<void>;

  constructor(input?: { mode?: "live" | "mock"; appKey?: string; appSecret?: string; readPacer?: Pick<TokenRequestPacer, "wait">; readRetryDelay?: (milliseconds: number) => Promise<void> }) {
    this.mode = input?.mode ?? (process.env.KIWOOM_API_MODE === "mock" ? "mock" : "live");
    this.baseUrl = this.mode === "live" ? "https://api.kiwoom.com" : "https://mockapi.kiwoom.com";
    this.appKey = input?.appKey ?? process.env.KIWOOM_APP_KEY ?? "";
    this.appSecret = input?.appSecret ?? process.env.KIWOOM_APP_SECRET ?? "";
    this.readPacer = input?.readPacer ?? kiwoomDomesticReadPacer;
    this.readRetryDelay = input?.readRetryDelay ?? (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)));
  }

  getStatus(): BrokerConnectionStatus {
    const fixedIpRegistered = process.env.KIWOOM_FIXED_IP_REGISTERED === "true";
    const hasCredentials = Boolean(this.appKey && this.appSecret && process.env.KIWOOM_ACCOUNT_NUMBER);
    const mayTransmitOrders = this.mode === "live"
      && fixedIpRegistered
      && hasCredentials
      && process.env.KIWOOM_ORDER_TRANSMISSION_ENABLED === "true";
    return { mode: this.mode, fixedIpRegistered, hasCredentials, mayTransmitOrders };
  }

  async issueAccessToken(): Promise<{ token: string; tokenType: string; expiresAt: string }> {
    this.assertFixedIpRegistered();
    this.assertCredentials();
    const response = await fetch(`${this.baseUrl}/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json;charset=UTF-8" },
      body: JSON.stringify({ grant_type: "client_credentials", appkey: this.appKey, secretkey: this.appSecret }),
    });
    const payload = await this.readJson<KiwoomTokenResponse>(response);
    if (!response.ok || !payload.token || String(payload.return_code ?? "0") !== "0") {
      throw new KiwoomApiError(payload.return_msg ?? "키움 OAuth 토큰 발급에 실패했습니다.", payload.return_code);
    }
    return { token: payload.token, tokenType: payload.token_type ?? "bearer", expiresAt: payload.expires_dt ?? "" };
  }

  async getAccessToken(): Promise<{ token: string; tokenType: string; expiresAt: string }> {
    const cacheKey = `${this.mode}:${this.appKey}`;
    const cached = accessTokenCache.get(cacheKey);
    if (cached && cached.validUntil > Date.now() + 60_000) {
      return { token: cached.token, tokenType: cached.tokenType, expiresAt: cached.expiresAt };
    }
    try {
      const issued = await this.issueAccessToken();
      accessTokenCache.set(cacheKey, { ...issued, validUntil: resolveTokenValidity(issued.expiresAt) });
      accessTokenErrors.delete(cacheKey);
      return issued;
    } catch (error) {
      accessTokenErrors.set(cacheKey, error instanceof Error ? error.message : "OAuth 토큰 발급에 실패했습니다.");
      throw error;
    }
  }

  clearAccessToken(): void {
    const cacheKey = `${this.mode}:${this.appKey}`;
    accessTokenCache.delete(cacheKey);
    accessTokenErrors.delete(cacheKey);
  }

  getAccessTokenStatus(): OAuthTokenStatus {
    const cacheKey = `${this.mode}:${this.appKey}`;
    const cached = accessTokenCache.get(cacheKey);
    const error = accessTokenErrors.get(cacheKey);
    if (error) return { state: "error", expiresAt: null, error };
    if (!cached) return { state: "not_issued", expiresAt: null, error: null };
    return { state: cached.validUntil <= Date.now() + 5 * 60_000 ? "expiring" : "cached", expiresAt: cached.expiresAt || null, error: null };
  }

  async getDailyBars(accessToken: string, input: DailyBarsRequest): Promise<DailyBar[]> {
    this.assertFixedIpRegistered();
    const baseDate = input.baseDate ?? new Date().toISOString().slice(0, 10).replaceAll("-", "");
    const maxPages = Math.min(Math.max(input.maxPages ?? 3, 1), 10);
    const rows: Array<Record<string, unknown>> = [];
    let continuation = "N";
    let nextKey = "";

    for (let page = 0; page < maxPages; page += 1) {
      if (page > 0) await new Promise(resolve => setTimeout(resolve, 1_000));
      await this.readPacer.wait(`${this.mode}:${accessToken}`);
      const { response, payload } = await this.fetchReadJson<KiwoomDailyBarsResponse>(`${this.baseUrl}/api/dostk/chart`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json;charset=UTF-8",
          authorization: `Bearer ${accessToken}`,
          "api-id": "ka10081",
          "cont-yn": continuation,
          "next-key": nextKey,
        },
        body: JSON.stringify({ stk_cd: input.symbol, base_dt: baseDate, upd_stkpc_tp: input.adjustedPrice ?? "1" }),
      });
      if (!response.ok || String(payload.return_code ?? "0") !== "0") {
        throw new KiwoomApiError(payload.return_msg ?? "키움 일봉 차트 조회에 실패했습니다.", payload.return_code);
      }
      if (Array.isArray(payload.stk_dt_pole_chart_qry)) rows.push(...payload.stk_dt_pole_chart_qry);
      const responseContinuation = String(payload.cont_yn ?? "N");
      const responseNextKey = String(payload.next_key ?? "");
      if (responseContinuation !== "Y" || !responseNextKey) break;
      continuation = "Y";
      nextKey = responseNextKey;
    }

    if (!rows.length) throw new KiwoomApiError("키움 일봉 차트 응답에 데이터가 없습니다.");
    return normalizeKiwoomDailyBars(rows);
  }

  /** ka10080의 5분 범위 응답을 시간순 OHLCV로 정규화한다. 주문·계좌 API와는 분리된 읽기 전용 요청이다. */
  async getFiveMinuteBars(accessToken: string, input: FiveMinuteBarsRequest): Promise<IntradayMinuteBar[]> {
    this.assertFixedIpRegistered();
    const maxPages = Math.min(Math.max(input.maxPages ?? 3, 1), 10);
    const rows: Array<Record<string, unknown>> = [];
    let continuation = "N";
    let nextKey = "";

    for (let page = 0; page < maxPages; page += 1) {
      if (page > 0) await new Promise(resolve => setTimeout(resolve, 1_000));
      await this.readPacer.wait(`${this.mode}:${accessToken}`);
      const { response, payload } = await this.fetchReadJson<KiwoomMinuteBarsResponse>(`${this.baseUrl}/api/dostk/chart`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json;charset=UTF-8",
          authorization: `Bearer ${accessToken}`,
          "api-id": "ka10080",
          "cont-yn": continuation,
          "next-key": nextKey,
        },
        body: JSON.stringify({ stk_cd: input.symbol, tic_scope: "5", upd_stkpc_tp: input.adjustedPrice ?? "1", base_dt: input.baseDate }),
      });
      if (!response.ok || String(payload.return_code ?? "0") !== "0") {
        throw new KiwoomApiError(payload.return_msg ?? "키움 5분봉 차트 조회에 실패했습니다.", payload.return_code);
      }
      if (Array.isArray(payload.stk_min_pole_chart_qry)) rows.push(...payload.stk_min_pole_chart_qry);
      const responseContinuation = String(payload.cont_yn ?? "N");
      const responseNextKey = String(payload.next_key ?? "");
      if (responseContinuation !== "Y" || !responseNextKey) break;
      continuation = "Y";
      nextKey = responseNextKey;
    }

    if (!rows.length) throw new KiwoomApiError("키움 5분봉 차트 응답에 데이터가 없습니다.");
    return normalizeKiwoomMinuteBars(rows);
  }

  async getTurnoverRankings(accessToken: string, input: TurnoverRankingRequest = {}): Promise<BrokerTurnoverRanking> {
    this.assertFixedIpRegistered();
    const exchange = input.exchange ?? "KRX";
    const { response, payload } = await this.fetchReadJson<KiwoomTurnoverRankingResponse>(`${this.baseUrl}/api/dostk/rkinfo`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json;charset=UTF-8",
        authorization: `Bearer ${accessToken}`,
        "api-id": "ka10032",
        "cont-yn": input.continuation?.enabled ? "Y" : "N",
        "next-key": input.continuation?.nextKey ?? "",
      },
      body: JSON.stringify({
        mrkt_tp: input.market ?? "000",
        mang_stk_incls: input.includeManagedStocks ? "1" : "0",
        stex_tp: exchange === "KRX" ? "1" : exchange === "NXT" ? "2" : "3",
      }),
    });
    if (!response.ok || String(payload.return_code ?? "0") !== "0") {
      throw new KiwoomApiError(payload.return_msg ?? "키움 거래대금 순위 조회에 실패했습니다.", payload.return_code);
    }
    const number = (value: unknown, absolute = false) => {
      const parsed = Number(String(value ?? "0").replace(/,/g, "").trim()) || 0;
      return absolute ? Math.abs(parsed) : parsed;
    };
    const items = (payload.trde_prica_upper ?? []).map(item => ({
      symbol: String(item.stk_cd ?? ""),
      rank: number(item.now_rank),
      previousRank: item.pred_rank ? number(item.pred_rank) : null,
      name: String(item.stk_nm ?? ""),
      price: number(item.cur_prc, true),
      change: number(item.pred_pre),
      changeRate: number(item.flu_rt),
      volume: number(item.now_trde_qty, true),
      previousVolume: number(item.pred_trde_qty, true),
      turnover: number(item.trde_prica, true) * 1_000_000,
    }));
    const continuation = response.headers.get("cont-yn") === "Y";
    return { items, continuation: { enabled: continuation, nextKey: continuation ? response.headers.get("next-key") : null } };
  }

  async listAccounts(accessToken: string): Promise<string[]> {
    this.assertFixedIpRegistered();
    const response = await fetch(`${this.baseUrl}/api/dostk/acnt`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json;charset=UTF-8",
        authorization: `Bearer ${accessToken}`,
        "api-id": "ka00001",
      },
      body: JSON.stringify({}),
    });
    const payload = await this.readJson<KiwoomAccountResponse>(response);
    if (!response.ok || String(payload.return_code ?? "0") !== "0") {
      throw new KiwoomApiError(payload.return_msg ?? "키움 계좌 조회에 실패했습니다.", payload.return_code);
    }
    return Array.isArray(payload.acctNo) ? payload.acctNo : payload.acctNo ? [payload.acctNo] : [];
  }

  assertOrderMayBeSubmitted(input: {
    candidate: OrderCandidate;
    settings: TradingSafetySettings;
    confirmedOrderCountToday: number;
    confirmedAt: Date | null;
    confirmationNonce: string | null;
    status: "pending_confirmation" | "confirmed" | "submitted" | "filled" | "blocked";
  }): void {
    const connectionReady = this.getStatus().mayTransmitOrders;
    const risk = evaluateOrderRisk(input.candidate, input.settings, input.confirmedOrderCountToday, connectionReady);
    if (!risk.allowed) throw new KiwoomApiError(risk.reasons.join(" "));
    if (!mayTransmitOrder(input)) throw new KiwoomApiError("필수 최종 확인이 완료되지 않았거나 이미 전송된 주문입니다.");
  }

  async submitLiveBuyOrder(accessToken: string, input: LiveBuyOrder): Promise<{ orderNumber: string; exchange: string }> {
    const status = this.getStatus();
    if (!status.mayTransmitOrders) throw new KiwoomApiError("실주문 전송은 고정 IP 등록과 별도 전송 승인이 모두 필요합니다.", "ORDER_TRANSMISSION_DISABLED");
    const response = await fetch(`${this.baseUrl}/api/dostk/ordr`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json;charset=UTF-8",
        authorization: `Bearer ${accessToken}`,
        "api-id": "kt10000",
      },
      body: JSON.stringify({
        dmst_stex_tp: input.exchange,
        stk_cd: input.symbol,
        ord_qty: String(input.quantity),
        ...(input.price ? { ord_uv: String(input.price) } : {}),
        trde_tp: input.tradeType,
        ...(input.conditionPrice ? { cond_uv: String(input.conditionPrice) } : {}),
      }),
    });
    const payload = await this.readJson<KiwoomOrderResponse>(response);
    if (!response.ok || !payload.ord_no || String(payload.return_code ?? "0") !== "0") {
      throw new KiwoomApiError(payload.return_msg ?? "키움 매수 주문이 접수되지 않았습니다.", payload.return_code);
    }
    return { orderNumber: payload.ord_no, exchange: payload.dmst_stex_tp ?? input.exchange };
  }

  async listOrderExecutions(accessToken: string, input: OrderExecutionQuery): Promise<BrokerOrderExecution[]> {
    this.assertFixedIpRegistered();
    const response = await fetch(`${this.baseUrl}/api/dostk/acnt`, {
      method: "POST",
      headers: { "Content-Type": "application/json;charset=UTF-8", authorization: `Bearer ${accessToken}`, "api-id": "kt00007" },
      body: JSON.stringify({
        ord_dt: input.orderDate ?? "",
        qry_tp: input.queryType,
        stk_bond_tp: "1",
        sell_tp: input.side,
        stk_cd: input.symbol ?? "",
        fr_ord_no: input.fromOrderNumber ?? "",
        dmst_stex_tp: input.exchange,
      }),
    });
    const payload = await this.readJson<KiwoomOrderExecutionResponse>(response);
    if (!response.ok || String(payload.return_code ?? "0") !== "0") throw new KiwoomApiError(payload.return_msg ?? "키움 주문·체결 조회에 실패했습니다.", payload.return_code);
    const number = (value?: string) => Number(String(value ?? "0").replace(/[^0-9.-]/g, "")) || 0;
    return (payload.acnt_ord_cntr_prps_dtl ?? []).map(item => ({
      orderNumber: item.ord_no ?? "", symbol: item.stk_cd ?? "", name: item.stk_nm ?? "", orderQuantity: number(item.ord_qty),
      orderPrice: number(item.ord_uv), filledQuantity: number(item.cntr_qty), filledPrice: number(item.cntr_uv),
      remainingQuantity: number(item.ord_remnq), orderTime: item.ord_tm ?? "",
    }));
  }

  async getAccountEvaluation(accessToken: string, exchange: "KRX" | "NXT" = "KRX"): Promise<BrokerAccountEvaluation> {
    this.assertFixedIpRegistered();
    const response = await fetch(`${this.baseUrl}/api/dostk/acnt`, {
      method: "POST",
      headers: { "Content-Type": "application/json;charset=UTF-8", authorization: `Bearer ${accessToken}`, "api-id": "kt00018" },
      body: JSON.stringify({ qry_tp: "1", dmst_stex_tp: exchange }),
    });
    const payload = await this.readJson<KiwoomAccountEvaluationResponse>(response);
    if (!response.ok || String(payload.return_code ?? "0") !== "0") throw new KiwoomApiError(payload.return_msg ?? "키움 계좌 평가잔고 조회에 실패했습니다.", payload.return_code);
    const number = (value: unknown) => Number(String(value ?? "0").replace(/[^0-9.-]/g, "")) || 0;
    const items = Array.isArray(payload.acnt_evlt_remn_indv_tot) ? payload.acnt_evlt_remn_indv_tot : [];
    return {
      totalPurchaseAmount: number(payload.tot_pur_amt), totalEvaluationAmount: number(payload.tot_evlt_amt),
      totalProfitLoss: number(payload.tot_evlt_pl), totalProfitLossRate: number(payload.tot_prft_rt), estimatedAssets: number(payload.prsm_dpst_aset_amt),
      positions: items.map(item => {
        return { symbol: String(item.stk_cd ?? ""), name: String(item.stk_nm ?? ""), quantity: number(item.rmnd_qty), tradeableQuantity: number(item.trde_able_qty), averagePrice: number(item.pur_pric), currentPrice: number(item.cur_prc), profitLoss: number(item.evltv_prft), profitLossRate: number(item.prft_rt) };
      }),
    };
  }

  private assertFixedIpRegistered() {
    if (this.mode === "live" && process.env.KIWOOM_FIXED_IP_REGISTERED !== "true") {
      throw new KiwoomApiError("키움 운영 API 지정단말기 IP 등록이 확인되지 않았습니다.", "FIXED_IP_REQUIRED");
    }
  }

  private assertCredentials() {
    if (!this.appKey || !this.appSecret) {
      throw new KiwoomApiError("키움 App Key와 App Secret이 필요합니다.", "CREDENTIALS_REQUIRED");
    }
  }

  private async fetchReadJson<T>(url: string, init: RequestInit): Promise<{ response: Response; payload: T }> {
    const maxAttempts = 3;
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const response = await fetch(url, init);
        if ((response.status === 408 || response.status === 429 || response.status >= 500) && attempt < maxAttempts) {
          await this.readRetryDelay(200 * 2 ** (attempt - 1));
          continue;
        }
        return { response, payload: await this.readJson<T>(response) };
      } catch (error) {
        lastError = error;
        if (error instanceof KiwoomApiError || attempt >= maxAttempts) throw error;
        await this.readRetryDelay(200 * 2 ** (attempt - 1));
      }
    }
    throw lastError instanceof Error ? lastError : new KiwoomApiError("키움 읽기 요청에 실패했습니다.");
  }

  private async readJson<T>(response: Response): Promise<T> {
    try {
      return await response.json() as T;
    } catch {
      throw new KiwoomApiError(`키움 API가 JSON이 아닌 응답을 반환했습니다. (HTTP ${response.status})`);
    }
  }
}
