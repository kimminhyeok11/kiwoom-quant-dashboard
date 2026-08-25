// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

Object.defineProperties(HTMLElement.prototype, {
  hasPointerCapture: { configurable: true, value: () => false },
  setPointerCapture: { configurable: true, value: () => undefined },
  releasePointerCapture: { configurable: true, value: () => undefined },
  scrollIntoView: { configurable: true, value: () => undefined },
});

const state = vi.hoisted(() => ({
  runError: null as Error | null,
  runInput: null as Record<string, unknown> | null,
  invalidate: vi.fn(),
  dailyBarsQuery: vi.fn(),
  runMutation: vi.fn(),
  results: [] as Array<Record<string, unknown>>,
  resultListeners: new Set<() => void>(),
}));

const bars = Array.from({ length: 60 }, (_, index) => ({
  date: `2026${String(index + 1).padStart(2, "0")}01`, open: 70_000 + index, high: 71_000 + index, low: 69_000 + index,
  close: 70_500 + index, volume: 1_000 + index, turnover: 80_000_000 + index,
}));

vi.mock("../client/src/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ backtests: { list: { invalidate: () => { state.invalidate(); state.resultListeners.forEach(listener => listener()); } } } }),
    presets: { list: { useQuery: () => ({ data: [{ id: 1, name: "실데이터 전략", description: "통합 테스트 프리셋" }], isLoading: false, error: null, refetch: vi.fn() }) } },
    backtests: {
      list: { useQuery: () => {
        const [, setVersion] = React.useState(0);
        React.useEffect(() => { const refresh = () => setVersion(version => version + 1); state.resultListeners.add(refresh); return () => state.resultListeners.delete(refresh); }, []);
        return { data: state.results, isLoading: false, error: null, refetch: vi.fn() };
      } },
      run: { useMutation: (options: { onSuccess?: () => void; onError?: (error: Error) => void }) => ({ isPending: false, mutate: (input: Record<string, unknown>) => { state.runInput = input; state.runMutation(input); if (state.runError) options.onError?.(state.runError); else { state.results = [{ id: 91, presetId: 1, status: "completed", startDate: "20260101", endDate: "20260301", totalReturn: "12.340", winRate: "55.50", tradeCount: 8, maxDrawdown: "-4.100" }]; options.onSuccess?.(); } } }) },
    },
    quant: { dailyBars: { useQuery: (input: Record<string, unknown>, options: Record<string, unknown>) => { state.dailyBarsQuery(input, options); return { data: { bars }, isLoading: false, error: null }; } } },
    research: {
      listDatasets: { useQuery: () => ({ data: [], isLoading: false, error: null, refetch: vi.fn() }) },
      createDataset: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) },
      listExperiments: { useQuery: () => ({ data: [], isLoading: false, error: null, refetch: vi.fn() }) },
      collectDataset: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) },
      runExperiment: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) },
      listWalkForwardRuns: { useQuery: () => ({ data: [], isLoading: false, error: null, refetch: vi.fn() }) },
      createWalkForwardRun: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) },
      runWalkForward: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) },
      listEvolutionSearches: { useQuery: () => ({ data: [], isLoading: false, error: null, refetch: vi.fn() }) },
      listEvolutionGenerations: { useQuery: () => ({ data: [], isLoading: false, error: null, refetch: vi.fn() }) },
      listEvolutionGenerationSummaries: { useQuery: () => ({ data: [], isLoading: false, error: null, refetch: vi.fn() }) },
      listEvolutionCandidates: { useQuery: () => ({ data: [], isLoading: false, error: null, refetch: vi.fn() }) },
      createEvolutionSearch: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) },
      evaluateEvolutionCandidate: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) },
      validateEvolutionCandidate: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) },
      runEvolutionCandidateWalkForward: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) },
      manuallyExpandEvolutionCandidate: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) },
      advanceEvolutionGeneration: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) },
    },
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));

import { Backtest } from "../client/src/pages/Home";
import { toast } from "sonner";

describe("Backtest 컴포넌트 통합 흐름", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    state.runError = null; state.runInput = null;
    state.results = [];
    state.resultListeners.clear();
    state.invalidate.mockReset(); state.dailyBarsQuery.mockReset(); state.runMutation.mockReset();
    vi.mocked(toast.success).mockReset(); vi.mocked(toast.error).mockReset();
  });

  async function selectPreset() {
    const user = userEvent.setup();
    await user.click(screen.getAllByRole("combobox").at(-1) as HTMLElement);
    await user.click(await screen.findByText("실데이터 전략"));
  }

  it("프리셋 선택 후 실제 일봉으로 리서치 백테스트를 실행하고 저장 결과를 갱신한다", async () => {
    render(React.createElement(Backtest));
    await selectPreset();
    await waitFor(() => expect(state.dailyBarsQuery).toHaveBeenLastCalledWith({ symbol: "005930", maxPages: 3 }, expect.objectContaining({ enabled: true })));
    fireEvent.click(screen.getByRole("button", { name: "리서치 백테스트 실행" }));
    expect(state.runInput).toMatchObject({ presetId: 1, bars, initialCapital: 10_000_000, holdingDays: 5, minScore: 70, feeRate: 0.00015 });
    expect(state.invalidate).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith("실데이터 백테스트 결과를 저장했습니다.");
    expect(await screen.findByText("20260101 ~ 20260301")).toBeTruthy();
    expect(screen.getByText("12.340%")).toBeTruthy();
  });

  it("실행 실패 후 오류를 알리고 실행 버튼을 다시 사용할 수 있다", async () => {
    state.runError = new Error("일봉 데이터가 부족합니다.");
    render(React.createElement(Backtest));
    await selectPreset();
    const button = screen.getByRole("button", { name: "리서치 백테스트 실행" });
    expect((button as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(button);
    expect(toast.error).toHaveBeenCalledWith("일봉 데이터가 부족합니다.");
    expect((screen.getByRole("button", { name: "리서치 백테스트 실행" }) as HTMLButtonElement).disabled).toBe(false);
  });
});
