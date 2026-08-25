import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../client/src/components/OrderDraftPanel.tsx", import.meta.url), "utf8");

describe("주문 초안 최종 확인 패널", () => {
  it("실제 주문 전송 전에 종목·수량·가격과 명시적 체크 확인을 다시 표시한다", () => {
    expect(source).toContain("실제 키움 주문 최종 확인");
    expect(source).toContain("매수 {selected.quantity.toLocaleString()}주");
    expect(source).toContain("실제 주문 전송");
    expect(source).toContain("checked={acknowledged}");
  });
});
