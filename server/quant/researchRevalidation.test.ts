import { describe, expect, it } from "vitest";
import { classifyResearchPriority } from "./researchRevalidation";

describe("연구 재평가 작업 분류", () => {
  it("저장 실제 일봉으로 판단 가능한 과제는 내부 재평가 대상으로 분류한다", () => {
    expect(classifyResearchPriority({
      id: "V03",
      ownerRole: "independent_validation",
      title: "탐색공간과 워크포워드 결과 재점검",
      rationale: "동일 저장 원본에서 다중검정 위험을 기록한다.",
      acceptanceCriteria: "저장된 조건식·OOS·워크포워드 지표를 다시 집계한다.",
      action: "queue_research",
    })).toEqual({ scope: "stored_daily_bars", readiness: "ready_for_internal_revalidation", blocker: null });
  });

  it("신규 원자료·분 단위·상장폐지 유니버스가 필요한 과제는 사용자 요청 대기 외부 검증으로 분류한다", () => {
    expect(classifyResearchPriority({
      id: "V01",
      ownerRole: "data_quality",
      title: "상장폐지 포함 유니버스 검증",
      rationale: "생존편향을 줄여야 합니다.",
      acceptanceCriteria: "새 원자료와 상장폐지 종목을 포함해 재수집합니다.",
      action: "queue_research",
    })).toMatchObject({ scope: "external_verification", readiness: "requires_user_requested_external_verification" });
  });

  it("승격 차단·관찰 과제는 재평가 실행 대상으로 만들지 않는다", () => {
    expect(classifyResearchPriority({
      id: "B01",
      ownerRole: "risk",
      title: "실전 승격 차단 유지",
      rationale: "근거가 부족합니다.",
      acceptanceCriteria: "추가 검증 전까지 승격하지 않습니다.",
      action: "block_promotion",
    })).toMatchObject({ readiness: "observe_only", blocker: expect.stringContaining("차단") });
  });
});
