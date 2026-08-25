// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const refreshProfile = { presetId: 7, universeJson: [{ symbol: "005930" }], cronExpression: "0 */15 * * * *", status: "ready", lastCompletedAt: null, lastError: null };
const storedPreset = { id: 7, name: "자동 복원 전략", description: "", rulesJson: [{ id: "macd", type: "macd_rising", enabled: true, weight: 20, config: { logic: "AND", comparator: "이상", lookback: 3, unit: "%" } }], scoringJson: { logic: "AND" } };

vi.mock("../client/src/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ presets: { list: { invalidate: vi.fn() } }, rankings: { latest: { invalidate: vi.fn() } }, rankingRefresh: { get: { invalidate: vi.fn() } } }),
    presets: { list: { useQuery: () => ({ data: [storedPreset], isLoading: false }) }, detail: { useQuery: () => ({ data: storedPreset }) }, save: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) }, remove: { useMutation: () => ({ mutate: vi.fn() }) } },
    rankingRefresh: { get: { useQuery: () => ({ data: refreshProfile }) }, save: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) } },
    research: { listDatasets: { useQuery: () => ({ data: [], isLoading: false, error: null, refetch: vi.fn() }) }, listExperiments: { useQuery: () => ({ data: [], isLoading: false, error: null, refetch: vi.fn() }) }, createExperiment: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) } },
    rankings: { refresh: { useMutation: () => ({ isPending: false, data: null, mutate: vi.fn() }) }, turnover: { useQuery: () => ({ data: null, error: null, isFetching: false, refetch: vi.fn() }) } },
    quant: { evaluatePreset: { useQuery: () => ({ data: null, error: null, isFetching: false, refetch: vi.fn() }) } },
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));

import { Builder } from "../client/src/pages/Home";

describe("연구 전용 조건 빌더 범위", () => {
  afterEach(() => cleanup());
  it("자동 랭킹 갱신·거래대금 순위 패널 없이 조건식 편집을 표시한다", async () => {
    render(React.createElement(Builder));
    expect(screen.getAllByText("MACD 오실레이터 우상향").length).toBeGreaterThan(0);
    expect(screen.queryByText("실데이터 랭킹 갱신")).toBeNull();
    expect(screen.queryByText("시장 거래대금 순위")).toBeNull();
    expect(screen.queryByText("HTS 조건식 · 데이터 출처")).toBeNull();
  });
});
