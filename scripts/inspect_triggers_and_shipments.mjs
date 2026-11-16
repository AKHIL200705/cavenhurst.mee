import postgres from 'postgres';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const match = env.match(/DATABASE_URL="?([^\r\n"]+)"?/);
const sql = postgres(match[1], { ssl: { rejectUnauthorized: false } });

async function inspect() {
  console.log("=== TRIGGERS ON auth.users from pg_trigger ===");
  const triggers = await sql`
    SELECT tgname, relname, proname 
    FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_proc p ON t.tgfoid = p.oid
    WHERE relname = 'users';
  `;
  console.log(triggers);

  console.log("\n=== ROWS IN public.shipments ===");
  const shipments = await sql`SELECT * FROM public.shipments`;
  console.log(shipments);

  console.log("\n=== ROWS IN public.orders ===");
  const orders = await sql`SELECT id, order_number, total, status, awb_number, customer_name FROM public.orders`;
  console.log(orders);

  await sql.end();
}

inspect();
