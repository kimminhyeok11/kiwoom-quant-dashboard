// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  list: [] as any[],
  saveInput: null as any,
  invalidate: vi.fn(),
  bars: Array.from({ length: 60 }, (_, index) => ({ date: `2026${String(index + 1).padStart(4, "0")}`, open: 100, high: 110, low: 100, close: 105, volume: 1_000, turnover: 100_000_000 })),
}));

vi.mock("../client/src/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ presets: { list: { invalidate: state.invalidate } }, rankings: { latest: { invalidate: vi.fn() } }, rankingRefresh: { get: { invalidate: vi.fn() } } }),
    presets: {
      list: { useQuery: () => ({ data: state.list, error: null, isLoading: false, refetch: vi.fn() }) },
      detail: { useQuery: () => ({ data: null, error: null, refetch: vi.fn() }) },
      save: { useMutation: (options: any) => ({ isPending: false, mutate: (input: any) => { state.saveInput = input; state.list = [{ id: 8, name: input.name, description: input.description, rulesJson: input.rules, scoringJson: input.expression }]; options.onSuccess({ id: 8, updated: false }); } }) },
      remove: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) },
    },
    rankingRefresh: { get: { useQuery: () => ({ data: null }) }, save: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) } },
    research: { listDatasets: { useQuery: () => ({ data: [], isLoading: false, error: null, refetch: vi.fn() }) }, listExperiments: { useQuery: () => ({ data: [], isLoading: false, error: null, refetch: vi.fn() }) }, createExperiment: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) } },
    rankings: { refresh: { useMutation: () => ({ isPending: false, data: null, mutate: vi.fn() }) }, turnover: { useQuery: () => ({ data: null, error: null, isFetching: false, refetch: vi.fn() }) } },
    quant: { evaluatePreset: { useQuery: () => ({ data: null, error: null, isFetching: false, refetch: vi.fn() }) } },
  },
}));

vi.mock("./db", () => ({
  getDb: vi.fn(async () => {
    let selectCount = 0;
    return {
      select: () => {
        const result = selectCount++ === 0 ? [{ id: 8, userId: 1, name: state.saveInput.name, rulesJson: state.saveInput.rules, scoringJson: state.saveInput.expression }] : [];
        return { from: () => ({ where: () => ({ limit: async () => result, orderBy: () => ({ limit: async () => result }) }) }) };
      },
    };
  }),
}));

vi.mock("./kiwoom/client", () => ({
  KiwoomClient: class {
    getAccessToken = async () => ({ token: "test-token" });
    getDailyBars = async () => state.bars;
    getStatus = () => ({ mayTransmitOrders: false });
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));

import { Builder } from "../client/src/pages/Home";
import { quantRouter } from "./routers/quant";

describe("조건 빌더 저장·불러오기·재평가 종단 흐름", () => {
  afterEach(() => { cleanup(); state.list = []; state.saveInput = null; state.invalidate.mockClear(); vi.unstubAllEnvs(); });

  it("저장한 OR·중첩 NOT 논리식과 지표 비교 기준을 불러온 뒤 실제 evaluatePreset에 동일하게 적용한다", async () => {
    vi.stubEnv("AUTONOMOUS_RESEARCH_EXTERNAL_DATA_ENABLED", "true");
    const view = render(React.createElement(Builder));
    const macdCard = screen.getAllByText("MACD 오실레이터 우상향").find(element => element.closest("[draggable='true']"))?.closest("[draggable='true']") as HTMLElement;
    const highCard = screen.getAllByText("최근 11일 고가 등락률").find(element => element.closest("[draggable='true']"))?.closest("[draggable='true']") as HTMLElement;
    fireEvent.click(within(macdCard).getByText("상세 조건식 편집"));
    fireEvent.change(within(macdCard).getByDisplayValue("이상"), { target: { value: "상향돌파" } });
    fireEvent.click(within(highCard).getByText("상세 조건식 편집"));
    fireEvent.change(within(highCard).getByDisplayValue("20"), { target: { value: "5" } });
    const preview = screen.getByText("조건식 상세 미리보기").closest("div.frosted-panel") as HTMLElement;
    fireEvent.change(preview.querySelector("select") as HTMLSelectElement, { target: { value: "OR" } });
    fireEvent.click(screen.getByText("하위 그룹 추가"));
    const nestedPanel = screen.getByText("중첩 논리 그룹").closest("section") as HTMLElement;
    fireEvent.click(screen.getAllByText("하위 그룹 추가")[1]);
    const logicSelects = Array.from(nestedPanel.querySelectorAll("select")).filter(select => select.getAttribute("aria-label")?.endsWith("논리"));
    const ruleMoveSelects = Array.from(nestedPanel.querySelectorAll("select")).filter(select => select.getAttribute("aria-label")?.endsWith("규칙 이동"));
    fireEvent.change(logicSelects.at(-1) as HTMLSelectElement, { target: { value: "NOT" } });
    fireEvent.change(ruleMoveSelects.at(-1) as HTMLSelectElement, { target: { value: "turnover" } });
    const parentMoveSelects = Array.from(nestedPanel.querySelectorAll("select")).filter(select => select.getAttribute("aria-label")?.endsWith("부모 이동"));
    fireEvent.change(parentMoveSelects.at(-1) as HTMLSelectElement, { target: { value: "root-group" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    view.rerender(React.createElement(Builder));

    expect(state.saveInput.expression.children).toEqual(expect.arrayContaining([expect.objectContaining({ logic: "NOT", children: [expect.objectContaining({ id: "turnover" })] })]));
    const libraryPreset = screen.getAllByText(state.saveInput.name).find(element => element.closest("button")?.className.includes("text-left"));
    fireEvent.click(libraryPreset as HTMLElement);
    expect(await screen.findByText("IF (OR)")).toBeTruthy();
    expect(screen.getAllByText("중첩 그룹").length).toBeGreaterThanOrEqual(2);
    const restoredMacd = screen.getAllByText("MACD 오실레이터 우상향").find(element => element.closest("[draggable='true']"))?.closest("[draggable='true']") as HTMLElement;
    expect(within(restoredMacd).getByDisplayValue("상향돌파")).toBeTruthy();

    const caller = quantRouter.createCaller({ user: { id: 1, openId: "operator", role: "admin" } as any, req: {} as any, res: {} as any });
    const evaluated = await caller.evaluatePreset({ presetId: 8, symbol: "005930", maxPages: 3 });
    expect(evaluated.result).toMatchObject({ eligible: true, score: 20 });
    expect(evaluated.result.evaluations).toEqual(expect.arrayContaining([expect.objectContaining({ ruleId: "macd", comparator: "상향돌파" }), expect.objectContaining({ ruleId: "high", matched: true, expected: 5, comparator: "이상" }), expect.objectContaining({ ruleId: "turnover", matched: false })]));
  });
});
