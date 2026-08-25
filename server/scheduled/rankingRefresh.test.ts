import { describe, expect, it } from "vitest";
import { buildRankingRunKey, getRankingRefreshSkip } from "./rankingRefresh";

describe("예약 랭킹 갱신 멱등성", () => {
  it("같은 예약 작업의 같은 UTC 분 실행 키는 재시도에도 동일하다", () => {
    const taskUid = "task-ranking-1";
    expect(buildRankingRunKey(taskUid, new Date("2026-08-12T00:15:02.000Z"))).toBe(buildRankingRunKey(taskUid, new Date("2026-08-12T00:15:58.000Z")));
    expect(buildRankingRunKey(taskUid, new Date("2026-08-12T00:16:00.000Z"))).not.toBe(buildRankingRunKey(taskUid, new Date("2026-08-12T00:15:02.000Z")));
  });

  it("동일 실행 키가 진행 중이거나 완료되면 외부 API 재호출을 건너뛴다", () => {
    const key = "task-ranking-1:2026-08-12T00:15";
    expect(getRankingRefreshSkip({ lastRunKey: key, status: "running" }, key)).toBe("already-running");
    expect(getRankingRefreshSkip({ lastRunKey: key, status: "ready" }, key)).toBe("already-completed");
    expect(getRankingRefreshSkip({ lastRunKey: key, status: "error" }, key)).toBeNull();
    expect(getRankingRefreshSkip({ lastRunKey: key, status: "ready" }, `${key}-next`)).toBeNull();
  });
});
