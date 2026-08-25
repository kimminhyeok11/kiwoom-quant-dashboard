import { describe, expect, it } from "vitest";
import { selectUniquePositions } from "./dayTradeHistory";

const entry = { symbol: "005930", name: "삼성전자", entryPrice: 70_000, entryAt: "2026-08-18T00:00:00.000Z", evidence: { score: 9, matchedRuleCount: 4, details: ["실제 조건 충족"] }, lastPrice: 71_000 };
const candidate = (id: number, fitnessScore: string) => ({ id, fingerprint: `${id}`.padStart(64, "0"), rootGenomeJson: { id }, inSampleMetricsJson: { return: 1 }, outOfSampleMetricsJson: { return: 1 }, walkForwardMetricsJson: { return: 1 }, fitnessScore, simulationJson: { entries: [entry] } });

describe("selectUniquePositions", () => {
  it("동일 종목을 여러 생존 조건식이 신호로 만들면 최고 적합도 조건식 한 건만 포트폴리오 대상으로 보존한다", () => {
    const result = selectUniquePositions([candidate(1, "10.0"), candidate(2, "15.0")]);
    expect(result.signalCount).toBe(2);
    expect(result.selected).toHaveLength(1);
    expect(result.selected[0]).toMatchObject({ candidate: { id: 2 }, entry: { symbol: "005930" }, signalCount: 2 });
  });
});
