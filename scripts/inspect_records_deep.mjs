import postgres from 'postgres';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const match = env.match(/DATABASE_URL="?([^\r\n"]+)"?/);
const sql = postgres(match[1], { ssl: { rejectUnauthorized: false } });

async function run() {
  try {
    console.log("=== CUSTOMERS ===");
    console.log(await sql`SELECT * FROM public.customers`);

    console.log("\n=== CUSTOMER PROFILES ===");
    console.log(await sql`SELECT * FROM public.customer_profiles`);

    console.log("\n=== CUSTOMER AUTH PROVIDERS ===");
    console.log(await sql`SELECT * FROM public.customer_auth_providers`);

    console.log("\n=== ORDERS ===");
    console.log(await sql`SELECT id, order_number, customer_id, user_id, customer_name, customer_email, total, status, payment_status, shipment_status, created_at FROM public.orders`);

    console.log("\n=== PAYMENTS ===");
    console.log(await sql`SELECT id, order_id, user_id, gateway, payment_method, razorpay_order_id, razorpay_payment_id, amount, status FROM public.payments`);

    console.log("\n=== SHIPMENTS ===");
    console.log(await sql`SELECT id, order_id, order_number, awb_number, courier_partner, status FROM public.shipments`);

    console.log("\n=== CUSTOMER ADDRESSES ===");
    console.log(await sql`SELECT id, customer_id, customer_auth_uid, full_name, city, state, postal_code, is_default FROM public.customer_addresses`);

    console.log("\n=== SHIPPING ADDRESSES ===");
    console.log(await sql`SELECT id, order_id, user_id, full_name, city, pincode FROM public.shipping_addresses`);

    console.log("\n=== ORDER ADDRESSES ===");
    console.log(await sql`SELECT id, order_id, full_name, email, city, postal_code FROM public.order_addresses`);

    console.log("\n=== PRODUCTS ===");
    const prods = await sql`SELECT id, slug, name, price, mrp, category_slug, is_published, is_featured FROM public.products`;
    console.table(prods);

    console.log("\n=== ADMIN USERS & WHITELIST ===");
    console.log('admin_users:', await sql`SELECT * FROM public.admin_users`);
    console.log('admin_whitelist:', await sql`SELECT * FROM public.admin_whitelist`);
    console.log('user_roles:', await sql`SELECT * FROM public.user_roles`);

  } catch (err) {
    console.error("Inspect error:", err);
  } finally {
    await sql.end();
  }
}

run();
