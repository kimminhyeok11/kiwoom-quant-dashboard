import postgres from "postgres";
const sql = postgres("postgresql://postgres:ZisWGWyeZlLURKmC@db.zrynnymusvndbbntkaso.supabase.co:5432/postgres", { prepare: false, ssl: "require" });
try {
  const r = await sql`SELECT DISTINCT symbol FROM local_research_daily_bars WHERE "adjustmentBasis" = 'adjusted' LIMIT 100`;
  console.log("Success! Rows:", r.length);
} catch (e) {
  console.error("Query failed:", e.message);
}
await sql.end();
