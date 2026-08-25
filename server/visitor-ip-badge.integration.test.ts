// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../client/src/lib/trpc", () => ({ trpc: { network: { visitorIp: { useQuery: () => ({ data: { ip: "203.0.113.42", scope: "current_request" }, isLoading: false }) } } } }));
import { VisitorIpBadge } from "../client/src/components/VisitorIpBadge";

describe("브라우저 요청 IP 상단 배지", () => {
  afterEach(() => cleanup());
  it("브라우저 요청 IP를 키움 REST 호출 IP와 구분해 표시한다", () => {
    render(React.createElement(VisitorIpBadge));
    expect(screen.getByText("현재 브라우저 IPv4")).toBeTruthy();
    expect(screen.getByText("203.0.113.42")).toBeTruthy();
  });
});
