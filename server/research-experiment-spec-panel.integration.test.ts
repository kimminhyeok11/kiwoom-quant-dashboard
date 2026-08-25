// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ mutate: vi.fn(), refetch: vi.fn() }));
vi.mock("../client/src/lib/trpc", () => ({
  trpc: { research: {
    listDatasets: { useQuery: () => ({ data: [{ id: 11, name: "KOSPI", versionKey: "krx-daily-r1", qualityStatus: "draft" }], isLoading: false, error: null, refetch: vi.fn() }) },
    listExperiments: { useQuery: () => ({ data: [], isLoading: false, error: null, refetch: state.refetch }) },
    createExperiment: { useMutation: () => ({ isPending: false, mutate: state.mutate }) },
  } },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { ResearchExperimentSpecPanel } from "../client/src/pages/Home";

describe("리서치 실험 명세 패널", () => {
  beforeEach(() => state.mutate.mockReset()); afterEach(() => cleanup());
  it("선택 조건식과 데이터셋 버전, 기간 분할, 비용 가정을 하나의 명세로 저장한다", () => {
    render(React.createElement(ResearchExperimentSpecPanel, { presetId: 7, presetName: "모멘텀 전략" }));
    fireEvent.change(screen.getByLabelText("실험 이름"), { target: { value: "모멘텀 OOS" } });
    fireEvent.change(screen.getByLabelText("조건식 버전 라벨"), { target: { value: "momentum-v2" } });
    fireEvent.click(screen.getByText("데이터셋 선택")); fireEvent.click(screen.getByText("KOSPI · krx-daily-r1"));
    fireEvent.change(screen.getByLabelText("학습 시작일"), { target: { value: "2020-01-02" } }); fireEvent.change(screen.getByLabelText("학습 종료일"), { target: { value: "2022-12-30" } }); fireEvent.change(screen.getByLabelText("검증 시작일"), { target: { value: "2023-01-02" } }); fireEvent.change(screen.getByLabelText("검증 종료일"), { target: { value: "2024-12-30" } });
    fireEvent.click(screen.getByRole("button", { name: "실험 명세 저장" }));
    expect(state.mutate).toHaveBeenCalledWith(expect.objectContaining({ datasetId: 11, presetId: 7, datasetVersionKey: "krx-daily-r1", strategyVersionLabel: "momentum-v2", informationCutoffTradingDays: 1, training: { startDate: "2020-01-02", endDate: "2022-12-30" }, validation: { startDate: "2023-01-02", endDate: "2024-12-30" }, assumptions: expect.objectContaining({ entryTiming: "next_open", feeRate: 0.00015, slippageBps: 10 }) }));
  });
});
