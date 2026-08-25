import { describe, expect, it } from "vitest";
import { LIVE_QUOTE_FRESH_SECONDS, getQuoteFreshness } from "./PublicIntradayMonitor";

describe("공개 장중 실제 시세 최신성", () => {
  const now = new Date("2026-08-18T04:25:00.000Z");

  it("90초 이내 실제 시세만 신선한 장중 성과로 표시한다", () => {
    expect(getQuoteFreshness("2026-08-18T04:23:30.000Z", now)).toEqual({ status: "fresh", ageSeconds: LIVE_QUOTE_FRESH_SECONDS });
  });

  it("90초를 넘긴 실제 시세는 지연 상태로 표시한다", () => {
    expect(getQuoteFreshness("2026-08-18T04:23:29.000Z", now)).toEqual({ status: "delayed", ageSeconds: LIVE_QUOTE_FRESH_SECONDS + 1 });
  });

  it("실제 시세 기록이 없으면 대기 상태로 표시한다", () => {
    expect(getQuoteFreshness(null, now)).toEqual({ status: "waiting", ageSeconds: null });
  });
});
