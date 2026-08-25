// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ collect: vi.fn(), run: vi.fn() }));
vi.mock("../client/src/lib/trpc", () => ({
  trpc: { research: {
    listDatasets: { useQuery: () => ({ data: [{ id: 8, name: "KOSPI", versionKey: "krx-daily-r1", startDate: "2020-01-02", endDate: "2025-12-30", barCount: 600, qualityStatus: "ready" }], isLoading: false, error: null, refetch: vi.fn() }) },
    listExperiments: { useQuery: () => ({ data: [{ id: 44, datasetId: 8, name: "모멘텀 OOS", status: "draft" }], isLoading: false, error: null, refetch: vi.fn() }) },
    collectDataset: { useMutation: () => ({ isPending: false, mutate: state.collect }) },
    runExperiment: { useMutation: () => ({ isPending: false, data: null, mutate: state.run }) },
  } },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { ResearchExecutionPanel } from "../client/src/pages/Home";

describe("고정 데이터셋 실험 실행 패널", () => {
  beforeEach(() => { state.collect.mockReset(); state.run.mockReset(); }); afterEach(() => cleanup());
  it("저장 실험을 선택하면 ready 데이터셋에서만 같은 종목으로 실행한다", () => {
    render(React.createElement(ResearchExecutionPanel));
    fireEvent.click(screen.getByText("실험 명세 선택")); fireEvent.click(screen.getByText("모멘텀 OOS · draft"));
    fireEvent.click(screen.getByRole("button", { name: "고정 데이터셋 실행" }));
    expect(state.run).toHaveBeenCalledWith({ experimentId: 44, symbol: "005930", initialCapital: 10_000_000, minScore: 70 });
    expect(screen.getByText("KOSPI · krx-daily-r1")).toBeTruthy();
  });
});
