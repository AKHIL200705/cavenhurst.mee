import postgres from "postgres";
import fs from "node:fs";
import path from "node:path";

let _sql: ReturnType<typeof postgres> | undefined;

function resolveDbUrl(): string {
  let dbUrl = (
    process.env["DATABASE_URL"] ||
    process.env["POSTGRES_URL"] ||
    process.env["DIRECT_URL"] ||
    process.env["POSTGRES_PRISMA_URL"] ||
    process.env["POSTGRES_URL_NON_POOLING"] ||
    process.env["SUPABASE_DB_URL"] ||
    process.env["STORAGE_DATABASE_URL"] ||
    process.env["STORAGE_POSTGRES_URL"] ||
    process.env["STORAGE_POSTGRES_PRISMA_URL"] ||
    process.env["STORAGE_URL"] ||
    ""
  )
    .replace(/^["']|["']$/g, "")
    .trim();

  // In local dev/Vite SSR where process.env may not preload .env, read local .env once
  if (!dbUrl && typeof process !== "undefined" && process.env["NODE_ENV"] !== "production") {
    try {
      const envPath = path.resolve(process.cwd(), ".env");
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, "utf8");
        const match = content.match(/^DATABASE_URL=["']?([^"'\r\n]+)["']?/m);
        if (match && match[1]) {
          dbUrl = match[1].trim();
          process.env["DATABASE_URL"] = dbUrl;
        }
      }
    } catch {
      // Ignore filesystem access limitations
    }
  }

  // Supabase direct URLs (db.[ref].supabase.co:5432) are IPv6-only.
  // In serverless cloud environments (like Vercel), outbound IPv6 is unavailable.
  // Automatically rewrite IPv6-only direct URLs to the IPv4-compatible Supabase pooler on port 5432.
  if (dbUrl && /@db\.[a-z0-9]+\.supabase\.co:5432\//i.test(dbUrl)) {
    dbUrl = dbUrl.replace(
      /^postgresql:\/\/postgres:([^@]+)@db\.([a-z0-9]+)\.supabase\.co:5432\/(.*)$/i,
      "postgresql://postgres.$2:$1@aws-0-ap-southeast-1.pooler.supabase.com:5432/$3",
    );
  }

  if (!dbUrl) {
    console.error(
      "[Database Security Error] DATABASE_URL is not configured. Refusing to connect without environment credentials.",
    );
    return "";
  }

  return dbUrl;
}

/**
 * Returns a pooled PostgreSQL client using DATABASE_URL if configured.
 * Guarantees direct, high-performance database access for server functions.
 */
export function getDb(): ReturnType<typeof postgres> | null {
  if (_sql) return _sql;
  const dbUrl = resolveDbUrl();

  if (!dbUrl) {
    return null;
  }

  try {
    const isTransactionPooler = /:6543\b/.test(dbUrl) || /[?&]pgbouncer=true\b/i.test(dbUrl);
    const poolMax = process.env["VERCEL"] ? 2 : 4;
    _sql = postgres(dbUrl, {
      ssl: { rejectUnauthorized: false },
      connect_timeout: process.env["VERCEL"] ? 8 : 5,
      max: poolMax,
      idle_timeout: 15,
      max_lifetime: 120,
      ...(isTransactionPooler ? { prepare: false } : {}),
    });
    return _sql;
  } catch (err) {
    console.error("[Postgres DB Pool Error]", err);
    return null;
  }
}
