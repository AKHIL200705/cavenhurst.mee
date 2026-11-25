import postgres from "postgres";
import fs from "fs";

const env = fs.readFileSync(".env", "utf8");
const match = env.match(/DATABASE_URL="?([^\r\n"]+)"?/);
const sql = postgres(match[1], { ssl: { rejectUnauthorized: false } });

try {
  const secrets = await sql`SELECT name, secret FROM vault.decrypted_secrets`;
  console.log("Secrets count:", secrets.length);
  for (const s of secrets) {
    console.log("Secret name:", s.name, "prefix:", s.secret ? s.secret.slice(0, 15) : "null");
  }
} catch (e) {
  console.log("Error querying decrypted_secrets:", e.message);
} finally {
  await sql.end();
}
