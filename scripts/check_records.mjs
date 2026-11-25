import postgres from "postgres";
import fs from "fs";

const env = fs.readFileSync(".env", "utf8");
const match = env.match(/DATABASE_URL="?([^\r\n"]+)"?/);
const dbUrl = match ? match[1] : process.env.DATABASE_URL;

const sql = postgres(dbUrl, { ssl: { rejectUnauthorized: false } });

try {
  const profiles = await sql`SELECT * FROM customer_profiles LIMIT 10`;
  console.log("Customer profiles:", profiles);
  const roles = await sql`SELECT * FROM user_roles`;
  console.log("User roles:", roles);
  const whitelist = await sql`SELECT * FROM admin_whitelist`;
  console.log("Admin whitelist:", whitelist);
} catch (err) {
  console.error(err);
} finally {
  await sql.end();
}
