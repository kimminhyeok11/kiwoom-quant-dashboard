import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const researchQuery = vi.hoisted(() => ({ current: { data: null, error: null } as any }));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    minuteResearch: {
      publicDashboard: { useQuery: () => researchQuery.current },
    },
  },
}));

vi.mock("@/components/PublicMarketNav", () => ({
  PublicMarketNav: () => <nav aria-label="공개 시장 메뉴">연구</nav>,
}));

import PublicMinuteResearchDashboard from "./PublicMinuteResearchDashboard";

const baseData = {
  program: null,
  sweeps: [],
  promoted: [],
  cumulative: [],
  distribution: null,
  failureReasons: [],
  regimePerformance: [],
  symbolPerformance: [],
  dataCoverage: null,
};

describe("PublicMinuteResearchDashboard", () => {
  beforeEach(() => { researchQuery.current = { data: null, error: null }; });

  it("원본과 통과 조건식이 없을 때 빈 상태를 명확히 표시한다", () => {
    researchQuery.current = { data: baseData, error: null };
    const markup = renderToStaticMarkup(<PublicMinuteResearchDashboard />);

    expect(markup).toContain("0일");
    expect(markup).toContain("아직 생존 조건식이 없습니다.");
    expect(markup).toContain("예시 성과나 가짜 통과 조건식은 표시하지 않습니다.");
    expect(markup).toContain('href="/datasets"');
    expect(markup).toContain("원본 준비로 이동");
  });

  it("저장된 스윕 성공 상태의 누적 조건식과 성과를 렌더링한다", () => {
    researchQuery.current = { data: {
      ...baseData,
      program: { id: 1, name: "매일 연구", status: "active", cronExpression: "0 30 7 * * 1-5" },
      sweeps: [{ id: 11, generatedCount: 3000, promotedCount: 3, rejectedCount: 2997, summaryJson: { trainingDates: ["2026-08-01", "2026-08-02"], validationDates: ["2026-08-03"], symbolCount: 20 } }],
      dataCoverage: { tradingDateCount: 3, firstDate: "2026-08-01", lastDate: "2026-08-03" },
      cumulative: [{ strategyFingerprint: "strategy-a", verifiedSweepCount: 2, totalValidationTrades: 42, averageValidationReturnPercent: 1.25, worstValidationMaxDrawdownPercent: -0.7, representative: { rootGenomeJson: { logic: "AND", children: [{}, {}] } } }],
    }, error: null };
    const markup = renderToStaticMarkup(<PublicMinuteResearchDashboard />);

    expect(markup).toContain("3일");
    expect(markup).toContain("3,000");
    expect(markup).toContain("AND · 규칙 2개");
    expect(markup).toContain("+1.25%");
    expect(markup).toContain('href="/"');
    expect(markup).toContain("게임 진입에서 배틀 준비");
  });

  it("조회 오류가 있어도 임의 성과를 만들지 않고 대기 구조를 유지한다", () => {
    researchQuery.current = { data: undefined, error: new Error("조회 실패") };
    const markup = renderToStaticMarkup(<PublicMinuteResearchDashboard />);

    expect(markup).toContain("원본을 기다리고 있습니다.");
    expect(markup).toContain("아직 생존 조건식이 없습니다.");
  });
});
