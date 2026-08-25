// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../client/src/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({}),
    minuteResearch: {
      dashboard: { useQuery: () => ({ data: { program: null, sweeps: [], promoted: [], cumulative: [], distribution: null, failureReasons: [], regimePerformance: [], symbolPerformance: [], dataCoverage: null }, isLoading: false, isFetching: false, error: null, refetch: vi.fn() }) },
      saveProgram: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      runNow: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
    research: {
      listDatasets: { useQuery: () => ({ data: [], isLoading: false, error: null }) },
      listExperiments: { useQuery: () => ({ data: [], isLoading: false, error: null }) },
      listWalkForwardRuns: { useQuery: () => ({ data: [], isLoading: false, error: null }) },
    },
    presets: { list: { useQuery: () => ({ data: [], isLoading: false, error: null }) } },
    rankings: { latest: { useQuery: () => ({ data: { items: [] }, isLoading: false, error: null }) } },
  },
}));
import { ResearchDashboard } from "../client/src/pages/Home";

describe("1분봉 연구 홈 실제 데이터 연결 대기 상태", () => {
  afterEach(() => cleanup());
  it("실제 데이터가 없을 때 임의 성과를 만들지 않고 연구 프로그램 설정과 원본 대기를 제시한다", () => {
    render(React.createElement(ResearchDashboard, { setActive: vi.fn() }));
    expect(screen.getByText(/수천 개 조합을 돌리고/)).toBeTruthy();
    expect(screen.getByText("연구 프로그램 설정 필요")).toBeTruthy();
    expect(screen.getByText("매일 반복할 탐색 규격")).toBeTruthy();
    expect(screen.getByText("아직 누적 통과 조건식이 없습니다.")).toBeTruthy();
    expect(screen.getByText(/예시 성과나 임의 조합을 만들지 않습니다/)).toBeTruthy();
    expect(screen.queryByText(/지정 단말/)).toBeNull();
    expect(screen.queryByText(/OAuth/)).toBeNull();
    expect(screen.queryByText("주문 전송")).toBeNull();
    expect(screen.queryByText("계좌 정보")).toBeNull();
    expect(screen.queryByText("포지션 현황")).toBeNull();
  });
});
