import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ data: null as any, isLoading: false }));

vi.mock("@/lib/trpc", () => ({
  trpc: { useUtils: () => ({ strategyCards: { listPublic: { invalidate: vi.fn() } } }), strategyCards: { listPublic: { useQuery: () => ({ data: state.data, isLoading: state.isLoading, refetch: vi.fn() }) }, collect: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) }, fork: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) }, listComments: { useQuery: () => ({ data: [], refetch: vi.fn() }) }, toggleFavorite: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) }, addComment: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) } } },
}));
vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/const", () => ({ startLogin: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import PublicStrategyCardCollection from "./PublicStrategyCardCollection";

describe("PublicStrategyCardCollection", () => {
  beforeEach(() => { state.isLoading = false; state.data = null; });

  it("발행된 카드의 원본 지문·검증 성과·데이터셋 증거를 함께 표시한다", () => {
    state.data = [{
      id: 18,
      version: 1,
      parentCardId: null,
      publishedAt: new Date("2026-08-20T00:00:00.000Z"),
      title: "아레나 카드 · abcdef12",
      creatorName: "연구자",
      strategyFingerprint: "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      datasetFingerprint: "dataset-fingerprint-001",
      rootGenomeJson: { id: "root", logic: "AND", children: [{ id: "rsi", type: "rsi" }, { id: "volume", type: "volume_ratio" }] },
      validationEvidenceJson: { inSample: { metrics: { netReturnPercent: "3.10" } }, validationReturnPercent: "2.35", validationMaxDrawdownPercent: "-1.20", validationTrades: 17, walkForward: { verificationCount: 4, averageReturnPercent: 1.2 } },
      favoriteCount: 3,
      commentCount: 2,
      favoritedByCurrentUser: false,
    }];

    const markup = renderToStaticMarkup(<PublicStrategyCardCollection />);
    expect(markup).toContain("아레나 카드 · abcdef12");
    expect(markup).toContain("+2.35%");
    expect(markup).toContain("-1.20%");
    expect(markup).toContain("검증 거래 17건");
    expect(markup).toContain("학습 성과");
    expect(markup).toContain("워크포워드: 4회");
    expect(markup).toContain("v1 · 원본");
    expect(markup).toContain("배틀 기록·발행 이력");
    expect(markup).toContain("의견");
  });

  it("아직 발행된 카드가 없으면 가짜 성과 대신 빈 상태를 표시한다", () => {
    state.data = [];
    const markup = renderToStaticMarkup(<PublicStrategyCardCollection />);
    expect(markup).toContain("아직 공개된 전략 카드가 없습니다.");
  });
});
