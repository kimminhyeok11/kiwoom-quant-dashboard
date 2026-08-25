import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const scriptSource = readFileSync(resolve("/mnt/1cc81634-8f0d-44a9-a846-2212c1e08d5a/kiwoom-research-node/check-kiwoom-rest-connection.mjs"), "utf8");

describe("키움 단말 점검 로컬 진단 이력", () => {
  it("설정·공인 IP·OAuth·키움 읽기 API·동기화·저장 결과 재확인 단계를 비밀값 없이 로컬 진단 이력에 기록한다", () => {
    expect(scriptSource).toContain("terminal-connection-diagnostics.jsonl");
    expect(scriptSource).toContain('phase: "local_configuration"');
    expect(scriptSource).toContain('phase: "public_ip"');
    expect(scriptSource).toContain('phase: "kiwoom_oauth"');
    expect(scriptSource).toContain('phase: "kiwoom_api_read"');
    expect(scriptSource).toContain('phase: "dashboard_sync"');
    expect(scriptSource).toContain('phase: "dashboard_read_back"');
    expect(scriptSource).toContain("readStoredConnection");
    expect(scriptSource).toContain("probeKiwoomReadApi");
    expect(scriptSource).toContain("[redacted]");
    expect(scriptSource).not.toContain("console.log(process.env.KIWOOM_APP_SECRET");
  });
});
