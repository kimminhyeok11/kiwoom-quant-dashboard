import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(resolve(process.cwd(), "client/src/App.tsx"), "utf8");
const gameEntrySource = readFileSync(resolve(process.cwd(), "client/src/pages/GameEntry.tsx"), "utf8");
const personalArenaSource = readFileSync(resolve(process.cwd(), "client/src/pages/PersonalArena.tsx"), "utf8");

describe("개인 아레나와 첫 배틀 튜토리얼 UI", () => {
  it("일반 로그인 사용자는 운영자 경로가 아닌 개인 아레나로 진입한다", () => {
    expect(appSource).toContain('window.location.pathname === "/arena"');
    expect(appSource).toContain("<PersonalArena/>");
    expect(gameEntrySource).toContain('user?.isOperator ? "/operator" : "/arena"');
    expect(gameEntrySource).toContain("${trainerArenaPath}?deck=${deck}&size=${arenaSize}");
  });

  it("개인 아레나는 사용자 전용 연구 데이터만 읽고 연구 실행만 호출한다", () => {
    expect(personalArenaSource).toContain("trpc.minuteResearch.personalDashboard.useQuery");
    expect(personalArenaSource).toContain("trpc.minuteResearch.runPersonal.useMutation");
    expect(personalArenaSource).toContain("계좌·주문 미접근");
    expect(personalArenaSource).not.toMatch(/trpc\.(orders|account|tradingProfile|paperPortfolio)\./);
  });

  it("공용 데이터셋에서 고른 조건식 카드·시간 단위·원본 목록은 개인 아레나의 실제 다중 원본 배틀로 전달된다", () => {
    expect(gameEntrySource).not.toContain("sharedDatasetIds");
    expect(personalArenaSource).toContain("sharedDatasetIds");
    expect(personalArenaSource).toContain("trpc.sharedDatasets.runMultiDatasetBacktest.useMutation");
    expect(personalArenaSource).toContain("datasetIds: startingChoice.sharedDatasetIds");
    expect(personalArenaSource).toContain("sharedTimeframe");
    expect(personalArenaSource).toContain("shared-arena-loadout");
    expect(personalArenaSource).toContain("shared-arena-scoreboard");
    expect(personalArenaSource).toContain("user.isOperator && !isSharedBattle");
    expect(personalArenaSource).not.toMatch(/trpc\.(orders|account|paperPortfolio)\./);
  });

  it("첫 배틀 튜토리얼이 덱·규모·연구 전용 확인·배틀 시작의 네 단계를 제공한다", () => {
    expect(gameEntrySource).toContain("FIRST BATTLE TUTORIAL");
    expect(gameEntrySource).toContain("생존 지표 덱 선택");
    expect(gameEntrySource).toContain("빠른 결과 선택");
    expect(gameEntrySource).toContain("연구 전용 확인");
    expect(gameEntrySource).toContain("첫 배틀 시작");
    expect(gameEntrySource).toContain("strategy-arena:first-battle-v1");
  });
});
