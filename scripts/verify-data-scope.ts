/**
 * 데이터 규모 확인 스크립트
 *
 * 1분봉 데이터의 범위를 파악한다:
 * - 총 레코드 수
 * - 거래일 수
 * - 종목 수
 * - 날짜 범위 (첫날 ~ 마지막날)
 * - 날짜별 종목 수 분포
 *
 * 검증에 충분한 표본인지 판단 기준:
 * - 최소 20거래일 이상
 * - 최소 10종목 이상
 * - "당일 급등(5%+)" 종목이 하루 평균 2개 이상이면 통계 가능
 */

import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL이 설정되지 않았습니다. .env 파일을 확인하세요.");
    process.exit(1);
  }

  const client = postgres(process.env.DATABASE_URL, {
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 10,
    ssl: "require",
  });
  const db = drizzle(client);

  console.log("=== 1분봉 데이터 규모 확인 ===\n");

  // 1. 총 레코드 수
  const [totalCount] = await db.execute(sql`SELECT COUNT(*) as cnt FROM intraday_minute_bars`);
  console.log(`총 레코드 수: ${Number(totalCount.cnt).toLocaleString()}`);

  // 2. 거래일 수 + 날짜 범위
  const dateRange = await db.execute(sql`
    SELECT
      COUNT(DISTINCT "tradingDate") as date_count,
      MIN("tradingDate") as first_date,
      MAX("tradingDate") as last_date
    FROM intraday_minute_bars
  `);
  const dr = dateRange[0];
  console.log(`거래일 수: ${dr.date_count}`);
  console.log(`날짜 범위: ${dr.first_date} ~ ${dr.last_date}`);

  // 3. 종목 수
  const [symbolCount] = await db.execute(sql`SELECT COUNT(DISTINCT symbol) as cnt FROM intraday_minute_bars`);
  console.log(`총 종목 수: ${symbolCount.cnt}`);

  // 4. 날짜별 종목 수 분포
  const dateDistribution = await db.execute(sql`
    SELECT "tradingDate", COUNT(DISTINCT symbol) as symbol_count, COUNT(*) as bar_count
    FROM intraday_minute_bars
    GROUP BY "tradingDate"
    ORDER BY "tradingDate" DESC
    LIMIT 30
  `);
  console.log(`\n=== 최근 날짜별 데이터 분포 (최대 30일) ===`);
  console.log("날짜         | 종목수 | 봉 수");
  console.log("-------------|--------|--------");
  for (const row of dateDistribution) {
    console.log(`${row.tradingDate} | ${String(row.symbol_count).padStart(6)} | ${Number(row.bar_count).toLocaleString().padStart(8)}`);
  }

  // 5. 당일 급등 종목 표본 확인 (시가 대비 고가 5% 이상)
  console.log(`\n=== 당일 급등 종목 표본 확인 ===`);
  console.log("(하루 중 시가 대비 고가가 5% 이상인 종목 수)");
  const surgeCount = await db.execute(sql`
    SELECT
      "tradingDate",
      COUNT(*) as surge_count
    FROM (
      SELECT
        "tradingDate",
        symbol,
        MIN(CASE WHEN EXTRACT(HOUR FROM "minuteAt") = 9 AND EXTRACT(MINUTE FROM "minuteAt") <= 5 THEN open ELSE NULL END) as open_price,
        MAX(high) as day_high
      FROM intraday_minute_bars
      GROUP BY "tradingDate", symbol
      HAVING MIN(CASE WHEN EXTRACT(HOUR FROM "minuteAt") = 9 AND EXTRACT(MINUTE FROM "minuteAt") <= 5 THEN open ELSE NULL END) IS NOT NULL
    ) daily_stats
    WHERE day_high > open_price * 1.05
    GROUP BY "tradingDate"
    ORDER BY "tradingDate" DESC
    LIMIT 30
  `);

  if (surgeCount.length === 0) {
    console.log("급등 종목 데이터가 없습니다. 시가 계산 방식을 조정해봅니다...\n");

    // 대안: 각 날짜의 첫 번째 봉을 시가로 사용
    const surgeCountAlt = await db.execute(sql`
      WITH first_bar AS (
        SELECT DISTINCT ON ("tradingDate", symbol)
          "tradingDate", symbol, open as first_open
        FROM intraday_minute_bars
        ORDER BY "tradingDate", symbol, "minuteAt" ASC
      ),
      day_highs AS (
        SELECT "tradingDate", symbol, MAX(high) as day_high
        FROM intraday_minute_bars
        GROUP BY "tradingDate", symbol
      )
      SELECT
        f."tradingDate",
        COUNT(*) as surge_count,
        COUNT(*) FILTER (WHERE d.day_high > f.first_open * 1.03) as surge_3pct,
        COUNT(*) FILTER (WHERE d.day_high > f.first_open * 1.05) as surge_5pct,
        COUNT(*) FILTER (WHERE d.day_high > f.first_open * 1.07) as surge_7pct
      FROM first_bar f
      JOIN day_highs d ON f."tradingDate" = d."tradingDate" AND f.symbol = d.symbol
      WHERE f.first_open > 0
      GROUP BY f."tradingDate"
      ORDER BY f."tradingDate" DESC
      LIMIT 30
    `);

    console.log("날짜         | 전체 | 3%↑ | 5%↑ | 7%↑");
    console.log("-------------|------|-----|-----|-----");
    for (const row of surgeCountAlt) {
      console.log(`${row.tradingDate} | ${String(row.surge_count).padStart(4)} | ${String(row.surge_3pct).padStart(3)} | ${String(row.surge_5pct).padStart(3)} | ${String(row.surge_7pct).padStart(3)}`);
    }
  } else {
    console.log("날짜         | 5%+ 급등 종목 수");
    console.log("-------------|----------------");
    for (const row of surgeCount) {
      console.log(`${row.tradingDate} | ${row.surge_count}`);
    }
  }

  // 6. 검증 적합성 판단
  console.log(`\n=== 검증 적합성 판단 ===`);
  const numDates = Number(dr.date_count);
  const numSymbols = Number(symbolCount.cnt);
  const totalBars = Number(totalCount.cnt);

  const sufficient = numDates >= 20 && numSymbols >= 10 && totalBars >= 50000;
  if (sufficient) {
    console.log(`✅ 충분한 데이터: ${numDates}거래일, ${numSymbols}종목, ${totalBars.toLocaleString()}봉`);
    console.log("   → In-Sample / OOS 분할 가능, 통계 검증 진행 가능");
  } else {
    console.log(`⚠️ 데이터 부족 가능성:`);
    if (numDates < 20) console.log(`   - 거래일 ${numDates}일 (최소 20일 권장)`);
    if (numSymbols < 10) console.log(`   - 종목 ${numSymbols}개 (최소 10개 권장)`);
    if (totalBars < 50000) console.log(`   - 봉 ${totalBars.toLocaleString()}개 (최소 50,000개 권장)`);
  }

  await client.end();
}

main().catch(error => {
  console.error("에러:", error.message);
  process.exit(1);
});
