import { describe, expect, it } from "vitest";
import { getKrxSymbolName } from "./krxSymbolNames";

describe("KRX 유니버스 표시명", () => {
  it("저장된 이름이 종목코드뿐이면 실제 유니버스 메타데이터 이름으로 보정한다", () => {
    expect(getKrxSymbolName("036930", "036930")).toBe("주성엔지니어링");
    expect(getKrxSymbolName("005930", "005930")).toBe("삼성전자");
  });

  it("저장된 실제 이름이 있으면 그 값을 우선하고 알 수 없는 코드는 그대로 보존한다", () => {
    expect(getKrxSymbolName("005930", "삼성전자 보통주")).toBe("삼성전자 보통주");
    expect(getKrxSymbolName("999999", "999999")).toBe("999999");
  });
});
