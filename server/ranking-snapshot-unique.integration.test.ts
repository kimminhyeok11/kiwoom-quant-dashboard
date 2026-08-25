import { describe, expect, it } from "vitest";
import { rankingSnapshots } from "../drizzle/schema";
import { getDb } from "./db";

describe("랭킹 스냅샷 실행 키 유니크 제약", () => {
  it("동일 userId·presetId·symbol·runKey의 두 번째 저장을 거부하고 트랜잭션을 롤백한다", async () => {
    const db = await getDb();
    if (!db) return;
    const runKey = `unique-test-${Date.now()}`;
    const row = { userId: 2_000_000_001, presetId: 2_000_000_001, symbol: "005930", name: "검증용", score: "80.00", price: 70_000, changeRate: "1.000", matchedRulesJson: ["macd"], runKey, capturedAt: new Date() };
    await expect(db.transaction(async tx => {
      await tx.insert(rankingSnapshots).values(row);
      await expect(tx.insert(rankingSnapshots).values(row)).rejects.toThrow();
      throw new Error("intentional-rollback");
    })).rejects.toThrow("intentional-rollback");
  });
});
