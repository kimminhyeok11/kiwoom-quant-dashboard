// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../client/src/lib/trpc", () => ({
  trpc: { research: {
    listExperiments: { useQuery: () => ({ data: [{ id: 44, name: "모멘텀 OOS", status: "completed", resultsJson: { datasetVersionKey: "krx-daily-r1", symbol: "005930", result: { totalReturn: 12.34, winRate: 55.5, tradeCount: 8, maxDrawdown: -4.1 } } }], isLoading: false, error: null }) },
    listWalkForwardRuns: { useQuery: () => ({ data: [{ id: 91, status: "completed", resultsJson: { datasetVersionKey: "krx-daily-r1", symbol: "005930", result: { foldCount: 3, totalReturn: 8.76, winRate: 52.5, tradeCount: 9, worstFoldDrawdown: -5.2 } } }], isLoading: false, error: null }) },
  } },
}));
import { ResearchComparisonPanel } from "../client/src/pages/Home";

describe("리서치 성과 비교 패널", () => {
  afterEach(() => cleanup());
  it("동일하게 기록된 단일 실험과 워크포워드 성과·데이터셋 버전을 표시한다", () => {
    render(React.createElement(ResearchComparisonPanel));
    expect(screen.getByText("모멘텀 OOS")).toBeTruthy(); expect(screen.getByText("워크포워드 #91")).toBeTruthy();
    expect(screen.getAllByText("005930 · krx-daily-r1")).toHaveLength(2); expect(screen.getByText("12.34%")).toBeTruthy(); expect(screen.getByText("8.76%")).toBeTruthy();
  });
});
