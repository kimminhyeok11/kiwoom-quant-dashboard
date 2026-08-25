// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ error: null as Error | null, detailError: null as Error | null, detailData: null as any, evaluationData: null as any, evaluateInput: null as any, detailRefetch: vi.fn(), refetch: vi.fn() }));
const preset = { id: 7, name: "근거 확인 전략", rulesJson: [{ id: "high", type: "high_return", enabled: true, weight: 35, config: { days: 11, minPercent: 20, comparator: "이상" } }], scoringJson: { id: "root", logic: "AND", enabled: true, children: [{ id: "high", type: "high_return", enabled: true, weight: 35, config: { days: 11, minPercent: 20, comparator: "이상" } }] } };
const result = { preset, symbol: "005930", source: "ka10081", latestDate: "20260812", barCount: 60, result: { eligible: true, score: 35, evaluations: [{ ruleId: "high", matched: true, score: 35, detail: "11일 고저 변동률 22.00% 이상 20%", actual: 22, expected: 20, comparator: "이상" }] } };

vi.mock("../client/src/lib/trpc", () => ({
  trpc: {
    presets: { detail: { useQuery: () => ({ data: state.detailError ? null : (state.detailData ?? preset), error: state.detailError, refetch: state.detailRefetch }) } },
    quant: { evaluatePreset: { useQuery: (input: any) => { state.evaluateInput = input; return { data: state.error ? null : (state.evaluationData ?? result), error: state.error, isFetching: false, refetch: state.refetch }; } } },
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));

import { PresetEvidencePanel } from "../client/src/pages/Home";

describe("조건식 상세 평가 근거 패널", () => {
  afterEach(() => { cleanup(); state.error = null; state.detailError = null; state.detailData = null; state.evaluationData = null; state.evaluateInput = null; state.refetch.mockClear(); state.detailRefetch.mockClear(); });
  it("저장 규칙·논리 그룹과 실제 일봉의 실측·기대값 근거를 표시한다", async () => {
    render(React.createElement(PresetEvidencePanel, { presetId: 7, presetName: "근거 확인 전략" }));
    expect(await screen.findByText("근거 확인 전략")).toBeTruthy();
    expect(screen.getByText("저장된 논리 구조")).toBeTruthy();
    expect(screen.getByText("11일 고저 변동률 22.00% 이상 20%")).toBeTruthy();
    expect(screen.getByText("실측 22 · 기준 20 · 이상")).toBeTruthy();
    expect(screen.getByText("조건 충족 · 35.0점")).toBeTruthy();
  });
  it("상세 조회한 프리셋 ID와 rulesJson·scoringJson을 같은 재평가 결과 흐름에 연결한다", async () => {
    const roundTripPreset = { id: 9, name: "OR 비교 전략", rulesJson: [{ id: "high", type: "high_return", enabled: true, weight: 30, config: { days: 11, minPercent: 20, comparator: "초과" } }, { id: "turnover", type: "turnover", enabled: true, weight: 25, config: { days: 5, threshold: 50_000_000, comparator: "이상" } }], scoringJson: { id: "root", logic: "OR", enabled: true, children: [{ id: "high", type: "high_return", enabled: true, weight: 30, config: { days: 11, minPercent: 20, comparator: "초과" } }, { id: "turnover", type: "turnover", enabled: true, weight: 25, config: { days: 5, threshold: 50_000_000, comparator: "이상" } }] } };
    state.detailData = roundTripPreset;
    state.evaluationData = { preset: roundTripPreset, symbol: "005930", source: "ka10081", latestDate: "20260812", barCount: 60, result: { eligible: true, score: 25, evaluations: [{ ruleId: "high", matched: false, score: 0, detail: "11일 고저 변동률 18.00% 초과 20%", actual: 18, expected: 20, comparator: "초과" }, { ruleId: "turnover", matched: true, score: 25, detail: "5일 내 최대 거래대금 100,000,000원 이상 50,000,000원", actual: 100_000_000, expected: 50_000_000, comparator: "이상" }] } };
    render(React.createElement(PresetEvidencePanel, { presetId: 9, presetName: "OR 비교 전략" }));
    expect(await screen.findByText("OR 비교 전략")).toBeTruthy();
    expect(screen.getByText("OR")).toBeTruthy();
    expect(screen.getByText("11일 고저 변동률 18.00% 초과 20%")).toBeTruthy();
    expect(screen.getByText("5일 내 최대 거래대금 100,000,000원 이상 50,000,000원")).toBeTruthy();
    expect(state.evaluateInput).toEqual({ presetId: 9, symbol: "005930", maxPages: 3 });
    expect(screen.getByText("조건 충족 · 25.0점")).toBeTruthy();
  });
  it("키움 일봉 수집 실패 시 근거 대신 연결 오류 상태를 표시한다", async () => {
    state.error = new Error("지정단말기 인증에 실패했습니다");
    render(React.createElement(PresetEvidencePanel, { presetId: 7 }));
    expect(await screen.findByText("실데이터 평가를 완료하지 못했습니다.")).toBeTruthy();
    expect(screen.getByText("지정단말기 인증에 실패했습니다")).toBeTruthy();
  });
  it("빈 일봉 응답은 조건 근거 대신 실데이터 없음 상태로 표시한다", async () => {
    state.error = new Error("실데이터 없음: 키움 ka10081에서 일봉 데이터를 받지 못했습니다.");
    render(React.createElement(PresetEvidencePanel, { presetId: 7 }));
    expect(await screen.findByText("수집된 실데이터 일봉이 없습니다.")).toBeTruthy();
    expect(screen.queryByText("조건 충족 · 35.0점")).toBeNull();
  });
  it("프리셋 상세 조회 실패 시 선택 ID를 유지하며 오류와 재시도 안내를 표시한다", async () => {
    state.detailError = new Error("프리셋을 찾을 수 없습니다");
    render(React.createElement(PresetEvidencePanel, { presetId: 7 }));
    expect(await screen.findByText("프리셋 상세를 불러오지 못했습니다.")).toBeTruthy();
    expect(screen.getByText("#7")).toBeTruthy();
    fireEvent.click(screen.getByText("다시 시도"));
    expect(state.detailRefetch).toHaveBeenCalled();
  });
});
