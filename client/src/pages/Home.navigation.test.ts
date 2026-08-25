import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const homeSource = readFileSync(fileURLToPath(new URL("./Home.tsx", import.meta.url)), "utf8");
const minuteResearchWorkspaceSource = readFileSync(fileURLToPath(new URL("../components/MinuteResearchWorkspace.tsx", import.meta.url)), "utf8");
const paperPortfolioSource = readFileSync(fileURLToPath(new URL("../components/PaperPortfolioPanel.tsx", import.meta.url)), "utf8");
const publicDashboardSource = readFileSync(fileURLToPath(new URL("./PublicDashboard.tsx", import.meta.url)), "utf8");

describe("운영자 메뉴의 관찰·포트폴리오·주문 구분", () => {
  it("햄버거 메뉴에서 장중 관찰, 모의 포트폴리오, 실제 주문 기록을 별도 항목으로 제공한다", () => {
    expect(homeSource).toContain('label: "장중 실제 가격 관찰"');
    expect(homeSource).toContain('label: "실제 가격 기반 모의 포트폴리오"');
    expect(homeSource).toContain('label: "실제 주문 · 체결 기록"');
    expect(homeSource).toContain('group: "장중 · 포트폴리오"');
    expect(homeSource).toContain('aria-label="기능 메뉴 열기"');
    expect(homeSource).toContain("setMenuOpen(true)");
  });

  it("관찰과 모의 포지션, 주문 초안을 매수·체결 기록과 혼동하지 않도록 구분한다", () => {
    expect(homeSource).toContain('title="장중 실제 가격 관찰"');
    expect(homeSource).toContain("매수·전송·체결을 뜻하지 않습니다.");
    expect(homeSource).toContain("실제 주문 · 체결");
    expect(paperPortfolioSource).toContain("실제 계좌 매수와는 별개입니다.");
    expect(paperPortfolioSource).toContain("실제 계좌 보유 아님");
    expect(paperPortfolioSource).toContain("showOrderDrafts = false");
  });

  it("생존 조건식 선택 뒤 상세 영역으로 이동해 긴 결과 화면에서도 상세 보기를 놓치지 않는다", () => {
    expect(publicDashboardSource).toContain("detailRef.current?.scrollIntoView");
    expect(publicDashboardSource).toContain('ref={detailRef}');
  });

  it("운영자 메인은 대량 1분봉 검증과 누적 생존 조건식 탐색을 우선 제공한다", () => {
    expect(homeSource).toContain("MinuteResearchWorkspace");
    expect(minuteResearchWorkspaceSource).toContain("MINUTE-BAR RESEARCH ENGINE");
    expect(minuteResearchWorkspaceSource).toContain("수천 개 조합을 돌리고");
    expect(minuteResearchWorkspaceSource).toContain("매일 반복할 탐색 규격");
    expect(minuteResearchWorkspaceSource).toContain("CUMULATIVE SURVIVORS");
  });

  it("조건식 평가와 저장형 랭킹이 실제 불변 일봉 스냅샷의 출처·버전을 사용자에게 알린다", () => {
    expect(homeSource).toContain("evidence.data.source");
    expect(homeSource).toContain("로컬 ka10081 불변 스냅샷");
    expect(homeSource).toContain("snapshotDatasetIds.join");
    expect(homeSource).toContain("const provenance = isLocalSnapshot");
    expect(homeSource).toContain("dailyBars.data.datasetVersionKey");
  });
});
