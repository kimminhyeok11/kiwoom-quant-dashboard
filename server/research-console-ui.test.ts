import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(resolve(process.cwd(), "client/src/App.tsx"), "utf8");
const topNavSource = readFileSync(resolve(process.cwd(), "client/src/components/ResearchTopNav.tsx"), "utf8");
const datasetsSource = readFileSync(resolve(process.cwd(), "client/src/pages/SharedDatasets.tsx"), "utf8");
const arenaSource = readFileSync(resolve(process.cwd(), "client/src/components/StrategyArenaLab.tsx"), "utf8");
const cardsRouterSource = readFileSync(resolve(process.cwd(), "server/routers/strategyCards.ts"), "utf8");

describe("연구 콘솔 공통 연결·진행·성과 UI", () => {
  it("모든 경로 위에 공통 상단 네비게이션과 동기화된 키움 단말 인증 상태를 제공한다", () => {
    expect(appSource).toContain("<ResearchTopNav/>");
    expect(topNavSource).toContain("VisitorIpBadge");
    expect(topNavSource).toContain("ServerEgressBadge");
    expect(topNavSource).toContain("서버 REST 확인");
    expect(topNavSource).toContain("trpc.quant.verifyOAuthConnection.useMutation");
    expect(topNavSource).toContain("myKiwoomTerminalStatus");
    expect(topNavSource).toContain("키움 단말");
    expect(topNavSource).toContain("등록 IP");
    expect(topNavSource).toContain("check-kiwoom-rest-connection.cmd");
    expect(topNavSource).toContain("myKiwoomTerminalDiagnostics");
    expect(topNavSource).toContain("왜 연결이 안 되는지 추적하기");
    expect(topNavSource).toContain("currentPath");
  });

  it("공용 데이터 수집은 4초 갱신 상태·수집 봉 수·실패 사유를 표시한다", () => {
    expect(datasetsSource).toContain("refetchInterval: 4_000");
    expect(datasetsSource).toContain("collection-progress-panel");
    expect(datasetsSource).toContain("acceptedDailyBarCount");
    expect(datasetsSource).toContain("acceptedFiveMinuteBarCount");
    expect(datasetsSource).toContain("실패 사유");
    expect(datasetsSource).toContain("toast.error(latest.lastError");
  });

  it("카드별 기간 성과는 실제 일별 검증 기록에서 만들고 비교 차트를 표시한다", () => {
    expect(cardsRouterSource).toContain("cardPeriodPerformance");
    expect(cardsRouterSource).toContain("dailyByCandidate.get(candidate.id) ?? []");
    expect(arenaSource).toContain("card-period-comparison");
    expect(arenaSource).toContain("CARD PERIOD COMPARISON");
    expect(arenaSource).toContain("기간별 순수익률");
  });
});
