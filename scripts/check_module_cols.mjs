import postgres from 'postgres';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const match = env.match(/DATABASE_URL="?([^\r\n"]+)"?/);
const sql = postgres(match[1], { ssl: { rejectUnauthorized: false } });

async function run() {
  try {
    const cols = await sql`
      SELECT table_name, column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' 
        AND table_name IN ('returns', 'return_items', 'product_reviews', 'product_categories', 'product_variants', 'admin_users', 'profiles', 'addresses')
      ORDER BY table_name, ordinal_position;
    `;
    console.table(cols);
  } catch (err) {
    console.error("Error:", err);
  } finally {
    await sql.end();
  }
}

run();
