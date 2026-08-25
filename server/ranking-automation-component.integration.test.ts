// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ saveInput: null as null | Record<string, unknown>, invalidate: vi.fn() }));
vi.mock("../client/src/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ rankingRefresh: { get: { invalidate: state.invalidate } } }),
    rankingRefresh: {
      get: { useQuery: () => ({ data: { presetId: 7, universeJson: [{ symbol: "005930" }, { symbol: "000660" }], cronExpression: "0 */15 * * * *", status: "ready", lastCompletedAt: null, lastError: null } }) },
      save: { useMutation: (options: { onSuccess: () => void }) => ({ isPending: false, mutate: (input: Record<string, unknown>) => { state.saveInput = input; options.onSuccess(); } }) },
    },
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { RankingAutomationPanel } from "../client/src/pages/Home";

describe("랭킹 자동 갱신 설정 패널", () => {
  beforeEach(() => { state.saveInput = null; state.invalidate.mockClear(); });
  afterEach(() => cleanup());

  it("저장된 프로필을 복원하고 선택 프리셋이 없어도 프로필 presetId로 중지한다", async () => {
    render(React.createElement(RankingAutomationPanel, { presetId: null }));
    expect(await screen.findByText("저장 프리셋 #7")).toBeTruthy();
    const user = userEvent.setup();
    const stopButton = await screen.findByRole("button", { name: "중지" });
    await waitFor(() => expect((stopButton as HTMLButtonElement).disabled).toBe(false));
    await user.click(stopButton);
    expect(state.saveInput).toMatchObject({ presetId: 7, universe: [{ symbol: "005930" }, { symbol: "000660" }], cron: "0 */15 * * * *", enabled: false });
    expect(state.invalidate).toHaveBeenCalled();
  });
});
