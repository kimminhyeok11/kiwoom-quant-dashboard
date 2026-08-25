// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({ user: null as any, loading: false }));

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ user: authState.user, loading: authState.loading, refresh: vi.fn(), logout: vi.fn() }),
}));
vi.mock("@/const", () => ({ startLogin: vi.fn() }));

import Home from "./Home";

describe("운영 화면 권한 게이트", () => {
  afterEach(() => {
    cleanup();
    authState.user = null;
    authState.loading = false;
  });

  it("세션이 없으면 운영자처럼 보이는 대신 로그인 재연결 안내를 표시한다", () => {
    render(<Home />);
    expect(screen.getByText("운영자 로그인 세션이 없습니다.")).toBeTruthy();
    expect(screen.queryByText("일별 연구 프로그램 저장")).toBeNull();
  });

  it("로그인했지만 운영자 역할이 아니면 연구 설정 대신 권한 안내를 표시한다", () => {
    authState.user = { email: "user@example.com", name: "일반 사용자", isOperator: false };
    render(<Home />);
    expect(screen.getByText("현재 계정에는 운영자 권한이 없습니다.")).toBeTruthy();
    expect(screen.getByText(/user@example.com/)).toBeTruthy();
  });
});
