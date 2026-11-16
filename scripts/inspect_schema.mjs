import postgres from 'postgres';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const match = env.match(/DATABASE_URL="?([^\r\n"]+)"?/);
const dbUrl = match ? match[1] : process.env.DATABASE_URL;

const sql = postgres(dbUrl, { ssl: { rejectUnauthorized: false } });

try {
  const columns = await sql`
    SELECT table_name, column_name, data_type 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    ORDER BY table_name, ordinal_position;
  `;
  const tableCols = {};
  for (const row of columns) {
    if (!tableCols[row.table_name]) tableCols[row.table_name] = [];
    tableCols[row.table_name].push(`${row.column_name} (${row.data_type})`);
  }
  console.log(JSON.stringify(tableCols, null, 2));
} catch (err) {
  console.error(err);
} finally {
  await sql.end();
}
