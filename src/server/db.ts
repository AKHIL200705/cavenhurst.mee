import postgres from "postgres";

let _sql: ReturnType<typeof postgres> | undefined;

/**
 * Returns a pooled PostgreSQL client using DATABASE_URL if configured.
 * Guarantees direct, high-performance database access for server functions.
 */
export function getDb(): ReturnType<typeof postgres> | null {
  if (_sql) return _sql;
  const dbUrl = (process.env["DATABASE_URL"] || "").replace(/^["']|["']$/g, "").trim();
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
