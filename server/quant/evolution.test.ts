import { describe, expect, it } from "vitest";
import { calculateFitness, canonicalizeGenome, evolvePopulation, fingerprintGenome, fingerprintResearchGenome, generateUniqueGenomes, manuallyExpandGenome, selectSurvivors } from "./evolution";

const spec = { seed: 20260814, populationSize: 200, minRules: 10, maxRules: 16, maxDepth: 3, allowedRuleTypes: ["macd_rising", "ma_position", "high_return", "turnover"] as const };
const countRules = (node: { children?: unknown[] }) => node.children?.reduce((total, child) => total + (typeof child === "object" && child !== null && "children" in child ? countRules(child as { children?: unknown[] }) : 1), 0) ?? 1;

describe("진화형 조건식 유전자", () => {
  it("동일한 시드와 설정에서는 동일한 고유 유전자 집단을 재생성한다", () => {
    const first = generateUniqueGenomes(spec); const second = generateUniqueGenomes(spec);
    expect(first.map(item => item.fingerprint)).toEqual(second.map(item => item.fingerprint));
    expect(new Set(first.map(item => item.fingerprint)).size).toBe(200);
    expect(first.every(item => countRules(item.root) >= 10 && countRules(item.root) <= 16)).toBe(true);
  });

  it("AND·OR 하위 규칙의 순서가 바뀌어도 같은 의미의 유전자는 같은 지문을 갖는다", () => {
    const left = { id: "root-left", logic: "AND" as const, enabled: true, children: [
      { id: "one", type: "turnover" as const, enabled: true, weight: 10, config: { days: 5, threshold: 50, unit: "억원", comparator: "이상" } },
      { id: "two", type: "high_return" as const, enabled: true, weight: 10, config: { days: 20, minPercent: 20, comparator: "이상" } },
    ] };
    const right = { ...left, id: "root-right", children: [...left.children].reverse() };
    expect(canonicalizeGenome(left, 50)).toEqual(canonicalizeGenome(right, 50));
    expect(fingerprintGenome(left, 50)).toEqual(fingerprintGenome(right, 50));
  });

  it("확장 보조지표 패밀리도 유전자 후보의 파라미터 공간에 포함한다", () => {
    const expanded = generateUniqueGenomes({ ...spec, populationSize: 50, allowedRuleTypes: ["rsi", "bollinger", "stochastic", "atr_percent", "volume_ratio"] });
    const types = new Set(expanded.flatMap(item => JSON.stringify(item.root)));
    expect([...types].join("")).toContain("rsi");
    expect([...types].join("")).toContain("bollinger");
    expect([...types].join("")).toContain("stochastic");
    expect([...types].join("")).toContain("atr_percent");
    expect([...types].join("")).toContain("volume_ratio");
  });

  it("순수 랜덤 모드는 10개 이상 서로 다른 규칙군만 한 전략 카드에 넣는다", () => {
    const allowed = ["macd_rising", "ma_position", "high_return", "turnover", "rsi", "bollinger", "stochastic", "atr_percent", "volume_ratio", "close_change", "gap_percent", "intrabar_position"] as const;
    const cards = generateUniqueGenomes({ seed: 20260820, populationSize: 24, minRules: 10, maxRules: 12, maxDepth: 3, allowedRuleTypes: [...allowed], requireUniqueRuleTypes: true });
    const collectTypes = (node: { children?: unknown[]; type?: string }): string[] => node.children ? node.children.flatMap(item => collectTypes(item as { children?: unknown[]; type?: string })) : node.type ? [node.type] : [];

    expect(cards.every(card => {
      const types = collectTypes(card.root);
      return types.length >= 10 && types.length === new Set(types).size;
    })).toBe(true);
  });

  it("거래 수·낙폭 패널티를 포함한 적합도로 생존자를 보존하고 중복 없는 다음 세대를 교차·변이한다", () => {
    const seeds = generateUniqueGenomes({ ...spec, populationSize: 12 });
    const scored = seeds.map((genome, index) => ({ ...genome, candidateId: index + 1, metrics: { totalReturn: index === 0 ? 90 : 10 + index, maxDrawdown: index === 0 ? -45 : -10, tradeCount: index === 0 ? 1 : 12, winRate: 40 + index }, fitnessScore: calculateFitness({ totalReturn: index === 0 ? 90 : 10 + index, maxDrawdown: index === 0 ? -45 : -10, tradeCount: index === 0 ? 1 : 12, winRate: 40 + index }, { minimumTrades: 5, maxDrawdownLimit: -25 }) }));
    const survivors = selectSurvivors(scored, 4);
    expect(survivors.map(item => item.candidateId)).not.toContain(1);
    const next = evolvePopulation({ survivors, populationSize: 12, seed: 1024, crossoverRate: 0.7, bounds: { minRules: 10, maxRules: 16 } });
    expect(next).toHaveLength(12); expect(new Set(next.map(item => item.fingerprint)).size).toBe(12);
    expect(next.filter(item => item.origin === "elite")).toHaveLength(4);
    expect(next.some(item => item.origin === "crossover")).toBe(true); expect(next.some(item => item.origin === "mutation")).toBe(true);
  });

  it("세대 간 전역 고유 지문 제약을 위해 생존자는 원 세대에 남기고 다음 세대는 파생 유전자만 만든다", () => {
    const seeds = generateUniqueGenomes({ ...spec, populationSize: 12 });
    const survivors = seeds.slice(0, 3).map((genome, index) => ({ ...genome, candidateId: index + 1, metrics: { totalReturn: 20, maxDrawdown: -10, tradeCount: 10, winRate: 55 }, fitnessScore: 20 }));
    const next = evolvePopulation({ survivors, populationSize: 12, seed: 44, crossoverRate: 0.5, bounds: { minRules: 10, maxRules: 16 }, preserveElites: false });
    expect(next).toHaveLength(12); expect(next.every(item => item.origin !== "elite")).toBe(true);
    expect(next.every(item => !survivors.some(parent => parent.fingerprint === item.fingerprint))).toBe(true);
  });

  it("같은 유전자라도 데이터셋 버전·비용·체결 가정이 다르면 연구 지문을 구분한다", () => {
    const genome = generateUniqueGenomes({ ...spec, populationSize: 1 })[0]!;
    const base = { root: genome.root, minimumScore: genome.minimumScore, datasetVersionKey: "krx-daily-r1", assumptions: { feeRate: 0.00015, slippageBps: 10, entryTiming: "next_open", informationCutoffTradingDays: 1 } };
    expect(fingerprintResearchGenome(base)).not.toEqual(fingerprintResearchGenome({ ...base, datasetVersionKey: "krx-daily-r2" }));
    expect(fingerprintResearchGenome(base)).not.toEqual(fingerprintResearchGenome({ ...base, assumptions: { ...base.assumptions, slippageBps: 20 } }));
  });

  it("선택한 규칙 수치나 논리 그룹만 바꾸는 수동 확장은 원본 유전자를 보존하고 계보를 남긴다", () => {
    const parent = { candidateId: 91, root: { id: "root", logic: "AND" as const, enabled: true, children: [{ id: "rsi", type: "rsi" as const, enabled: true, weight: 10, config: { period: 14, threshold: 35, comparator: "이상" } }] }, minimumScore: 40 };
    const parameterDerived = manuallyExpandGenome(parent, { kind: "rule_numeric", targetNodeId: "rsi", key: "threshold", next: 40 });
    const logicDerived = manuallyExpandGenome(parent, { kind: "group_logic", targetNodeId: "root", next: "OR" });
    expect((parameterDerived.root.children[0] as { config: { threshold: number } }).config.threshold).toBe(40);
    expect((parent.root.children[0] as { config: { threshold: number } }).config.threshold).toBe(35);
    expect(parameterDerived).toMatchObject({ origin: "manual_expand", parentCandidateIds: [91], mutation: { targetNodeId: "rsi", key: "threshold", previous: 35, next: 40 } });
    expect(logicDerived).toMatchObject({ mutation: { targetNodeId: "root", key: "logic", previous: "AND", next: "OR" } });
  });
});
