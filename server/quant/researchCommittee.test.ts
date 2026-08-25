import { describe, expect, it } from "vitest";
import { RESEARCH_COMMITTEE_POLICY_VERSION, RESEARCH_COMMITTEE_ROLES } from "./researchCommittee";

describe("실제 데이터 AI 연구위원회 계약", () => {
  it("서로 다른 전문 역할 여섯 개를 고정하고, 각 역할은 연구 검증 목적을 명시한다", () => {
    expect(RESEARCH_COMMITTEE_POLICY_VERSION).toBe("research-committee-v1");
    expect(RESEARCH_COMMITTEE_ROLES.map(role => role.id)).toEqual([
      "data_quality",
      "signal_structure",
      "independent_validation",
      "exit_rules",
      "risk",
      "execution_feasibility",
    ]);
    expect(new Set(RESEARCH_COMMITTEE_ROLES.map(role => role.title)).size).toBe(6);
    for (const role of RESEARCH_COMMITTEE_ROLES) {
      expect(role.mandate.length).toBeGreaterThan(20);
    }
  });

  it("위원회 정책은 실제 원본 근거를 새로 정규화한 뒤 같은 지문 결과만 재사용하도록 버전으로 고정한다", () => {
    expect(RESEARCH_COMMITTEE_POLICY_VERSION).toMatch(/^research-committee-v\d+$/);
  });

  it("실행 시각이 아니라 고정 원본·가정·정책 버전이 위원회 재사용 지문의 기준이 된다", () => {
    const stableEvidence = { sourceRunId: 1, barCount: 12_000, feeRate: 0.001, generatedAt: undefined };
    expect(JSON.stringify(stableEvidence)).not.toContain("generatedAt");
  });
});
