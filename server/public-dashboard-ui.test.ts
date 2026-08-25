import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const publicDashboardSource = readFileSync(resolve(process.cwd(), "client/src/pages/PublicDashboard.tsx"), "utf8");

describe("공개 리서치 보드", () => {
  it("실제 데이터 원칙과 일반 사용자를 위한 성과 설명·상세 보기를 렌더링한다", () => {
    expect(publicDashboardSource).toContain("조건식 연구 결과");
    expect(publicDashboardSource).toContain("과거 실제 일봉 백테스트");
    expect(publicDashboardSource).toContain("성과 지표 읽는 법");
    expect(publicDashboardSource).toContain("조건식 상세 분석");
    expect(publicDashboardSource).toContain("ServerEgressBadge");
    expect(publicDashboardSource).toContain("과거 실험값이며 미래 예측이 아닙니다");
    expect(publicDashboardSource).not.toContain("startLogin");
    expect(publicDashboardSource).not.toContain("useAuth");
    expect(publicDashboardSource).not.toContain("로그아웃");
  });

  it("공개 화면은 자동 리서치 조회·안전한 OAuth·저장 데이터 재사용·후보 상세 조회만 호출하고 수동·브로커·주문·계좌 API를 호출하지 않는다", () => {
    expect(publicDashboardSource).toContain("trpc.autonomousResearch.latest.useQuery");
    expect(publicDashboardSource).toContain("trpc.quant.verifyOAuthConnection.useMutation");
    expect(publicDashboardSource).toContain("trpc.autonomousResearch.runHistoricalBacktest.useMutation");
    expect(publicDashboardSource).toContain("trpc.autonomousResearch.reuseHistoricalDataset.useMutation");
    expect(publicDashboardSource).toContain("trpc.autonomousResearch.historicalResearchInsights.useQuery");
    expect(publicDashboardSource).toContain("trpc.autonomousResearch.historicalCandidateDetail.useQuery");
    expect(publicDashboardSource).not.toMatch(/trpc\.(rankings|account|orders|tradingProfile|presets|backtests|research)\./);
    expect(publicDashboardSource).not.toMatch(/trpc\.quant\.(?!verifyOAuthConnection\.)/);
  });

  it("생존 조건식의 읽기 쉬운 규칙·실제 진입과 청산 타점·거래별 성과·용어 설명을 제공한다", () => {
    expect(publicDashboardSource).toContain("사람이 읽는 조건 조합");
    expect(publicDashboardSource).toContain("대표 진입·청산 타점");
    expect(publicDashboardSource).toContain("거래별 실제 성과");
    expect(publicDashboardSource).toContain("익절 거래 비율");
    expect(publicDashboardSource).toContain("성과 지표 읽는 법");
    expect(publicDashboardSource).toContain("저장 일봉으로 새 실험");
    expect(publicDashboardSource).toContain("상위 조건식이 공통으로 사용한 신호");
    expect(publicDashboardSource).toContain("일봉 스윙 청산 규칙 비교");
    expect(publicDashboardSource).toContain("같은 일봉에서 목표 익절가와 손절가가 모두 닿으면 보수적으로 손절을 먼저 적용");
    expect(publicDashboardSource).toContain("전문 연구 점검: 수익률만으로 선발하지 않습니다");
    expect(publicDashboardSource).toContain("청산 규칙의 국면별 견고성");
    expect(publicDashboardSource).toContain("전문가형 한계 점검");
  });

  it("실제 데이터 결과와 구분되는 AI 연구위원회의 근거·토론·합의·추가 검증을 표시한다", () => {
    expect(publicDashboardSource).toContain("AI RESEARCH COMMITTEE");
    expect(publicDashboardSource).toContain("실전성 검증 연구위원회");
    expect(publicDashboardSource).toContain("예시·생성 시장 데이터, 계좌·주문 정보, 미기록 장중 시퀀스는 입력에서 차단합니다");
    expect(publicDashboardSource).toContain("COMMITTEE CONSENSUS");
    expect(publicDashboardSource).toContain("위원별 검토와 상호 반박 포인트");
    expect(publicDashboardSource).toContain("합의된 추가 검증 항목");
    expect(publicDashboardSource).toContain("trpc.autonomousResearch.researchCommitteeReport.useQuery");
    expect(publicDashboardSource).toContain("trpc.autonomousResearch.runResearchCommittee.useMutation");
  });

  it("부장 AI의 자율 개선 지시와 팀장 후속 검토를 실제 연구 결과와 분리해 표시한다", () => {
    expect(publicDashboardSource).toContain("AUTONOMOUS RESEARCH GOVERNANCE");
    expect(publicDashboardSource).toContain("부장 AI의 자율 개선 지시");
    expect(publicDashboardSource).toContain("팀장 후속 검토와 반박");
    expect(publicDashboardSource).toContain("코드·주문·미검증 조건식 승격은 자동 실행하지 않습니다");
    expect(publicDashboardSource).toContain("trpc.autonomousResearch.researchGovernanceCycle.useQuery");
  });

  it("자율 운영 상태와 저장 데이터 재평가·외부 원본 필요 상태를 명확히 표시한다", () => {
    expect(publicDashboardSource).toContain("AUTONOMOUS OPERATIONS");
    expect(publicDashboardSource).toContain("KIWOOM CONNECTION");
    expect(publicDashboardSource).toContain("OAuth → 일봉 → 연구");
    expect(publicDashboardSource).toContain("배포 서버에서 다시 확인");
    expect(publicDashboardSource).toContain("주문·계좌 조회·주문 전송은 포함하지 않습니다");
    expect(publicDashboardSource).toContain("STORED-DATA REVALIDATION");
    expect(publicDashboardSource).toContain("부장 AI 지시의 자동 재평가 기록");
    expect(publicDashboardSource).toContain("저장 일봉 내부 재평가 완료");
    expect(publicDashboardSource).toContain("OOS 양(+)");
    expect(publicDashboardSource).toContain("워크포워드 양(+)");
    expect(publicDashboardSource).toContain("수용 기준 자동 충족·실전 승격 아님");
    expect(publicDashboardSource).toContain("외부 원본 필요");
    expect(publicDashboardSource).toContain("trpc.autonomousResearch.autonomousOperationsStatus.useQuery");
    expect(publicDashboardSource).toContain("실전 승격 경계");
  });
});
