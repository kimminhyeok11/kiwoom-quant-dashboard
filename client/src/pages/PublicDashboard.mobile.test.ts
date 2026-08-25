import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dashboardSource = readFileSync(fileURLToPath(new URL("./PublicDashboard.tsx", import.meta.url)), "utf8");
const globalStyles = readFileSync(fileURLToPath(new URL("../index.css", import.meta.url)), "utf8");

describe("PublicDashboard 모바일 반응형 디자인 계약", () => {
  it("대시보드·지표 카드에 모바일 밀도 제어 식별자를 둔다", () => {
    expect(dashboardSource).toContain('className="research-dashboard');
    expect(dashboardSource).toContain('className="metric-card');
    expect(dashboardSource).toContain('className={`metric-explainer');
  });

  it("좁은 화면에서 제목·카드 패딩·핵심 지표 그리드·실행 버튼을 압축한다", () => {
    expect(globalStyles).toContain("@media (max-width: 639px)");
    expect(globalStyles).toContain(".research-dashboard > div > header h1");
    expect(globalStyles).toContain(".research-dashboard .metric-explainer");
    expect(globalStyles).toContain("grid-template-columns: repeat(2, minmax(0, 1fr));");
    expect(globalStyles).toContain("section:nth-of-type(2)");
  });

  it("공개 메인 상단에 햄버거 메뉴와 핵심 리서치 바로가기를 제공한다", () => {
    expect(dashboardSource).toContain('aria-label="공개 기능 메뉴 열기"');
    expect(dashboardSource).toContain('aria-label="공개 리서치 기능 메뉴"');
    expect(dashboardSource).toContain("키움 연결");
    expect(dashboardSource).toContain("과거 백테스트");
  });

  it("로컬 지정 IP의 실제 ka10081 불변 일봉 원본을 결과 출처로 구분한다", () => {
    expect(dashboardSource).toContain("kiwoom_ka10081_local_snapshot");
    expect(dashboardSource).toContain("사용자 컴퓨터의 키움 지정 IP에서 수집한 ka10081 실제 일봉 불변 스냅샷");
    expect(dashboardSource).toContain("종목 ·");
    expect(dashboardSource).toContain("개 일봉 ·");
  });

  it("장중 실행이 대기여도 완료된 실제 일봉 연구 결과를 공개 상단 상태에 우선 반영한다", () => {
    expect(dashboardSource).toContain("const displayRun = run?.dataStatus === \"ready\"");
    expect(dashboardSource).toContain("displayRun ? phaseLabel[displayRun.phase]");
    expect(dashboardSource).toContain("저장 연구 불러오는 중");
    expect(dashboardSource).toContain("실제 데이터 연결 대기");
  });

  it("카드 테두리 대신 콘텐츠 흐름을 사용하고 큰 화면 폭을 넓게 활용한다", () => {
    expect(globalStyles).toContain("카드 표면 대신 제목·간격·가느다란 흐름선");
    expect(globalStyles).toContain("border: 0 !important;");
    expect(globalStyles).toContain("max-width: 96rem !important;");
    expect(globalStyles).toContain("padding-left: clamp(2rem, 5vw, 6rem)");
  });
});
