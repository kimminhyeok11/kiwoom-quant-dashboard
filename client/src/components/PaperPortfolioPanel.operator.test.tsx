import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const observationQuery = vi.hoisted(() => ({ current: { data: [] as any[] } }));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ paperPortfolio: { list: { invalidate: vi.fn() } } }),
    paperPortfolio: {
      latestActualObservations: { useQuery: () => observationQuery.current },
      list: { useQuery: () => ({ data: [] }) },
      openFromObservation: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
    orders: { createFromResearchObservation: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) } },
  },
}));

vi.mock("@/components/OrderDraftPanel", () => ({ OrderDraftPanel: () => <div>주문 초안</div> }));

import { PaperPortfolioPanel } from "./PaperPortfolioPanel";

describe("PaperPortfolioPanel 운영자 실제 관찰", () => {
  it("운영자 조회에서 반환된 실제 가격 관찰을 종목·원천·가격과 함께 렌더링한다", () => {
    observationQuery.current = {
      data: [{ id: 91, name: "테스트전자", symbol: "005930", source: "kiwoom_observation", price: 71200 }],
    };

    const markup = renderToStaticMarkup(<PaperPortfolioPanel />);

    expect(markup).toContain("실제 가격 관찰 후보");
    expect(markup).toContain("테스트전자");
    expect(markup).toContain("005930 · kiwoom_observation");
    expect(markup).toContain("71,200원");
  });
});
