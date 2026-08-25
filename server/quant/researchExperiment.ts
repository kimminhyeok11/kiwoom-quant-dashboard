export type ResearchExecutionAssumptions = {
  entryTiming: "next_open" | "next_close";
  feeRate: number;
  slippageBps: number;
  maxHoldingDays: number;
  maxConcurrentPositions: number;
};

export type ResearchExperimentSpec = {
  datasetVersionKey: string;
  strategyVersionLabel: string;
  informationCutoffTradingDays: number;
  training?: { startDate: string; endDate: string };
  validation?: { startDate: string; endDate: string };
  assumptions: ResearchExecutionAssumptions;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function assertDateRange(name: string, range: { startDate: string; endDate: string }) {
  if (!DATE_PATTERN.test(range.startDate) || !DATE_PATTERN.test(range.endDate)) throw new Error(`${name} 기간은 YYYY-MM-DD 형식이어야 합니다.`);
  if (range.startDate > range.endDate) throw new Error(`${name} 시작일은 종료일보다 늦을 수 없습니다.`);
}

/**
 * 리서치 실험은 데이터셋·전략·비용·체결·정보 절단을 모두 명시해야 한다.
 * 검증 구간은 학습 구간 뒤에 있어야 하며, 최소 정보 절단 거래일을 둔다.
 */
export function validateResearchExperimentSpec(spec: ResearchExperimentSpec): ResearchExperimentSpec {
  if (!spec.datasetVersionKey.trim()) throw new Error("리서치 데이터셋 버전이 필요합니다.");
  if (!spec.strategyVersionLabel.trim()) throw new Error("전략 버전 라벨이 필요합니다.");
  if (!Number.isInteger(spec.informationCutoffTradingDays) || spec.informationCutoffTradingDays < 1) throw new Error("정보 절단 거래일은 최소 1일이어야 합니다.");
  if (Boolean(spec.training) !== Boolean(spec.validation)) throw new Error("학습·검증 기간은 함께 지정해야 합니다.");
  if (spec.training && spec.validation) {
    assertDateRange("학습", spec.training);
    assertDateRange("검증", spec.validation);
    if (spec.training.endDate >= spec.validation.startDate) throw new Error("검증 기간은 학습 기간 뒤에 배치해야 합니다.");
  }

  const assumptions = spec.assumptions;
  if (assumptions.entryTiming !== "next_open" && assumptions.entryTiming !== "next_close") throw new Error("체결 시점이 올바르지 않습니다.");
  if (!Number.isFinite(assumptions.feeRate) || assumptions.feeRate < 0 || assumptions.feeRate > 0.1) throw new Error("거래비용 비율이 올바르지 않습니다.");
  if (!Number.isFinite(assumptions.slippageBps) || assumptions.slippageBps < 0 || assumptions.slippageBps > 10_000) throw new Error("슬리피지 가정이 올바르지 않습니다.");
  if (!Number.isInteger(assumptions.maxHoldingDays) || assumptions.maxHoldingDays < 1) throw new Error("최대 보유 기간은 1일 이상이어야 합니다.");
  if (!Number.isInteger(assumptions.maxConcurrentPositions) || assumptions.maxConcurrentPositions < 1) throw new Error("최대 동시 보유 종목 수는 1개 이상이어야 합니다.");
  return spec;
}

export function researchExperimentDisclosure(spec: ResearchExperimentSpec) {
  return {
    datasetVersionKey: spec.datasetVersionKey,
    strategyVersionLabel: spec.strategyVersionLabel,
    informationCutoffTradingDays: spec.informationCutoffTradingDays,
    entryTiming: spec.assumptions.entryTiming,
    feeRate: spec.assumptions.feeRate,
    slippageBps: spec.assumptions.slippageBps,
  };
}
