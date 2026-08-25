// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ mockOrderError: null as Error | null, historyError: null as Error | null, user: { id: 1, isOperator: true } as { id: number; isOperator: boolean } | null }));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ autonomousResearch: { minuteCollectionStatus: { invalidate: vi.fn() }, minuteValidationHistory: { invalidate: vi.fn() }, dayTradeHistory: { invalidate: vi.fn() }, mockOrderOperationStatus: { invalidate: vi.fn() } } }),
    autonomousResearch: {
      latest: { useQuery: () => ({ data: null, error: null, isLoading: false }) },
      dayTradeHistory: { useQuery: () => ({ data: null, error: state.historyError, isLoading: false }) },
      minuteValidationHistory: { useQuery: () => ({ data: null, error: null, isLoading: false }) },
      minuteCollectionStatus: { useQuery: () => ({ data: null, error: null, isLoading: false }) },
      minuteBackfillStatus: { useQuery: () => ({ data: null, error: null, isLoading: false }) },
      mockOrderOperationStatus: { useQuery: () => ({ data: null, error: state.mockOrderError, isLoading: false }) },
      requestMinuteCollection: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
  },
}));

vi.mock("@/components/DayTradingExperimentPanel", () => ({ DayTradingExperimentPanel: () => <div>실험 패널</div> }));
vi.mock("@/components/PublicMarketNav", () => ({ PublicMarketNav: () => <nav>공개 탐색</nav> }));
vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ user: state.user }) }));

import PublicIntradayMonitor from "./PublicIntradayMonitor";

describe("장중 대시보드 조회 오류", () => {
  afterEach(() => {
    cleanup();
    state.mockOrderError = null;
    state.historyError = null;
    state.user = { id: 1, isOperator: true };
  });

  it("모의 주문 상태가 504 HTML 응답을 JSON 오류로 변환한 경우 오류를 화면에 표시한다", () => {
    state.mockOrderError = new Error("API 엔드포인트가 JSON 대신 HTML 응답을 반환했습니다.");
    render(<PublicIntradayMonitor />);
    expect(screen.getByText("장중 기록을 불러오지 못했습니다.")).toBeTruthy();
    expect(screen.getByText(/JSON 대신 HTML 응답/)).toBeTruthy();
    expect(screen.getByText(/자동으로 재시도합니다/)).toBeTruthy();
  });

  it("배치 응답의 결과 누락도 오류로 표시해 무한 대기 화면을 방지한다", () => {
    state.mockOrderError = new Error("Missing result");
    render(<PublicIntradayMonitor />);
    expect(screen.getByText("Missing result")).toBeTruthy();
  });

  it("서버 재시작 중 비JSON 응답도 오류를 명시하고 자동 재시도를 안내한다", () => {
    state.mockOrderError = new Error("서버 재시작 중 tRPC 연결을 다시 설정하고 있습니다.");
    render(<PublicIntradayMonitor />);
    expect(screen.getByText(/서버 재시작 중 tRPC 연결/)).toBeTruthy();
    expect(screen.getByText(/자동으로 재시도합니다/)).toBeTruthy();
  });

  it("특정 라우터 절차가 실패해도 전체 장중 화면에 오류를 노출한다", () => {
    state.historyError = new Error("autonomousResearch.dayTradeHistory 라우터 오류");
    render(<PublicIntradayMonitor />);
    expect(screen.getByText(/dayTradeHistory 라우터 오류/)).toBeTruthy();
  });

  it("비운영자는 민감한 주문 운영 상태 오류로 장중 연구 화면이 중단되지 않는다", () => {
    state.user = { id: 2, isOperator: false };
    state.mockOrderError = new Error("운영자 권한이 필요합니다.");
    render(<PublicIntradayMonitor />);
    expect(screen.queryByText("장중 기록을 불러오지 못했습니다.")).toBeNull();
    expect(screen.queryByLabelText("모의 주문 자동 실행 상태")).toBeNull();
  });
});
