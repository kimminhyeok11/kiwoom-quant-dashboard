// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ create: vi.fn(), execute: vi.fn(), refetch: vi.fn() }));
vi.mock("../client/src/lib/trpc", () => ({
  trpc: { research: {
    listExperiments: { useQuery: () => ({ data: [{ id: 44, name: "모멘텀 OOS" }], isLoading: false, error: null, refetch: vi.fn() }) },
    listWalkForwardRuns: { useQuery: () => ({ data: [{ id: 91, status: "queued" }], isLoading: false, error: null, refetch: state.refetch }) },
    createWalkForwardRun: { useMutation: () => ({ isPending: false, mutate: state.create }) },
    runWalkForward: { useMutation: () => ({ isPending: false, data: null, mutate: state.execute }) },
  } },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { WalkForwardPanel } from "../client/src/pages/Home";

describe("워크포워드 패널", () => {
  beforeEach(() => { state.create.mockReset(); state.execute.mockReset(); }); afterEach(() => cleanup());
  it("실험 명세·학습/검증/이동 기간을 저장하고 선택한 실행 기록을 고정 종목으로 실행한다", () => {
    render(React.createElement(WalkForwardPanel));
    const selects = screen.getAllByRole("combobox");
    fireEvent.click(selects[0] as HTMLElement); fireEvent.click(screen.getByText("모멘텀 OOS"));
    fireEvent.click(screen.getByRole("button", { name: "실행 계획 저장" }));
    expect(state.create).toHaveBeenCalledWith({ experimentId: 44, trainingDays: 252, validationDays: 63, stepDays: 63 });
    fireEvent.click(selects[1] as HTMLElement); fireEvent.click(screen.getByText("#91 · queued"));
    fireEvent.click(screen.getByRole("button", { name: "워크포워드 실행" }));
    expect(state.execute).toHaveBeenCalledWith({ walkForwardRunId: 91, symbol: "005930", minScore: 70 });
  });
});
