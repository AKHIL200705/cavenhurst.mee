import postgres from "postgres";
import fs from "fs";

const env = fs.readFileSync(".env", "utf8");
const match = env.match(/DATABASE_URL="?([^\r\n"]+)"?/);
const sql = postgres(match[1], { ssl: { rejectUnauthorized: false } });

async function getFn() {
  const fns = await sql`
    SELECT proname, pg_get_functiondef(oid) as def
    FROM pg_proc 
    WHERE proname IN ('is_admin', 'requesting_user_id');
  `;
  for (const f of fns) {
    console.log(`=== ${f.proname} ===\n${f.def}\n`);
  }
  await sql.end();
}

getFn();
