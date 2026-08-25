import { describe, expect, it } from "vitest";
import { diagnoseKiwoomTerminalCheck } from "./network";

describe("키움 단말 인증 진단 분류", () => {
  const checkedAt = new Date("2026-08-21T00:00:00.000Z");

  it("OAuth만 기록된 연결과 키움 API·서비스 왕복 확인 완료를 구분한다", () => {
    expect(diagnoseKiwoomTerminalCheck({ terminalIp: "203.0.113.42", status: "connected", errorCode: null, message: "OAuth 성공", checkedAt })).toMatchObject({ kind: "partial", title: "OAuth 토큰 발급만 기록됨" });
    expect(diagnoseKiwoomTerminalCheck({ terminalIp: "203.0.113.42", status: "connected", errorCode: null, message: "왕복 확인", verificationJson: { oauth: "passed", apiRead: "passed", serviceSync: "passed", serviceReadBack: "passed", apiId: "ka10081", responseRows: 100 }, checkedAt })).toMatchObject({ kind: "connected", title: "키움 API·서비스 왕복 확인 완료" });
  });

  it("동기화·네트워크·자격 증명·OAuth 실패를 다음 조치와 함께 구분한다", () => {
    expect(diagnoseKiwoomTerminalCheck({ terminalIp: "203.0.113.42", status: "failed", errorCode: "owner_not_ready", message: "동기화 실패", checkedAt }).kind).toBe("sync");
    expect(diagnoseKiwoomTerminalCheck({ terminalIp: "203.0.113.42", status: "failed", errorCode: "public_ip_timeout", message: "공인 IP 확인 실패", checkedAt }).kind).toBe("network");
    expect(diagnoseKiwoomTerminalCheck({ terminalIp: "203.0.113.42", status: "failed", errorCode: "missing_app_key", message: "config missing", checkedAt }).kind).toBe("credentials");
    expect(diagnoseKiwoomTerminalCheck({ terminalIp: "203.0.113.42", status: "failed", errorCode: "oauth_token_issue_failed", message: "키움 OAuth 토큰 발급 실패", checkedAt }).kind).toBe("oauth");
  });
});
