import { describe, expect, it } from "vitest";
import { researchExperimentDisclosure, validateResearchExperimentSpec } from "./researchExperiment";

const baseSpec = {
  datasetVersionKey: "krx-daily-2026-08-13-r1",
  strategyVersionLabel: "momentum-v7",
  informationCutoffTradingDays: 1,
  training: { startDate: "2021-01-01", endDate: "2023-12-29" },
  validation: { startDate: "2024-01-02", endDate: "2025-12-30" },
  assumptions: { entryTiming: "next_open" as const, feeRate: 0.00015, slippageBps: 5, maxHoldingDays: 5, maxConcurrentPositions: 10 },
};

describe("재현 가능한 리서치 실험 명세", () => {
  it("데이터셋·전략·정보 절단·기간 분할·체결 비용 가정을 함께 검증한다", () => {
    const spec = validateResearchExperimentSpec(baseSpec);
    expect(researchExperimentDisclosure(spec)).toEqual({
      datasetVersionKey: "krx-daily-2026-08-13-r1", strategyVersionLabel: "momentum-v7", informationCutoffTradingDays: 1,
      entryTiming: "next_open", feeRate: 0.00015, slippageBps: 5,
    });
  });

  it("미래 정보가 섞일 수 있는 기간 겹침과 불완전한 가정을 거부한다", () => {
    expect(() => validateResearchExperimentSpec({ ...baseSpec, informationCutoffTradingDays: 0 })).toThrow("정보 절단");
    expect(() => validateResearchExperimentSpec({ ...baseSpec, validation: { startDate: "2023-12-29", endDate: "2025-12-30" } })).toThrow("검증 기간");
    expect(() => validateResearchExperimentSpec({ ...baseSpec, assumptions: { ...baseSpec.assumptions, feeRate: -1 } })).toThrow("거래비용");
  });
});
