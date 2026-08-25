import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const routerSource = readFileSync(resolve(process.cwd(), "server/routers/sharedDatasets.ts"), "utf8");
const pageSource = readFileSync(resolve(process.cwd(), "client/src/pages/SharedDatasets.tsx"), "utf8");
const appSource = readFileSync(resolve(process.cwd(), "client/src/App.tsx"), "utf8");

describe("공용 일봉·5분봉 데이터셋 아레나", () => {
  it("인증 사용자의 실제 읽기 전용 고정 IP 수집 요청만 허용하고 요청 지문으로 재사용한다", () => {
    expect(routerSource).toContain("collectRandomShared: protectedProcedure");
    expect(routerSource).toContain("sharedDatasetCollectionRequests");
    expect(routerSource).toContain("requestFingerprint");
    expect(routerSource).toContain("listMyCollectionRequests");
    expect(routerSource).toContain("resumeCollection: protectedProcedure");
    expect(routerSource).toContain("vaultSummary: publicProcedure");
    expect(routerSource).toContain('inArray(sharedDatasetCollectionRequests.status, ["queued", "running"])');
    expect(routerSource).not.toContain("KiwoomClient");
    expect(routerSource).not.toContain("getTurnoverRankings");
    expect(routerSource).not.toMatch(/(submitOrder|sendOrder|orderIntent|accountEvaluation)/);
  });

  it("누구나 공용 카탈로그를 읽고 본인 조건식으로 동일 원본 백테스트 결과를 저장한다", () => {
    expect(routerSource).toContain("listPublic: publicProcedure");
    expect(routerSource).toContain("runBacktest: protectedProcedure");
    expect(routerSource).toContain("sharedDatasetBacktests");
    expect(routerSource).toContain("datasetVersionKey");
    expect(routerSource).toContain("informationCutoffBars: 1");
  });

  it("게임 화면은 공용 데이터 수집·카탈로그·일봉/5분봉 재생을 하나의 흐름으로 제공한다", () => {
    expect(appSource).toContain('window.location.pathname === "/datasets"');
    expect(appSource).toContain("<SharedDatasets/>");
    expect(pageSource).toContain("키움 단말 수동 수집 요청 만들기");
    expect(pageSource).toContain("myKiwoomTerminalStatus");
    expect(pageSource).toContain("단말 인증 성공 · 수집 요청 활성화");
    expect(pageSource).toContain("단말 인증 후 수집 요청 활성화");
    expect(pageSource).toContain("terminal-collection-status");
    expect(pageSource).toContain("Notification.requestPermission");
    expect(pageSource).toContain("공용 데이터 수집 완료");
    expect(pageSource).toContain("공용 데이터 수집 실패");
    expect(pageSource).toContain("수집 완료 알림 켜기");
    expect(pageSource).toContain("REAL-TIME COLLECTION CONTROL · 4초 자동 갱신");
    expect(pageSource).toContain("지금 새로고침");
    expect(pageSource).toContain("단말 수집기 접수");
    expect(pageSource).toContain("일봉·5분봉 원본 검증");
    expect(pageSource).toContain("마지막 상태 확인:");
    expect(pageSource).toContain("수집기가 아직 요청을 접수하지 않았습니다");
    expect(pageSource).toContain("게이지는 시간 경과가 아니라 실제 수집 증거가 갱신될 때만 움직입니다");
    expect(pageSource).toContain("run-shared-dataset-collector.cmd를 실행하세요");
    expect(pageSource).toContain("QUEUED · 수집기 미접수");
    expect(pageSource).toContain("function collectionEvidenceAt");
    expect(pageSource).toContain("request.completedAt ?? request.startedAt ?? request.requestedAt");
    expect(pageSource).toContain("const latestRequest = useMemo");
    expect(pageSource).toContain("PUBLIC DATASET CATALOG");
    expect(pageSource).toContain("dataset-catalog-skeleton");
    expect(pageSource).toContain("dataset-catalog-pagination");
    expect(pageSource).toContain("공용 데이터셋 카탈로그를 준비하고 있습니다.");
    expect(pageSource).toContain("목록 다시 불러오기");
    expect(pageSource).toContain("REPLAY BACKTEST");
    expect(pageSource).toContain("5분봉");
    expect(pageSource).toContain("주문 분리");
    expect(pageSource).toContain("DatasetCollectionControlPanel");
    expect(pageSource).toContain("resumeLatestCollection");
    expect(pageSource).toContain("vaultSummary");
    expect(pageSource).toContain("collectionProfileId");
  });
});
