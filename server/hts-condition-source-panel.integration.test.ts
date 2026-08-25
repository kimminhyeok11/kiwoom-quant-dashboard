// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { HtsConditionSourcePanel } from "../client/src/pages/Home";

describe("HTS 조건식 데이터 출처 패널", () => {
  afterEach(() => cleanup());

  it("현재 HTS 후보와 과거 조건 빌더 백테스트를 명확히 분리해 표시한다", () => {
    render(React.createElement(HtsConditionSourcePanel));
    expect(screen.getByText("HTS 조건식 · 데이터 출처")).toBeTruthy();
    expect(screen.getByText("HTS 현재 후보 · 워크포워드")).toBeTruthy();
    expect(screen.getByText("앱 조건 빌더 · 과거 백테스트")).toBeTruthy();
    expect(screen.getByText(/키움 로그인 ID·비밀번호는 입력하거나 저장하지 않습니다/)).toBeTruthy();
    expect(screen.getByText(/후보 데이터가 없으면 수집 대기 상태만 표시합니다/)).toBeTruthy();
    expect(screen.getByText(/과거 조건 충족 이력으로 바꾸어 백테스트하지 않습니다/)).toBeTruthy();
  });
});
