import postgres from "postgres";
const sql = postgres("postgresql://postgres:ZisWGWyeZlLURKmC@db.zrynnymusvndbbntkaso.supabase.co:5432/postgres", { prepare: false, ssl: "require" });
try {
  const r = await sql`SELECT count(*) as cnt FROM information_schema.tables WHERE table_schema = 'public'`;
  console.log("Connected! Public tables:", r[0].cnt);
  await sql.end();
} catch (e) {
  console.error("Failed:", e.message);
  process.exit(1);
}
