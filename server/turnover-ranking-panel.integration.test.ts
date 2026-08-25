// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  data: null as null | { items: Array<{ symbol: string; rank: number; name: string; price: number; changeRate: number; turnover: number }> },
  error: null as null | { message: string },
  refetch: vi.fn(),
}));

vi.mock("../client/src/lib/trpc", () => ({
  trpc: {
    rankings: {
      turnover: { useQuery: () => ({ data: state.data, error: state.error, isFetching: false, refetch: state.refetch }) },
    },
  },
}));

import { TurnoverRankingPanel } from "../client/src/pages/Home";

describe("운영자 거래대금 순위 패널", () => {
  beforeEach(() => { state.data = null; state.error = null; state.refetch.mockClear(); });
  afterEach(() => cleanup());

  it("OAuth 연결 대기 오류를 명확히 표시하고 수동 조회만 실행한다", async () => {
    state.error = { message: "인증에 실패했습니다[8050:지정단말기 인증에 실패했습니다]" };
    render(React.createElement(TurnoverRankingPanel));
    expect(screen.getByText("실데이터 순위를 불러오지 못했습니다.")).toBeTruthy();
    expect(screen.getByText(/8050/)).toBeTruthy();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "공식 거래대금 순위 조회" }));
    expect(state.refetch).toHaveBeenCalledTimes(1);
  });

  it("실제 정규화 순위의 종목·가격·등락률·거래대금을 표시한다", () => {
    state.data = { items: [{ symbol: "005930", rank: 1, name: "삼성전자", price: 71_000, changeRate: 1.43, turnover: 85_000_000 }] };
    render(React.createElement(TurnoverRankingPanel));
    expect(screen.getByText("삼성전자")).toBeTruthy();
    expect(screen.getByText("71,000")).toBeTruthy();
    expect(screen.getByText("1.43%")).toBeTruthy();
    expect(screen.getByText("0.9억")).toBeTruthy();
  });
});
