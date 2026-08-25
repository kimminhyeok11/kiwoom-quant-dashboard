import { describe, expect, it } from "vitest";

const mode = process.env.KIWOOM_API_MODE ?? "mock";
const baseUrl = mode === "live" ? "https://api.kiwoom.com" : "https://mockapi.kiwoom.com";
const liveOAuthVerificationEnabled = process.env.KIWOOM_OAUTH_LIVE_VERIFICATION_ENABLED === "true";
const mockOAuthVerificationEnabled = process.env.KIWOOM_MOCK_CREDENTIALS_VERIFICATION_ENABLED === "true";

describe("Kiwoom OAuth credentials", () => {
  it.skipIf(mode !== "live" || process.env.KIWOOM_FIXED_IP_REGISTERED !== "true" || !liveOAuthVerificationEnabled)("issues an access token with the server-side App Key and App Secret", async () => {
    const appKey = process.env.KIWOOM_APP_KEY;
    const appSecret = process.env.KIWOOM_APP_SECRET;

    expect(appKey, "KIWOOM_APP_KEY is required").toBeTruthy();
    expect(appSecret, "KIWOOM_APP_SECRET is required").toBeTruthy();

    const response = await fetch(`${baseUrl}/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json;charset=UTF-8" },
      body: JSON.stringify({
        grant_type: "client_credentials",
        appkey: appKey,
        secretkey: appSecret,
      }),
    });
    const payload = await response.json() as {
      token?: string;
      access_token?: string;
      data?: { token?: string; access_token?: string };
      return_code?: number | string;
      return_msg?: string;
      message?: string;
    };
    const token = payload.token ?? payload.access_token ?? payload.data?.token ?? payload.data?.access_token;
    const diagnostic = [
      `HTTP ${response.status}`,
      payload.return_code !== undefined ? `code=${payload.return_code}` : undefined,
      payload.return_msg ?? payload.message,
    ].filter(Boolean).join(" · ");

    expect(response.ok, diagnostic || "Kiwoom OAuth token request failed").toBe(true);
    expect(token, `Kiwoom OAuth response did not include an access token (${diagnostic})`).toBeTruthy();
  }, 15_000);

  it.skipIf(mode !== "mock" || !mockOAuthVerificationEnabled)("issues an access token with the configured mock App Key and App Secret", async () => {
    const appKey = process.env.KIWOOM_APP_KEY;
    const appSecret = process.env.KIWOOM_APP_SECRET;

    expect(appKey, "KIWOOM_APP_KEY is required").toBeTruthy();
    expect(appSecret, "KIWOOM_APP_SECRET is required").toBeTruthy();

    const response = await fetch(`${baseUrl}/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json;charset=UTF-8" },
      body: JSON.stringify({ grant_type: "client_credentials", appkey: appKey, secretkey: appSecret }),
    });
    const payload = await response.json() as { token?: string; access_token?: string; data?: { token?: string; access_token?: string }; return_code?: number | string; return_msg?: string; message?: string };
    const token = payload.token ?? payload.access_token ?? payload.data?.token ?? payload.data?.access_token;
    const diagnostic = [`HTTP ${response.status}`, payload.return_code !== undefined ? `code=${payload.return_code}` : undefined, payload.return_msg ?? payload.message].filter(Boolean).join(" · ");

    expect(response.ok, diagnostic || "Kiwoom mock OAuth token request failed").toBe(true);
    expect(token, `Kiwoom mock OAuth response did not include an access token (${diagnostic})`).toBeTruthy();
  }, 15_000);
});
