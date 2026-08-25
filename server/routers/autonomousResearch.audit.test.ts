import { describe, expect, it } from "vitest";
import { auditState, auditUniverse } from "./autonomousResearch";

function run(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    tradingDate: "2026-08-19",
    phase: "completed",
    runKey: "autonomous-v1:2026-08-19:historical",
    dataStatus: "ready",
    universeJson: null,
    policyVersion: "autonomous-v1",
    summaryJson: null,
    lastError: null,
    startedAt: new Date("2026-08-19T01:00:00.000Z"),
    lastObservedAt: null,
    completedAt: new Date("2026-08-19T01:05:00.000Z"),
    createdAt: new Date("2026-08-19T01:00:00.000Z"),
    updatedAt: new Date(),
    ...overrides,
  } as any;
}

describe("자동 연구 실행 증거 판정", () => {
  it("완료 상태라도 원본과 후보 기록이 함께 있을 때만 검증 완료로 판정한다", () => {
    expect(auditState(run(), { dailyBarRows: 11_400, candidateRows: 100, completedTaskCount: 1 }).code).toBe("verified_completed");
    expect(auditState(run(), { dailyBarRows: 0, candidateRows: 0, completedTaskCount: 0 }).code).toBe("requested");
  });

  it("대기·오류 실행은 실제 연구 진행 중으로 표현하지 않는다", () => {
    const waiting = auditState(run({ phase: "waiting_for_data", dataStatus: "waiting", lastError: "지정단말기 인증에 실패했습니다" }), { dailyBarRows: 0, candidateRows: 0, completedTaskCount: 0 });
    expect(waiting).toMatchObject({ code: "blocked", label: "실행 불가 또는 대기" });
  });

  it("최근 원본 또는 후보 기록이 갱신될 때만 실행 증거 수집 중으로 판정한다", () => {
    expect(auditState(run({ phase: "preparing", dataStatus: "pending" }), { dailyBarRows: 1, candidateRows: 0, completedTaskCount: 0 })).toMatchObject({ code: "active_evidence", label: "실행 증거 수집 중" });
  });

  it("실행별 유니버스의 종목과 종목명을 감사 기록으로 정규화한다", () => {
    expect(auditUniverse([{ symbol: "005930", name: "삼성전자" }, { symbol: "000660" }, "035420"])).toEqual(["005930 · 삼성전자", "000660", "035420"]);
  });
});
