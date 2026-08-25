// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const auditQuery = vi.hoisted(() => ({
  value: {
    data: { generatedAt: new Date(), lastRequested: { runId: 1, startedAt: new Date(), updatedAt: new Date(), state: { label: "실행 불가 또는 대기", detail: "8050 지정단말 인증 실패" } }, lastVerified: null, runs: [], minuteEvidence: { minuteBarRows: 0, minuteTradingDateCount: 0, minuteSymbolCount: 0, firstMinuteAt: null, lastMinuteAt: null, lastMinuteCapturedAt: null }, readOnlyBoundary: "데이터 수집·조건식 연구만 표시하며 주문·계좌 조회·주문 전송은 이 경로에서 수행하지 않습니다." },
    isLoading: false,
    error: null as Error | null,
  },
}));

const researchOperationQueryOptions = vi.hoisted(() => ({
  insights: [] as Array<{ enabled?: boolean } | undefined>,
  committee: [] as Array<{ enabled?: boolean } | undefined>,
  governance: [] as Array<{ enabled?: boolean } | undefined>,
  operations: [] as Array<{ enabled?: boolean } | undefined>,
}));

vi.mock("../client/src/lib/trpc", () => ({
  trpc: {
    autonomousResearch: {
      latest: {
        useQuery: () => ({ data: { run: { tradingDate: "2026-08-18", phase: "waiting_for_data", dataStatus: "waiting", policyVersion: "autonomous-v1", lastObservedAt: null, lastError: "8050 지정단말 인증 실패" }, tasks: [], observations: [], candidates: [], historical: { run: null, candidates: [] } } }),
      },
      auditTrail: {
        useQuery: () => auditQuery.value,
      },
      runHistoricalBacktest: {
        useMutation: () => ({ data: undefined, isPending: false, mutate: vi.fn() }),
      },
      reuseHistoricalDataset: {
        useMutation: () => ({ data: undefined, isPending: false, mutate: vi.fn() }),
      },
      historicalResearchInsights: {
        useQuery: (_input: undefined, options?: { enabled?: boolean }) => {
          researchOperationQueryOptions.insights.push(options);
          return { data: null, isLoading: false, isFetching: false, isSuccess: false, error: null, refetch: vi.fn() };
        },
      },
      researchCommitteeReport: {
        useQuery: (_input: undefined, options?: { enabled?: boolean }) => {
          researchOperationQueryOptions.committee.push(options);
          return { data: null, isLoading: false, isFetching: false, isSuccess: false, error: null, refetch: vi.fn() };
        },
      },
      researchGovernanceCycle: {
        useQuery: (_input: undefined, options?: { enabled?: boolean }) => {
          researchOperationQueryOptions.governance.push(options);
          return { data: null, isLoading: false, isFetching: false, isSuccess: false, error: null, refetch: vi.fn() };
        },
      },
      autonomousOperationsStatus: {
        useQuery: (_input: undefined, options?: { enabled?: boolean }) => {
          researchOperationQueryOptions.operations.push(options);
          return { data: { status: "waiting_for_real_data", evidence: { activeRun: { dataStatus: "waiting", lastError: "8050 지정단말 인증 실패" }, committee: null, governance: null, schedule: null }, queue: [], nextAction: { kind: "collect_real_daily_bars", automatic: true, title: "인증된 읽기 전용 연구 노드의 실제 일봉 원본을 기다립니다.", reason: "8050 지정단말 인증 실패" }, promotion: { permitted: false, reason: "주문·종목 추천·실전 승격을 자동으로 수행하지 않습니다." }, boundaries: [] }, isLoading: false, isFetching: false, isSuccess: false, error: null, refetch: vi.fn() };
        },
      },
      runResearchCommittee: {
        useMutation: () => ({ data: undefined, isPending: false, mutate: vi.fn(), error: null }),
      },
      historicalCandidateDetail: {
        useQuery: () => ({ data: undefined, isLoading: false }),
      },
    },
    system: {
      serverEgress: {
        useQuery: () => ({ data: { ip: null, cacheStatus: "mismatch" }, isLoading: false }),
      },
    },
    quant: {
      verifyOAuthConnection: {
        useMutation: () => ({ data: undefined, isPending: false, mutate: vi.fn(), mutateAsync: vi.fn() }),
      },
    },
  },
}));

import PublicDashboard from "../client/src/pages/PublicDashboard";

describe("공개 리서치 보드 데이터 대기 상태", () => {
  afterEach(() => {
    cleanup();
    researchOperationQueryOptions.insights = [];
    researchOperationQueryOptions.committee = [];
    researchOperationQueryOptions.governance = [];
    researchOperationQueryOptions.operations = [];
    auditQuery.value = { data: { generatedAt: new Date(), lastRequested: { runId: 1, startedAt: new Date(), updatedAt: new Date(), state: { label: "실행 불가 또는 대기", detail: "8050 지정단말 인증 실패" } }, lastVerified: null, runs: [], minuteEvidence: { minuteBarRows: 0, minuteTradingDateCount: 0, minuteSymbolCount: 0, firstMinuteAt: null, lastMinuteAt: null, lastMinuteCapturedAt: null }, readOnlyBoundary: "데이터 수집·조건식 연구만 표시하며 주문·계좌 조회·주문 전송은 이 경로에서 수행하지 않습니다." }, isLoading: false, error: null };
  });

  it("실제 후보가 없을 때에도 연결 확인 흐름과 데이터 미연결 사유를 표시한다", () => {
    render(React.createElement(PublicDashboard));

    expect(screen.getByText("실제 가격 관찰을 기다리고 있습니다.")).toBeTruthy();
    expect(screen.getAllByText("8050 지정단말 인증 실패").length).toBeGreaterThan(0);
    expect(screen.queryByText("연구 워크스페이스 로그인")).toBeNull();
    expect(screen.getByText(/상단의 ‘최근 단말 기록’은 사용자 컴퓨터에서 마지막으로 동기화한 결과/)).toBeTruthy();
    expect(screen.getByText("배포 서버 경로 · 읽기 전용 재검증")).toBeTruthy();
    expect(screen.getByText("저장 일봉으로 새 실험")).toBeTruthy();
  });

  it("초기 감사 화면에서는 무거운 자율 연구 운영 조회를 시작하지 않는다", () => {
    render(React.createElement(PublicDashboard));

    expect(screen.getByText("운영 상세 불러오기")).toBeTruthy();
    expect(researchOperationQueryOptions.insights.at(-1)?.enabled).toBe(false);
    expect(researchOperationQueryOptions.committee.at(-1)?.enabled).toBe(false);
    expect(researchOperationQueryOptions.governance.at(-1)?.enabled).toBe(false);
    expect(researchOperationQueryOptions.operations.at(-1)?.enabled).toBe(false);
  });

  it("최근 원본 기록이 있을 때만 실행 증거 수집 중으로 표시한다", () => {
    auditQuery.value = { data: { generatedAt: new Date(), lastRequested: { runId: 2, startedAt: new Date(), updatedAt: new Date(), state: { label: "실행 증거 수집 중", detail: "최근 작업 또는 원본·후보 기록이 갱신되고 있습니다." } }, lastVerified: null, runs: [], minuteEvidence: { minuteBarRows: 1, minuteTradingDateCount: 1, minuteSymbolCount: 1, firstMinuteAt: new Date(), lastMinuteAt: new Date(), lastMinuteCapturedAt: new Date() }, readOnlyBoundary: "데이터 수집·조건식 연구만 표시하며 주문·계좌 조회·주문 전송은 이 경로에서 수행하지 않습니다." }, isLoading: false, error: null };
    render(React.createElement(PublicDashboard));
    expect(screen.getAllByText(/실행 증거 수집 중/).length).toBeGreaterThan(0);
  });

  it("감사 API 오류는 완료·진행 상태 대신 오류 내용으로 표시한다", () => {
    auditQuery.value = { data: null, isLoading: false, error: new Error("감사 조회 연결이 끊겼습니다") };
    render(React.createElement(PublicDashboard));
    expect(screen.getByText("감사 기록을 불러오지 못했습니다.")).toBeTruthy();
    expect(screen.getByText("감사 조회 연결이 끊겼습니다")).toBeTruthy();
  });

  it("감사 기록이 없으면 완료나 실행 중을 주장하지 않는 빈 상태를 표시한다", () => {
    auditQuery.value = { data: { generatedAt: new Date(), lastRequested: null, lastVerified: null, runs: [], minuteEvidence: { minuteBarRows: 0, minuteTradingDateCount: 0, minuteSymbolCount: 0, firstMinuteAt: null, lastMinuteAt: null, lastMinuteCapturedAt: null }, readOnlyBoundary: "데이터 수집·조건식 연구만 표시하며 주문·계좌 조회·주문 전송은 이 경로에서 수행하지 않습니다." }, isLoading: false, error: null };
    render(React.createElement(PublicDashboard));
    expect(screen.getByText("검증 가능한 완료 기록 없음")).toBeTruthy();
    expect(screen.getByText("저장된 요청 기록이 없습니다.")).toBeTruthy();
    expect(screen.getByText("원본·후보 증거를 모두 충족한 기록이 없습니다.")).toBeTruthy();
  });

  it("검증 완료 상태에서 실행 ID·원본 행·통과/제외·대상 종목을 함께 표시한다", () => {
    const completed = { runId: 101, runKey: "autonomous-v1:2026-08-19:historical", tradingDate: "2026-08-19", phase: "completed", dataStatus: "ready", policyVersion: "autonomous-v1", startedAt: new Date(), updatedAt: new Date(), completedAt: new Date(), lastObservedAt: new Date(), lastError: null, sourceLabel: "배포 서버가 수집한 키움 ka10081 일봉", universe: ["005930 · 삼성전자", "000660 · SK하이닉스"], state: { code: "verified_completed", label: "실제 원본 검증 완료", detail: "저장된 원본 행과 조건식 결과가 모두 확인되었습니다." }, daily: { dailyBarRows: 11_400, dailySymbolCount: 2, firstDailyDate: "2024-01-02", lastDailyDate: "2026-08-19", lastDailyCapturedAt: new Date() }, candidates: { candidateRows: 100, survivedRows: 12, rejectedRows: 88, lastCandidateUpdatedAt: new Date() }, tasks: [], orderTransmission: "이 연구 실행 경로에서는 주문 API를 호출하지 않습니다." };
    auditQuery.value = { data: { generatedAt: new Date(), lastRequested: completed, lastVerified: completed, runs: [completed], minuteEvidence: { minuteBarRows: 390, minuteTradingDateCount: 1, minuteSymbolCount: 2, firstMinuteAt: new Date(), lastMinuteAt: new Date(), lastMinuteCapturedAt: new Date() }, readOnlyBoundary: "데이터 수집·조건식 연구만 표시하며 주문·계좌 조회·주문 전송은 이 경로에서 수행하지 않습니다." }, isLoading: false, error: null };
    render(React.createElement(PublicDashboard));
    expect(screen.getByText("검증 완료 #101")).toBeTruthy();
    expect(screen.getByText(/#101 · completed/)).toBeTruthy();
    expect(screen.getByText("11,400행 · 2종목")).toBeTruthy();
    expect(screen.getByText("생성 100 · 생존 12")).toBeTruthy();
    expect(screen.getByText(/제외 88/)).toBeTruthy();
    expect(screen.getByText(/005930 · 삼성전자/)).toBeTruthy();
  });
});
