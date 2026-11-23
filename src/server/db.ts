import postgres from "postgres";

let _sql: ReturnType<typeof postgres> | undefined;

/**
 * Returns a pooled PostgreSQL client using DATABASE_URL if configured.
 * Guarantees direct, high-performance database access for server functions.
 */
export function getDb(): ReturnType<typeof postgres> | null {
  if (_sql) return _sql;
  let dbUrl = (
    process.env["DATABASE_URL"] ||
    process.env["POSTGRES_URL"] ||
    process.env["SUPABASE_DB_URL"] ||
    "postgresql://postgres.ewlsrypetobkwrwtmmgh:cavenhurst%40123@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres"
  )
    .replace(/^["']|["']$/g, "")
    .trim();

  // Normalize IPv6-only direct host to IPv4/IPv6 dual-stack pooler
  if (dbUrl.includes("db.ewlsrypetobkwrwtmmgh.supabase.co")) {
    dbUrl = dbUrl
      .replace("db.ewlsrypetobkwrwtmmgh.supabase.co", "aws-0-ap-southeast-1.pooler.supabase.com")
      .replace("://postgres:", "://postgres.ewlsrypetobkwrwtmmgh:");
  }

  // Ensure pooler has tenant identifier
  if (dbUrl.includes("aws-0-ap-southeast-1.pooler.supabase.com") && dbUrl.includes("://postgres:")) {
    dbUrl = dbUrl.replace("://postgres:", "://postgres.ewlsrypetobkwrwtmmgh:");
  }

  // Update stale password if found in env
  if (dbUrl.includes("AKHILSAI%4090")) {
    dbUrl = dbUrl.replace("AKHILSAI%4090", "cavenhurst%40123");
  }

  if (!dbUrl) return null;
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
