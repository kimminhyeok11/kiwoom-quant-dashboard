import { describe, expect, it } from "vitest";
import { calculatePokemonProgression, calculatePokemonStrengths, describePokemonStrengths } from "./pokemonStrength";

describe("calculatePokemonStrengths", () => {
  it("실제 검증 입력을 수익성·안정성·승률·표본·재현성의 0~100 방사형 축으로 정규화한다", () => {
    const strengths = calculatePokemonStrengths({ validationReturnPercent: 3, maxDrawdownPercent: -2, winRate: 61, validationTradeCount: 24, dailyBattleCount: 5, positiveBattleRate: 60 });

    expect(strengths).toEqual([
      { label: "수익성", score: 86 },
      { label: "안정성", score: 68 },
      { label: "승률", score: 61 },
      { label: "표본", score: 24 },
      { label: "재현성", score: 60 },
    ]);
  });

  it("극단값은 0~100 범위를 벗어나지 않고 강점·보완 지표를 일관되게 반환한다", () => {
    const result = describePokemonStrengths({ validationReturnPercent: 20, maxDrawdownPercent: -20, winRate: 120, validationTradeCount: 200, dailyBattleCount: 20, positiveBattleRate: 100 });

    expect(result.strengths.every(item => item.score >= 0 && item.score <= 100)).toBe(true);
    expect(result.best.score).toBe(100);
    expect(result.weakest.label).toBe("안정성");
  });

  it("누적 수익률·승률·표본·재현성이 높을수록 높은 레벨과 희귀도를 부여한다", () => {
    const basic = calculatePokemonProgression({ validationReturnPercent: -2, maxDrawdownPercent: -5, winRate: 35, validationTradeCount: 8, dailyBattleCount: 1, positiveBattleRate: 20 });
    const elite = calculatePokemonProgression({ validationReturnPercent: 6, maxDrawdownPercent: -1, winRate: 78, validationTradeCount: 72, dailyBattleCount: 10, positiveBattleRate: 90 });

    expect(elite.progressionScore).toBeGreaterThan(basic.progressionScore);
    expect(elite.level).toBeGreaterThan(basic.level);
    expect(["전설", "신화"]).toContain(elite.rarity);
  });
});
