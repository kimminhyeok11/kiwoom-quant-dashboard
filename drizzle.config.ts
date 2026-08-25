import { defineConfig } from "drizzle-kit";

const connectionString = process.env.DATABASE_URL || "postgresql://postgres.zrynnymusvndbbntkaso:your-password@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres";

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: connectionString,
  },
});
