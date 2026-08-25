import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(fileURLToPath(new URL("./DayTradingExperimentPanel.tsx", import.meta.url)), "utf8");

describe("DayTradingExperimentPanel", () => {
  it("생존 조건식의 저장된 실제 시세 모의 진입·평가·청산 값을 표시한다", () => {
    expect(source).toContain("candidate.simulationJson");
    expect(source).toContain("모의 진입");
    expect(source).toContain("현재 실제 가격");
    expect(source).toContain("마감 모의 청산");
    expect(source).toContain("entry.evidence.details");
  });

  it("종목명·축약 없는 조건식·실제 1분봉의 진입 및 청산 시점을 함께 표시한다", () => {
    expect(source).toContain("getKrxSymbolName");
    expect(source).toContain("전체 조건식 보기 · 축약 없음");
    expect(source).toContain("FullRuleTree");
    expect(source).toContain("DayTradePriceChart");
    expect(source).toContain("모의 진입과 청산 시점");
    expect(source).toContain("dayTradePositionDetail");
    expect(source).toContain("키움 ka10080 실제 1분봉");
  });

  it("실제 주문 생성·전송 없이 저장된 실험 기록만 조회한다", () => {
    expect(source).toContain("장중 관찰만으로 매수나 모의 진입은 만들지 않습니다.");
    expect(source).toContain("실주문·체결이 아니며");
    expect(source).not.toContain("orders.createFromResearchObservation");
    expect(source).not.toContain("orders.transmit");
    expect(source).toContain("refetchInterval: 15_000");
  });

  it("일시적인 게이트웨이 오류와 누락 응답에는 조회 재시도 정책을 사용한다", () => {
    expect(source).toContain("retryTransientQuery");
    expect(source).toContain("retry: 2");
  });
});
