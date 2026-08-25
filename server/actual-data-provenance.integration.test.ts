import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dashboardSource = readFileSync(new URL("../client/src/pages/PublicDashboard.tsx", import.meta.url), "utf8");
const scheduledResearchSource = readFileSync(new URL("./scheduled/autonomousResearch.ts", import.meta.url), "utf8");
const publicBacktestSource = readFileSync(new URL("./quant/publicHistoricalBacktest.ts", import.meta.url), "utf8");

describe("실제 시장 데이터 출처 경계", () => {
  it("공개 화면은 장중 결과를 가상 모의가 아닌 실제 가격 관찰로 표시한다", () => {
    expect(dashboardSource).toContain('intraday: "장중 실제 가격 관찰"');
    expect(dashboardSource).not.toContain('intraday: "장중 모의 추적"');
  });

  it("자동 연구·공개 백테스트 원본은 키움 실시간 순위와 일봉으로만 기록한다", () => {
    expect(scheduledResearchSource).toContain('source: "kiwoom_ka10032"');
    expect(scheduledResearchSource).toContain('source: "kiwoom_ka10081"');
    expect(publicBacktestSource).toContain('source: "kiwoom_ka10081_historical"');
    expect(publicBacktestSource).not.toContain("mockDailyBars");
  });
});
