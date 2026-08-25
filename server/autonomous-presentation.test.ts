import { describe, expect, it } from "vitest";
import { selectLatestObservations } from "../client/src/lib/autonomousPresentation";

describe("자동 결과 관찰값 표시", () => {
  it("같은 종목의 여러 실제 관찰값 중 capturedAt이 가장 최신인 값만 표시한다", () => {
    const selected = selectLatestObservations([
      { symbol: "005930", price: 70000, capturedAt: "2026-08-18T00:10:00.000Z" },
      { symbol: "000660", price: 180000, capturedAt: "2026-08-18T00:12:00.000Z" },
      { symbol: "005930", price: 70500, capturedAt: "2026-08-18T00:15:00.000Z" },
    ]);
    expect(selected).toEqual([
      { symbol: "005930", price: 70500, capturedAt: "2026-08-18T00:15:00.000Z" },
      { symbol: "000660", price: 180000, capturedAt: "2026-08-18T00:12:00.000Z" },
    ]);
  });
});
