import { KiwoomApiError, KiwoomClient } from "../server/kiwoom/client.ts";

// This verifier intentionally never imports or calls any order submission method.
// Keep the process-level gate off even if a deployment environment enables it.
process.env.KIWOOM_ORDER_TRANSMISSION_ENABLED = "false";

const compactError = error => ({
  name: error instanceof Error ? error.name : "UnknownError",
  code: error instanceof KiwoomApiError ? error.code ?? null : null,
  message: error instanceof Error ? error.message : String(error),
});

const client = new KiwoomClient();
const status = client.getStatus();
const report = {
  mode: status.mode,
  fixedIpRegistered: status.fixedIpRegistered,
  hasCredentials: status.hasCredentials,
  mayTransmitOrders: client.getStatus().mayTransmitOrders,
  orderTransmissionForcedOff: process.env.KIWOOM_ORDER_TRANSMISSION_ENABLED === "false",
  oauth: { verified: false },
  dailyBars: { verified: false },
  accountEvaluation: { verified: false },
};

try {
  const accessToken = await client.getAccessToken();
  report.oauth = { verified: true, expiresAt: accessToken.expiresAt || null };

  try {
    const bars = await client.getDailyBars(accessToken.token, { symbol: "005930", maxPages: 1 });
    report.dailyBars = { verified: true, symbol: "005930", barCount: bars.length, latestDate: bars.at(-1)?.date ?? null };
  } catch (error) {
    report.dailyBars = { verified: false, error: compactError(error) };
  }

  try {
    const evaluation = await client.getAccountEvaluation(accessToken.token, "KRX");
    report.accountEvaluation = { verified: true, positionCount: evaluation.positions.length };
  } catch (error) {
    report.accountEvaluation = { verified: false, error: compactError(error) };
  }
} catch (error) {
  report.oauth = { verified: false, error: compactError(error) };
  report.dailyBars = { verified: false, skipped: "OAuth 토큰을 받지 못해 실행하지 않았습니다." };
  report.accountEvaluation = { verified: false, skipped: "OAuth 토큰을 받지 못해 실행하지 않았습니다." };
}

console.log(JSON.stringify(report, null, 2));
