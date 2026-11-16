import postgres from 'postgres';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const match = env.match(/DATABASE_URL="?([^\r\n"]+)"?/);
const sql = postgres(match[1], { ssl: { rejectUnauthorized: false } });

async function backup() {
  try {
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `;

    const fullBackup = {
      timestamp: new Date().toISOString(),
      tables: {},
    };

    for (const t of tables) {
      const name = t.table_name;
      try {
        const rows = await sql.unsafe(`SELECT * FROM public."${name}"`);
        fullBackup.tables[name] = rows;
        console.log(`Backed up ${name}: ${rows.length} rows`);
      } catch (err) {
        console.warn(`Could not backup table ${name}:`, err.message);
      }
    }

    fs.mkdirSync('supabase/backups', { recursive: true });
    const filename = `supabase/backups/backup_${Date.now()}.json`;
    fs.writeFileSync(filename, JSON.stringify(fullBackup, null, 2));
    console.log(`\nSuccessfully wrote full database backup to ${filename}`);

  } catch (err) {
    console.error("Backup failed:", err);
  } finally {
    await sql.end();
  }
}

backup();
