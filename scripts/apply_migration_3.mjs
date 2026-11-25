import postgres from "postgres";
import fs from "fs";

const env = fs.readFileSync(".env", "utf8");
const match = env.match(/DATABASE_URL="?([^\r\n"]+)"?/);
if (!match) {
  console.error("DATABASE_URL missing from .env");
  process.exit(1);
}

const sql = postgres(match[1], { ssl: { rejectUnauthorized: false } });

async function apply() {
  try {
    const migrationSql = fs.readFileSync(
      "supabase/migrations/20261116000003_cleanup_and_auth_sync.sql",
      "utf8",
    );
    console.log("Applying Migration 3 to live Supabase PostgreSQL database...");
    await sql.unsafe(migrationSql);
    console.log("Migration 3 successfully applied!");

    // Verify results
    const customers =
      await sql`SELECT id, auth_provider_uid, full_name, email FROM public.customers`;
    console.log("\nRemaining customers in public.customers:", customers);

    const profiles =
      await sql`SELECT id, email, full_name, auth_provider, account_status FROM public.profiles`;
    console.log("\nProfiles in public.profiles:", profiles);

    const orders =
      await sql`SELECT id, order_number, customer_name, customer_email, total, status FROM public.orders`;
    console.log("\nRemaining orders in public.orders:", orders);

    const adminRoles = await sql`SELECT * FROM public.admin_roles`;
    console.log("\nAdmin roles:", adminRoles);

    const triggerCheck = await sql`
      SELECT trigger_name, event_manipulation, event_object_table
      FROM information_schema.triggers
      WHERE event_object_schema = 'auth' AND event_object_table = 'users';
    `;
    console.log("\nTriggers on auth.users:", triggerCheck);
  } catch (err) {
    console.error("Migration 3 failed:", err);
  } finally {
    await sql.end();
  }
}

apply();
