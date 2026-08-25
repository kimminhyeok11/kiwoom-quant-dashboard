// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ saveProgram: vi.fn(), runNow: vi.fn(), refetchDashboard: vi.fn(), refetchAnalysis: vi.fn(), avatarId: "nebula", running: false, analysisFetching: false, sweeps: [] as Array<Record<string, unknown>>, failureReasons: [] as Array<{ reason: string; count: number }>, promoted: [{ id: 21, strategyFingerprint: "radar-card-001", validationReturnPercent: 3.4, validationMaxDrawdownPercent: -1.2, validationTradeCount: 24 }] }));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ minuteResearch: { dashboard: { invalidate: vi.fn() } }, profile: { me: { invalidate: vi.fn(), setData: (_input: unknown, updater: (current: { name: string; email: string; avatarId: string }) => { name: string; email: string; avatarId: string }) => { const next = updater({ name: "테스트 트레이너", email: "trainer@example.com", avatarId: state.avatarId }); if (next) state.avatarId = next.avatarId; } } } }),
    minuteResearch: {
      dashboard: { useQuery: () => ({ data: {
        dataCoverage: { tradingDateCount: 12, firstDate: "2026-08-01", lastDate: "2026-08-20" },
        commonRuleTypes: ["rsi", "volume_ratio", "ma_position"],
        promoted: state.promoted, sweeps: state.sweeps, failureReasons: state.failureReasons,
      }, isFetching: state.analysisFetching, dataUpdatedAt: 1_787_276_900_000, refetch: state.refetchDashboard }) },
      saveProgram: { useMutation: () => ({ mutate: state.saveProgram, isPending: state.running }) },
      runNow: { useMutation: () => ({ mutate: state.runNow, isPending: state.running }) },
    },
    strategyCards: { publish: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) }, listHeroConditions: { useQuery: () => ({ data: [] }) }, collectHeroCondition: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) }, myCollectionAnalysis: { useQuery: () => ({ data: { summary: { collectedCount: 2, cumulativeReturnPercent: 3.4, averageWinRate: 57.5, battleCount: 31 }, cards: [{ presetId: 1, name: "검증 카드", validationReturnPercent: 3.4, winRate: 58, validationTradeCount: 24, maxDrawdownPercent: -1.2, dailyBattleCount: 5, positiveBattleRate: 60 }], trend: [] }, isFetching: state.analysisFetching, dataUpdatedAt: 1_787_276_900_000, refetch: state.refetchAnalysis }) } },
    tradingProfile: { get: { useQuery: () => ({ data: { profile: null }, refetch: vi.fn() }) }, setSimpleMode: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) } },
    profile: { me: { useQuery: () => ({ data: { name: "테스트 트레이너", email: "trainer@example.com", avatarId: state.avatarId } }) } },
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));
vi.mock("html2canvas", () => ({ default: vi.fn(async () => ({ toBlob: (callback: (blob: Blob) => void) => callback(new Blob(["battle"], { type: "image/png" })) })) }));
vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ user: { name: "테스트 트레이너", email: "trainer@example.com" } }) }));

import { StrategyArenaLab } from "./StrategyArenaLab";

describe("StrategyArenaLab", () => {
  beforeEach(() => { state.saveProgram.mockReset(); state.runNow.mockReset(); state.refetchDashboard.mockReset().mockResolvedValue({ data: {} }); state.refetchAnalysis.mockReset().mockResolvedValue({ data: {} }); state.avatarId = "nebula"; state.running = false; state.analysisFetching = false; state.sweeps = []; state.failureReasons = []; });
  afterEach(() => cleanup());

  it("실제 분봉 아레나와 누적 공통 생존 지표를 게임형 시작 화면에 표시한다", () => {
    render(<StrategyArenaLab />);

    expect(screen.getByText(/12일 실제 1분봉 아레나/)).toBeTruthy();
    expect(screen.getByText("RSI")).toBeTruthy();
    expect(screen.getByText("거래량 비율")).toBeTruthy();
    expect(screen.getByText("이동평균")).toBeTruthy();
    expect(screen.getByText("내 포켓몬 배틀 분석")).toBeTruthy();
    expect(screen.getAllByText("+3.40%").length).toBeGreaterThan(0);
    expect(screen.getByRole("img", { name: "전략 카드 강점 약점 방사형 차트" })).toBeTruthy();
    expect(screen.getByText("결과 공유")).toBeTruthy();
    expect(screen.getByText("READY TO BATTLE")).toBeTruthy();
    expect(screen.getByText("생존 지표 덱")).toBeTruthy();
    expect(screen.getByText("랜덤 도전 덱")).toBeTruthy();
    expect(document.querySelector(".pokemon-rarity-epic")).toBeTruthy();
    expect(screen.queryByText("내 캐릭터 아바타")).toBeNull();
  });

  it("공통 지표를 끄고 대규모 탐색을 선택하면 비중복 순수 랜덤 실제 배틀 설정을 저장한다", () => {
    render(<StrategyArenaLab />);
    fireEvent.click(screen.getByRole("button", { name: /랜덤 도전 덱/ }));
    fireEvent.click(screen.getByRole("button", { name: /대규모 탐색/ }));
    fireEvent.click(screen.getByRole("button", { name: "대규모 탐색 배틀 시작" }));

    expect(state.saveProgram).toHaveBeenCalledWith(expect.objectContaining({
      name: "아레나 자동 연구소",
      configuration: expect.objectContaining({ combinationsPerSweep: 3_000, lookbackTradingDays: 20, maxUniverseSymbols: 20, explorationMode: "diverse_random" }),
    }));
    expect(screen.getByText(/10개 이상 비중복 규칙군/)).toBeTruthy();
  });

  it("빠른 결과 단계는 소규모 실제 데이터 검증으로 먼저 결과를 만든다", () => {
    render(<StrategyArenaLab />);
    fireEvent.click(screen.getByRole("button", { name: /빠른 결과/ }));
    fireEvent.click(screen.getByRole("button", { name: "빠른 결과 배틀 시작" }));

    expect(state.saveProgram).toHaveBeenCalledWith(expect.objectContaining({
      configuration: expect.objectContaining({ combinationsPerSweep: 100, lookbackTradingDays: 5, validationTradingDays: 2, maxUniverseSymbols: 4 }),
    }));
  });

  it("연구 요청이 진행 중이면 타격 단계와 진행 상태바를 표시한다", () => {
    state.running = true;
    render(<StrategyArenaLab />);

    expect(screen.getByText("카드 소환")).toBeTruthy();
    expect(screen.getByRole("progressbar", { name: "아레나 연구 진행률" })).toBeTruthy();
    expect(screen.getByText(/서버가 10장마다 저장한 처리량/)).toBeTruthy();
  });

  it("10분 이상 갱신되지 않은 배틀은 무한 진행 대신 중단 원인과 재시작 제어를 표시한다", () => {
    state.sweeps = [{ status: "running", updatedAt: new Date(Date.now() - 11 * 60 * 1_000), generatedCount: 0, promotedCount: 0, rejectedCount: 0, summaryJson: null }];
    render(<StrategyArenaLab />);

    expect(screen.getByTestId("stale-battle-recovery")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "중단된 배틀 다시 시작" }));
    expect(state.saveProgram).toHaveBeenCalledTimes(1);
  });

  it("완료된 배틀이 수집 카드 0장이어도 실제 평가 결과·탈락 원인·다음 배틀 행동을 표시한다", () => {
    state.sweeps = [{ id: 60001, status: "completed", updatedAt: new Date(), completedAt: new Date(), generatedCount: 100, evaluatedCount: 100, promotedCount: 0, rejectedCount: 100, lastError: null, summaryJson: null }];
    state.failureReasons = [{ reason: "독립 검증 거래 수 8건 미만입니다.", count: 73 }];
    render(<StrategyArenaLab />);

    expect(screen.getByTestId("research-outcome")).toBeTruthy();
    expect(screen.getByText(/실제 배틀은 끝났지만 수집 카드는 0장/)).toBeTruthy();
    expect(screen.getByText(/독립 검증 거래 수 8건 미만입니다. · 73개/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "다음 배틀 시작" }));
    expect(state.saveProgram).toHaveBeenCalledTimes(1);
  });

  it("배틀 분석의 단계·최신 기준을 보여 주고 수동 새로고침으로 두 분석 쿼리를 즉시 갱신한다", async () => {
    render(<StrategyArenaLab />);

    expect(screen.getByTestId("arena-analysis-status")).toBeTruthy();
    expect(screen.getByText("아레나 기록 불러오기")).toBeTruthy();
    expect(screen.getByText("내 포켓몬 성과 집계")).toBeTruthy();
    expect(screen.getByText("기간별 결과 정리")).toBeTruthy();
    expect(screen.getByText(/최근 분석 기준:/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "아레나 분석 새로고침" }));
    await waitFor(() => expect(state.refetchDashboard).toHaveBeenCalledTimes(1));
    expect(state.refetchAnalysis).toHaveBeenCalledTimes(1);
  });

  it("검증 통과 카드의 결과 이미지를 만들어 브라우저 공유 흐름으로 전달한다", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { share, canShare: () => true });
    render(<StrategyArenaLab />);

    fireEvent.click(screen.getByText("결과 공유"));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    const captureMetric = screen.getByText("독립 검증 수익률").parentElement;
    expect(captureMetric?.textContent).toContain("+3.40%");
    expect(screen.getByText("최대 낙폭").parentElement?.textContent).toContain("-1.20%");
    expect(screen.getByText("검증 거래").parentElement?.textContent).toContain("24회");
    expect(screen.getByText("테스트 트레이너")).toBeTruthy();
    expect(screen.getByLabelText("성운 마도사 프로필 아이콘")).toBeTruthy();
  });

  it("내 정보에서 이미 선택된 캐릭터가 다음 결과 공유 카드에 반영된다", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { share, canShare: () => true });
    state.avatarId = "dragon";
    render(<StrategyArenaLab />);

    fireEvent.click(screen.getByText("결과 공유"));

    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText("청룡 트레이너 프로필 아이콘")).toBeTruthy();
  });
});
