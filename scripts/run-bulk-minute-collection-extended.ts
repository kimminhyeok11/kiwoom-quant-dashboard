/**
 * 확장 벌크 1분봉 수집 — 6개월치 (baseDate를 이동하며 연속 수집)
 *
 * 전략:
 * - 종목당 base_dt를 한 달씩 뒤로 이동하며 여러 번 호출
 * - 각 호출당 10페이지(9,000봉 ≈ 23일)
 * - 6개월 = 약 6번 호출/종목 → 종목당 ~54,000봉 (약 138거래일)
 * - 45종목 × 54,000봉 = 약 2,430,000봉
 *
 * 병렬:
 * - 키움 API는 초당 1회 제약이므로 완전 병렬은 불가
 * - 대신 "API 호출 → DB 업로드를 병렬" 로 파이프라인 처리
 * - 업로드 중에 다음 API 호출 시작 (API 대기시간 활용)
 */

import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import { createHash } from "node:crypto";

// ─────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────

const DEFAULT_SYMBOLS = [
  "005930", "000660", "005380", "035420", "051910",
  "006400", "035720", "005490", "068270", "028260",
  "003670", "105560", "055550", "034730", "012330",
  "066570", "096770", "032830", "003490", "011200",
  "000270", "010130", "009150", "018260", "033780",
  "030200", "086790", "034020", "015760", "316140",
  "017670", "024110", "009540", "003550", "011170",
  "010950", "036570", "047050", "000810", "004020",
  "078930", "138040", "161390", "021240", "004170",
];

// 6개월치를 받기 위한 base_dt 리스트 (최신→과거 순)
function generateBaseDates(monthsBack: number): string[] {
  const dates: string[] = [];
  const now = new Date();
  for (let m = 0; m < monthsBack; m++) {
    const d = new Date(now);
    d.setMonth(d.getMonth() - m);
    dates.push(d.toISOString().slice(0, 10).replaceAll("-", ""));
  }
  return dates;
}

const BASE_DATES = generateBaseDates(7); // 7개월 전까지 (6개월 커버)
const MAX_PAGES = 10;
const DELAY_BETWEEN_API_CALLS_MS = 1100; // 키움 rate limit: 초당 1회

// ─────────────────────────────────────────────
// Direct API call (bypasses rate limiter accumulation)
// ─────────────────────────────────────────────

import { normalizeKiwoomMinuteBars } from "../server/kiwoom/minuteBars";
import type { IntradayMinuteBar } from "../server/kiwoom/minuteBars";

async function fetchOneMinuteBarsRaw(token: string, symbol: string, baseDate: string, maxPages: number): Promise<IntradayMinuteBar[]> {
  const baseUrl = "https://api.kiwoom.com";
  const rows: Array<Record<string, unknown>> = [];
  let continuation = "N";
  let nextKey = "";

  for (let page = 0; page < maxPages; page++) {
    if (page > 0) await new Promise(r => setTimeout(r, 1100)); // 페이지 간 1.1초 대기

    const res = await fetch(`${baseUrl}/api/dostk/chart`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json;charset=UTF-8",
        authorization: `Bearer ${token}`,
        "api-id": "ka10080",
        "cont-yn": continuation,
        "next-key": nextKey,
      },
      body: JSON.stringify({ stk_cd: symbol, tic_scope: "1", upd_stkpc_tp: "1", base_dt: baseDate }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json() as Record<string, unknown>;
    if (String(body.return_code ?? "0") !== "0") throw new Error(String(body.return_msg ?? "API 오류"));

    const data = body.stk_min_pole_chart_qry;
    if (Array.isArray(data)) rows.push(...data);

    // Continuation from headers (키움 분봉 API 특성)
    const resCont = res.headers.get("cont-yn") ?? String(body.cont_yn ?? "N");
    const resNext = res.headers.get("next-key") ?? String(body.next_key ?? "");
    if (resCont !== "Y" || !resNext) break;
    continuation = "Y";
    nextKey = resNext;
  }

  if (!rows.length) return [];
  return normalizeKiwoomMinuteBars(rows as Array<Record<string, unknown>>);
}

// ─────────────────────────────────────────────
// DB Upload (pipelined — 업로드를 비동기로 처리)
// ─────────────────────────────────────────────

let dbClient: ReturnType<typeof postgres> | null = null;
let db: ReturnType<typeof drizzle> | null = null;

function getDbConnection() {
  if (!db) {
    dbClient = postgres(process.env.DATABASE_URL!, { prepare: false, idle_timeout: 30, connect_timeout: 15, ssl: "require", max: 3 });
    db = drizzle(dbClient);
  }
  return db;
}

function fingerprint(bar: { symbol: string; minuteAt: Date; open: number; high: number; low: number; close: number; volume: number }) {
  return createHash("sha256").update(JSON.stringify({ symbol: bar.symbol, minuteAt: bar.minuteAt.toISOString(), open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume, source: "kiwoom_ka10080" })).digest("hex");
}

function koreanTradingDate(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(date);
}

// Upload queue — DB 업로드를 병렬로 처리
const uploadQueue: Array<Promise<number>> = [];
const MAX_CONCURRENT_UPLOADS = 2;

async function uploadBatch(bars: Array<{ symbol: string; minuteAt: Date; open: number; high: number; low: number; close: number; volume: number }>): Promise<number> {
  const database = getDbConnection();
  const capturedAt = new Date();

  const validBars = bars.filter(b =>
    /^\d{6}$/.test(b.symbol) && !Number.isNaN(b.minuteAt.getTime()) &&
    b.open > 0 && b.high > 0 && b.low > 0 && b.close > 0 && b.volume >= 0 &&
    b.low <= Math.min(b.open, b.close) && b.high >= Math.max(b.open, b.close)
  );

  if (!validBars.length) return 0;

  for (let offset = 0; offset < validBars.length; offset += 100) {
    const batch = validBars.slice(offset, offset + 100);
    const values = batch.map(bar => ({
      tradingDate: koreanTradingDate(bar.minuteAt),
      symbol: bar.symbol,
      minuteAt: bar.minuteAt.toISOString(),
      open: bar.open, high: bar.high, low: bar.low, close: bar.close,
      volume: String(Math.trunc(bar.volume)),
      source: "kiwoom_ka10080",
      rawFingerprint: fingerprint(bar),
      capturedAt: capturedAt.toISOString(),
    }));

    await database.execute(sql`
      INSERT INTO intraday_minute_bars ("tradingDate", symbol, "minuteAt", open, high, low, close, volume, source, "rawFingerprint", "capturedAt")
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(values)}::jsonb) AS t(
        "tradingDate" varchar, symbol varchar, "minuteAt" timestamptz, open int, high int, low int, close int, volume numeric, source varchar, "rawFingerprint" varchar, "capturedAt" timestamptz
      )
      ON CONFLICT ("tradingDate", symbol, "minuteAt") DO UPDATE SET
        open = EXCLUDED.open, high = EXCLUDED.high, low = EXCLUDED.low, close = EXCLUDED.close,
        volume = EXCLUDED.volume, "rawFingerprint" = EXCLUDED."rawFingerprint", "capturedAt" = EXCLUDED."capturedAt"
    `);
  }
  return validBars.length;
}

async function queueUpload(bars: Array<{ symbol: string; minuteAt: Date; open: number; high: number; low: number; close: number; volume: number }>): Promise<void> {
  // Wait if too many concurrent uploads
  while (uploadQueue.length >= MAX_CONCURRENT_UPLOADS) {
    await Promise.race(uploadQueue);
    // Remove completed
    for (let i = uploadQueue.length - 1; i >= 0; i--) {
      const resolved = await Promise.race([uploadQueue[i].then(() => true), Promise.resolve(false)]);
      if (resolved) uploadQueue.splice(i, 1);
    }
  }
  const promise = uploadBatch(bars);
  uploadQueue.push(promise);
}

// ─────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────

async function main() {
  console.log("=== 확장 벌크 1분봉 수집 (6개월치) ===\n");
  console.log(`종목: ${DEFAULT_SYMBOLS.length}개`);
  console.log(`기간: ${BASE_DATES[BASE_DATES.length - 1]} ~ ${BASE_DATES[0]} (${BASE_DATES.length}개 기간)`);
  console.log(`예상: 종목당 ~${BASE_DATES.length * 9000}봉, 총 ~${(DEFAULT_SYMBOLS.length * BASE_DATES.length * 9000 / 1000000).toFixed(1)}M봉\n`);

  if (!process.env.KIWOOM_APP_KEY || !process.env.KIWOOM_APP_SECRET) {
    console.error("KIWOOM 자격증명이 필요합니다."); process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL이 필요합니다."); process.exit(1);
  }

  // 토큰 발급 (직접)
  const tokenRes = await fetch("https://api.kiwoom.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/json;charset=UTF-8" },
    body: JSON.stringify({ grant_type: "client_credentials", appkey: process.env.KIWOOM_APP_KEY, secretkey: process.env.KIWOOM_APP_SECRET }),
  });
  if (!tokenRes.ok) { console.error("토큰 발급 실패:", tokenRes.status); process.exit(1); }
  const tokenBody = await tokenRes.json() as { token: string; access_token?: string };
  const token = tokenBody.access_token ?? tokenBody.token;
  if (!token) { console.error("토큰이 비어있습니다"); process.exit(1); }
  console.log("토큰 발급 완료\n");

  let totalAccepted = 0;
  let completedSymbols = 0;
  const startTime = Date.now();

  for (const symbol of DEFAULT_SYMBOLS) {
    completedSymbols++;
    const symbolStart = Date.now();
    let symbolBars = 0;

    process.stdout.write(`[${completedSymbols}/${DEFAULT_SYMBOLS.length}] ${symbol}: `);

    for (const baseDate of BASE_DATES) {
      try {
        // KiwoomClient의 readPacer 누적 문제를 피하기 위해 직접 API 호출
        const bars = await fetchOneMinuteBarsRaw(token, symbol, baseDate, MAX_PAGES);

        if (bars.length > 0) {
          const barsToUpload = bars.map(b => ({ symbol, minuteAt: b.minuteAt, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume }));
          await queueUpload(barsToUpload);
          symbolBars += bars.length;
          process.stdout.write(`${bars.length} `);
        } else {
          break; // 데이터 없으면 더 이상 과거 없음
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (msg.includes("데이터가 없") || msg.includes("no data")) break;
        process.stdout.write(`✗(${msg.slice(0, 30)}) `);
      }
    }

    // Wait for pending uploads
    await Promise.all(uploadQueue);
    uploadQueue.length = 0;
    totalAccepted += symbolBars;

    const elapsed = ((Date.now() - symbolStart) / 1000).toFixed(0);
    console.log(`→ ${symbolBars.toLocaleString()}봉 (${elapsed}초) [누적: ${totalAccepted.toLocaleString()}]`);
  }

  // Final cleanup
  await Promise.all(uploadQueue);
  if (dbClient) await dbClient.end();

  const totalElapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log(`\n=== 수집 완료 ===`);
  console.log(`총 수집: ${totalAccepted.toLocaleString()}봉`);
  console.log(`소요 시간: ${totalElapsed}분`);
  console.log(`\n다음: npx tsx scripts/verify-surge-hypothesis.ts`);
}

main().catch(e => { console.error("에러:", e.message); process.exit(1); });
