export const POKEMON_STRENGTH_LABELS = ["수익성", "안정성", "승률", "표본", "재현성"] as const;

export type PokemonStrengthInput = {
  validationReturnPercent: number;
  winRate: number;
  validationTradeCount: number;
  maxDrawdownPercent: number;
  dailyBattleCount?: number;
  positiveBattleRate?: number;
};

export type PokemonStrength = { label: typeof POKEMON_STRENGTH_LABELS[number]; score: number };
export type PokemonRarity = "일반" | "고급" | "레어" | "에픽" | "전설" | "신화";

function clamp(value: number) {
  return Math.max(0, Math.min(100, value));
}

/** 실제 저장 검증 지표를 0~100 비교 축으로 정규화한다. 투자 판단 점수나 수익 예측값은 아니다. */
export function calculatePokemonStrengths(input: PokemonStrengthInput): PokemonStrength[] {
  const values = [
    clamp(50 + input.validationReturnPercent * 12),
    clamp(100 - Math.abs(input.maxDrawdownPercent) * 16),
    clamp(input.winRate),
    clamp(input.validationTradeCount),
    clamp(((input.positiveBattleRate ?? 0) * 0.7) + Math.min(100, (input.dailyBattleCount ?? 0) * 12) * 0.3),
  ];
  return POKEMON_STRENGTH_LABELS.map((label, index) => ({ label, score: values[index] }));
}

export function describePokemonStrengths(input: PokemonStrengthInput) {
  const strengths = calculatePokemonStrengths(input);
  const best = strengths.reduce((current, item) => item.score > current.score ? item : current, strengths[0]);
  const weakest = strengths.reduce((current, item) => item.score < current.score ? item : current, strengths[0]);
  return { strengths, best, weakest };
}

/** 누적 검증 성과를 게임 진행용 레벨·희귀도로 변환한다. 수익 예측 또는 투자 권유가 아니다. */
export function calculatePokemonProgression(input: PokemonStrengthInput) {
  const strengths = calculatePokemonStrengths(input);
  const byLabel = new Map(strengths.map(item => [item.label, item.score]));
  const progressionScore = Math.round(
    (byLabel.get("수익성") ?? 0) * 0.32 +
    (byLabel.get("승률") ?? 0) * 0.28 +
    (byLabel.get("표본") ?? 0) * 0.18 +
    (byLabel.get("재현성") ?? 0) * 0.22,
  );
  const level = Math.max(1, Math.min(50, Math.floor(progressionScore / 2) + 1));
  const rarity: PokemonRarity = progressionScore >= 88 ? "신화" : progressionScore >= 74 ? "전설" : progressionScore >= 58 ? "에픽" : progressionScore >= 42 ? "레어" : progressionScore >= 28 ? "고급" : "일반";
  return { level, rarity, progressionScore, strengths };
}
