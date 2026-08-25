export type ArenaEvidence = {
  datasetId: number;
  datasetName: string;
  averageReturn: number;
  averageWinRate: number;
  totalTradeCount: number;
  worstDrawdown: number;
};

export const SURVIVAL_CRITERIA = {
  minimumArenaCount: 2,
  minimumReturnPerArena: 0,
  minimumTotalTradeCount: 120,
  minimumAverageWinRate: 40,
  maximumWorstDrawdown: -20,
} as const;

export function evaluateSurvivalEvidence(arenas: ArenaEvidence[]) {
  const totalTradeCount = arenas.reduce((sum, arena) => sum + arena.totalTradeCount, 0);
  const averageWinRate = arenas.length ? arenas.reduce((sum, arena) => sum + arena.averageWinRate, 0) / arenas.length : 0;
  const worstDrawdown = arenas.length ? Math.min(...arenas.map(arena => arena.worstDrawdown)) : Number.NEGATIVE_INFINITY;
  const positiveArenaCount = arenas.filter(arena => arena.averageReturn > 0).length;
  const failures = [
    arenas.length < SURVIVAL_CRITERIA.minimumArenaCount ? `아레나 ${SURVIVAL_CRITERIA.minimumArenaCount}개 이상 필요` : null,
    arenas.some(arena => arena.averageReturn <= SURVIVAL_CRITERIA.minimumReturnPerArena) ? "모든 아레나의 평균 수익률이 양수가 아님" : null,
    totalTradeCount < SURVIVAL_CRITERIA.minimumTotalTradeCount ? `누적 거래 ${SURVIVAL_CRITERIA.minimumTotalTradeCount}회 미만` : null,
    averageWinRate < SURVIVAL_CRITERIA.minimumAverageWinRate ? `평균 승률 ${SURVIVAL_CRITERIA.minimumAverageWinRate}% 미만` : null,
    worstDrawdown < SURVIVAL_CRITERIA.maximumWorstDrawdown ? `최대 낙폭 ${SURVIVAL_CRITERIA.maximumWorstDrawdown}% 하회` : null,
  ].filter((value): value is string => Boolean(value));
  const status = failures.length === 0 ? "promoted" as const : positiveArenaCount > 0 && worstDrawdown >= SURVIVAL_CRITERIA.maximumWorstDrawdown ? "observe" as const : "rejected" as const;
  return { status, failures, summary: { arenaCount: arenas.length, positiveArenaCount, totalTradeCount, averageWinRate, worstDrawdown } };
}
