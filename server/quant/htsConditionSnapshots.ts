import type { ConditionSearchMatch } from "../kiwoom/realtime";

export type HtsConditionSnapshotCandidate = Pick<ConditionSearchMatch, "symbol" | "name" | "price" | "change" | "changeRate" | "cumulativeVolume">;

export type HtsConditionSnapshotRecord = {
  conditionSequence: string;
  conditionName: string;
  capturedAt: Date;
  candidates: HtsConditionSnapshotCandidate[];
  source: "hts_condition_current_snapshot";
  historicalBacktestEligible: false;
};

/**
 * HTS 조건검색은 호출 시점의 후보만 제공한다. 이 레코드는 워크포워드 기록용이며
 * 과거 백테스트의 조건 충족 이력으로 사용하면 안 된다.
 */
export function createHtsConditionSnapshot(input: {
  conditionSequence: string;
  conditionName: string;
  candidates: ConditionSearchMatch[];
  capturedAt?: Date;
}): HtsConditionSnapshotRecord {
  const conditionSequence = input.conditionSequence.trim();
  const conditionName = input.conditionName.trim();
  if (!/^\d{1,3}$/.test(conditionSequence)) throw new Error("HTS 조건식 일련번호는 1~3자리 숫자여야 합니다.");
  if (!conditionName) throw new Error("HTS 조건식 이름이 필요합니다.");

  const candidateBySymbol = new Map<string, HtsConditionSnapshotCandidate>();
  for (const candidate of input.candidates) {
    if (!/^\d{6}$/.test(candidate.symbol)) continue;
    candidateBySymbol.set(candidate.symbol, {
      symbol: candidate.symbol,
      name: candidate.name,
      price: candidate.price,
      change: candidate.change,
      changeRate: candidate.changeRate,
      cumulativeVolume: candidate.cumulativeVolume,
    });
  }

  return {
    conditionSequence,
    conditionName,
    capturedAt: input.capturedAt ?? new Date(),
    candidates: Array.from(candidateBySymbol.values()),
    source: "hts_condition_current_snapshot",
    historicalBacktestEligible: false,
  };
}

export function isEligibleForHistoricalBacktest(snapshot: HtsConditionSnapshotRecord): false {
  return snapshot.historicalBacktestEligible;
}
