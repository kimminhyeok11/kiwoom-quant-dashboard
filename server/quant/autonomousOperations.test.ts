import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDb } = vi.hoisted(() => ({ getDb: vi.fn() }));

vi.mock("../db", () => ({ getDb }));

import { getAutonomousOperationsStatus } from "./autonomousOperations";

describe("autonomous operations status", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses stored real daily bars for the governance queue while keeping external-only validation and promotion blocked", async () => {
    const rows = [
      [{ id: 60001, runKey: "autonomous-v1:2026-08-17:day", phase: "waiting_for_data", dataStatus: "waiting", updatedAt: new Date("2026-08-17T01:00:00Z"), lastError: "지정 단말 인증 대기" }],
      [{ id: 30001, runKey: "autonomous-v1:2026-08-15:historical:reuse:1", dataStatus: "ready", updatedAt: new Date("2026-08-15T01:00:00Z") }],
      [{ id: 90001, status: "completed", evidenceFingerprint: "evidence-fingerprint", updatedAt: new Date("2026-08-15T02:00:00Z") }],
      [{ id: 1, status: "completed", cycleFingerprint: "cycle-fingerprint", updatedAt: new Date("2026-08-15T03:00:00Z"), managerDirectiveJson: { final: { priorities: [{ id: "V01", ownerRole: "data_quality", title: "유니버스 검증", rationale: "생존편향 점검", acceptanceCriteria: "상장폐지 포함 여부를 기록", action: "queue_research" }] } } }],
      [{ isEnabled: true, cronExpression: "0 20 8 * * 1-5", lastRequestedAt: new Date("2026-08-15T04:00:00Z") }],
      [{ id: 41, governanceCycleId: 1, priorityId: "V01", priorityTitle: "유니버스 검증", scope: "external_verification", status: "blocked", blocker: "사용자 요청 대기", lastError: null, updatedAt: new Date("2026-08-15T05:00:00Z"), resultJson: null }],
    ];
    const db = {
      select: () => ({
        from: () => {
          const terminal = { limit: async () => rows.shift() ?? [] };
          return {
            orderBy: () => terminal,
            where: () => ({ orderBy: () => terminal }),
          };
        },
      }),
    };
    getDb.mockResolvedValue(db);

    const result = await getAutonomousOperationsStatus();

    expect(result.status).toBe("validation_required");
    expect(result.evidence?.activeRun).toMatchObject({ dataStatus: "waiting", lastError: "지정 단말 인증 대기" });
    expect(result.queue).toEqual([expect.objectContaining({ id: "V01", action: "queue_research", acceptanceCriteria: "상장폐지 포함 여부를 기록", readiness: "requires_user_requested_external_verification" })]);
    expect(result.nextAction).toEqual(expect.objectContaining({ kind: "queue_research", automatic: false }));
    expect(result.revalidations).toEqual([expect.objectContaining({ priorityId: "V01", scope: "external_verification", status: "blocked" })]);
    expect(result.externalVerification).toEqual(expect.objectContaining({ mode: "user_requested_only", enabled: false }));
    expect(result.promotion).toEqual(expect.objectContaining({ permitted: false }));
  });

  it("keeps the remaining operations status available when the historical research lookup fails", async () => {
    const rows: Array<unknown> = [
      [{ id: 60001, runKey: "autonomous-v1:2026-08-19:day", phase: "waiting_for_data", dataStatus: "waiting", updatedAt: new Date("2026-08-19T01:00:00Z"), lastError: null }],
      new Error("temporary database connection reset"),
      [{ id: 90001, status: "completed", evidenceFingerprint: "evidence-fingerprint", updatedAt: new Date("2026-08-19T02:00:00Z") }],
      [{ id: 1, status: "completed", cycleFingerprint: "cycle-fingerprint", updatedAt: new Date("2026-08-19T03:00:00Z"), managerDirectiveJson: { final: { priorities: [] } } }],
      [{ isEnabled: true, cronExpression: "0 20 8 * * 1-5", lastRequestedAt: new Date("2026-08-19T04:00:00Z") }],
      [],
    ];
    const db = {
      select: () => ({
        from: () => {
          const terminal = { limit: async () => {
            const value = rows.shift();
            if (value instanceof Error) throw value;
            return value ?? [];
          } };
          return {
            orderBy: () => terminal,
            where: () => ({ orderBy: () => terminal }),
          };
        },
      }),
    };
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    getDb.mockResolvedValue(db);

    const result = await getAutonomousOperationsStatus();

    expect(result.status).toBe("historical_lookup_unavailable");
    expect(result.evidence?.activeRun).toMatchObject({ id: 60001, dataStatus: "waiting" });
    expect(result.evidence?.committee).toMatchObject({ id: 90001, status: "completed" });
    expect(result.evidence?.historicalRun).toBeNull();
    expect(result.nextAction).toMatchObject({ kind: "retry_historical_lookup", automatic: true });
    expect(result.boundaries).toContain("과거 연구 실행 조회가 일시적으로 실패했으나 나머지 자동 운영 상태는 표시합니다.");
    expect(warning).toHaveBeenCalledWith(expect.stringContaining("Historical research lookup failed"), expect.stringContaining("temporary database connection reset"));
  });
});
