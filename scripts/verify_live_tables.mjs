import postgres from "postgres";
import fs from "fs";

const env = fs.readFileSync(".env", "utf8");
const match = env.match(/DATABASE_URL="?([^\r\n"]+)"?/);
const sql = postgres(match[1], { ssl: { rejectUnauthorized: false } });

async function verifyTables() {
  const tables = await sql`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
    ORDER BY table_name;
  `;
  console.log(`Total BASE TABLES in public schema: ${tables.length}\n`);

  for (const t of tables) {
    try {
      const [{ count }] = await sql.unsafe(
        `SELECT COUNT(*) as count FROM public."${t.table_name}"`,
      );
      console.log(`- ${t.table_name.padEnd(25)} : ${count} rows`);
    } catch (e) {
      console.log(`- ${t.table_name.padEnd(25)} : error reading (${e.message})`);
    }
  }

  const views = await sql`
    SELECT table_name 
    FROM information_schema.views 
    WHERE table_schema = 'public'
    ORDER BY table_name;
  `;
  console.log(`\nTotal VIEWS in public schema: ${views.length}\n`);
  for (const v of views) {
    console.log(`- [VIEW] ${v.table_name}`);
  }

  await sql.end();
}

verifyTables();
