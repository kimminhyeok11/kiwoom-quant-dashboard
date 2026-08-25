// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ error: null as Error | null }));

vi.mock("../client/src/lib/trpc", () => ({
  trpc: {
    quant: {
      dailyBars: {
        useQuery: () => ({ data: null, isLoading: false, error: state.error }),
      },
    },
  },
}));

import { ChartView } from "../client/src/pages/Home";

describe("실데이터 일봉 차트 오류 상태", () => {
  afterEach(() => {
    cleanup();
    state.error = null;
  });

  it("8050 지정 단말 인증 실패 시 예시 캔들 대신 연결 오류와 실제 데이터 대기 안내를 표시한다", () => {
    state.error = new Error("인증에 실패했습니다[8050:지정단말기 인증에 실패했습니다]");
    render(React.createElement(ChartView));

    expect(screen.getByText("005930 실제 일봉을 표시할 수 없습니다.")).toBeTruthy();
    expect(screen.getByText(/8050:지정단말기 인증에 실패했습니다/)).toBeTruthy();
    expect(screen.getByText(/예시 캔들·가격·지표를 제공하지 않습니다/)).toBeTruthy();
  });
});
