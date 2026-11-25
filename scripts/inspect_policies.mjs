import postgres from "postgres";
import fs from "fs";

const env = fs.readFileSync(".env", "utf8");
const match = env.match(/DATABASE_URL="?([^\r\n"]+)"?/);
const sql = postgres(match[1], { ssl: { rejectUnauthorized: false } });

async function inspectPolicies() {
  const policies = await sql`
    SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
    FROM pg_policies
    WHERE tablename IN ('admin_users', 'customers', 'profiles', 'orders', 'user_roles')
    ORDER BY tablename, policyname;
  `;
  console.log("Policies:");
  for (const p of policies) {
    console.log(`[${p.tablename}] ${p.policyname} (${p.cmd}) -> qual: ${p.qual}`);
  }
  await sql.end();
}

inspectPolicies();
