// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ list: [] as any[], listError: null as Error | null, listRefetch: vi.fn(), saveInput: null as any, removeInput: null as any, saveError: null as Error | null, removeError: null as Error | null, invalidate: vi.fn() }));
const storedPreset = { id: 7, name: "선택 전략", description: "", rulesJson: [{ id: "macd", type: "macd_rising", enabled: true, weight: 20, config: { lookback: 3, comparator: "이상", logic: "AND", unit: "%" } }], scoringJson: { id: "root", logic: "AND", enabled: true, children: [] } };

vi.mock("../client/src/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ presets: { list: { invalidate: state.invalidate } }, rankings: { latest: { invalidate: vi.fn() } }, rankingRefresh: { get: { invalidate: vi.fn() } } }),
    presets: {
      list: { useQuery: () => ({ data: state.listError ? null : state.list, error: state.listError, refetch: state.listRefetch, isLoading: false }) }, detail: { useQuery: () => ({ data: storedPreset }) },
      save: { useMutation: (options: any) => ({ isPending: false, mutate: (input: any) => { state.saveInput = input; if (state.saveError) options.onError(state.saveError); else options.onSuccess({ id: 8, updated: false }); } }) },
      remove: { useMutation: (options: any) => ({ isPending: false, mutate: (input: any) => { state.removeInput = input; if (state.removeError) options.onError(state.removeError); else options.onSuccess({ success: true }, input); } }) },
    },
    rankingRefresh: { get: { useQuery: () => ({ data: null }) }, save: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) } },
    research: { listDatasets: { useQuery: () => ({ data: [], isLoading: false, error: null, refetch: vi.fn() }) }, listExperiments: { useQuery: () => ({ data: [], isLoading: false, error: null, refetch: vi.fn() }) }, createExperiment: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) } },
    rankings: { refresh: { useMutation: () => ({ isPending: false, data: null, mutate: vi.fn() }) }, turnover: { useQuery: () => ({ data: null, error: null, isFetching: false, refetch: vi.fn() }) } },
    quant: { evaluatePreset: { useQuery: () => ({ data: null, error: null, isFetching: false, refetch: vi.fn() }) } },
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));

import { Builder } from "../client/src/pages/Home";

describe("조건 빌더 프리셋 수명주기", () => {
  beforeEach(() => { state.list = []; state.listError = null; state.listRefetch.mockClear(); state.saveInput = null; state.removeInput = null; state.saveError = null; state.removeError = null; state.invalidate.mockClear(); });
  afterEach(() => cleanup());

  it("신규 저장 성공의 반환 ID를 선택 상태로 반영한다", async () => {
    render(React.createElement(Builder));
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    expect(state.saveInput.id).toBeUndefined();
    expect(await screen.findByText("#8")).toBeTruthy();
  });

  it("상세 조건식의 비교·기간·루트 논리식을 저장 후 불러와 복원한다", async () => {
    const view = render(React.createElement(Builder));
    const macdCard = screen.getAllByText("MACD 오실레이터 우상향").find(element => element.closest("[draggable='true']"))?.closest("[draggable='true']") as HTMLElement;
    fireEvent.click(within(macdCard).getByText("상세 조건식 편집"));
    fireEvent.change(within(macdCard).getByDisplayValue("이상"), { target: { value: "상향돌파" } });
    fireEvent.change(within(macdCard).getByDisplayValue("3"), { target: { value: "4" } });
    const preview = screen.getByText("조건식 상세 미리보기").closest("div.frosted-panel") as HTMLElement;
    fireEvent.change(preview.querySelector("select") as HTMLSelectElement, { target: { value: "OR" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(state.saveInput.expression.logic).toBe("OR");
    expect(state.saveInput.rules[0].config).toMatchObject({ comparator: "상향돌파", lookback: 4, logic: "AND" });
    state.list = [{ id: 8, name: state.saveInput.name, description: "", rulesJson: state.saveInput.rules, scoringJson: state.saveInput.expression }];
    view.rerender(React.createElement(Builder));
    const libraryPreset = screen.getAllByText(state.saveInput.name).find(element => element.closest("button")?.className.includes("text-left"));
    fireEvent.click(libraryPreset as HTMLElement);

    expect(await screen.findByText("IF (OR)")).toBeTruthy();
    const restoredMacdCard = screen.getAllByText("MACD 오실레이터 우상향").find(element => element.closest("[draggable='true']"))?.closest("[draggable='true']") as HTMLElement;
    fireEvent.click(within(restoredMacdCard).getByText("상세 조건식 편집"));
    expect(within(restoredMacdCard).getByDisplayValue("상향돌파")).toBeTruthy();
    expect(within(restoredMacdCard).getByDisplayValue("4")).toBeTruthy();
  });

  it("중첩 AND·OR 그룹에 규칙을 이동해 저장하고 불러오기에서 복원한다", async () => {
    const view = render(React.createElement(Builder));
    fireEvent.click(screen.getByText("하위 그룹 추가"));
    const nestedPanel = screen.getByText("중첩 논리 그룹").closest("section") as HTMLElement;
    const selects = nestedPanel.querySelectorAll("select");
    fireEvent.change(selects[2], { target: { value: "OR" } });
    fireEvent.change(selects[3], { target: { value: "high" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    const nestedGroup = state.saveInput.expression.children.find((child: any) => Array.isArray(child.children));
    expect(nestedGroup).toMatchObject({ logic: "OR", children: [expect.objectContaining({ id: "high" })] });
    state.list = [{ id: 8, name: state.saveInput.name, description: "", rulesJson: state.saveInput.rules, scoringJson: state.saveInput.expression }];
    view.rerender(React.createElement(Builder));
    const libraryPreset = screen.getAllByText(state.saveInput.name).find(element => element.closest("button")?.className.includes("text-left"));
    fireEvent.click(libraryPreset as HTMLElement);
    expect(await screen.findByText("중첩 그룹")).toBeTruthy();
  });

  it("중첩 그룹을 해제하면 포함 규칙을 유지한 채 저장 표현식에서 그룹을 제거한다", async () => {
    render(React.createElement(Builder));
    fireEvent.click(screen.getByText("하위 그룹 추가"));
    const nestedPanel = screen.getByText("중첩 논리 그룹").closest("section") as HTMLElement;
    const selects = nestedPanel.querySelectorAll("select");
    fireEvent.change(selects[3], { target: { value: "high" } });
    fireEvent.click(screen.getByText("그룹 해제"));
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(state.saveInput.expression.children.some((child: any) => Array.isArray(child.children))).toBe(false);
    expect(state.saveInput.expression.children).toEqual(expect.arrayContaining([expect.objectContaining({ id: "high" })]));
    expect(screen.queryByText("그룹 해제")).toBeNull();
  });

  it("중첩 그룹 자체를 루트로 이동하면 저장 표현식의 부모 구조가 갱신된다", async () => {
    render(React.createElement(Builder));
    fireEvent.click(screen.getByText("하위 그룹 추가"));
    fireEvent.click(screen.getAllByText("하위 그룹 추가")[1]);
    const nestedPanel = screen.getByText("중첩 논리 그룹").closest("section") as HTMLElement;
    const parentMoveSelects = Array.from(nestedPanel.querySelectorAll("select")).filter(select => select.getAttribute("aria-label")?.endsWith("부모 이동"));
    fireEvent.change(parentMoveSelects.at(-1) as HTMLSelectElement, { target: { value: "root-group" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    const groups = state.saveInput.expression.children.filter((child: any) => Array.isArray(child.children));
    expect(groups).toHaveLength(2);
    expect(groups.every((group: any) => group.children.every((child: any) => !Array.isArray(child.children)))).toBe(true);
  });

  it("신규 저장 실패 시 선택 상태를 만들지 않는다", async () => {
    state.saveError = new Error("저장에 실패했습니다");
    render(React.createElement(Builder));
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    expect(state.saveInput.id).toBeUndefined();
    expect(screen.queryByText("#8")).toBeNull();
    expect(screen.getByText("상세 조회할 저장 프리셋을 선택하세요.")).toBeTruthy();
  });

  it("프리셋 목록 불러오기 실패 시 오류와 재시도 안내를 표시한다", async () => {
    state.listError = new Error("목록 연결 오류");
    render(React.createElement(Builder));
    expect(await screen.findByText("프리셋 목록을 불러오지 못했습니다.")).toBeTruthy();
    fireEvent.click(screen.getByText("다시 시도"));
    expect(state.listRefetch).toHaveBeenCalled();
    expect(screen.getByText("상세 조회할 저장 프리셋을 선택하세요.")).toBeTruthy();
  });

  it("선택 프리셋은 삭제 성공 시에만 선택 상태를 해제한다", async () => {
    state.list = [storedPreset];
    render(React.createElement(Builder));
    fireEvent.click(screen.getByText("선택 전략"));
    expect(await screen.findByText("#7")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "선택 전략 삭제" }));
    await waitFor(() => expect(state.removeInput).toEqual({ id: 7 }));
    expect(screen.getByText("상세 조회할 저장 프리셋을 선택하세요.")).toBeTruthy();
  });

  it("선택 프리셋 삭제 실패 시 선택 상태를 유지한다", async () => {
    state.list = [storedPreset]; state.removeError = new Error("삭제 권한이 없습니다");
    render(React.createElement(Builder));
    fireEvent.click(screen.getByText("선택 전략"));
    expect(await screen.findByText("#7")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "선택 전략 삭제" }));
    expect(screen.getByText("#7")).toBeTruthy();
  });
});
