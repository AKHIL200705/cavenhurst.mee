import postgres from 'postgres';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const match = env.match(/DATABASE_URL="?([^\r\n"]+)"?/);
const sql = postgres(match[1], { ssl: { rejectUnauthorized: false } });

try {
  const customers = await sql`SELECT id, auth_provider_uid, full_name, email, phone FROM public.customers`;
  console.log('Customers in public.customers:');
  console.log(customers);

  const orders = await sql`SELECT id, order_number, user_id, customer_id, customer_name, customer_email, total, status FROM public.orders`;
  console.log('Orders in public.orders:');
  console.log(orders);

  const shippingAddrs = await sql`SELECT id, order_id, full_name, city, pincode FROM public.shipping_addresses`;
  console.log('Shipping addresses count:', shippingAddrs.length);

  const orderAddrs = await sql`SELECT count(*) FROM public.order_addresses`;
  console.log('Order addresses count:', orderAddrs[0].count);

  const customerCarts = await sql`SELECT user_id, jsonb_array_length(items) as cart_len, jsonb_array_length(wishlist) as wish_len FROM public.customer_carts`;
  console.log('Customer carts:', customerCarts);
} catch (e) {
  console.error('Error:', e);
} finally {
  await sql.end();
}
