import postgres from "postgres";
import fs from "fs";

const env = fs.readFileSync(".env", "utf8");
const match = env.match(/DATABASE_URL="?([^\r\n"]+)"?/);
const sql = postgres(match[1], { ssl: { rejectUnauthorized: false } });

async function createBackup() {
  console.log("=== CREATING FULL DATABASE BACKUP ===");
  const tables = await sql`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name;
  `;

  const backupData = {
    timestamp: new Date().toISOString(),
    tables: {},
  };

  for (const t of tables) {
    const rows = await sql.unsafe(`SELECT * FROM public."${t.table_name}"`);
    backupData.tables[t.table_name] = rows;
    console.log(`Backed up ${t.table_name}: ${rows.length} rows`);
  }

  const backupPath = `supabase/backups/backup_${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  fs.mkdirSync("supabase/backups", { recursive: true });
  fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2), "utf8");
  console.log(`\nBackup successfully written to ${backupPath}`);

  await sql.end();
}

createBackup().catch(console.error);
