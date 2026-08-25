import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");

describe("공용 데이터셋 다중 비교 백테스트 UI", () => {
  it("선택 조건식 조합을 여러 공용 데이터셋에서 반복 실행하고 데이터셋별 성과를 표시한다", () => {
    const router = readFileSync(resolve(projectRoot, "server/routers/sharedDatasets.ts"), "utf8");
    const page = readFileSync(resolve(projectRoot, "client/src/pages/SharedDatasets.tsx"), "utf8");

    expect(router).toContain("runMultiDatasetBacktest");
    expect(router).toContain("multi_shared_dataset");
    expect(router).toContain("strategySnapshot");
    expect(router).toContain("tradeSamples");
    expect(router).toContain("turnover: Number(row.close) * Number(row.volume)");
    expect(page).toContain("MULTI-ARENA SCOREBOARD");
    expect(page).toContain("SAVED RESEARCH LEDGER");
    expect(page).toContain("조건식 카드 원본 스냅샷");
    expect(page).toContain("humanRule");
    expect(page).toContain("formatRuleConfig(rule.config ?? {})");
    expect(page).toContain("sourceRule");
    expect(page).toContain("coverage");
    expect(page).toContain("comparisonDatasetIds");
    expect(page).toContain("키움 단말 수동 수집 요청 만들기");
  });
});
