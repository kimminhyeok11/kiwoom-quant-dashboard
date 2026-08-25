// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ positions: [] as any[], orders: [] as any[], executions: [] as any[], queryError: null as Error | null, refetch: vi.fn(), positionsLoading: false, ordersLoading: false, executionsLoading: false }));

vi.mock("../client/src/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ account: { listPositions: { invalidate: vi.fn() } } }),
    account: {
      listPositions: { useQuery: () => ({ data: state.positions, isLoading: state.positionsLoading, error: state.queryError, refetch: state.refetch }) },
      syncPositions: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
    orders: {
      list: { useQuery: () => ({ data: state.orders, isLoading: state.ordersLoading, error: state.queryError, refetch: state.refetch }) },
      listExecutions: { useQuery: () => ({ data: state.executions, isLoading: state.executionsLoading, error: state.queryError, refetch: state.refetch }) },
    },
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ActivityView } from "../client/src/pages/Home";

describe("주문·포지션 실제 조회 화면", () => {
  afterEach(cleanup);
  beforeEach(() => { state.positions = []; state.orders = []; state.executions = []; state.queryError = null; state.positionsLoading = false; state.ordersLoading = false; state.executionsLoading = false; state.refetch.mockReset(); });

  it("실제 포지션의 평가손익과 운영자 소유 전송·체결 기록을 표시한다", () => {
    state.positions = [{ symbol: "005930", name: "삼성전자", quantity: 7, averagePrice: 71_000, currentPrice: 72_500, profitLoss: 10_500, profitLossRate: "2.113" }];
    state.orders = [{ id: 1, symbol: "005930", name: "삼성전자", quantity: 7, status: "submitted" }];
    state.executions = [{ id: 11, symbol: "005930", name: "삼성전자", side: "buy", quantity: 7, executionStatus: "filled", filledQuantity: 7, filledPrice: 72_500 }];
    render(React.createElement(ActivityView));
    expect(screen.getByText("보유 포지션 · 평가손익")).toBeTruthy();
    expect(screen.getByText("10,500원")).toBeTruthy();
    expect(screen.getByText("실제 전송 · 체결")).toBeTruthy();
    expect(screen.getByText("filled")).toBeTruthy();
    expect(screen.getByText(/체결 7주 · 72,500원/)).toBeTruthy();
  });

  it("실제 포지션과 전송·체결 기록이 없으면 예시 데이터 대신 명시적 빈 상태를 표시한다", () => {
    render(React.createElement(ActivityView));
    expect(screen.getByText("표시할 실제 포지션 데이터가 없습니다.")).toBeTruthy();
    expect(screen.getByText("표시할 실제 전송·체결 기록이 없습니다.")).toBeTruthy();
    expect(screen.getByText("실제 주문 기록이 없습니다.")).toBeTruthy();
  });

  it("포지션·주문·체결 조회 실패 시 오류를 표시하고 모든 쿼리를 재시도한다", () => {
    state.queryError = new Error("키움 접근 인증이 확인되지 않았습니다.");
    render(React.createElement(ActivityView));
    expect(screen.getByText("실제 계좌·주문·체결 기록을 불러오지 못했습니다.")).toBeTruthy();
    expect(screen.getByText(/키움 접근 인증이 확인되지 않았습니다/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(state.refetch).toHaveBeenCalledTimes(3);
  });

  it("포지션·주문·체결의 각 로딩 범위를 빈 상태 대신 명시적으로 표시한다", () => {
    state.positionsLoading = true;
    const first = render(React.createElement(ActivityView));
    expect(screen.getByText("포지션·평가손익 데이터를 불러오고 있습니다.")).toBeTruthy();
    first.unmount();
    state.positionsLoading = false; state.ordersLoading = true;
    const second = render(React.createElement(ActivityView));
    expect(screen.getByText("주문 의도 데이터를 불러오고 있습니다.")).toBeTruthy();
    second.unmount();
    state.ordersLoading = false; state.executionsLoading = true;
    render(React.createElement(ActivityView));
    expect(screen.getByText("전송·체결 기록 데이터를 불러오고 있습니다.")).toBeTruthy();
  });
});
