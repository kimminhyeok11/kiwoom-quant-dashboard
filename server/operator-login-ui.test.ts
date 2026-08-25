import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const publicDashboardSource = readFileSync(resolve(process.cwd(), "client/src/pages/PublicDashboard.tsx"), "utf8");
const operatorDashboardSource = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");

describe("운영자 로그인 UI", () => {
  it("공개 자동 리서치 보드는 사용자 로그인 진입을 제공하지 않는다", () => {
    expect(publicDashboardSource).toContain("조건식 연구 결과");
    expect(publicDashboardSource).not.toContain("startLogin");
    expect(publicDashboardSource).not.toContain("연구 워크스페이스 로그인");
    expect(publicDashboardSource).not.toContain("SALAD20C@GMAIL.COM");
  });

  it("기존 수동 연구 화면의 인증 제어는 자동 결과 앱 진입점에서 렌더링하지 않는다", () => {
    expect(operatorDashboardSource).toContain("function OperatorAccount()");
    const appSource = readFileSync(resolve(process.cwd(), "client/src/App.tsx"), "utf8");
    expect(appSource).not.toContain("OperatorAccount");
    expect(appSource).not.toContain("useAuth");
  });
});
