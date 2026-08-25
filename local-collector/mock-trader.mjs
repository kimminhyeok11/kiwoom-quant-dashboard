/**
 * 키움 모의투자 자동 주문 실행기
 * 
 * 서버에서 자동 주문 계획을 받아 mockapi.kiwoom.com으로 주문 전송.
 * 체결 조회 + 잔고 동기화까지 수행.
 * 
 * 사용법:
 *   node mock-trader.mjs              # 주문 계획 조회 → 전송 → 체결 동기화
 *   node mock-trader.mjs --check      # 잔고/체결 조회만
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "data");
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

// ===== Load .env =====
function loadEnv() {
  const envPath = resolve(__dirname, ".env");
  if (!existsSync(envPath)) { console.error("❌ .env 파일이 없습니다."); process.exit(1); }
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnv();

const CONFIG = {
  appKey: process.env.KIWOOM_MOCK_APP_KEY || "",
  appSecret: process.env.KIWOOM_MOCK_APP_SECRET || "",
  account: process.env.KIWOOM_MOCK_ACCOUNT || "",
  baseUrl: "https://mockapi.kiwoom.com",
  serverUrl: (process.env.SERVER_URL || "").replace(/\/$/, ""),
  serverToken: process.env.SERVER_TOKEN || "",
};

function log(level, msg, data) {
  const ts = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
  console.log(`[${ts}] [${level}] ${msg}${data ? " " + JSON.stringify(data) : ""}`);
}

// ===== Kiwoom Mock API =====
let accessToken = null;
let tokenExpiry = 0;

async function rateLimit() {
  await new Promise(r => setTimeout(r, 220));
}

async function getToken() {
  if (accessToken && Date.now() < tokenExpiry - 60000) return accessToken;
  const res = await fetch(`${CONFIG.baseUrl}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json;charset=UTF-8" },
    body: JSON.stringify({ grant_type: "client_credentials", appkey: CONFIG.appKey, secretkey: CONFIG.appSecret }),
  });
  const data = await res.json();
  if (!res.ok || String(data.return_code ?? "0") !== "0") {
    throw new Error(`모의투자 OAuth 실패: ${data.return_msg || res.status} (code: ${data.return_code})`);
  }
  accessToken = data.token;
  const exp = (data.expires_dt || "").replace(/[^0-9]/g, "");
  tokenExpiry = exp.length >= 14
    ? new Date(+exp.slice(0,4), +exp.slice(4,6)-1, +exp.slice(6,8), +exp.slice(8,10), +exp.slice(10,12), +exp.slice(12,14)).getTime()
    : Date.now() + 50*60*1000;
  log("INFO", "모의투자 OAuth 토큰 발급 완료");
  return accessToken;
}

async function submitBuyOrder(symbol, quantity, price) {
  const token = await getToken();
  await rateLimit();
  const res = await fetch(`${CONFIG.baseUrl}/api/dostk/order`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json;charset=UTF-8",
      authorization: `Bearer ${token}`,
      "api-id": "kt10000",
    },
    body: JSON.stringify({
      acnt_no: CONFIG.account,
      stk_cd: symbol,
      ord_qty: String(quantity),
      ord_uv: String(price),
      buy_sell_tp: "1", // 매수
      ord_tp: "00", // 지정가
      stex_tp: "KRX",
    }),
  });
  const data = await res.json();
  if (!res.ok || String(data.return_code ?? "0") !== "0") {
    throw new Error(`매수 주문 실패 [${symbol}]: ${data.return_msg || res.status}`);
  }
  return { orderNumber: data.ord_no, symbol, quantity, price };
}

async function submitSellOrder(symbol, quantity, price) {
  const token = await getToken();
  await rateLimit();
  const res = await fetch(`${CONFIG.baseUrl}/api/dostk/order`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json;charset=UTF-8",
      authorization: `Bearer ${token}`,
      "api-id": "kt10000",
    },
    body: JSON.stringify({
      acnt_no: CONFIG.account,
      stk_cd: symbol,
      ord_qty: String(quantity),
      ord_uv: String(price),
      buy_sell_tp: "2", // 매도
      ord_tp: "00", // 지정가
      stex_tp: "KRX",
    }),
  });
  const data = await res.json();
  if (!res.ok || String(data.return_code ?? "0") !== "0") {
    throw new Error(`매도 주문 실패 [${symbol}]: ${data.return_msg || res.status}`);
  }
  return { orderNumber: data.ord_no, symbol, quantity, price };
}

async function getExecutions() {
  const token = await getToken();
  await rateLimit();
  const today = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const res = await fetch(`${CONFIG.baseUrl}/api/dostk/acnt`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json;charset=UTF-8",
      authorization: `Bearer ${token}`,
      "api-id": "kt00007",
    },
    body: JSON.stringify({
      acnt_no: CONFIG.account,
      ord_dt: today,
      qry_tp: "1", // 전체
      buy_sell_tp: "0", // 전체
      stex_tp: "%",
    }),
  });
  const data = await res.json();
  if (!res.ok || String(data.return_code ?? "0") !== "0") {
    throw new Error(`체결 조회 실패: ${data.return_msg || res.status}`);
  }
  return (data.acnt_ord_cntr_prps_dtl || []).map(row => ({
    orderNumber: row.ord_no || "",
    symbol: row.stk_cd || "",
    name: row.stk_nm || "",
    orderQuantity: Number(row.ord_qty || 0),
    orderPrice: Number(row.ord_uv || 0),
    filledQuantity: Number(row.cntr_qty || 0),
    filledPrice: Number(row.cntr_uv || 0),
    remainingQuantity: Number(row.ord_remnq || 0),
    orderTime: row.ord_tm || "",
  }));
}

async function getPositions() {
  const token = await getToken();
  await rateLimit();
  const res = await fetch(`${CONFIG.baseUrl}/api/dostk/acnt`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json;charset=UTF-8",
      authorization: `Bearer ${token}`,
      "api-id": "kt00018",
    },
    body: JSON.stringify({ acnt_no: CONFIG.account }),
  });
  const data = await res.json();
  if (!res.ok || String(data.return_code ?? "0") !== "0") {
    throw new Error(`잔고 조회 실패: ${data.return_msg || res.status}`);
  }
  const positions = (data.acnt_evlt_remn_indv_tot || []).map(row => ({
    symbol: (row.stk_cd || "").trim(),
    name: (row.stk_nm || "").trim(),
    quantity: Number(row.rmnd_qty || 0),
    averagePrice: Number(row.pur_pric || 0),
    currentPrice: Number(row.cur_prc || 0),
    profitLoss: Number(row.evltv_prft || 0),
    profitLossRate: Number(row.prft_rt || 0),
  })).filter(p => p.quantity > 0);
  return {
    totalPurchase: Number(data.tot_pur_amt || 0),
    totalEvaluation: Number(data.tot_evlt_amt || 0),
    totalProfitLoss: Number(data.tot_evlt_pl || 0),
    positions,
  };
}

// ===== Server Communication =====
async function serverRequest(path, method = "GET", body = null) {
  const url = `${CONFIG.serverUrl}/api/local-research-node${path}`;
  const opts = {
    method,
    headers: { "x-research-node-token": CONFIG.serverToken, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(30000),
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  return res.json();
}

async function syncExecutionsToServer(executions, positions) {
  return serverRequest("/execution-sync", "POST", {
    tradingDate: new Date().toISOString().slice(0, 10),
    mode: "mock",
    executions,
    positions: positions.positions,
    summary: {
      totalPurchase: positions.totalPurchase,
      totalEvaluation: positions.totalEvaluation,
      totalProfitLoss: positions.totalProfitLoss,
    },
    capturedAt: new Date().toISOString(),
  });
}

// ===== Main Logic =====
async function main() {
  const checkOnly = process.argv.includes("--check");

  log("INFO", "========================================");
  log("INFO", `모의투자 실행기 시작 (${checkOnly ? "조회 모드" : "주문+동기화 모드"})`);
  log("INFO", "========================================");

  if (!CONFIG.appKey || !CONFIG.appSecret || !CONFIG.account) {
    log("ERROR", "KIWOOM_MOCK_APP_KEY / SECRET / ACCOUNT가 설정되지 않았습니다.");
    process.exit(1);
  }

  // 1. OAuth 테스트
  try {
    await getToken();
  } catch (error) {
    log("ERROR", "모의투자 OAuth 실패", { error: error.message });
    process.exit(1);
  }

  // 2. 체결/잔고 조회
  log("INFO", "체결 내역 조회...");
  const executions = await getExecutions();
  log("INFO", `체결 내역: ${executions.length}건`);

  log("INFO", "잔고 조회...");
  const positions = await getPositions();
  log("INFO", `보유 종목: ${positions.positions.length}개`, {
    totalPL: positions.totalProfitLoss,
    positions: positions.positions.map(p => `${p.name}(${p.symbol}) ${p.quantity}주 ${p.profitLossRate}%`),
  });

  if (checkOnly) {
    console.log("\n=== 체결 내역 ===");
    executions.forEach(e => console.log(`  ${e.orderTime} ${e.name}(${e.symbol}) 체결 ${e.filledQuantity}/${e.orderQuantity} @${e.filledPrice}`));
    console.log("\n=== 보유 종목 ===");
    positions.positions.forEach(p => console.log(`  ${p.name}(${p.symbol}) ${p.quantity}주 평단가${p.averagePrice} 현재${p.currentPrice} 수익률${p.profitLossRate}%`));
    console.log(`\n  총평가: ${positions.totalEvaluation.toLocaleString()}원, 총손익: ${positions.totalProfitLoss.toLocaleString()}원`);
    return;
  }

  // 3. 서버에서 자동 주문 계획 가져오기
  log("INFO", "서버에서 주문 계획 조회...");
  let orderPlan;
  try {
    orderPlan = await serverRequest("/auto-order-plan");
  } catch (error) {
    log("WARN", "주문 계획 조회 실패 - 주문 없이 동기화만 진행", { error: error.message });
    orderPlan = { status: "idle" };
  }

  if (orderPlan.status === "ready" && orderPlan.orders?.length) {
    log("INFO", `주문 계획: ${orderPlan.orders.length}건`);

    for (const order of orderPlan.orders) {
      try {
        if (order.side === "buy") {
          const result = await submitBuyOrder(order.symbol, order.quantity, order.price);
          log("INFO", `✅ 매수 주문 전송: ${order.name}(${order.symbol}) ${order.quantity}주 @${order.price}`, { orderNumber: result.orderNumber });
        } else if (order.side === "sell") {
          const result = await submitSellOrder(order.symbol, order.quantity, order.price);
          log("INFO", `✅ 매도 주문 전송: ${order.name}(${order.symbol}) ${order.quantity}주 @${order.price}`, { orderNumber: result.orderNumber });
        }
        await new Promise(r => setTimeout(r, 500));
      } catch (error) {
        log("ERROR", `주문 실패: ${order.symbol}`, { error: error.message });
      }
    }

    // Re-fetch after orders
    await new Promise(r => setTimeout(r, 2000));
    const newExecutions = await getExecutions();
    const newPositions = await getPositions();

    // 4. 서버에 체결/잔고 동기화
    try {
      await syncExecutionsToServer(newExecutions, newPositions);
      log("INFO", "서버 동기화 완료");
    } catch (error) {
      log("WARN", "서버 동기화 실패", { error: error.message });
    }
  } else {
    log("INFO", "실행할 주문 계획이 없습니다.");

    // 동기화만 수행
    try {
      await syncExecutionsToServer(executions, positions);
      log("INFO", "서버 동기화 완료 (잔고만)");
    } catch (error) {
      log("WARN", "서버 동기화 실패", { error: error.message });
    }
  }

  log("INFO", "모의투자 실행기 완료");
}

main().catch(error => {
  log("ERROR", "치명적 오류", { error: error.message });
  process.exit(1);
});
