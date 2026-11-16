import postgres from 'postgres';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const match = env.match(/DATABASE_URL="?([^\r\n"]+)"?/);
const sql = postgres(match[1], { ssl: { rejectUnauthorized: false } });

async function run() {
  try {
    const triggers = await sql`
      SELECT 
        trigger_name,
        event_manipulation,
        event_object_schema,
        event_object_table,
        action_statement
      FROM information_schema.triggers
      WHERE event_object_schema = 'auth' AND event_object_table = 'users';
    `;
    console.log("Triggers on auth.users:", triggers);

    const functions = await sql`
      SELECT routine_name, routine_definition
      FROM information_schema.routines
      WHERE routine_schema = 'public' AND routine_name LIKE '%profile%' OR routine_name LIKE '%user%';
    `;
    console.log("Profile / user routines:", functions.map(f => f.routine_name));
  } catch (err) {
    console.error("Error:", err);
  } finally {
    await sql.end();
  }
}

run();
