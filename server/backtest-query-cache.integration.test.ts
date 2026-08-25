// @vitest-environment jsdom
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { TRPCLink } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import { fireEvent, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppRouter } from "../server/routers";
import { trpc } from "../client/src/lib/trpc";
import { Backtest } from "../client/src/pages/Home";

Object.defineProperties(HTMLElement.prototype, {
  hasPointerCapture: { configurable: true, value: () => false },
  setPointerCapture: { configurable: true, value: () => undefined },
  releasePointerCapture: { configurable: true, value: () => undefined },
  scrollIntoView: { configurable: true, value: () => undefined },
});

const bars = Array.from({ length: 60 }, (_, index) => ({
  date: `2026${String(index + 1).padStart(2, "0")}01`, open: 70_000 + index, high: 71_000 + index, low: 69_000 + index,
  close: 70_500 + index, volume: 1_000 + index, turnover: 80_000_000 + index,
}));

let results: Array<Record<string, unknown>> = [];
let paths: string[] = [];

function testLink(): TRPCLink<AppRouter> {
  return () => ({ op }) => observable(observer => {
    paths.push(op.path);
    let data: unknown;
    if (op.path === "presets.list") data = [{ id: 1, name: "실제 캐시 전략", description: "tRPC QueryClient 통합 테스트" }];
    else if (op.path === "quant.dailyBars") data = { symbol: "005930", source: "ka10081", bars };
    else if (op.path === "backtests.list") data = results;
    else if (op.path === "backtests.run") {
      results = [{ id: 501, presetId: 1, status: "completed", startDate: "20260101", endDate: "20260301", totalReturn: "7.250", winRate: "62.50", tradeCount: 4, maxDrawdown: "-2.100" }];
      data = { id: 501, result: { totalReturn: 7.25 } };
    } else data = null;
    queueMicrotask(() => { observer.next({ result: { type: "data", data } } as never); observer.complete(); });
    return () => undefined;
  });
}

describe("Backtest 실제 tRPC QueryClient 통합 흐름", () => {
  afterEach(() => cleanup());
  beforeEach(() => { results = []; paths = []; });

  it("mutation 성공 뒤 backtests.list를 무효화·재조회해 새 결과 카드를 자동으로 표시한다", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const client = trpc.createClient({ links: [testLink()] });
    render(React.createElement(trpc.Provider, { client, queryClient }, React.createElement(QueryClientProvider, { client: queryClient }, React.createElement(Backtest))));

    const user = userEvent.setup();
    await user.click((await screen.findAllByRole("combobox")).at(-1) as HTMLElement);
    await user.click(await screen.findByText("실제 캐시 전략"));
    const runButton = await screen.findByRole("button", { name: "리서치 백테스트 실행" });
    await waitFor(() => expect((runButton as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(runButton);

    expect(await screen.findByText("20260101 ~ 20260301")).toBeTruthy();
    expect(screen.getByText("7.250%")).toBeTruthy();
    expect(paths.filter(path => path === "backtests.list").length).toBeGreaterThanOrEqual(2);
    queryClient.clear();
  });
});
