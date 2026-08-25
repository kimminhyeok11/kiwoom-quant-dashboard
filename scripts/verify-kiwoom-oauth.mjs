const appKey = process.env.KIWOOM_APP_KEY;
const appSecret = process.env.KIWOOM_APP_SECRET;

if (!appKey || !appSecret) {
  throw new Error("KIWOOM_APP_KEY 또는 KIWOOM_APP_SECRET이 설정되지 않았습니다.");
}

const response = await fetch("https://api.kiwoom.com/oauth2/token", {
  method: "POST",
  headers: { "Content-Type": "application/json;charset=UTF-8" },
  body: JSON.stringify({ grant_type: "client_credentials", appkey: appKey, secretkey: appSecret }),
  signal: AbortSignal.timeout(15_000),
});
const payload = await response.json().catch(() => ({}));

if (!response.ok || !payload.token || String(payload.return_code ?? "0") !== "0") {
  throw new Error(`키움 OAuth 발급 실패: ${payload.return_msg ?? `HTTP ${response.status}`}`);
}

console.log(JSON.stringify({ success: true, expiresAt: payload.expires_dt ?? null }, null, 2));
