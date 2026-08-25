import {
  buildConditionSearchRequest,
  buildConditionListRequest,
  buildRealtimeRegistration,
  buildRealtimeRemoval,
  getKiwoomRealtimeEndpoint,
  parseConditionSearchMatches,
  parseHtsConditionDefinitions,
  parseRealtimeTrades,
  type ConditionSearchMatch,
  type HtsConditionDefinition,
  type RealtimeExchange,
  type RealtimeTrade,
  type RealtimeType,
} from "./realtime";

export type RealtimeConnectionState = "idle" | "connecting" | "ready" | "retry_wait" | "failed" | "stopped";

export type RealtimeTransport = {
  send: (message: string) => void;
  close: () => void;
};

export type RealtimeTransportFactory = (input: {
  endpoint: string;
  accessToken: string;
  onMessage: (raw: string) => void;
  onClose: () => void;
}) => Promise<RealtimeTransport>;

export type KiwoomRealtimeSessionOptions = {
  mode: "live" | "mock";
  groupNumber: string | number;
  symbols: string[];
  exchange?: RealtimeExchange;
  type?: RealtimeType;
  getAccessToken: () => Promise<{ token: string }>;
  createTransport: RealtimeTransportFactory;
  onTrade?: (trade: RealtimeTrade) => void;
  onStateChange?: (state: RealtimeConnectionState, detail?: string) => void;
  retryBaseMs?: number;
  retryMaxMs?: number;
  schedule?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  cancelSchedule?: (timer: ReturnType<typeof setTimeout>) => void;
};

export type HtsConditionListQueryOptions = {
  mode: "live" | "mock";
  getAccessToken: () => Promise<{ token: string }>;
  createTransport: RealtimeTransportFactory;
  timeoutMs?: number;
  schedule?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  cancelSchedule?: (timer: ReturnType<typeof setTimeout>) => void;
};

export type HtsConditionMatchesQueryOptions = HtsConditionListQueryOptions & {
  sequence: string | number;
  exchange?: "KRX" | "INTEGRATED";
};

export async function queryHtsConditionList(options: HtsConditionListQueryOptions): Promise<HtsConditionDefinition[]> {
  const schedule = options.schedule ?? ((callback, delayMs) => setTimeout(callback, delayMs));
  const cancelSchedule = options.cancelSchedule ?? (timer => clearTimeout(timer));
  const { token } = await options.getAccessToken();

  return new Promise<HtsConditionDefinition[]>((resolve, reject) => {
    let completed = false;
    let transport: RealtimeTransport | null = null;
    const finish = (result: { definitions?: HtsConditionDefinition[]; error?: unknown }) => {
      if (completed) return;
      completed = true;
      cancelSchedule(timeout);
      transport?.close();
      if (result.error) reject(result.error); else resolve(result.definitions ?? []);
    };
    const timeout = schedule(() => finish({ error: new Error("키움 HTS 조건식 목록 조회 시간이 초과되었습니다.") }), options.timeoutMs ?? 10_000);

    options.createTransport({
      endpoint: getKiwoomRealtimeEndpoint(options.mode),
      accessToken: token,
      onMessage: raw => {
        try {
          const payload = JSON.parse(raw) as Parameters<typeof parseHtsConditionDefinitions>[0];
          if (payload.trnm === "CNSRLST" || payload.return_code !== undefined) finish({ definitions: parseHtsConditionDefinitions(payload) });
        } catch (error) {
          finish({ error });
        }
      },
      onClose: () => finish({ error: new Error("키움 HTS 조건식 목록 연결이 종료되었습니다.") }),
    }).then(created => {
      if (completed) { created.close(); return; }
      transport = created;
      transport.send(JSON.stringify(buildConditionListRequest()));
    }).catch(error => finish({ error }));
  });
}

export async function queryHtsConditionMatches(options: HtsConditionMatchesQueryOptions): Promise<ConditionSearchMatch[]> {
  const schedule = options.schedule ?? ((callback, delayMs) => setTimeout(callback, delayMs));
  const cancelSchedule = options.cancelSchedule ?? (timer => clearTimeout(timer));
  const { token } = await options.getAccessToken();

  return new Promise<ConditionSearchMatch[]>((resolve, reject) => {
    let completed = false;
    let transport: RealtimeTransport | null = null;
    const finish = (result: { matches?: ConditionSearchMatch[]; error?: unknown }) => {
      if (completed) return;
      completed = true;
      cancelSchedule(timeout);
      transport?.close();
      if (result.error) reject(result.error); else resolve(result.matches ?? []);
    };
    const timeout = schedule(() => finish({ error: new Error("키움 HTS 조건검색 현재 후보 조회 시간이 초과되었습니다.") }), options.timeoutMs ?? 10_000);

    options.createTransport({
      endpoint: getKiwoomRealtimeEndpoint(options.mode),
      accessToken: token,
      onMessage: raw => {
        try {
          const payload = JSON.parse(raw) as Parameters<typeof parseConditionSearchMatches>[0];
          if (payload.trnm === "CNSRREQ") finish({ matches: parseConditionSearchMatches(payload) });
        } catch (error) {
          finish({ error });
        }
      },
      onClose: () => finish({ error: new Error("키움 HTS 조건검색 현재 후보 연결이 종료되었습니다.") }),
    }).then(created => {
      if (completed) { created.close(); return; }
      transport = created;
      transport.send(JSON.stringify(buildConditionSearchRequest({ sequence: options.sequence, exchange: options.exchange })));
    }).catch(error => finish({ error }));
  });
}

function mustNotRetry(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /8050|FIXED_IP_REQUIRED|CREDENTIALS_REQUIRED/i.test(message);
}

export class KiwoomRealtimeSession {
  private readonly exchange: RealtimeExchange;
  private readonly type: RealtimeType;
  private readonly retryBaseMs: number;
  private readonly retryMaxMs: number;
  private readonly schedule: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  private readonly cancelSchedule: (timer: ReturnType<typeof setTimeout>) => void;
  private transport: RealtimeTransport | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryCount = 0;
  private stopped = false;
  private currentState: RealtimeConnectionState = "idle";

  constructor(private readonly options: KiwoomRealtimeSessionOptions) {
    this.exchange = options.exchange ?? "KRX";
    this.type = options.type ?? "0B";
    this.retryBaseMs = Math.max(options.retryBaseMs ?? 1_000, 100);
    this.retryMaxMs = Math.max(options.retryMaxMs ?? 30_000, this.retryBaseMs);
    this.schedule = options.schedule ?? ((callback, delayMs) => setTimeout(callback, delayMs));
    this.cancelSchedule = options.cancelSchedule ?? (timer => clearTimeout(timer));
  }

  get state(): RealtimeConnectionState {
    return this.currentState;
  }

  get retryAttempt(): number {
    return this.retryCount;
  }

  async start(): Promise<void> {
    if (this.stopped || this.currentState === "connecting" || this.currentState === "ready") return;
    this.setState("connecting");
    try {
      const { token } = await this.options.getAccessToken();
      if (this.stopped) return;
      const transport = await this.options.createTransport({
        endpoint: getKiwoomRealtimeEndpoint(this.options.mode),
        accessToken: token,
        onMessage: raw => this.handleMessage(raw),
        onClose: () => this.handleClose(),
      });
      if (this.stopped) {
        transport.close();
        return;
      }
      this.transport = transport;
      transport.send(JSON.stringify(buildRealtimeRegistration({
        groupNumber: this.options.groupNumber,
        symbols: this.options.symbols,
        exchange: this.exchange,
        type: this.type,
      })));
      this.retryCount = 0;
      this.setState("ready");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "실시간 연결을 시작하지 못했습니다.";
      if (mustNotRetry(error)) {
        this.setState("failed", detail);
        return;
      }
      this.scheduleRetry(detail);
    }
  }

  stop(): void {
    this.stopped = true;
    if (this.retryTimer) {
      this.cancelSchedule(this.retryTimer);
      this.retryTimer = null;
    }
    if (this.transport) {
      this.transport.send(JSON.stringify(buildRealtimeRemoval({
        groupNumber: this.options.groupNumber,
        symbols: this.options.symbols,
        exchange: this.exchange,
        type: this.type,
      })));
      this.transport.close();
      this.transport = null;
    }
    this.setState("stopped");
  }

  private handleMessage(raw: string): void {
    try {
      const payload = JSON.parse(raw) as Parameters<typeof parseRealtimeTrades>[0];
      for (const trade of parseRealtimeTrades(payload)) this.options.onTrade?.(trade);
    } catch {
      // A malformed transport message must not crash the session or affect order safety.
    }
  }

  private handleClose(): void {
    this.transport = null;
    if (!this.stopped) this.scheduleRetry("키움 실시간 연결이 종료되어 재접속을 대기합니다.");
  }

  private scheduleRetry(detail: string): void {
    if (this.stopped || this.retryTimer) return;
    this.retryCount += 1;
    const delay = Math.min(this.retryBaseMs * 2 ** (this.retryCount - 1), this.retryMaxMs);
    this.setState("retry_wait", detail);
    this.retryTimer = this.schedule(() => {
      this.retryTimer = null;
      void this.start();
    }, delay);
  }

  private setState(state: RealtimeConnectionState, detail?: string): void {
    this.currentState = state;
    this.options.onStateChange?.(state, detail);
  }
}
