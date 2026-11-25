import postgres from "postgres";
import fs from "node:fs";
import path from "node:path";

let _sql: ReturnType<typeof postgres> | undefined;

function resolveDbUrl(): string {
  let dbUrl = (
    process.env["DATABASE_URL"] ||
    process.env["POSTGRES_URL"] ||
    process.env["SUPABASE_DB_URL"] ||
    ""
  )
    .replace(/^["']|["']$/g, "")
    .trim();

  // If not in process.env, inspect local .env file directly (covers Vite SSR dev environments)
  if (!dbUrl && typeof process !== "undefined") {
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

  if (!dbUrl) {
    dbUrl =
      "postgresql://postgres.ewlsrypetobkwrwtmmgh:cavenhurst%40123@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres";
  }

  // Normalize IPv6-only direct host to IPv4/IPv6 dual-stack pooler
  if (dbUrl.includes("db.ewlsrypetobkwrwtmmgh.supabase.co")) {
    dbUrl = dbUrl
      .replace("db.ewlsrypetobkwrwtmmgh.supabase.co", "aws-0-ap-southeast-1.pooler.supabase.com")
      .replace("://postgres:", "://postgres.ewlsrypetobkwrwtmmgh:");
  }

  // Ensure pooler has tenant identifier
  if (
    dbUrl.includes("aws-0-ap-southeast-1.pooler.supabase.com") &&
    dbUrl.includes("://postgres:")
  ) {
    dbUrl = dbUrl.replace("://postgres:", "://postgres.ewlsrypetobkwrwtmmgh:");
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
    _sql = postgres(dbUrl, {
      ssl: { rejectUnauthorized: false },
      connect_timeout: 10,
      max: 5,
      idle_timeout: 20,
    });
    return _sql;
  } catch (err) {
    console.error("[Postgres DB Pool Error]", err);
    return null;
  }
}
