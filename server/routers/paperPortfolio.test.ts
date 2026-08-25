import { describe, expect, it } from "vitest";
import { assertActualObservationSource } from "./paperPortfolio";

describe("실제 가격 기반 모의 포트폴리오", () => {
  it("키움 실제 가격 관찰 출처만 진입·평가 근거로 허용한다", () => {
    expect(() => assertActualObservationSource("kiwoom_ka10032")).not.toThrow();
    expect(() => assertActualObservationSource("kiwoom_ka10032_tracking")).not.toThrow();
    expect(() => assertActualObservationSource("kiwoom_ka10081")).not.toThrow();
    expect(() => assertActualObservationSource("generated_market")).toThrow("키움 실제 가격 관찰만");
  });
});
