import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");

describe("생존 카드 연구 장부 UI", () => {
  it("엄격한 다중 아레나 판정과 규칙별 제거 비교 근거를 함께 노출한다", () => {
    const router = readFileSync(resolve(projectRoot, "server/routers/survivalResearch.ts"), "utf8");
    const page = readFileSync(resolve(projectRoot, "client/src/pages/SurvivalResearch.tsx"), "utf8");
    const app = readFileSync(resolve(projectRoot, "client/src/App.tsx"), "utf8");

    expect(router).toContain("evaluate");
    expect(router).toContain("evaluateSurvivalEvidence");
    expect(router).toContain("strategySurvivalLedgers");
    expect(page).toContain("SURVIVOR LEDGER");
    expect(page).toContain("규칙 하나씩 제거한 실제 5분봉 비교 보기");
    expect(page).toContain("ablationResults");
    expect(page).toContain("제거한 규칙:");
    expect(page).toContain("판독:");
    expect(page).toContain("추가 표본 필요:");
    expect(page).toContain("60일 독립 아레나 재검증 보기");
    expect(page).toContain("longArenaRevalidation");
    expect(page).toContain("longArenaDecision");
    expect(page).toContain("16종목·60일 독립 아레나 재검증 보기");
    expect(page).toContain("extendedArenaRevalidation");
    expect(page).toContain("복합 조건 구조 · 시간축 · 원문 근거 보기");
    expect(page).toContain("sourceRule");
    expect(page).toContain("config.timeframe");
    expect(page).toContain("모두 양수");
    expect(app).toContain('window.location.pathname === "/survivors"');
    expect(app).toContain("<SurvivalResearch/>");
  });
});
