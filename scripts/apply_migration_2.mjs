import postgres from 'postgres';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const match = env.match(/DATABASE_URL="?([^\r\n"]+)"?/);
const dbUrl = match ? match[1] : process.env.DATABASE_URL;

console.log('Connecting to Supabase PostgreSQL database...');
const sql = postgres(dbUrl, { ssl: { rejectUnauthorized: false } });

async function run() {
  try {
    console.log('Reading migration SQL 20261116000002_consolidate_and_secure.sql...');
    const migrationSql = fs.readFileSync('supabase/migrations/20261116000002_consolidate_and_secure.sql', 'utf8');

    console.log('Executing consolidation & RLS hardening...');
    await sql.unsafe(migrationSql);
    console.log('Migration executed successfully!');

    // Verification
    console.log('\n--- VERIFYING CONSOLIDATION RESULTS ---');
    const customers = await sql`SELECT id, auth_provider_uid, full_name, email, phone FROM public.customers`;
    console.log(`Total customers: ${customers.length}`);
    console.log(customers);

    const orders = await sql`SELECT id, order_number, user_id, customer_id, customer_name, total FROM public.orders`;
    console.log(`\nTotal orders: ${orders.length}`);
    console.log(orders);

    const orderAddrs = await sql`SELECT count(*) FROM public.order_addresses`;
    console.log(`\nOrder addresses count: ${orderAddrs[0].count}`);

    const customerAddrs = await sql`SELECT id, customer_id, full_name, address_line1, city, postal_code, is_default FROM public.customer_addresses`;
    console.log(`\nCustomer addresses count: ${customerAddrs.length}`);
    console.log(customerAddrs);

    const statusHistory = await sql`SELECT count(*) FROM public.order_status_history`;
    console.log(`\nOrder status history count: ${statusHistory[0].count}`);

    const invTransactions = await sql`SELECT count(*) FROM public.inventory_transactions`;
    console.log(`\nInventory transactions count: ${invTransactions[0].count}`);

  } catch (err) {
    console.error('Error applying migration 2:', err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

run();
