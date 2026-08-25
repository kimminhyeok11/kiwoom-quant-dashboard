import { describe, expect, it } from "vitest";
import { AUTONOMOUS_EVOLUTION_CONFIGURATION, buildAutonomousInitialCandidates, selectAutonomousSurvivorFingerprints, selectAutonomousUniverse } from "./autonomousPipeline";

describe("무설정 자동 리서치 파이프라인", () => {
  it("실제 양수 가격·거래대금이 있는 중복 없는 유동성 유니버스만 자동 선택한다", () => {
    const selected = selectAutonomousUniverse([
      { symbol: "005930", name: "삼성전자", turnover: 800_000_000_000, price: 70_000, changeRate: 1.2 },
      { symbol: "005930", name: "삼성전자", turnover: 900_000_000_000, price: 70_100, changeRate: 1.3 },
      { symbol: "000660", name: "SK하이닉스", turnover: 700_000_000_000, price: 180_000, changeRate: 0.4 },
      { symbol: "123456", name: "미수집", turnover: 0, price: 1, changeRate: 0 },
    ]);
    expect(selected.map(item => item.symbol)).toEqual(["005930", "000660"]);
  });

  it("사용자 설정 없이도 10~20개 규칙의 중복 없는 초기 유전자를 데이터셋 버전에 고정한다", () => {
    const candidates = buildAutonomousInitialCandidates({ seed: 20260818, datasetVersionKey: "auto-2026-08-18" });
    expect(candidates).toHaveLength(AUTONOMOUS_EVOLUTION_CONFIGURATION.populationSize);
    expect(new Set(candidates.map(candidate => candidate.fingerprint)).size).toBe(candidates.length);
    expect(candidates.every(candidate => candidate.root.children.length > 0)).toBe(true);
  });

  it("적합도와 지문으로 결정적으로 생존 유전자를 선발한다", () => {
    expect([...selectAutonomousSurvivorFingerprints([
      { fingerprint: "c", fitnessScore: 3 }, { fingerprint: "a", fitnessScore: 5 }, { fingerprint: "b", fitnessScore: 5 },
    ], 2)]).toEqual(["a", "b"]);
  });
});
