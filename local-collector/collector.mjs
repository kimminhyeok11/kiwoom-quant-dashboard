/**
 * 키움 로컬 수집기 (kiwoom-local-collector)
 * 
 * 24시간 켜진 PC에서 실행:
 * - 장 시작 전: 공인IP 확인 → OAuth 토큰 발급
 * - 장 마감 후: 유동성 유니버스 일봉 수집 → 서버 동기화
 * - 장 중(09:00~15:30): 1분봉 실시간 수집 → 서버 동기화
 * 
 * 사용법:
 *   node collector.mjs              # 자동 모드 (시간대에 맞춰 동작)
 *   node collector.mjs --mode=daily  # 일봉만 수집
 *   node collector.mjs --mode=minute # 분봉만 수집
 *   node collector.mjs --mode=check-ip # IP 확인만
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "data");
const PROGRESS_FILE = resolve(DATA_DIR, "progress.json");
const LOG_FILE = resolve(DATA_DIR, "collector.log");

// Ensure data directory exists
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

// ===== Configuration =====
function loadEnv() {
  const envPath = resolve(__dirname, ".env");
  if (!existsSync(envPath)) {
    console.error("❌ .env 파일이 없습니다. .env.example을 복사해서 설정하세요.");
    process.exit(1);
  }
  const lines = readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex < 0) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnv();

const CONFIG = {
  // 키움 실투자 (데이터 수집용)
  liveAppKey: process.env.KIWOOM_LIVE_APP_KEY || "",
  liveAppSecret: process.env.KIWOOM_LIVE_APP_SECRET || "",
  liveBaseUrl: "https://api.kiwoom.com",

  // 키움 모의투자 (주문용)
  mockAppKey: process.env.KIWOOM_MOCK_APP_KEY || "",
  mockAppSecret: process.env.KIWOOM_MOCK_APP_SECRET || "",
  mockBaseUrl: "https://mockapi.kiwoom.com",
  mockAccount: process.env.KIWOOM_MOCK_ACCOUNT || "",

  // 서버 연결
  serverUrl: process.env.SERVER_URL || "",
  serverToken: process.env.SERVER_TOKEN || "",

  // 수집 설정
  maxSymbols: parseInt(process.env.MAX_UNIVERSE_SYMBOLS || "20", 10),
  minuteInterval: parseInt(process.env.MINUTE_COLLECT_INTERVAL || "60", 10) * 1000,
};

// ===== Logging =====
function log(level, message, data) {
  const timestamp = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
  const line = `[${timestamp}] [${level}] ${message}${data ? " " + JSON.stringify(data) : ""}`;
  console.log(line);
  try {
    const existing = existsSync(LOG_FILE) ? readFileSync(LOG_FILE, "utf8") : "";
    // Keep last 500 lines
    const lines = existing.split("\n").slice(-499);
    lines.push(line);
    writeFileSync(LOG_FILE, lines.join("\n"), "utf8");
  } catch { /* ignore log write errors */ }
}

// ===== Progress Tracking =====
function loadProgress() {
  if (!existsSync(PROGRESS_FILE)) return {};
  try { return JSON.parse(readFileSync(PROGRESS_FILE, "utf8")); } catch { return {}; }
}

function saveProgress(data) {
  const current = loadProgress();
  writeFileSync(PROGRESS_FILE, JSON.stringify({ ...current, ...data, lastUpdated: new Date().toISOString() }, null, 2), "utf8");
}

// ===== IP Detection =====
async function detectPublicIp() {
  const services = [
    "https://api.ipify.org?format=json",
    "https://httpbin.org/ip",
    "https://ifconfig.me/ip",
  ];
  for (const url of services) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) continue;
      const text = await response.text();
      try {
        const json = JSON.parse(text);
        const ip = json.ip || json.origin || "";
        if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip.trim())) return ip.trim();
      } catch {
        const ip = text.trim();
        if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return ip;
      }
    } catch { continue; }
  }
  return null;
}

// ===== Kiwoom API Client =====
class KiwoomApi {
  constructor(baseUrl, appKey, appSecret) {
    this.baseUrl = baseUrl;
    this.appKey = appKey;
    this.appSecret = appSecret;
    this.accessToken = null;
    this.tokenExpiresAt = 0;
    this.lastRequestAt = 0;
  }

  async ensureRateLimit() {
    const now = Date.now();
    const elapsed = now - this.lastRequestAt;
    if (elapsed < 220) { // 200ms minimum + 20ms buffer
      await new Promise(r => setTimeout(r, 220 - elapsed));
    }
    this.lastRequestAt = Date.now();
  }

  async getToken() {
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 60_000) {
      return this.accessToken;
    }
    log("INFO", "OAuth 토큰 발급 요청...");
    const response = await fetch(`${this.baseUrl}/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json;charset=UTF-8" },
      body: JSON.stringify({ grant_type: "client_credentials", appkey: this.appKey, secretkey: this.appSecret }),
    });
    const payload = await response.json();
    if (!response.ok || String(payload.return_code ?? "0") !== "0") {
      const msg = payload.return_msg || `HTTP ${response.status}`;
      log("ERROR", `OAuth 실패: ${msg}`, { code: payload.return_code });
      throw new Error(`OAuth 실패: ${msg} (코드: ${payload.return_code})`);
    }
    this.accessToken = payload.token;
    // Parse expiry - Kiwoom returns "20260825120000" format
    const expStr = (payload.expires_dt || "").replace(/[^0-9]/g, "");
    if (expStr.length >= 14) {
      this.tokenExpiresAt = new Date(
        +expStr.slice(0, 4), +expStr.slice(4, 6) - 1, +expStr.slice(6, 8),
        +expStr.slice(8, 10), +expStr.slice(10, 12), +expStr.slice(12, 14)
      ).getTime();
    } else {
      this.tokenExpiresAt = Date.now() + 50 * 60 * 1000;
    }
    log("INFO", "OAuth 토큰 발급 성공", { expiresAt: new Date(this.tokenExpiresAt).toISOString() });
    return this.accessToken;
  }

  async getDailyBars(symbol, maxPages = 3) {
    const token = await this.getToken();
    const baseDate = new Date().toISOString().slice(0, 10).replaceAll("-", "");
    const bars = [];
    let contYn = "N";
    let nextKey = "";

    for (let page = 0; page < maxPages; page++) {
      if (page > 0) await new Promise(r => setTimeout(r, 1000));
      await this.ensureRateLimit();

      const response = await fetch(`${this.baseUrl}/api/dostk/chart`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json;charset=UTF-8",
          authorization: `Bearer ${token}`,
          "api-id": "ka10081",
          "cont-yn": contYn,
          "next-key": nextKey,
        },
        body: JSON.stringify({ stk_cd: symbol, base_dt: baseDate, upd_stkpc_tp: "1" }),
        signal: AbortSignal.timeout(10000),
      });
      const payload = await response.json();
      if (!response.ok || String(payload.return_code ?? "0") !== "0") {
        throw new Error(`일봉 조회 실패 [${symbol}]: ${payload.return_msg || response.status}`);
      }
      const rows = payload.stk_dt_pole_chart_qry || [];
      for (const row of rows) {
        const asNum = (v) => Math.abs(Number(String(v ?? "0").replace(/,/g, "").replace(/^\+/, ""))) || 0;
        bars.push({
          date: String(row.dt || "").replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3"),
          open: Math.round(asNum(row.open_pric)),
          high: Math.round(asNum(row.high_pric)),
          low: Math.round(asNum(row.low_pric)),
          close: Math.round(asNum(row.cur_prc)),
          volume: Math.round(asNum(row.trde_qty)),
          turnover: Math.round(asNum(row.trde_prica) * 1000000),
        });
      }
      contYn = String(payload.cont_yn || "N");
      nextKey = String(payload.next_key || "");
      if (contYn !== "Y" || !nextKey) break;
    }
    return bars.filter(b => b.open > 0 && b.high > 0 && b.low > 0 && b.close > 0);
  }

  async getMinuteBars(symbol, baseDate) {
    const token = await this.getToken();
    const bars = [];
    let contYn = "N";
    let nextKey = "";

    for (let page = 0; page < 5; page++) {
      if (page > 0) await new Promise(r => setTimeout(r, 1000));
      await this.ensureRateLimit();

      const response = await fetch(`${this.baseUrl}/api/dostk/chart`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json;charset=UTF-8",
          authorization: `Bearer ${token}`,
          "api-id": "ka10080",
          "cont-yn": contYn,
          "next-key": nextKey,
        },
        body: JSON.stringify({ stk_cd: symbol, base_dt: baseDate, tic_scope: "1", upd_stkpc_tp: "1" }),
      });
      const payload = await response.json();
      if (!response.ok || String(payload.return_code ?? "0") !== "0") {
        throw new Error(`분봉 조회 실패 [${symbol}]: ${payload.return_msg || response.status}`);
      }
      const rows = payload.stk_min_pole_chart_qry || [];
      for (const row of rows) {
        const ts = String(row.dt || "");
        if (ts.length < 14) continue;
        // Kiwoom returns KST timestamp: 20260825093000 → convert to UTC
        const kst = new Date(+ts.slice(0, 4), +ts.slice(4, 6) - 1, +ts.slice(6, 8), +ts.slice(8, 10), +ts.slice(10, 12), +ts.slice(12, 14));
        const utc = new Date(kst.getTime() - 9 * 60 * 60 * 1000);
        bars.push({
          symbol,
          minuteAt: utc.toISOString(),
          open: Math.round(Number(row.open_pric || 0)),
          high: Math.round(Number(row.high_pric || 0)),
          low: Math.round(Number(row.low_pric || 0)),
          close: Math.round(Number(row.clos_pric || 0)),
          volume: Math.round(Number(row.trde_qty || 0)),
        });
      }
      contYn = String(payload.cont_yn || "N");
      nextKey = String(payload.next_key || "");
      if (contYn !== "Y" || !nextKey) break;
    }
    return bars.filter(b => b.open > 0 && b.high > 0 && b.low > 0 && b.close > 0);
  }

  async getTurnoverRanking(market = "000") {
    const token = await this.getToken();
    await this.ensureRateLimit();

    const response = await fetch(`${this.baseUrl}/api/dostk/rkinfo`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json;charset=UTF-8",
        authorization: `Bearer ${token}`,
        "api-id": "ka10032",
      },
      body: JSON.stringify({ mrkt_tp: market, mang_stk_incls: "0", stex_tp: "1" }),
      signal: AbortSignal.timeout(8000),
    });
    const payload = await response.json();
    if (!response.ok || String(payload.return_code ?? "0") !== "0") {
      throw new Error(`거래대금순위 조회 실패: ${payload.return_msg || response.status}`);
    }
    const items = (payload.trde_prica_upper || []).map((row, i) => ({
      symbol: String(row.stk_cd || "").trim(),
      name: String(row.stk_nm || "").trim(),
      rank: i + 1,
      price: Math.abs(Number(String(row.cur_prc || "0").replace(/,/g, "").trim())) || 0,
      turnover: (Math.abs(Number(String(row.trde_prica || "0").replace(/,/g, "").trim())) || 0) * 1000000,
      changeRate: Number(String(row.flu_rt || "0").replace(/,/g, "").trim()) || 0,
    })).filter(item => /^\d{6}$/.test(item.symbol) && item.price > 0);
    return items;
  }
}

// ===== Server Sync =====
class ServerSync {
  constructor(serverUrl, token) {
    this.serverUrl = serverUrl.replace(/\/$/, "");
    this.token = token;
  }

  async request(path, method = "GET", body = null) {
    const url = `${this.serverUrl}/api/local-research-node${path}`;
    const headers = {
      "x-research-node-token": this.token,
      "Content-Type": "application/json",
    };
    const options = { method, headers, signal: AbortSignal.timeout(30000) };
    if (body) options.body = JSON.stringify(body);

    const response = await fetch(url, options);
    const data = await response.json();
    if (!response.ok && response.status !== 409) {
      throw new Error(`서버 동기화 실패 [${path}]: ${data.message || data.status || response.status}`);
    }
    return data;
  }

  async health() { return this.request("/health"); }

  async syncDailyBars(symbol, bars) {
    return this.request("/daily-bar-sync", "POST", { symbol, adjustmentBasis: "adjusted", bars });
  }

  async syncMinuteBars(tradingDate, bars, capturedAt) {
    return this.request("/intraday-minute-sync", "POST", { tradingDate, capturedAt: capturedAt.toISOString(), bars });
  }

  async reportTerminalConnection(ip, status, verification) {
    return this.request("/kiwoom-terminal-connection", "POST", { terminalIp: ip, status, verification, message: `로컬 수집기 연결 확인 (${new Date().toISOString()})` });
  }

  async getDailyCollectionPlan() { return this.request("/daily-bar-collection-plan"); }
  async getMinuteCollectionPlan() { return this.request("/intraday-minute-collection-plan"); }
  async getAutoOrderPlan() { return this.request("/auto-order-plan"); }
}

// ===== Time Helpers =====
function getKoreaTime() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000);
}

function getKoreaTradingDate() {
  return getKoreaTime().toISOString().slice(0, 10);
}

function isMarketHours() {
  const kst = getKoreaTime();
  const day = kst.getUTCDay(); // 0=Sun, 6=Sat
  if (day === 0 || day === 6) return false;
  const minutes = kst.getUTCHours() * 60 + kst.getUTCMinutes();
  return minutes >= 9 * 60 && minutes <= 15 * 60 + 30;
}

function isAfterMarket() {
  const kst = getKoreaTime();
  const day = kst.getUTCDay();
  if (day === 0 || day === 6) return false;
  const minutes = kst.getUTCHours() * 60 + kst.getUTCMinutes();
  return minutes >= 15 * 60 + 35;
}

function isBeforeMarket() {
  const kst = getKoreaTime();
  const day = kst.getUTCDay();
  if (day === 0 || day === 6) return false;
  const minutes = kst.getUTCHours() * 60 + kst.getUTCMinutes();
  return minutes >= 7 * 60 && minutes < 9 * 60;
}

// ===== Universe Selection =====
function selectUniverse(ranking, maxSymbols) {
  // Filter out ETF-like codes and select top by turnover
  return ranking
    .filter(item => item.turnover > 0 && item.price >= 1000)
    .slice(0, maxSymbols);
}

// Default universe when ranking API is unavailable (after hours / first run)
const DEFAULT_UNIVERSE = [
  { symbol: "005930", name: "삼성전자" },
  { symbol: "000660", name: "SK하이닉스" },
  { symbol: "373220", name: "LG에너지솔루션" },
  { symbol: "035420", name: "NAVER" },
  { symbol: "005380", name: "현대자동차" },
  { symbol: "000270", name: "기아" },
  { symbol: "068270", name: "셀트리온" },
  { symbol: "035720", name: "카카오" },
  { symbol: "005490", name: "POSCO홀딩스" },
  { symbol: "055550", name: "신한지주" },
  { symbol: "105560", name: "KB금융" },
  { symbol: "006400", name: "삼성SDI" },
  { symbol: "003670", name: "포스코퓨처엠" },
  { symbol: "051910", name: "LG화학" },
  { symbol: "028260", name: "삼성물산" },
  { symbol: "012330", name: "현대모비스" },
  { symbol: "066570", name: "LG전자" },
  { symbol: "003550", name: "LG" },
  { symbol: "034730", name: "SK" },
  { symbol: "015760", name: "한국전력" },
];

// ===== Main Collection Logic =====
async function collectDaily(api, sync) {
  log("INFO", "=== 일봉 수집 시작 ===");

  // 1. Get turnover ranking for universe
  let universe;
  try {
    const ranking = await api.getTurnoverRanking();
    universe = selectUniverse(ranking, CONFIG.maxSymbols);
    log("INFO", `거래대금 순위에서 ${universe.length}개 종목 선정`);
    saveProgress({ dailyUniverse: universe.map(s => ({ symbol: s.symbol, name: s.name })), dailyUniverseAt: new Date().toISOString() });
  } catch (error) {
    // Fallback: use saved universe or default
    const progress = loadProgress();
    if (progress.dailyUniverse?.length) {
      universe = progress.dailyUniverse;
      log("WARN", `거래대금 순위 조회 실패, 저장된 유니버스 사용 (${universe.length}개)`, { error: error.message });
    } else {
      universe = DEFAULT_UNIVERSE.slice(0, CONFIG.maxSymbols);
      log("WARN", `거래대금 순위 조회 실패, 기본 대형주 ${universe.length}개 사용`, { error: error.message });
      saveProgress({ dailyUniverse: universe, dailyUniverseAt: new Date().toISOString() });
    }
  }

  // 2. Collect daily bars for each symbol
  let successCount = 0;
  let failCount = 0;

  for (const item of universe) {
    try {
      const bars = await api.getDailyBars(item.symbol);
      if (!bars.length) { failCount++; continue; }

      // Sync to server
      const result = await sync.syncDailyBars(item.symbol, bars);
      log("INFO", `일봉 동기화 완료: ${item.symbol} ${item.name} (${bars.length}개)`, { accepted: result.acceptedBarCount });
      successCount++;

      // Small delay between symbols
      await new Promise(r => setTimeout(r, 300));
    } catch (error) {
      log("ERROR", `일봉 수집 실패: ${item.symbol}`, { error: error.message });
      failCount++;
    }
  }

  log("INFO", `=== 일봉 수집 완료: 성공 ${successCount}, 실패 ${failCount} ===`);
  saveProgress({ lastDailyCollection: new Date().toISOString(), dailySuccess: successCount, dailyFail: failCount });
}

async function collectMinute(api, sync) {
  const tradingDate = getKoreaTradingDate();
  const baseDate = tradingDate.replaceAll("-", "");
  log("INFO", "=== 분봉 수집 시작 ===", { tradingDate });

  // Use saved universe
  const progress = loadProgress();
  let universe = progress.dailyUniverse;
  if (!universe?.length) {
    // Try to get from turnover ranking
    try {
      const ranking = await api.getTurnoverRanking();
      universe = selectUniverse(ranking, CONFIG.maxSymbols);
      saveProgress({ dailyUniverse: universe });
    } catch (error) {
      log("ERROR", "분봉 수집용 유니버스가 없습니다", { error: error.message });
      return;
    }
  }

  let totalBars = 0;
  const allBars = [];

  for (const item of universe) {
    try {
      const bars = await api.getMinuteBars(item.symbol, baseDate);
      if (bars.length) {
        allBars.push(...bars);
        totalBars += bars.length;
      }
      await new Promise(r => setTimeout(r, 200));
    } catch (error) {
      log("WARN", `분봉 수집 실패: ${item.symbol}`, { error: error.message });
    }
  }

  if (allBars.length) {
    try {
      // Sync in batches of 5000
      for (let i = 0; i < allBars.length; i += 5000) {
        const batch = allBars.slice(i, i + 5000);
        const result = await sync.syncMinuteBars(tradingDate, batch, new Date());
        log("INFO", `분봉 동기화: ${batch.length}개 전송, ${result.acceptedBarCount || 0}개 저장`);
      }
    } catch (error) {
      log("ERROR", "분봉 서버 동기화 실패", { error: error.message });
    }
  }

  log("INFO", `=== 분봉 수집 완료: ${universe.length}개 종목, 총 ${totalBars}개 봉 ===`);
  saveProgress({ lastMinuteCollection: new Date().toISOString(), lastMinuteBars: totalBars, lastMinuteTradingDate: tradingDate });
}

// ===== Main Entry =====
async function main() {
  const mode = process.argv.find(a => a.startsWith("--mode="))?.split("=")[1] || "auto";

  log("INFO", "========================================");
  log("INFO", `키움 로컬 수집기 시작 (모드: ${mode})`);
  log("INFO", "========================================");

  // 1. Detect public IP
  const publicIp = await detectPublicIp();
  if (!publicIp) {
    log("ERROR", "공인 IP를 확인할 수 없습니다. 인터넷 연결을 확인하세요.");
    process.exit(1);
  }
  log("INFO", `현재 공인 IP: ${publicIp}`);
  saveProgress({ currentIp: publicIp, ipCheckedAt: new Date().toISOString() });

  // Check IP change
  const progress = loadProgress();
  if (progress.lastKnownIp && progress.lastKnownIp !== publicIp) {
    log("WARN", "⚠️  IP가 변경되었습니다!", { previous: progress.lastKnownIp, current: publicIp });
    log("WARN", "⚠️  키움 OpenAPI 웹사이트에서 지정단말 IP를 업데이트하세요.");
    log("WARN", "⚠️  https://openapi.kiwoom.com → 지정단말관리");
    saveProgress({ lastKnownIp: publicIp, ipChangedAt: new Date().toISOString() });
  } else {
    saveProgress({ lastKnownIp: publicIp });
  }

  if (mode === "check-ip") {
    console.log(`\n✅ 현재 공인 IP: ${publicIp}`);
    console.log("이 IP를 키움 OpenAPI 지정단말에 등록하세요.");
    return;
  }

  // 2. Validate config
  if (!CONFIG.liveAppKey || !CONFIG.liveAppSecret) {
    log("ERROR", "KIWOOM_LIVE_APP_KEY / KIWOOM_LIVE_APP_SECRET이 설정되지 않았습니다.");
    process.exit(1);
  }
  if (!CONFIG.serverUrl || !CONFIG.serverToken) {
    log("ERROR", "SERVER_URL / SERVER_TOKEN이 설정되지 않았습니다.");
    process.exit(1);
  }

  // 3. Initialize API and Server sync
  const api = new KiwoomApi(CONFIG.liveBaseUrl, CONFIG.liveAppKey, CONFIG.liveAppSecret);
  const sync = new ServerSync(CONFIG.serverUrl, CONFIG.serverToken);

  // 4. Health check
  try {
    const health = await sync.health();
    log("INFO", "서버 연결 확인", { status: health.status });
  } catch (error) {
    log("ERROR", "서버 연결 실패", { error: error.message });
    process.exit(1);
  }

  // 5. OAuth test
  try {
    await api.getToken();
    log("INFO", "키움 OAuth 토큰 발급 성공 ✅");
    // Report connection to server (non-blocking)
    sync.reportTerminalConnection(publicIp, "connected", { oauth: "passed", apiRead: "not_run", serviceSync: "not_run", serviceReadBack: "not_run" }).catch(() => {});
  } catch (error) {
    log("ERROR", "키움 OAuth 토큰 발급 실패 ❌", { error: error.message });
    await sync.reportTerminalConnection(publicIp, "failed", { oauth: "failed", apiRead: "not_run", serviceSync: "not_run", serviceReadBack: "not_run" }).catch(() => {});
    log("ERROR", "IP가 키움 지정단말에 등록되어 있는지 확인하세요.");
    process.exit(1);
  }

  // 6. Execute based on mode
  if (mode === "daily") {
    await collectDaily(api, sync);
    return;
  }

  if (mode === "minute") {
    if (!isMarketHours()) {
      log("INFO", "현재 장 시간이 아닙니다. (09:00~15:30 KST)");
      return;
    }
    await collectMinute(api, sync);
    return;
  }

  // Auto mode: determine what to do based on time
  if (mode === "auto") {
    if (isMarketHours()) {
      log("INFO", "장 시간 - 분봉 수집 모드");
      // Continuous minute collection during market hours
      while (isMarketHours()) {
        await collectMinute(api, sync);
        log("INFO", `다음 수집까지 ${CONFIG.minuteInterval / 1000}초 대기...`);
        await new Promise(r => setTimeout(r, CONFIG.minuteInterval));
      }
      log("INFO", "장 마감 - 분봉 수집 종료");
      // After market close, collect daily bars
      await collectDaily(api, sync);
    } else if (isAfterMarket()) {
      log("INFO", "장 마감 후 - 일봉 수집");
      await collectDaily(api, sync);
    } else if (isBeforeMarket()) {
      log("INFO", "장 시작 전 - IP 확인 및 OAuth 테스트 완료. 장 시작 대기.");
    } else {
      log("INFO", "장 외 시간 (주말 또는 야간). 일봉만 수집합니다.");
      await collectDaily(api, sync);
    }
  }

  log("INFO", "수집기 실행 완료");
}

main().catch(error => {
  log("ERROR", "수집기 치명적 오류", { error: error.message, stack: error.stack });
  process.exit(1);
});
