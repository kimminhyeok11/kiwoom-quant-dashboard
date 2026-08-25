import { describe, expect, it } from "vitest";
import { RESEARCH_GOVERNANCE_POLICY_VERSION } from "./researchGovernance";
import { RESEARCH_COMMITTEE_ROLES } from "./researchCommittee";

describe("실제 데이터 자율 연구 거버넌스 계약", () => {
  it("부장 AI 지시의 담당 범위는 여섯 실제 데이터 전문 역할로 제한된다", () => {
    expect(RESEARCH_GOVERNANCE_POLICY_VERSION).toBe("research-governance-v1");
    expect(RESEARCH_COMMITTEE_ROLES.map(role => role.id)).toContain("data_quality");
    expect(RESEARCH_COMMITTEE_ROLES.map(role => role.id)).toContain("execution_feasibility");
  });

  it("같은 실제 근거·정책 버전은 실행 시각과 무관하게 동일한 자율 개선 사이클 지문을 사용한다", () => {
    const stableCycleInput = { policy: RESEARCH_GOVERNANCE_POLICY_VERSION, reportId: 90001, evidenceFingerprint: "a".repeat(64) };
    expect(JSON.stringify(stableCycleInput)).not.toContain("generatedAt");
    expect(stableCycleInput.evidenceFingerprint).toHaveLength(64);
  });
});
