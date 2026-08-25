import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const gameEntrySource = readFileSync(resolve(process.cwd(), "client/src/pages/GameEntry.tsx"), "utf8");
const arenaSource = readFileSync(resolve(process.cwd(), "client/src/components/StrategyArenaLab.tsx"), "utf8");
const publicNavSource = readFileSync(resolve(process.cwd(), "client/src/components/PublicMarketNav.tsx"), "utf8");

describe("루트 게임 아레나 진입 화면", () => {
  it("비로그인 사용자도 덱과 아레나 규모를 탐색하고 로그인으로 배틀을 시작할 수 있다", () => {
    expect(gameEntrySource).toContain("생존 지표 덱");
    expect(gameEntrySource).toContain("랜덤 도전 덱");
    expect(gameEntrySource).toContain("공개 컬렉션 덱");
    expect(gameEntrySource).toContain("빠른 결과");
    expect(gameEntrySource).toContain("표준 확인");
    expect(gameEntrySource).toContain("대규모 탐색");
    expect(gameEntrySource).toContain("로그인하고 배틀 시작");
    expect(gameEntrySource).toContain("startLogin()");
  });

  it("선택한 생존·랜덤 덱과 규모를 로그인 사용자의 개인 또는 운영 아레나 초기 설정으로 전달한다", () => {
    expect(gameEntrySource).toContain("${trainerArenaPath}?deck=${deck}&size=${arenaSize}");
    expect(gameEntrySource).toContain('user?.isOperator ? "/operator" : "/arena"');
    expect(arenaSource).toContain("initialDeck?: \"survivor\" | \"random\"");
    expect(arenaSource).toContain("initialCombinationCount?: 100 | 1_000 | 3_000");
    expect(arenaSource).toContain("useState(initialDeck !== \"random\")");
  });

  it("게임 화면과 기록 화면이 내 포켓몬·공개 컬렉션·연구 기록으로 서로 탐색 가능하다", () => {
    expect(gameEntrySource).toContain('href="/collection"');
    expect(gameEntrySource).toContain('href="/research"');
    expect(gameEntrySource).toContain("href={trainerArenaPath}");
    expect(publicNavSource).toContain('path: "/"');
    expect(publicNavSource).toContain('path: "/research"');
    expect(publicNavSource).toContain("게임 아레나");
  });
});
