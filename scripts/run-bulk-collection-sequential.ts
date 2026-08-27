/**
 * 순차 벌크 수집 — 여러 기간을 자동으로 이어서 수집
 *
 * BASE_DATE를 한 달씩 뒤로 이동하며 run-bulk-minute-collection.ts와 같은 로직을 반복.
 * 한 기간이 끝나면 바로 다음 기간 시작. 사람 개입 불필요.
 */

import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { normalizeKiwoomMinuteBars } from "../server/kiwoom/minuteBars";
import type { IntradayMinuteBar } from "../server/kiwoom/minuteBars";

const SYMBOLS = [
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

// 수집할 기간들 (최신→과거)
const PERIODS = ["20260801", "20260701", "20260601", "20260501", "20260401"];
const MAX_PAGES = 10;

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

function fingerprint(bar: { symbol: string; minuteAt: Date; open: number; high: number; low: number; close: number; volume: number }) {
  return createHash("sha256").update(JSON.stringify({ symbol: bar.symbol, minuteAt: bar.minuteAt.toISOString(), open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume, source: "kiwoom_ka10080" })).digest("hex");
}

function koreanTradingDate(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(date);
}

async function fetchBars(token: string, symbol: string, baseDate: string): Promise<IntradayMinuteBar[]> {
  const rows: Array<Record<string, unknown>> = [];
  let continuation = "N";
  let nextKey = "";

  for (let page = 0; page < MAX_PAGES; page++) {
    if (page > 0) await sleep(1100);
    const res = await fetch("https://api.kiwoom.com/api/dostk/chart", {
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
    if (String(body.return_code ?? "0") !== "0") throw new Error(String(body.return_msg ?? "API error"));
    const data = body.stk_min_pole_chart_qry;
    if (Array.isArray(data)) rows.push(...data);
    const resCont = res.headers.get("cont-yn") ?? String(body.cont_yn ?? "N");
    const resNext = res.headers.get("next-key") ?? String(body.next_key ?? "");
    if (resCont !== "Y" || !resNext) break;
    continuation = "Y";
    nextKey = resNext;
  }
  return rows.length ? normalizeKiwoomMinuteBars(rows as Array<Record<string, unknown>>) : [];
}

async function uploadBars(db: ReturnType<typeof drizzle>, bars: IntradayMinuteBar[], symbol: string): Promise<number> {
  const capturedAt = new Date();
  const validBars = bars.filter(b => b.open > 0 && b.high > 0 && b.low > 0 && b.close > 0 && b.volume >= 0);
  if (!validBars.length) return 0;

  // 100건씩 업로드 (Supabase pooler 호환)
  for (let offset = 0; offset < validBars.length; offset += 100) {
    const batch = validBars.slice(offset, offset + 100);
    const values = batch.map(bar => ({
      tradingDate: koreanTradingDate(bar.minuteAt),
      symbol,
      minuteAt: bar.minuteAt.toISOString(),
      open: bar.open, high: bar.high, low: bar.low, close: bar.close,
      volume: String(Math.trunc(bar.volume)),
      source: "kiwoom_ka10080",
      rawFingerprint: fingerprint({ symbol, ...bar }),
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
  }
  return validBars.length;
}

async function main() {
  console.log("=== 순차 벌크 1분봉 수집 (자동 기간 이어받기) ===\n");
  console.log(`종목: ${SYMBOLS.length}개 | 기간: ${PERIODS.length}개 (${PERIODS[PERIODS.length - 1]} ~ ${PERIODS[0]})`);
  console.log(`예상 총량: ~${(SYMBOLS.length * PERIODS.length * 9000 / 1000000).toFixed(1)}M봉\n`);

  // 토큰 발급
  const tokenRes = await fetch("https://api.kiwoom.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/json;charset=UTF-8" },
    body: JSON.stringify({ grant_type: "client_credentials", appkey: process.env.KIWOOM_APP_KEY, secretkey: process.env.KIWOOM_APP_SECRET }),
  });
  if (!tokenRes.ok) { console.error("토큰 발급 실패"); process.exit(1); }
  const tokenBody = await tokenRes.json() as { access_token?: string; token?: string };
  const token = tokenBody.access_token ?? tokenBody.token ?? "";
  if (!token) { console.error("토큰 비어있음"); process.exit(1); }
  console.log("토큰 OK\n");

  const client = postgres(process.env.DATABASE_URL!, { prepare: false, idle_timeout: 30, connect_timeout: 15, ssl: "require" });
  const db = drizzle(client);

  let grandTotal = 0;
  const startTime = Date.now();

  for (let p = 0; p < PERIODS.length; p++) {
    const baseDate = PERIODS[p];
    console.log(`\n─── 기간 ${p + 1}/${PERIODS.length}: base_dt=${baseDate} ───`);

    for (let s = 0; s < SYMBOLS.length; s++) {
      const symbol = SYMBOLS[s];
      try {
        const bars = await fetchBars(token, symbol, baseDate);
        if (bars.length === 0) {
          process.stdout.write(`  [${s + 1}/${SYMBOLS.length}] ${symbol}: 데이터없음\n`);
          continue;
        }
        const accepted = await uploadBars(db, bars, symbol);
        grandTotal += accepted;
        process.stdout.write(`  [${s + 1}/${SYMBOLS.length}] ${symbol}: ${accepted.toLocaleString()}봉 OK (총 ${grandTotal.toLocaleString()})\n`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stdout.write(`  [${s + 1}/${SYMBOLS.length}] ${symbol}: ✗ ${msg.slice(0, 50)}\n`);
      }
      await sleep(2000); // 종목 간 2초 대기
    }
  }

  await client.end();
  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log(`\n=== 전체 수집 완료: ${grandTotal.toLocaleString()}봉, ${elapsed}분 소요 ===`);
  console.log("다음: npx tsx scripts/verify-surge-hypothesis.ts");
}

main().catch(e => { console.error("Fatal:", e.message); process.exit(1); });
