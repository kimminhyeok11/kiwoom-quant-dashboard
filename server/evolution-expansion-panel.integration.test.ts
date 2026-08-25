// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

Object.defineProperties(HTMLElement.prototype, { hasPointerCapture: { configurable: true, value: () => false }, setPointerCapture: { configurable: true, value: () => undefined }, releasePointerCapture: { configurable: true, value: () => undefined } });
const state = vi.hoisted(() => ({ expand: vi.fn() }));
vi.mock("../client/src/lib/trpc", () => ({ trpc: { research: {
  listEvolutionSearches: { useQuery: () => ({ data: [{ id: 71, name: "모멘텀 세대", randomSeed: 20260814 }], isLoading: false, error: null }) },
  listEvolutionCandidates: { useQuery: () => ({ data: [{ id: 55, fingerprint: "abcdeffedcba012345", status: "survived", fitnessScore: "18.42", rootGenomeJson: { id: "root", logic: "AND", enabled: true, children: [{ id: "rsi", type: "rsi", enabled: true, weight: 10, config: { period: 14, threshold: 35, comparator: "이상" } }] } }], isLoading: false, error: null, refetch: vi.fn() }) },
  manuallyExpandEvolutionCandidate: { useMutation: () => ({ isPending: false, mutate: state.expand }) },
} } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { EvolutionExpansionPanel } from "../client/src/pages/Home";

describe("생존 유전자 확장 실험 패널", () => {
  beforeEach(() => state.expand.mockReset()); afterEach(() => cleanup());
  it("생존 부모의 숫자형 규칙 파라미터만 선택해 파생 유전자 생성을 요청한다", () => {
    render(React.createElement(EvolutionExpansionPanel));
    fireEvent.click(screen.getByText("탐색 선택")); fireEvent.click(screen.getByText("모멘텀 세대 · seed 20260814"));
    fireEvent.click(screen.getByText("생존 후보 선택")); fireEvent.click(screen.getByText(/abcdeffedcba · fitness 18.42/));
    fireEvent.click(screen.getByText("변경 대상 선택")); fireEvent.click(screen.getByText("rsi · threshold (35)"));
    fireEvent.change(screen.getByLabelText("파생 값"), { target: { value: "40" } });
    fireEvent.click(screen.getByRole("button", { name: "확장 유전자 생성" }));
    expect(state.expand).toHaveBeenCalledWith({ candidateId: 55, change: { kind: "rule_numeric", targetNodeId: "rsi", key: "threshold", next: 40 } });
  });
});
