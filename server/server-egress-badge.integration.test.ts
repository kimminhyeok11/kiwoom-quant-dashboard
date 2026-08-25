// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../client/src/lib/trpc", () => ({ trpc: { system: { serverEgress: { useQuery: () => ({ data: { ip: "162.220.234.153", checkedAt: "2026-08-17T18:51:03.652Z", cacheStatus: "fresh" }, isLoading: false }) } } } }));
import { ServerEgressBadge } from "../client/src/components/ServerEgressBadge";

describe("서버 REST 출발지 IP 상단 배지", () => {
  afterEach(() => cleanup());

  it("배포 서버 출발지 IP를 브라우저·사용자 단말 IP와 구분해 표시한다", () => {
    render(React.createElement(ServerEgressBadge));
    expect(screen.getByText("서버 REST IP")).toBeTruthy();
    expect(screen.getByText("162.220.234.153")).toBeTruthy();
  });
});
