import { describe, expect, it } from "vitest";
import { createHtsConditionSnapshot, isEligibleForHistoricalBacktest } from "./htsConditionSnapshots";

describe("HTS 조건식 현재 후보 스냅샷", () => {
  it("현재 후보를 중복 없이 워크포워드 기록으로 정규화하고 과거 백테스트 입력을 차단한다", () => {
    const snapshot = createHtsConditionSnapshot({
      conditionSequence: "12",
      conditionName: "거래량 돌파",
      capturedAt: new Date("2026-08-13T00:00:00.000Z"),
      candidates: [
        { symbol: "005930", name: "삼성전자", price: 71_000, change: 1_000, changeRate: 1.43, cumulativeVolume: 1_200, open: 70_000, high: 72_000, low: 69_500 },
        { symbol: "005930", name: "삼성전자", price: 71_200, change: 1_200, changeRate: 1.71, cumulativeVolume: 1_300, open: 70_000, high: 72_000, low: 69_500 },
      ],
    });
    expect(snapshot).toMatchObject({
      conditionSequence: "12", source: "hts_condition_current_snapshot", historicalBacktestEligible: false,
      candidates: [{ symbol: "005930", price: 71_200, cumulativeVolume: 1_300 }],
    });
    expect(isEligibleForHistoricalBacktest(snapshot)).toBe(false);
  });

  it("잘못된 HTS 조건식 식별자를 거부한다", () => {
    expect(() => createHtsConditionSnapshot({ conditionSequence: "bad", conditionName: "조건", candidates: [] })).toThrow("일련번호");
  });
});
