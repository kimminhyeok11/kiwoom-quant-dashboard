// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

Object.defineProperties(HTMLElement.prototype, { hasPointerCapture: { configurable: true, value: () => false }, setPointerCapture: { configurable: true, value: () => undefined }, releasePointerCapture: { configurable: true, value: () => undefined }, scrollIntoView: { configurable: true, value: () => undefined } });
const state = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("../client/src/lib/trpc", () => ({
  trpc: { research: {
    listDatasets: { useQuery: () => ({ data: [{ id: 8, name: "KOSPI 원본", versionKey: "krx-daily-r1", qualityStatus: "ready", barCount: 920 }], isLoading: false, error: null }) },
    listEvolutionSearches: { useQuery: () => ({ data: [], isLoading: false, error: null, refetch: vi.fn() }) },
    listEvolutionGenerations: { useQuery: () => ({ data: [], isLoading: false, error: null, refetch: vi.fn() }) },
    listEvolutionGenerationSummaries: { useQuery: () => ({ data: [], isLoading: false, error: null, refetch: vi.fn() }) },
    listEvolutionCandidates: { useQuery: () => ({ data: [], isLoading: false, error: null, refetch: vi.fn() }) },
    createEvolutionSearch: { useMutation: () => ({ isPending: false, mutate: state.create }) },
    evaluateEvolutionCandidate: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) },
    advanceEvolutionGeneration: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) },
  } },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { EvolutionSearchPanel } from "../client/src/pages/Home";

describe("진화형 조건식 탐색 패널", () => {
  beforeEach(() => state.create.mockReset()); afterEach(() => cleanup());
  it("ready 실제 데이터셋에서만 고차원 조건식 첫 세대 생성을 요청한다", () => {
    render(React.createElement(EvolutionSearchPanel));
    fireEvent.click(screen.getByText("데이터셋 선택")); fireEvent.click(screen.getByText("KOSPI 원본 · krx-daily-r1 · ready"));
    fireEvent.change(screen.getByLabelText("후보 수"), { target: { value: "50" } });
    fireEvent.click(screen.getByRole("button", { name: "첫 세대 생성" }));
    expect(state.create).toHaveBeenCalledWith(expect.objectContaining({ datasetId: 8, name: "고차원 조건식 세대 탐색", configuration: expect.objectContaining({ populationSize: 50, minRules: 10, maxRules: 16, informationCutoffTradingDays: 1, entryTiming: "next_open", allowedRuleTypes: expect.arrayContaining(["rsi", "bollinger", "stochastic", "atr_percent", "volume_ratio"]) }) }));
  });
});
