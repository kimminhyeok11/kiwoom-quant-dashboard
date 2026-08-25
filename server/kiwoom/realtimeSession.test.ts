import { describe, expect, it, vi } from "vitest";
import { KiwoomRealtimeSession, queryHtsConditionList, queryHtsConditionMatches, type RealtimeTransportFactory } from "./realtimeSession";

describe("키움 실시간 세션 경계", () => {
  it("OAuth 성공 뒤에만 0B REG를 전송하고 REAL 체결값을 전달한다", async () => {
    const sent: string[] = [];
    const trades: any[] = [];
    let callbacks: any;
    const createTransport: RealtimeTransportFactory = vi.fn(async input => {
      callbacks = input;
      return { send: message => sent.push(message), close: vi.fn() };
    });
    const session = new KiwoomRealtimeSession({
      mode: "live", groupNumber: 1, symbols: ["005930"], getAccessToken: async () => ({ token: "oauth" }), createTransport,
      onTrade: trade => trades.push(trade),
    });

    await session.start();
    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({ endpoint: "wss://api.kiwoom.com:10000/api/dostk/websocket", accessToken: "oauth" }));
    expect(JSON.parse(sent[0]!)).toEqual({ trnm: "REG", grp_no: "0001", refresh: "1", data: [{ item: "005930", type: "0B" }] });
    callbacks.onMessage(JSON.stringify({ trnm: "REAL", data: [{ item: "005930", type: "0B", values: { "10": "+72000", "13": "100", "14": "3" } }] }));
    expect(trades).toEqual([expect.objectContaining({ symbol: "005930", price: 72_000, cumulativeVolume: 100, cumulativeTurnover: 3_000_000 })]);
    expect(session.state).toBe("ready");
  });

  it("일시 연결 종료는 지수 재접속하고 stop은 REMOVE 후 재접속을 취소한다", async () => {
    const timers: Array<{ callback: () => void; delay: number }> = [];
    const sent: string[] = [];
    let closeCallback: (() => void) | undefined;
    const createTransport: RealtimeTransportFactory = vi.fn(async input => {
      closeCallback = input.onClose;
      return { send: message => sent.push(message), close: vi.fn() };
    });
    const session = new KiwoomRealtimeSession({
      mode: "mock", groupNumber: 2, symbols: ["005930"], getAccessToken: async () => ({ token: "oauth" }), createTransport,
      retryBaseMs: 100, schedule: (callback, delay) => { timers.push({ callback, delay }); return timers.length as any; }, cancelSchedule: vi.fn(),
    });
    await session.start();
    closeCallback?.();
    expect(session.state).toBe("retry_wait");
    expect(timers[0]?.delay).toBe(100);
    timers[0]?.callback();
    await Promise.resolve();
    await Promise.resolve();
    expect(createTransport).toHaveBeenCalledTimes(2);
    session.stop();
    expect(JSON.parse(sent.at(-1)!)).toMatchObject({ trnm: "REMOVE", grp_no: "0002" });
    expect(session.state).toBe("stopped");
  });

  it("8050 지정 단말 오류에서는 재접속하지 않고 failed 상태로 머문다", async () => {
    const schedule = vi.fn();
    const session = new KiwoomRealtimeSession({
      mode: "live", groupNumber: 3, symbols: ["005930"], getAccessToken: async () => { throw new Error("8050:지정단말기 인증에 실패했습니다"); },
      createTransport: vi.fn(), schedule,
    });
    await session.start();
    expect(session.state).toBe("failed");
    expect(schedule).not.toHaveBeenCalled();
  });
});

describe("HTS 저장 조건식 목록 세션", () => {
  it("OAuth 토큰을 transport 경계에만 전달하고 CNSRLST 응답을 정규화한다", async () => {
    let onMessage: ((raw: string) => void) | undefined;
    const send = vi.fn();
    const createTransport: RealtimeTransportFactory = vi.fn(async input => {
      onMessage = input.onMessage;
      return { send, close: vi.fn() };
    });
    const request = queryHtsConditionList({ mode: "live", getAccessToken: async () => ({ token: "oauth-token" }), createTransport });
    await vi.waitFor(() => expect(onMessage).toBeTypeOf("function"));
    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({ endpoint: "wss://api.kiwoom.com:10000/api/dostk/websocket", accessToken: "oauth-token" }));
    expect(send).toHaveBeenCalledWith(JSON.stringify({ trnm: "CNSRLST" }));
    onMessage?.(JSON.stringify({ trnm: "CNSRLST", data: [{ seq: "1", name: "돌파" }] }));
    await expect(request).resolves.toEqual([{ sequence: "1", name: "돌파" }]);
  });

  it("8050 OAuth 실패는 WebSocket 연결을 열지 않고 호출자에게 전달한다", async () => {
    const createTransport: RealtimeTransportFactory = vi.fn();
    await expect(queryHtsConditionList({ mode: "live", getAccessToken: async () => { throw new Error("8050 지정단말 인증 실패"); }, createTransport })).rejects.toThrow("8050");
    expect(createTransport).not.toHaveBeenCalled();
  });

  it("OAuth 성공 뒤에만 CNSRREQ를 전송하고 현재 후보 결과를 정규화한다", async () => {
    let onMessage: ((raw: string) => void) | undefined;
    const send = vi.fn();
    const createTransport: RealtimeTransportFactory = vi.fn(async input => {
      onMessage = input.onMessage;
      return { send, close: vi.fn() };
    });
    const request = queryHtsConditionMatches({ mode: "live", sequence: "7", getAccessToken: async () => ({ token: "oauth-token" }), createTransport });
    await vi.waitFor(() => expect(onMessage).toBeTypeOf("function"));
    expect(send).toHaveBeenCalledWith(JSON.stringify({ trnm: "CNSRREQ", seq: "7", search_type: "0", stex_tp: "K", cont_yn: "N", next_key: "" }));
    onMessage?.(JSON.stringify({ trnm: "CNSRREQ", data: [{ "9001": "A005930", "302": "삼성전자", "10": "+72000", "12": "1250" }] }));
    await expect(request).resolves.toEqual([{ symbol: "005930", name: "삼성전자", price: 72_000, change: null, changeRate: 1.25, cumulativeVolume: null, open: null, high: null, low: null }]);
  });

  it("HTS 현재 후보도 8050 OAuth 실패 시 WebSocket 연결을 열지 않는다", async () => {
    const createTransport: RealtimeTransportFactory = vi.fn();
    await expect(queryHtsConditionMatches({ mode: "live", sequence: "7", getAccessToken: async () => { throw new Error("8050 지정단말 인증 실패"); }, createTransport })).rejects.toThrow("8050");
    expect(createTransport).not.toHaveBeenCalled();
  });
});
