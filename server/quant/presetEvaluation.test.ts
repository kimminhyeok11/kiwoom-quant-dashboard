import { describe, expect, it } from "vitest";
import { requireDailyBarsForEvaluation } from "../routers/quant";

describe("프리셋 실데이터 평가 입력", () => {
  it("키움 일봉이 비어 있으면 근거 없는 조건 평가 대신 실데이터 없음 오류를 반환한다", () => {
    expect(() => requireDailyBarsForEvaluation([])).toThrow("실데이터 없음: 키움 ka10081에서 일봉 데이터를 받지 못했습니다.");
  });
  it("수집된 일봉은 원본을 유지해 조건 평가로 전달한다", () => {
    const bars = [{ date: "20260812", open: 1, high: 2, low: 1, close: 2, volume: 10, turnover: 20 }];
    expect(requireDailyBarsForEvaluation(bars)).toBe(bars);
  });
});
