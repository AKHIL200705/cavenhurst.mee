import postgres from "postgres";
import fs from "fs";

const env = fs.readFileSync(".env", "utf8");
const match = env.match(/DATABASE_URL="?([^\r\n"]+)"?/);
const sql = postgres(match[1], { ssl: { rejectUnauthorized: false } });

try {
  const schemas = await sql`
    SELECT schema_name FROM information_schema.schemata
  `;
  console.log(
    "Schemas:",
    schemas.map((s) => s.schema_name),
  );
} catch (e) {
  console.log("Error:", e.message);
} finally {
  await sql.end();
}
