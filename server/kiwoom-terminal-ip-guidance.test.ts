import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const visitorBadge = readFileSync(resolve(process.cwd(), "client/src/components/VisitorIpBadge.tsx"), "utf8");
const serverBadge = readFileSync(resolve(process.cwd(), "client/src/components/ServerEgressBadge.tsx"), "utf8");
const terminalCheck = readFileSync("/mnt/1cc81634-8f0d-44a9-a846-2212c1e08d5a/kiwoom-research-node/check-kiwoom-rest-connection.mjs", "utf8");

describe("키움 REST 단말 인증 IP 안내", () => {
  it("브라우저 요청 IP와 서버 REST 출발지 IP를 등록 IP로 오해하지 않도록 구분한다", () => {
    expect(visitorBadge).toContain("브라우저 IP");
    expect(serverBadge).toContain("서버 REST IP");
    expect(serverBadge).not.toContain("키움 등록 IP");
  });

  it("사용자 컴퓨터에서 IP를 출력한 뒤 주문·계좌 API 없이 OAuth 토큰만 점검한다", () => {
    expect(terminalCheck).toContain("키움 단말 등록 IP:");
    expect(terminalCheck).toContain("issueTokenRequest");
    expect(terminalCheck).toContain("주문·계좌 API는 호출하지 않습니다");
    expect(terminalCheck).toContain("/api/local-research-node/kiwoom-terminal-connection");
    expect(terminalCheck).toContain("status: \"connected\"");
    expect(terminalCheck).toContain("status: \"failed\"");
    expect(terminalCheck).not.toMatch(/domesticOrder|domesticAccount|submitOrder|sendOrder/);
  });
});
