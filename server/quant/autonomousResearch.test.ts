import { describe, expect, it } from "vitest";
import { AUTONOMOUS_RESEARCH_POLICY, buildAutonomousRunKey, getAutonomousResearchPhase, getKoreaTradingDate, getWaitingForDataTransition } from "./autonomousResearch";

describe("무설정 장중 자동 리서치 정책", () => {
  it("한국 거래 시간에만 준비·개장·장중·마감 단계를 판정한다", () => {
    expect(getAutonomousResearchPhase(new Date("2026-08-17T23:55:00.000Z"))).toBe("preparing");
    expect(getAutonomousResearchPhase(new Date("2026-08-18T00:05:00.000Z"))).toBe("opening");
    expect(getAutonomousResearchPhase(new Date("2026-08-18T01:00:00.000Z"))).toBe("intraday");
    expect(getAutonomousResearchPhase(new Date("2026-08-18T06:25:00.000Z"))).toBe("closing");
    expect(getAutonomousResearchPhase(new Date("2026-08-15T01:00:00.000Z"))).toBeNull();
  });

  it("같은 장중 분에는 동일하고 다음 분에는 다른 멱등 실행 키를 만들며 날짜는 한국 표준시를 사용한다", () => {
    const first = new Date("2026-08-18T01:02:10.000Z");
    const sameMinute = new Date("2026-08-18T01:02:59.000Z");
    const nextMinute = new Date("2026-08-18T01:03:00.000Z");
    expect(getKoreaTradingDate(first)).toBe("2026-08-18");
    expect(buildAutonomousRunKey(first, "intraday")).toBe(buildAutonomousRunKey(sameMinute, "intraday"));
    expect(buildAutonomousRunKey(first, "intraday")).not.toBe(buildAutonomousRunKey(nextMinute, "intraday"));
    expect(buildAutonomousRunKey(first, "intraday")).toContain(AUTONOMOUS_RESEARCH_POLICY.version);
  });

  it("실제 데이터가 없으면 모의 수치를 만들지 않고 연결 대기 상태로 끝낸다", () => {
    expect(getWaitingForDataTransition("8050 지정단말 인증 실패")).toEqual({
      phase: "waiting_for_data",
      dataStatus: "waiting",
      lastError: "8050 지정단말 인증 실패",
      summary: { reason: "8050 지정단말 인증 실패", policyVersion: AUTONOMOUS_RESEARCH_POLICY.version },
    });
  });
});
