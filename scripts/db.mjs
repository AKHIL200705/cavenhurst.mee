import postgres from "postgres";
import fs from "fs";

// Read .env
const env = fs.readFileSync(".env", "utf8");
const match = env.match(/DATABASE_URL="?([^\r\n"]+)"?/);
const dbUrl = match ? match[1] : process.env.DATABASE_URL;

console.log("Connecting to:", dbUrl ? dbUrl.replace(/:[^:@]+@/, ":***@") : "NONE");

const sql = postgres(dbUrl, { ssl: { rejectUnauthorized: false } });

try {
  const tables = await sql`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name;
  `;
  console.log(
    "Existing tables in public schema:",
    tables.map((t) => t.table_name),
  );
} catch (err) {
  console.error("Database connection error:", err);
} finally {
  await sql.end();
}
