import postgres from "postgres";

async function testDirect() {
  const directUrl = (process.env.DIRECT_DATABASE_URL || "").trim();
  const poolerUrl = (process.env.DATABASE_URL || "").trim();

  if (!directUrl && !poolerUrl) {
    console.error(
      "Missing environment variables. Run with: node --env-file=.env scripts/test_direct_connection.mjs",
    );
    process.exit(1);
  }

  if (directUrl) {
    console.log("Testing DIRECT_DATABASE_URL...");
    try {
      const sql = postgres(directUrl, {
        ssl: { rejectUnauthorized: false },
        connect_timeout: 5,
      });
      const res = await sql`SELECT current_database(), version()`;
      console.log("DIRECT CONNECTION SUCCESS:", res[0]);
      await sql.end();
    } catch (err) {
      console.error("DIRECT CONNECTION FAILED:", err.message);
    }
  }

  if (poolerUrl) {
    console.log("Testing DATABASE_URL (pooler)...");
    try {
      const sqlPooler = postgres(poolerUrl, {
        ssl: { rejectUnauthorized: false },
        connect_timeout: 5,
      });
      const resPooler = await sqlPooler`SELECT current_database(), version()`;
      console.log("POOLER CONNECTION SUCCESS:", resPooler[0]);
      await sqlPooler.end();
    } catch (err) {
      console.error("POOLER CONNECTION FAILED:", err.message);
    }
  }
}

testDirect();
