import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const intradaySource = readFileSync(fileURLToPath(new URL("./PublicIntradayMonitor.tsx", import.meta.url)), "utf8");
const navSource = readFileSync(fileURLToPath(new URL("../components/PublicMarketNav.tsx", import.meta.url)), "utf8");
const policySource = readFileSync(fileURLToPath(new URL("../../../server/quant/autonomousResearch.ts", import.meta.url)), "utf8");
const routerSource = readFileSync(fileURLToPath(new URL("../../../server/routers/autonomousResearch.ts", import.meta.url)), "utf8");

describe("공개 장중 실시간 성과 모니터 계약", () => {
  it("명시적으로 열린 상태를 관리하는 공개 햄버거와 장중 성과 경로를 제공한다", () => {
    expect(navSource).toContain("const [open, setOpen] = useState(false)");
    expect(navSource).toContain('path: "/intraday"');
    expect(navSource).toContain('aria-expanded={open}');
  });

  it("실제 시세 기반 데이트레이드 기록·모의 주문 운영 상태·조건식별 누적 성과를 15초마다 조회한다", () => {
    expect(intradaySource).toContain("DayTradingExperimentPanel");
    expect(intradaySource).toContain("dayTradeHistory.useQuery");
    expect(intradaySource).toContain("refetchInterval: 15_000");
    expect(intradaySource).toContain("조건식별 누적 장중 성과");
    expect(intradaySource).toContain("mockOrderOperationStatus.useQuery");
    expect(intradaySource).toContain("다종목 모의 주문 계획");
    expect(intradaySource).toContain("모의투자 주문은 로컬 지정 IP 실행기에서만 전송");
  });

  it("일시적인 5xx 또는 서버 재시작 응답에는 조회 재시도 정책을 적용한다", () => {
    expect(intradaySource).toContain("retryTransientQuery");
    expect(intradaySource).toContain("retry: 2");
  });

  it("장중 실제 가격 수집 버킷을 1분으로 둔다", () => {
    expect(policySource).toContain("intradayIntervalMinutes: 1");
  });

  it("최근 로컬 시세 수집의 성공·부분 실패·실패 이력을 최신성 상태와 함께 표시한다", () => {
    expect(intradaySource).toContain("latestSyncEvent");
    expect(intradaySource).toContain("로컬 수집 성공");
    expect(intradaySource).toContain("일부 종목 수집 실패");
    expect(intradaySource).toContain("로컬 수집 실패");
  });

  it("저장된 실제 1분봉만 사용해 다음 봉 진입·손절 우선 체결을 검증하는 결과를 표시한다", () => {
    expect(intradaySource).toContain("minuteValidationHistory.useQuery");
    expect(intradaySource).toContain("당일 1분봉 조건식 검증");
    expect(intradaySource).toContain("다음 완결 1분봉 시가에 진입");
    expect(intradaySource).toContain("손절을 우선");
  });

  it("사용자가 로컬 지정 IP의 실제 1분봉 수집을 즉시 요청하고 완료·실패 상태를 확인할 수 있다", () => {
    expect(intradaySource).toContain("requestMinuteCollection.useMutation");
    expect(intradaySource).toContain("minuteCollectionStatus.useQuery");
    expect(intradaySource).toContain("지금 1분봉 조회");
    expect(intradaySource).toContain("최근 1분봉 수집 완료");
    expect(intradaySource).toContain("최근 1분봉 수집 실패");
  });

  it("실제 1분봉으로 평가한 데이트레이딩 조건식의 학습·관찰·생존·탈락 선발 상태를 표시한다", () => {
    expect(intradaySource).toContain("DAY-TRADE AUTO SELECTION");
    expect(intradaySource).toContain("실제 1분봉 기반 자동 평가·선발");
    expect(intradaySource).toContain("minuteSelection?.survivingCandidateCount");
    expect(intradaySource).toContain("분 단위 상태");
  });

  it("장 마감 뒤에는 마지막 실제 가격의 청산 성과를 보존하고 새 주문·분봉 수집 후보를 중단한다", () => {
    expect(routerSource).toContain('experiment.status === "closed" ? "market_closed"');
    expect(routerSource).toContain('selectedOrders: experiment?.status === "tracking"');
    expect(intradaySource).toContain("장 마감 · 최종 가격 확정");
    expect(intradaySource).toContain("장 마감 · 최종 청산 확정");
    expect(intradaySource).toContain("장 마감 · 수집 종료");
    expect(intradaySource).toContain("당일 청산 확정 순손익");
  });

  it("로컬 실행기가 동기화한 당일 모의 주문·체결 이력과 이력 없음 상태를 실제 저장 기록으로 표시한다", () => {
    expect(routerSource).toContain("recentExecutions");
    expect(routerSource).toContain('eq(orderIntents.executionOrigin, "local_node")');
    expect(routerSource).toContain("auto:${tradingDate}:%");
    expect(intradaySource).toContain("MOCK ORDER EXECUTION HISTORY");
    expect(intradaySource).toContain("당일 모의 주문·체결 이력");
    expect(intradaySource).toContain("아직 로컬 실행기에서 동기화된 모의 주문·체결 이력이 없습니다.");
  });
});
