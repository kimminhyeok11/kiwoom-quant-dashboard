import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("connection-audit tRPC batch policy", () => {
  it("대시보드의 다수 초기 쿼리가 한 요청으로 몰리지 않도록 3개 절차 단위로 분할한다", async () => {
    const source = await readFile(new URL("../client/src/main.tsx", import.meta.url), "utf8");
    expect(source).toContain("maxItems: 3");
    expect(source).toContain("fetch: fetchJsonTrpcResponse");
  });
});
