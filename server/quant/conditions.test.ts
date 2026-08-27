import { describe, it, expect } from "vitest";
import { evaluateExpression, evaluateRule, simpleMovingAverage, exponentialMovingAverage } from "./conditions";
import type { DailyBar, ConditionEvaluation } from "./conditions";
import type { ConditionRule, ConditionExpressionGroup } from "../../shared/trading";

// === 테스트 헬퍼 ===

/** N일 분량의 상승 트렌드 봉 생성 */
function makeRisingBars(count: number, startPrice = 10000): DailyBar[] {
  return Array.from({ length: count }, (_, i) => ({
    date: `2024-01-${String(i + 1).padStart(2, "0")}`,
    open: startPrice + i * 100,
    high: startPrice + i * 100 + 80,
    low: startPrice + i * 100 - 20,
    close: startPrice + (i + 1) * 100,
    volume: 1_000_000 + i * 10000,
    turnover: 10_000_000_000 + i * 100_000_000,
  }));
}

/** N일 분량의 횡보 봉 생성 */
function makeFlatBars(count: number, price = 10000): DailyBar[] {
  return Array.from({ length: count }, (_, i) => ({
    date: `2024-01-${String(i + 1).padStart(2, "0")}`,
    open: price,
    high: price + 50,
    low: price - 50,
    close: price + (i % 2 === 0 ? 10 : -10),
    volume: 1_000_000,
    turnover: 10_000_000_000,
  }));
}

function makeRule(overrides: Partial<ConditionRule> & { type: ConditionRule["type"] }): ConditionRule {
  return {
    id: "test-rule-1",
    enabled: true,
    weight: 10,
    config: {},
    ...overrides,
  };
}

function makeGroup(overrides: Partial<ConditionExpressionGroup>): ConditionExpressionGroup {
  return {
    id: "group-1",
    logic: "AND",
    enabled: true,
    children: [],
    ...overrides,
  };
}

// === simpleMovingAverage ===

describe("simpleMovingAverage", () => {
  it("기간 내 종가 평균을 반환", () => {
    const bars = makeRisingBars(5);
    const sma = simpleMovingAverage(bars, 3);
    // 마지막 3봉의 close: 10300, 10400, 10500
    expect(sma).toBeCloseTo((10300 + 10400 + 10500) / 3, 0);
  });

  it("봉 수 부족 시 null 반환", () => {
    const bars = makeRisingBars(2);
    expect(simpleMovingAverage(bars, 5)).toBeNull();
  });

  it("period가 0이면 null", () => {
    expect(simpleMovingAverage(makeRisingBars(5), 0)).toBeNull();
  });
});

// === exponentialMovingAverage ===

describe("exponentialMovingAverage", () => {
  it("결과 배열 길이가 입력과 동일", () => {
    const values = [10, 11, 12, 13, 14];
    const ema = exponentialMovingAverage(values, 3);
    expect(ema).toHaveLength(5);
  });

  it("첫 값은 입력 첫 값과 동일", () => {
    const values = [100, 110, 120];
    const ema = exponentialMovingAverage(values, 3);
    expect(ema[0]).toBe(100);
  });

  it("빈 배열이면 빈 배열 반환", () => {
    expect(exponentialMovingAverage([], 5)).toHaveLength(0);
  });
});

// === evaluateRule ===

describe("evaluateRule", () => {
  it("비활성 규칙은 항상 미매칭", () => {
    const rule = makeRule({ type: "close_change", enabled: false });
    const result = evaluateRule(rule, makeRisingBars(10));
    expect(result.matched).toBe(false);
    expect(result.score).toBe(0);
    expect(result.detail).toBe("비활성 조건");
  });

  it("빈 봉 데이터에서는 미매칭", () => {
    const rule = makeRule({ type: "close_change", config: { days: 1, threshold: 0.5, comparator: "이상" } });
    const result = evaluateRule(rule, []);
    expect(result.matched).toBe(false);
  });

  it("close_change: 종가 변동률이 threshold 이상이면 매칭", () => {
    // 마지막 봉 close가 이전 봉 close보다 상승한 데이터
    const bars: DailyBar[] = [
      { date: "2024-01-01", open: 10000, high: 10100, low: 9900, close: 10000, volume: 1000000, turnover: 10000000000 },
      { date: "2024-01-02", open: 10000, high: 10300, low: 9900, close: 10200, volume: 1000000, turnover: 10000000000 },
    ];
    const rule = makeRule({
      type: "close_change",
      config: { days: 1, threshold: 1, comparator: "이상" },
      weight: 5,
    });
    const result = evaluateRule(rule, bars);
    // 변동률: (10200 - 10000) / 10000 * 100 = 2% >= 1%
    expect(result.matched).toBe(true);
    expect(result.score).toBe(5);
  });

  it("close_change: 변동률 미달 시 미매칭", () => {
    const bars: DailyBar[] = [
      { date: "2024-01-01", open: 10000, high: 10100, low: 9900, close: 10000, volume: 1000000, turnover: 10000000000 },
      { date: "2024-01-02", open: 10000, high: 10050, low: 9950, close: 10010, volume: 1000000, turnover: 10000000000 },
    ];
    const rule = makeRule({
      type: "close_change",
      config: { days: 1, threshold: 2, comparator: "이상" },
    });
    const result = evaluateRule(rule, bars);
    // 변동률: (10010 - 10000) / 10000 * 100 = 0.1% < 2%
    expect(result.matched).toBe(false);
  });

  it("new_high: 신고가 달성 시 매칭", () => {
    const bars: DailyBar[] = [
      { date: "2024-01-01", open: 100, high: 110, low: 90, close: 105, volume: 1000, turnover: 100000 },
      { date: "2024-01-02", open: 105, high: 108, low: 100, close: 106, volume: 1000, turnover: 100000 },
      { date: "2024-01-03", open: 106, high: 115, low: 104, close: 112, volume: 1000, turnover: 100000 },
    ];
    const rule = makeRule({ type: "new_high", config: { period: 3 }, weight: 8 });
    const result = evaluateRule(rule, bars);
    // 마지막 봉 high(115) >= 이전 봉들의 max high(110)
    expect(result.matched).toBe(true);
    expect(result.score).toBe(8);
  });

  it("new_high: 신고가 미달성 시 미매칭", () => {
    const bars: DailyBar[] = [
      { date: "2024-01-01", open: 100, high: 120, low: 90, close: 105, volume: 1000, turnover: 100000 },
      { date: "2024-01-02", open: 105, high: 108, low: 100, close: 106, volume: 1000, turnover: 100000 },
      { date: "2024-01-03", open: 106, high: 115, low: 104, close: 112, volume: 1000, turnover: 100000 },
    ];
    const rule = makeRule({ type: "new_high", config: { period: 3 } });
    const result = evaluateRule(rule, bars);
    // 마지막 봉 high(115) < 이전 봉 max high(120)
    expect(result.matched).toBe(false);
  });
});

// === evaluateExpression ===

describe("evaluateExpression", () => {
  // 매칭되는 규칙과 안 되는 규칙을 준비
  const risingBars = makeRisingBars(30);

  const matchingRule = makeRule({
    id: "rule-match",
    type: "close_change",
    config: { days: 1, threshold: 0.5, comparator: "이상" },
    weight: 10,
  });

  const nonMatchingRule = makeRule({
    id: "rule-no-match",
    type: "close_change",
    config: { days: 1, threshold: 99, comparator: "이상" }, // 99% 변동은 불가
    weight: 5,
  });

  describe("단일 규칙 노드", () => {
    it("매칭되는 단일 규칙: eligible=true", () => {
      const result = evaluateExpression(matchingRule, risingBars);
      expect(result.eligible).toBe(true);
      expect(result.score).toBe(10);
      expect(result.evaluations).toHaveLength(1);
    });

    it("미매칭 단일 규칙: eligible=false", () => {
      const result = evaluateExpression(nonMatchingRule, risingBars);
      expect(result.eligible).toBe(false);
      expect(result.score).toBe(0);
    });
  });

  describe("AND 그룹", () => {
    it("모든 자식 매칭 시 eligible=true", () => {
      const group = makeGroup({
        logic: "AND",
        children: [
          { ...matchingRule, id: "r1" },
          { ...matchingRule, id: "r2" },
        ],
      });
      const result = evaluateExpression(group, risingBars);
      expect(result.eligible).toBe(true);
      expect(result.score).toBe(20); // 10 + 10
    });

    it("하나라도 미매칭이면 eligible=false", () => {
      const group = makeGroup({
        logic: "AND",
        children: [matchingRule, nonMatchingRule],
      });
      const result = evaluateExpression(group, risingBars);
      expect(result.eligible).toBe(false);
      expect(result.score).toBe(0);
    });
  });

  describe("OR 그룹", () => {
    it("하나라도 매칭이면 eligible=true", () => {
      const group = makeGroup({
        logic: "OR",
        children: [nonMatchingRule, matchingRule],
      });
      const result = evaluateExpression(group, risingBars);
      expect(result.eligible).toBe(true);
      expect(result.score).toBeGreaterThan(0);
    });

    it("모두 미매칭이면 eligible=false", () => {
      const group = makeGroup({
        logic: "OR",
        children: [
          { ...nonMatchingRule, id: "n1" },
          { ...nonMatchingRule, id: "n2" },
        ],
      });
      const result = evaluateExpression(group, risingBars);
      expect(result.eligible).toBe(false);
    });
  });

  describe("NOT 그룹", () => {
    it("자식이 미매칭이면 eligible=true (반전)", () => {
      const group = makeGroup({
        logic: "NOT",
        children: [nonMatchingRule],
      });
      const result = evaluateExpression(group, risingBars);
      expect(result.eligible).toBe(true);
    });

    it("자식이 매칭이면 eligible=false (반전)", () => {
      const group = makeGroup({
        logic: "NOT",
        children: [matchingRule],
      });
      const result = evaluateExpression(group, risingBars);
      expect(result.eligible).toBe(false);
    });
  });

  describe("비활성 그룹", () => {
    it("enabled=false 그룹은 항상 eligible=false", () => {
      const group = makeGroup({
        enabled: false,
        children: [matchingRule],
      });
      const result = evaluateExpression(group, risingBars);
      expect(result.eligible).toBe(false);
      expect(result.evaluations).toHaveLength(0);
    });
  });

  describe("중첩 그룹", () => {
    it("AND( OR(match, no-match), match ) → eligible=true", () => {
      const orGroup = makeGroup({
        id: "or-inner",
        logic: "OR",
        children: [matchingRule, nonMatchingRule],
      });
      const andGroup = makeGroup({
        id: "and-outer",
        logic: "AND",
        children: [orGroup, { ...matchingRule, id: "r-outer" }],
      });
      const result = evaluateExpression(andGroup, risingBars);
      expect(result.eligible).toBe(true);
    });

    it("AND( OR(no-match, no-match), match ) → eligible=false", () => {
      const orGroup = makeGroup({
        id: "or-inner",
        logic: "OR",
        children: [
          { ...nonMatchingRule, id: "n1" },
          { ...nonMatchingRule, id: "n2" },
        ],
      });
      const andGroup = makeGroup({
        id: "and-outer",
        logic: "AND",
        children: [orGroup, matchingRule],
      });
      const result = evaluateExpression(andGroup, risingBars);
      expect(result.eligible).toBe(false);
    });
  });

  describe("evaluations 누적", () => {
    it("그룹 내 모든 리프 규칙의 evaluation이 포함됨", () => {
      const group = makeGroup({
        logic: "AND",
        children: [
          { ...matchingRule, id: "a" },
          { ...matchingRule, id: "b" },
          { ...matchingRule, id: "c" },
        ],
      });
      const result = evaluateExpression(group, risingBars);
      expect(result.evaluations).toHaveLength(3);
      expect(result.evaluations.map(e => e.ruleId)).toEqual(["a", "b", "c"]);
    });
  });
});
