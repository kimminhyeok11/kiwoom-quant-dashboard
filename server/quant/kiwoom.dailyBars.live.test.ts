import { describe, expect, it } from "vitest";
import { KiwoomClient } from "../kiwoom/client";

const mode = process.env.KIWOOM_API_MODE ?? "mock";
const liveDailyBarsVerificationEnabled = process.env.KIWOOM_LIVE_DAILY_BARS_VERIFICATION_ENABLED === "true";

describe("Kiwoom 운영 일봉 읽기 전용 검증", () => {
  it.skipIf(mode !== "live" || process.env.KIWOOM_FIXED_IP_REGISTERED !== "true" || !liveDailyBarsVerificationEnabled)("주문·계좌 조회 없이 삼성전자 ka10081 일봉을 정규화한다", async () => {
    expect(process.env.KIWOOM_ORDER_TRANSMISSION_ENABLED).not.toBe("true");

    const client = new KiwoomClient();
    const token = await client.getAccessToken();
    const bars = await client.getDailyBars(token.token, { symbol: "005930", maxPages: 1 });

    expect(bars.length).toBeGreaterThan(0);
    expect(bars[0]).toMatchObject({ symbol: "005930" });
    expect(bars.at(-1)?.date).toMatch(/^\d{8}$/);
    expect(bars.every(bar => bar.open > 0 && bar.high > 0 && bar.low > 0 && bar.close > 0)).toBe(true);
  }, 20_000);
});
