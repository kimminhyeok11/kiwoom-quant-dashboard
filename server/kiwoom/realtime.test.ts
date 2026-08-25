import { describe, expect, it } from "vitest";
import { buildConditionListRequest, buildConditionSearchRequest, buildRealtimeRegistration, buildRealtimeRemoval, getKiwoomRealtimeEndpoint, parseConditionSearchMatches, parseHtsConditionDefinitions, parseRealtimeTrades } from "./realtime";

describe("키움 실시간 0B 계약", () => {
  it("운영·모의 WebSocket 엔드포인트와 공식 REG 등록 메시지를 구성한다", () => {
    expect(getKiwoomRealtimeEndpoint("live")).toBe("wss://api.kiwoom.com:10000/api/dostk/websocket");
    expect(getKiwoomRealtimeEndpoint("mock")).toBe("wss://mockapi.kiwoom.com:10000/api/dostk/websocket");
    expect(buildRealtimeRegistration({ groupNumber: 7, symbols: ["005930", "005930", "039490"], exchange: "NXT", keepExisting: false })).toEqual({
      trnm: "REG", grp_no: "0007", refresh: "0", data: [{ item: "005930_NX", type: "0B" }, { item: "039490_NX", type: "0B" }],
    });
    expect(buildRealtimeRemoval({ groupNumber: "7", symbols: ["005930"], exchange: "SOR" })).toEqual({
      trnm: "REMOVE", grp_no: "0007", data: [{ item: "005930_AL", type: "0B" }],
    });
  });

  it("0B REAL 수신값을 실제 가격·거래량·거래대금 단위로 정규화한다", () => {
    expect(parseRealtimeTrades({ trnm: "REAL", data: [{ item: "005930_NX", type: "0B", values: { "20": "101530", "10": "+72500", "11": "+1000", "12": "+1.40", "15": "+20", "13": "1,234,567", "14": "89,123", "16": "+71000", "17": "+73000", "18": "-70500" } }] }, 123)).toEqual([{
      symbol: "005930", exchange: "NXT", tradeTime: "101530", price: 72_500, change: 1_000, changeRate: 1.4, tradeVolume: 20,
      cumulativeVolume: 1_234_567, cumulativeTurnover: 89_123_000_000, open: 71_000, high: 73_000, low: 70_500, receivedAt: 123,
    }]);
  });

  it("잘못된 등록값과 비실시간 응답을 안전하게 거부한다", () => {
    expect(() => buildRealtimeRegistration({ groupNumber: "x", symbols: ["005930"] })).toThrow("그룹 번호");
    expect(() => buildRealtimeRegistration({ groupNumber: 1, symbols: ["bad"] })).toThrow("6자리");
    expect(parseRealtimeTrades({ trnm: "REG", data: [] })).toEqual([]);
  });

  it("ka10172 조건검색 요청과 0-padding 수신값을 조건 후보로 정규화한다", () => {
    expect(buildConditionSearchRequest({ sequence: 12, exchange: "INTEGRATED", continuation: { enabled: true, nextKey: "page-2" } })).toEqual({
      trnm: "CNSRREQ", seq: "12", search_type: "0", stex_tp: "A", cont_yn: "Y", next_key: "page-2",
    });
    expect(parseConditionSearchMatches({ trnm: "CNSRREQ", data: [{ "9001": "A005930", "302": "삼성전자", "10": "+000071000", "11": "+000001000", "12": "00001430", "13": "000001200", "16": "+000070000", "17": "+000072000", "18": "-000069500" }] })).toEqual([{
      symbol: "005930", name: "삼성전자", price: 71_000, change: 1_000, changeRate: 1.43, cumulativeVolume: 1_200, open: 70_000, high: 72_000, low: 69_500,
    }]);
    expect(() => buildConditionSearchRequest({ sequence: "bad" })).toThrow("일련번호");
  });

  it("HTS 저장 조건식 목록의 CNSRLST 메시지와 seq·name 응답을 정규화한다", () => {
    expect(buildConditionListRequest()).toEqual({ trnm: "CNSRLST" });
    expect(parseHtsConditionDefinitions({ trnm: "CNSRLST", data: [{ seq: "001", name: "거래량 돌파" }, { seq: 23, name: "이평 정배열" }, { seq: "bad", name: "제외" }] })).toEqual([
      { sequence: "001", name: "거래량 돌파" },
      { sequence: "23", name: "이평 정배열" },
    ]);
    expect(() => parseHtsConditionDefinitions({ return_code: 3, return_msg: "OAuth 인증 실패" })).toThrow("OAuth 인증 실패");
  });
});
