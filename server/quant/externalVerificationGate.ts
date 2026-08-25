export const EXTERNAL_VERIFICATION_POLICY = "user_requested_only";

export function isExternalResearchVerificationEnabled(value = process.env.AUTONOMOUS_RESEARCH_EXTERNAL_DATA_ENABLED): boolean {
  return value === "true";
}

export const externalVerificationPausedMessage = "사용자 요청 전 외부 실데이터 검증 보류";
