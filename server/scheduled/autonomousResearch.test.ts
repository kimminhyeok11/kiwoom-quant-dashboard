import { describe, expect, it } from "vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getAutonomousTaskSkip, isExternalResearchCollectionEnabled, shouldStartAutonomousResearchWorker } from "./autonomousResearch";

describe("자동 리서치 작업 멱등성", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("같은 runKey의 플랫폼 재시도는 실행 중·완료 상태를 다시 수집하지 않는다", () => {
    expect(getAutonomousTaskSkip(undefined)).toBeNull();
    expect(getAutonomousTaskSkip({ status: "running" })).toBe("already-running");
    expect(getAutonomousTaskSkip({ status: "completed" })).toBe("already-completed");
    expect(getAutonomousTaskSkip({ status: "waiting_for_data" })).toBe("already-completed");
  });

  it("상시 실행 워커는 기본 활성화하며 명시적으로 false인 경우에만 비활성화한다", () => {
    expect(shouldStartAutonomousResearchWorker(undefined)).toBe(true);
    expect(shouldStartAutonomousResearchWorker("true")).toBe(true);
    expect(shouldStartAutonomousResearchWorker("false")).toBe(false);
  });

  it("외부 키움 데이터 수집은 사용자 요청에 따라 명시적으로 활성화할 때만 허용한다", () => {
    vi.stubEnv("AUTONOMOUS_RESEARCH_EXTERNAL_DATA_ENABLED", "false");
    expect(isExternalResearchCollectionEnabled(undefined)).toBe(false);
    expect(isExternalResearchCollectionEnabled("false")).toBe(false);
    expect(isExternalResearchCollectionEnabled("true")).toBe(true);
  });

  it("실제 데이터 허용 환경 변수가 true면 기본 수집 경로를 활성화한다", () => {
    vi.stubEnv("AUTONOMOUS_RESEARCH_EXTERNAL_DATA_ENABLED", "true");
    expect(isExternalResearchCollectionEnabled(undefined)).toBe(true);
  });
});
