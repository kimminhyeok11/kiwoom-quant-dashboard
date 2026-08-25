// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ mutate: vi.fn(), refetch: vi.fn() }));
vi.mock("../client/src/lib/trpc", () => ({
  trpc: { research: {
    listDatasets: { useQuery: () => ({ data: [], isLoading: false, error: null, refetch: state.refetch }) },
    createDataset: { useMutation: () => ({ isPending: false, mutate: state.mutate }) },
  } },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ResearchDatasetPanel } from "../client/src/pages/Home";

describe("리서치 데이터셋 패널", () => {
  beforeEach(() => { state.mutate.mockReset(); state.refetch.mockReset(); });
  afterEach(() => cleanup());

  it("유니버스·기간·버전이 모두 있을 때만 데이터셋 초안을 만든다", () => {
    render(React.createElement(ResearchDatasetPanel));
    fireEvent.change(screen.getByLabelText("데이터셋 이름"), { target: { value: "KOSPI 연구" } });
    fireEvent.change(screen.getByLabelText("버전 키"), { target: { value: "krx-daily-r1" } });
    fireEvent.change(screen.getByLabelText(/유니버스 종목 코드/), { target: { value: "005930, 000660" } });
    fireEvent.change(screen.getByLabelText("시작일"), { target: { value: "2020-01-02" } });
    fireEvent.change(screen.getByLabelText("종료일"), { target: { value: "2025-12-30" } });
    fireEvent.click(screen.getByRole("button", { name: "데이터셋 초안 저장" }));
    expect(state.mutate).toHaveBeenCalledWith({ name: "KOSPI 연구", versionKey: "krx-daily-r1", universe: [{ symbol: "005930" }, { symbol: "000660" }], startDate: "2020-01-02", endDate: "2025-12-30", adjustmentBasis: "adjusted" });
  });
});
