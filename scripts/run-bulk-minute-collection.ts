/**
 * 벌크 1분봉 수집 실행 스크립트
 *
 * 이 스크립트를 키움 API 접근이 가능한 환경(고정 IP 등록된 PC)에서 실행합니다.
 *
 * 실행 방법:
 *   npx tsx scripts/run-bulk-minute-collection.ts
 *
 * 환경변수 필요:
 *   - DATABASE_URL (또는 서버 URL 기반 동작)
 *   - KIWOOM_APP_KEY, KIWOOM_APP_SECRET
 *   - KIWOOM_FIXED_IP_REGISTERED=true
 *   - LOCAL_RESEARCH_NODE_TOKEN
 *   - KIWOOM_API_MODE=live (또는 mock)
 *
 * 동작:
 *   1. 서버에서 대기 중인 벌크 수집 요청 확인 (bulk-minute-collection-plan)
 *   2. 요청이 없으면 직접 기본 50종목 × 60일 수집 실행
 *   3. 각 종목에 대해 키움 ka10080 (1분봉) 호출
 *   4. 수집된 데이터를 서버 DB에 직접 적재 (intraday-minute-backfill-sync)
 *   5. 진행률 보고
 */

import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import { KiwoomClient } from "../server/kiwoom/client";

// ─────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────

const SERVER_BASE_URL = process.env.SERVER_BASE_URL ?? "https://kiwoom-quant-dashboard.vercel.app";
const NODE_TOKEN = process.env.LOCAL_RESEARCH_NODE_TOKEN ?? "";

/** 서버 요청이 없을 때 사용할 기본 종목 리스트 */
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

const MAX_PAGES_PER_SYMBOL = 10; // 10페이지 × ~900봉/페이지 = 약 9,000봉 (약 23거래일치)
const DELAY_BETWEEN_SYMBOLS_MS = 2_000;

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function sleep(ms: number) { return new Promise(resolve => setTimeout(resolve, ms)); }

function today() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
}

async function reportProgress(requestId: number | null, completedSymbols: number, totalSymbols: number, acceptedBarCount: number, currentSymbol: string | null, status?: "running" | "completed" | "failed", lastError?: string) {
  if (!requestId) return;
  try {
    await fetch(`${SERVER_BASE_URL}/api/local-research-node/bulk-minute-collection-progress`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-research-node-token": NODE_TOKEN },
      body: JSON.stringify({ requestId, completedSymbols, acceptedBarCount, currentSymbol, totalSymbols, status: status ?? "running", lastError: lastError ?? null }),
    });
  } catch { /* ignore progress report failures */ }
}

async function uploadBars(bars: Array<{ symbol: string; minuteAt: Date; open: number; high: number; low: number; close: number; volume: number }>, year: number): Promise<{ accepted: number }> {
  // 직접 DB에 적재 (같은 환경에서 실행 시)
  if (process.env.DATABASE_URL) {
    return uploadBarsDirect(bars, year);
  }
  // 서버 API로 전송
  const response = await fetch(`${SERVER_BASE_URL}/api/local-research-node/intraday-minute-backfill-sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-research-node-token": NODE_TOKEN },
    body: JSON.stringify({
      year,
      capturedAt: new Date().toISOString(),
      bars: bars.map(b => ({ ...b, minuteAt: b.minuteAt.toISOString() })),
    }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`업로드 실패 (${response.status}): ${text.slice(0, 200)}`);
  }
  const result = await response.json() as { acceptedBarCount?: number };
  return { accepted: result.acceptedBarCount ?? 0 };
}

async function uploadBarsDirect(bars: Array<{ symbol: string; minuteAt: Date; open: number; high: number; low: number; close: number; volume: number }>, year: number): Promise<{ accepted: number }> {
  const { createHash } = await import("node:crypto");
  const client = postgres(process.env.DATABASE_URL!, { prepare: false, idle_timeout: 20, connect_timeout: 10, ssl: "require" });
  const db = drizzle(client);

  function fingerprint(bar: { symbol: string; minuteAt: Date; open: number; high: number; low: number; close: number; volume: number }) {
    return createHash("sha256").update(JSON.stringify({ symbol: bar.symbol, minuteAt: bar.minuteAt.toISOString(), open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume, source: "kiwoom_ka10080" })).digest("hex");
  }

  function koreanTradingDate(date: Date) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(date);
  }

  const capturedAt = new Date();
  let accepted = 0;

  // Filter valid bars
  const validBars = bars.filter(b =>
    /^\d{6}$/.test(b.symbol) &&
    !Number.isNaN(b.minuteAt.getTime()) &&
    b.open > 0 && b.high > 0 && b.low > 0 && b.close > 0 && b.volume >= 0 &&
    b.low <= Math.min(b.open, b.close) &&
    b.high >= Math.max(b.open, b.close) &&
    koreanTradingDate(b.minuteAt).startsWith(`${year}-`)
  );

  // Insert in batches
  for (let offset = 0; offset < validBars.length; offset += 500) {
    const batch = validBars.slice(offset, offset + 500);
    const values = batch.map(bar => ({
      tradingDate: koreanTradingDate(bar.minuteAt),
      symbol: bar.symbol,
      minuteAt: bar.minuteAt.toISOString(),
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: String(Math.trunc(bar.volume)),
      source: "kiwoom_ka10080",
      rawFingerprint: fingerprint(bar),
      capturedAt: capturedAt.toISOString(),
    }));

    await db.execute(sql`
      INSERT INTO intraday_minute_bars ("tradingDate", symbol, "minuteAt", open, high, low, close, volume, source, "rawFingerprint", "capturedAt")
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(values)}::jsonb) AS t(
        "tradingDate" varchar, symbol varchar, "minuteAt" timestamptz, open int, high int, low int, close int, volume numeric, source varchar, "rawFingerprint" varchar, "capturedAt" timestamptz
      )
      ON CONFLICT ("tradingDate", symbol, "minuteAt") DO UPDATE SET
        open = EXCLUDED.open, high = EXCLUDED.high, low = EXCLUDED.low, close = EXCLUDED.close,
        volume = EXCLUDED.volume, "rawFingerprint" = EXCLUDED."rawFingerprint", "capturedAt" = EXCLUDED."capturedAt"
    `);
    accepted += batch.length;
  }

  await client.end();
  return { accepted };
}

// ─────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────

async function main() {
  console.log("=== 벌크 1분봉 수집 시작 ===\n");

  // Check required env
  if (!process.env.KIWOOM_APP_KEY || !process.env.KIWOOM_APP_SECRET) {
    console.error("KIWOOM_APP_KEY, KIWOOM_APP_SECRET 환경변수가 필요합니다.");
    process.exit(1);
  }
  if (process.env.KIWOOM_FIXED_IP_REGISTERED !== "true") {
    console.error("KIWOOM_FIXED_IP_REGISTERED=true가 필요합니다 (고정 IP 등록 필수).");
    process.exit(1);
  }

  // Try to get plan from server
  let symbols = DEFAULT_SYMBOLS;
  let requestId: number | null = null;

  try {
    const planRes = await fetch(`${SERVER_BASE_URL}/api/local-research-node/bulk-minute-collection-plan`, {
      headers: { "x-research-node-token": NODE_TOKEN },
    });
    if (planRes.ok) {
      const plan = await planRes.json() as { status: string; requestId?: number; symbols?: string[] };
      if (plan.status === "ready" && plan.symbols?.length) {
        symbols = plan.symbols;
        requestId = plan.requestId ?? null;
        console.log(`서버 요청 발견 (ID: ${requestId}): ${symbols.length}종목`);
      }
    }
  } catch (e) {
    console.log("서버 연결 실패 — 기본 종목 리스트로 진행합니다.");
  }

  if (!requestId) {
    console.log(`서버 요청 없음 — 기본 ${symbols.length}종목으로 직접 수집합니다.`);
  }

  // Initialize Kiwoom client
  const kiwoom = new KiwoomClient();
  console.log(`키움 API 모드: ${kiwoom.getStatus().mode}`);

  // Get access token
  console.log("OAuth 토큰 발급 중...");
  const { token } = await kiwoom.getAccessToken();
  console.log("토큰 발급 완료\n");

  const baseDate = process.env.BASE_DATE ?? today().replaceAll("-", "");
  let totalAccepted = 0;
  let completedSymbols = 0;
  const errors: Array<{ symbol: string; error: string }> = [];

  for (const symbol of symbols) {
    completedSymbols++;
    console.log(`[${completedSymbols}/${symbols.length}] ${symbol} 수집 중...`);

    await reportProgress(requestId, completedSymbols - 1, symbols.length, totalAccepted, symbol);

    try {
      const bars = await kiwoom.getOneMinuteBars(token, {
        symbol,
        baseDate,
        adjustedPrice: "1",
        maxPages: MAX_PAGES_PER_SYMBOL,
      });

      console.log(`  → ${bars.length}봉 수신`);

      if (bars.length > 0) {
        const year = Number(bars[0].minuteAt.getFullYear());
        // Upload in chunks of 5000
        for (let offset = 0; offset < bars.length; offset += 5000) {
          const chunk = bars.slice(offset, offset + 5000).map(b => ({
            symbol,
            minuteAt: b.minuteAt,
            open: b.open,
            high: b.high,
            low: b.low,
            close: b.close,
            volume: b.volume,
          }));
          const result = await uploadBars(chunk, year);
          totalAccepted += result.accepted;
        }
        console.log(`  → ${bars.length}봉 업로드 완료 (누적: ${totalAccepted.toLocaleString()})`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`  ✗ ${symbol} 실패: ${message}`);
      errors.push({ symbol, error: message });
    }

    // Wait between symbols
    if (completedSymbols < symbols.length) {
      await sleep(DELAY_BETWEEN_SYMBOLS_MS);
    }
  }

  // Final report
  const finalStatus = errors.length > symbols.length / 2 ? "failed" : "completed";
  await reportProgress(requestId, symbols.length, symbols.length, totalAccepted, null, finalStatus, errors.length ? `${errors.length}종목 실패` : undefined);

  console.log("\n=== 수집 완료 ===");
  console.log(`총 수집: ${totalAccepted.toLocaleString()}봉`);
  console.log(`성공: ${symbols.length - errors.length}종목, 실패: ${errors.length}종목`);
  if (errors.length) {
    console.log("\n실패 종목:");
    errors.forEach(e => console.log(`  ${e.symbol}: ${e.error}`));
  }
  console.log(`\n다음 단계: npx tsx scripts/verify-surge-hypothesis.ts 로 가설 재검증`);
}

main().catch(error => {
  console.error("치명적 오류:", error.message ?? error);
  process.exit(1);
});
