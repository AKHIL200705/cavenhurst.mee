import postgres from 'postgres';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const match = env.match(/DATABASE_URL="?([^\r\n"]+)"?/);
const sql = postgres(match[1], { ssl: { rejectUnauthorized: false } });

try {
  const jwtSecret = await sql`SELECT current_setting('app.settings.jwt_secret', true) as secret`;
  console.log('JWT Secret:', jwtSecret);
} catch (e) {
  console.log('Error querying jwt_secret:', e.message);
} finally {
  await sql.end();
}
