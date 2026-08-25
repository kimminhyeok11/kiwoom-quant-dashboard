// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

Object.defineProperties(HTMLElement.prototype, { hasPointerCapture: { configurable: true, value: () => false }, setPointerCapture: { configurable: true, value: () => undefined }, releasePointerCapture: { configurable: true, value: () => undefined }, scrollIntoView: { configurable: true, value: () => undefined } });
const state = vi.hoisted(() => ({ runWalkForward: vi.fn() }));
vi.mock("../client/src/lib/trpc", () => ({ trpc: { research: {
  listEvolutionSearches: { useQuery: () => ({ data: [{ id: 71, name: "모멘텀 세대", randomSeed: 20260814 }], isLoading: false, error: null }) },
  listEvolutionCandidates: { useQuery: () => ({ data: [{ id: 55, fingerprint: "abcdeffedcba012345", origin: "mutation", status: "survived", minimumScore: 45, fitnessScore: "18.42", parentCandidateIdsJson: [12], mutationJson: { key: "threshold", previous: 30, next: 35 }, rootGenomeJson: { id: "root", logic: "AND", enabled: true, children: [{ id: "rsi", type: "rsi", enabled: true, weight: 15, config: { period: 14, threshold: 35, comparator: "이상" } }] }, inSampleMetricsJson: { datasetVersionKey: "krx-daily-r1", symbol: "005930", metrics: { totalReturn: 12.4, winRate: 55.5, tradeCount: 8, maxDrawdown: -4.2 } } }], isLoading: false, error: null }) },
  validateEvolutionCandidate: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) },
  runEvolutionCandidateWalkForward: { useMutation: () => ({ isPending: false, mutate: state.runWalkForward }) },
} } }));
import { EvolutionCandidateDetailPanel } from "../client/src/pages/Home";

describe("유전자 상세 검토 패널", () => {
  afterEach(() => cleanup()); beforeEach(() => state.runWalkForward.mockReset());
  it("선택한 생존 유전자의 규칙 트리·부모·변이·고정 데이터셋 성과를 표시한다", () => {
    render(React.createElement(EvolutionCandidateDetailPanel));
    fireEvent.click(screen.getByText("탐색 선택")); fireEvent.click(screen.getByText("모멘텀 세대 · seed 20260814"));
    fireEvent.click(screen.getByText("후보 선택")); fireEvent.click(screen.getByText(/abcdeffedcba · mutation · survived/));
    expect(screen.getByText("RSI")).toBeTruthy(); expect(screen.getByText(/period=14 · threshold=35 · comparator=이상/)).toBeTruthy();
    expect(screen.getByText("12")).toBeTruthy(); expect(screen.getByText(/krx-daily-r1 · 005930/)).toBeTruthy(); expect(screen.getByText("12.40%")).toBeTruthy();
  });

  it("상위 후보 상세 검토 이벤트가 탐색과 후보를 자동 선택한다", () => {
    render(React.createElement(EvolutionCandidateDetailPanel));
    fireEvent(window, new CustomEvent("open-evolution-candidate-detail", { detail: { searchId: 71, candidateId: 55 } }));
    expect(screen.getByText("RSI")).toBeTruthy();
    expect(document.getElementById("evolution-candidate-detail")).toBeTruthy();
  });

  it("생존 유전자의 반복 워크포워드 분할을 요청한다", () => {
    render(React.createElement(EvolutionCandidateDetailPanel));
    fireEvent.click(screen.getByText("탐색 선택")); fireEvent.click(screen.getByText("모멘텀 세대 · seed 20260814"));
    fireEvent.click(screen.getByText("후보 선택")); fireEvent.click(screen.getByText(/abcdeffedcba · mutation · survived/));
    fireEvent.click(screen.getByRole("button", { name: "워크포워드 실행" }));
    expect(state.runWalkForward).toHaveBeenCalledWith({ candidateId: 55, symbol: "005930", trainingDays: 120, validationDays: 40, stepDays: 20 });
  });
});
