import postgres from 'postgres';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const match = env.match(/DATABASE_URL="?([^\r\n"]+)"?/);
if (!match) {
  console.error("No DATABASE_URL found");
  process.exit(1);
}

const sql = postgres(match[1], { ssl: { rejectUnauthorized: false } });

async function run() {
  try {
    // 1. Get all public tables
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `;
    console.log(`Found ${tables.length} tables in public schema:`);

    const tableStats = [];
    for (const t of tables) {
      const name = t.table_name;
      try {
        const countRes = await sql.unsafe(`SELECT count(*) FROM public."${name}"`);
        const rlsRes = await sql`
          SELECT relrowsecurity, relforcerowsecurity 
          FROM pg_class 
          WHERE relname = ${name} AND relnamespace = 'public'::regnamespace;
        `;
        tableStats.push({
          table: name,
          rows: parseInt(countRes[0].count, 10),
          rls: rlsRes[0]?.relrowsecurity ? 'ENABLED' : 'DISABLED',
        });
      } catch (err) {
        tableStats.push({
          table: name,
          rows: -1,
          error: err.message,
        });
      }
    }
    console.table(tableStats);

    // 2. Inspect auth.users
    const authUsers = await sql`
      SELECT id, email, phone, raw_user_meta_data, raw_app_meta_data, created_at, last_sign_in_at
      FROM auth.users
      ORDER BY created_at DESC;
    `;
    console.log(`\nFound ${authUsers.length} users in auth.users:`);
    for (const u of authUsers) {
      console.log(`- ID: ${u.id}, Email: ${u.email}, Phone: ${u.phone}, Created: ${u.created_at}, LastSignIn: ${u.last_sign_in_at}`);
    }

  } catch (err) {
    console.error("Audit error:", err);
  } finally {
    await sql.end();
  }
}

run();
