import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";

async function main() {
  const client = postgres(process.env.DATABASE_URL!, { prepare: false, idle_timeout: 20, connect_timeout: 10, ssl: "require" });
  const db = drizzle(client);

  const [fiveMin] = await db.execute(sql`SELECT COUNT(*) as cnt, COUNT(DISTINCT symbol) as symbols, COUNT(DISTINCT "tradingDate") as days, MIN("tradingDate") as first_date, MAX("tradingDate") as last_date FROM research_five_minute_bars`);
  console.log("=== 5분봉 (research_five_minute_bars) ===");
  console.log(`총: ${fiveMin.cnt} | 종목: ${fiveMin.symbols} | 거래일: ${fiveMin.days} | ${fiveMin.first_date} ~ ${fiveMin.last_date}`);

  const [daily] = await db.execute(sql`SELECT COUNT(*) as cnt, COUNT(DISTINCT symbol) as symbols, COUNT(DISTINCT date) as days, MIN(date) as first_date, MAX(date) as last_date FROM local_research_daily_bars`);
  console.log("=== 일봉 (local_research_daily_bars) ===");
  console.log(`총: ${daily.cnt} | 종목: ${daily.symbols} | 거래일: ${daily.days} | ${daily.first_date} ~ ${daily.last_date}`);

  const [rd] = await db.execute(sql`SELECT COUNT(*) as cnt, COUNT(DISTINCT symbol) as symbols, COUNT(DISTINCT date) as days, MIN(date) as first_date, MAX(date) as last_date FROM research_daily_bars`);
  console.log("=== 연구 일봉 (research_daily_bars) ===");
  console.log(`총: ${rd.cnt} | 종목: ${rd.symbols} | 거래일: ${rd.days} | ${rd.first_date} ~ ${rd.last_date}`);

  const [minute] = await db.execute(sql`SELECT COUNT(*) as cnt, COUNT(DISTINCT symbol) as symbols, COUNT(DISTINCT "tradingDate") as days FROM intraday_minute_bars`);
  console.log("=== 1분봉 (intraday_minute_bars) ===");
  console.log(`총: ${minute.cnt} | 종목: ${minute.symbols} | 거래일: ${minute.days}`);

  await client.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });
