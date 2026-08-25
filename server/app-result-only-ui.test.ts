import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(resolve(process.cwd(), "client/src/App.tsx"), "utf8");

describe("게임 아레나 앱 진입점", () => {
  it("공개 루트는 게임 진입 화면을, 연구 기록과 운영 워크스페이스는 별도 경로를 렌더링한다", () => {
    expect(appSource).toContain('window.location.pathname === "/research"');
    expect(appSource).toContain("<GameEntry/>");
    expect(appSource).toContain("<PublicMinuteResearchDashboard/>");
    expect(appSource).toContain('window.location.pathname === "/operator"');
    expect(appSource).toContain("<Home/>");
    expect(appSource).not.toContain("useAuth");
    expect(appSource).not.toContain("trpc.auth.operator");
  });
});
