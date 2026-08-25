import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { currentJourneyStep } from "./ResearchTopNav";

const navigationSource = readFileSync(fileURLToPath(new URL("./ResearchTopNav.tsx", import.meta.url)), "utf8");
const visitorIpSource = readFileSync(fileURLToPath(new URL("./VisitorIpBadge.tsx", import.meta.url)), "utf8");

describe("공통 연구 여정 단계", () => {
  it("게임 진입과 컬렉션은 아직 완료 단계가 아닌 시작 상태로 유지한다", () => {
    expect(currentJourneyStep("/")).toBeNull();
    expect(currentJourneyStep("/collection")).toBeNull();
  });

  it("실제 연구 단계 화면은 해당 단계를 정확히 선택한다", () => {
    expect(currentJourneyStep("/connection-audit")).toBe("connection");
    expect(currentJourneyStep("/datasets")).toBe("dataset");
    expect(currentJourneyStep("/arena")).toBe("battle");
    expect(currentJourneyStep("/research")).toBe("results");
    expect(currentJourneyStep("/intraday")).toBe("results");
  });

  it("모든 경로에서 공인 IP·단말 상태·최근 점검을 표시하는 공통 상태 바를 제공한다", () => {
    expect(navigationSource).toContain('data-testid="global-live-connection-status"');
    expect(navigationSource).toContain("<VisitorIpBadge compact/>");
    expect(navigationSource).toContain("키움 등록 단말 IPv4 · {connectionLabel}");
    expect(navigationSource).toContain("최근 왕복 확인 완료");
    expect(navigationSource).toContain("최근 OAuth만 확인됨");
    expect(navigationSource).toContain("키움 API·서비스 왕복 확인 완료");
    expect(navigationSource).toContain("lastCheckLabel");
    expect(navigationSource).not.toContain('currentPath === "/connection-audit" && <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 py-2 text-[11px] sm:px-7 lg:px-10"><VisitorIpBadge');
    expect(visitorIpSource).toContain("refetchInterval: 30_000");
    expect(visitorIpSource).toContain('fetch("https://api.ipify.org?format=json"');
    expect(visitorIpSource).toContain("이 브라우저 인터넷 IPv4 · 키움 등록 주소 아님");
    expect(visitorIpSource).toContain("현재 브라우저 IPv4");
    expect(visitorIpSource).toContain('cache: "no-store"');
  });
});
