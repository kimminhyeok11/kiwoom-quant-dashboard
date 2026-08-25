import { describe, expect, it } from "vitest";
import { evaluateSurvivalEvidence } from "./survivalSelection";

describe("생존 카드 승격 기준", () => {
  it("모든 아레나에서 수익·승률·낙폭·거래 수 기준을 통과할 때만 승격한다", () => {
    const result = evaluateSurvivalEvidence([
      { datasetId: 1, datasetName: "A", averageReturn: 2.1, averageWinRate: 44, totalTradeCount: 80, worstDrawdown: -8 },
      { datasetId: 2, datasetName: "B", averageReturn: 1.4, averageWinRate: 42, totalTradeCount: 70, worstDrawdown: -10 },
    ]);
    expect(result.status).toBe("promoted");
  });

  it("한 아레나만 양수여도 낙폭이 관리되면 관찰로 남기고 자동 승격하지 않는다", () => {
    const result = evaluateSurvivalEvidence([
      { datasetId: 1, datasetName: "A", averageReturn: 5, averageWinRate: 44, totalTradeCount: 80, worstDrawdown: -10 },
      { datasetId: 2, datasetName: "B", averageReturn: -2, averageWinRate: 42, totalTradeCount: 70, worstDrawdown: -12 },
    ]);
    expect(result.status).toBe("observe");
    expect(result.failures).toContain("모든 아레나의 평균 수익률이 양수가 아님");
  });

  it("낙폭이 기준을 넘으면 제외로 기록한다", () => {
    const result = evaluateSurvivalEvidence([
      { datasetId: 1, datasetName: "A", averageReturn: 4, averageWinRate: 41, totalTradeCount: 100, worstDrawdown: -25 },
      { datasetId: 2, datasetName: "B", averageReturn: -1, averageWinRate: 42, totalTradeCount: 80, worstDrawdown: -10 },
    ]);
    expect(result.status).toBe("rejected");
  });
});
