import { describe, expect, it } from "vitest";
import type { ConditionRule } from "../../shared/trading";
import type { IntradayMinuteBar } from "../kiwoom/minuteBars";
import { evaluateMinuteExpression } from "./minuteValidation";

const rule: ConditionRule = { id: "ma", type: "ma_position", enabled: true, weight: 1, config: { period: "2", comparator: "이상" } };
const bars: IntradayMinuteBar[] = [
  { minuteAt: new Date("2026-08-18T00:00:00.000Z"), open: 100, high: 101, low: 99, close: 100, volume: 100 },
  { minuteAt: new Date("2026-08-18T00:01:00.000Z"), open: 100, high: 102, low: 100, close: 101, volume: 100 },
  { minuteAt: new Date("2026-08-18T00:02:00.000Z"), open: 102, high: 103, low: 101, close: 102, volume: 100 },
  { minuteAt: new Date("2026-08-18T00:03:00.000Z"), open: 102, high: 110, low: 101, close: 108, volume: 100 },
];

describe("1분봉 조건식 검증", () => {
  it("완결된 신호 봉 뒤의 다음 1분봉 시가로만 진입하고 목표가를 체결한다", () => {
    const result = evaluateMinuteExpression({ expression: rule, bars, policy: { takeProfitPercent: 5, stopLossPercent: 2, maxHoldingBars: 5, feeRate: 0, quantity: 1 } });
    expect(result.trades).toEqual([expect.objectContaining({ signalAt: new Date("2026-08-18T00:01:00.000Z"), entryAt: new Date("2026-08-18T00:02:00.000Z"), entryPrice: 102, exitAt: new Date("2026-08-18T00:03:00.000Z"), exitReason: "take_profit", netPnl: 5, })]);
    expect(result.trades[0]?.exitPrice).toBeCloseTo(107.1, 8);
    expect(result.turnoverBasis).toBe("derived_close_x_volume");
  });

  it("같은 1분봉에서 손절·익절이 모두 닿으면 손절을 우선해 낙관적 체결을 피한다", () => {
    const result = evaluateMinuteExpression({ expression: rule, bars: [...bars.slice(0, 3), { minuteAt: new Date("2026-08-18T00:03:00.000Z"), open: 102, high: 110, low: 99, close: 108, volume: 100 }], policy: { takeProfitPercent: 5, stopLossPercent: 2, maxHoldingBars: 5, feeRate: 0, quantity: 1 } });
    expect(result.trades[0]).toMatchObject({ exitReason: "same_bar_stop_priority", exitPrice: 99.96, netPnl: -2 });
  });

  it("슬리피지는 다음 1분 시가 진입 가격을 올리고 청산 가격을 낮춰 성과에 반영한다", () => {
    const result = evaluateMinuteExpression({ expression: rule, bars, policy: { takeProfitPercent: 5, stopLossPercent: 2, maxHoldingBars: 5, feeRate: 0, slippageBps: 10, quantity: 1 } });

    expect(result.trades[0]).toMatchObject({ entryAt: new Date("2026-08-18T00:02:00.000Z"), exitReason: "take_profit" });
    expect(result.trades[0]?.entryPrice).toBeCloseTo(102.102, 8);
    expect(result.trades[0]?.exitPrice).toBeCloseTo(107.0998929, 8);
    expect(result.trades[0]?.netReturnPercent).toBeLessThan(5);
  });

  it("생존 후보에 저장된 최소 점수보다 낮은 분봉 신호는 진입하지 않는다", () => {
    const result = evaluateMinuteExpression({ expression: rule, bars, minimumScore: 2, policy: { feeRate: 0 } });
    expect(result.tradeCount).toBe(0);
  });
});
