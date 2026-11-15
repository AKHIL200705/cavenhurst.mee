-- ==============================================================================
-- CAVENHURST – Complete Master Supabase PostgreSQL Database Schema
-- Run this entire script in Supabase Dashboard -> SQL Editor -> New Query -> Run
-- ==============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==============================================================================
-- 1. USER ROLES, ADMIN WHITELIST & RBAC
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.admin_whitelist (
  email text PRIMARY KEY,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'staff', 'customer')) DEFAULT 'customer',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_roles_user_role_unique UNIQUE (user_id, role)
);
CREATE INDEX IF NOT EXISTS user_roles_user_id_idx ON public.user_roles (user_id);
CREATE INDEX IF NOT EXISTS user_roles_role_idx ON public.user_roles (role);

GRANT ALL ON public.user_roles TO service_role;
GRANT SELECT ON public.user_roles TO anon, authenticated;
GRANT ALL ON public.admin_whitelist TO service_role;
GRANT SELECT ON public.admin_whitelist TO anon, authenticated;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_whitelist ENABLE ROW LEVEL SECURITY;

-- Helper function to check if current session is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()::text AND role = 'admin'
  ) OR EXISTS (
    SELECT 1 FROM public.admin_whitelist
    WHERE lower(email) = lower(auth.jwt() ->> 'email')
  );
$$;

DROP POLICY IF EXISTS "Public read roles" ON public.user_roles;
CREATE POLICY "Public read roles" ON public.user_roles
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Admins manage roles" ON public.user_roles;
CREATE POLICY "Admins manage roles" ON public.user_roles
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Public read whitelist" ON public.admin_whitelist;
CREATE POLICY "Public read whitelist" ON public.admin_whitelist
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Admins manage whitelist" ON public.admin_whitelist;
CREATE POLICY "Admins manage whitelist" ON public.admin_whitelist
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Function to assign admin role by email
CREATE OR REPLACE FUNCTION public.assign_admin_role_by_email(target_email text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  target_uid uuid;
  clean_email text;
BEGIN
  clean_email := lower(trim(target_email));

  INSERT INTO public.admin_whitelist (email)
  VALUES (clean_email)
  ON CONFLICT (email) DO NOTHING;

  SELECT id INTO target_uid FROM auth.users WHERE lower(email) = clean_email LIMIT 1;
  IF target_uid IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (target_uid::text, 'admin')
    ON CONFLICT (user_id, role) DO UPDATE SET role = 'admin';
  END IF;

  RETURN 'SUCCESS: ' || clean_email || ' is authorized as a CAVENHURST administrator.';
END;
$$;

-- Pre-seed admin emails
SELECT public.assign_admin_role_by_email('akhilsaiabbireddy2007@gmail.com');
SELECT public.assign_admin_role_by_email('cavenhurst@gmail.com');

-- ==============================================================================
-- 2. CUSTOMER PROFILES, CARTS & WELCOME
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.customer_profiles (
  id text PRIMARY KEY,
  full_name text,
  phone text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.customer_profiles TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.customer_profiles TO anon, authenticated;
ALTER TABLE public.customer_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read profiles" ON public.customer_profiles;
CREATE POLICY "Public read profiles" ON public.customer_profiles
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Users write own profile" ON public.customer_profiles;
CREATE POLICY "Users write own profile" ON public.customer_profiles
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.customer_carts (
  user_id text PRIMARY KEY,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  wishlist jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.customer_carts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_carts TO anon, authenticated;
ALTER TABLE public.customer_carts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Manage own carts" ON public.customer_carts;
CREATE POLICY "Manage own carts" ON public.customer_carts
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.customer_welcome (
  user_id text PRIMARY KEY,
  welcome_seen_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.customer_welcome TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.customer_welcome TO anon, authenticated;
ALTER TABLE public.customer_welcome ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Manage own welcome" ON public.customer_welcome;
CREATE POLICY "Manage own welcome" ON public.customer_welcome
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- ==============================================================================
-- 3. PRODUCT CATEGORIES & PRODUCTS CATALOG
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.product_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.product_categories TO service_role;
GRANT SELECT ON public.product_categories TO anon, authenticated;
GRANT ALL ON public.product_categories TO authenticated;
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Categories viewable by everyone" ON public.product_categories;
CREATE POLICY "Categories viewable by everyone" ON public.product_categories
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Admins manage categories" ON public.product_categories;
CREATE POLICY "Admins manage categories" ON public.product_categories
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Seed Categories
INSERT INTO public.product_categories (slug, name, description)
VALUES 
  ('t-shirts', 'T-Shirts', 'Premium heavyweight tees for everyday movement and relaxed drape.'),
  ('hoodies', 'Hoodies', 'Heavyweight fleece comfort, built for the city and seasonal layering.'),
  ('oversized', 'Oversized', 'Boxy silhouettes, dropped shoulders, and effortless structure.'),
  ('graphic', 'Graphics', 'Screen-printed artwork and classical sculptured illustrations.'),
  ('fan-edition', 'Fan Edition', 'Matchday crests and stadium-night editions.')
ON CONFLICT (slug) DO UPDATE SET 
  name = EXCLUDED.name,
  description = EXCLUDED.description;

CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  category_slug text REFERENCES public.product_categories(slug) ON UPDATE CASCADE ON DELETE SET NULL,
  price integer NOT NULL,
  mrp integer NOT NULL,
  fabric text,
  fit text,
  description text,
  tags text[] DEFAULT '{}',
  colors jsonb DEFAULT '[]'::jsonb,
  stock jsonb DEFAULT '{}'::jsonb,
  images text[] DEFAULT '{}',
  is_new boolean DEFAULT true,
  is_published boolean DEFAULT true,
  is_featured boolean DEFAULT false,
  views integer DEFAULT 0,
  sold integer DEFAULT 0,
  rank integer DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.products TO service_role;
GRANT SELECT ON public.products TO anon, authenticated;
GRANT ALL ON public.products TO authenticated;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Published products viewable by everyone" ON public.products;
CREATE POLICY "Published products viewable by everyone" ON public.products
  FOR SELECT TO anon, authenticated USING (is_published = true OR public.is_admin());

DROP POLICY IF EXISTS "Admins manage products" ON public.products;
CREATE POLICY "Admins manage products" ON public.products
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Seed 12 Core Products
INSERT INTO public.products (
  slug, name, category_slug, price, mrp, fabric, fit, description, 
  colors, stock, images, is_new, is_published, is_featured, sold, rank
) VALUES 
(
  'signature-oversized-tee', 'Signature Oversized Tee', 't-shirts', 879, 1099,
  '100% combed cotton, 240 GSM', 'Oversized',
  'Our signature heavyweight tee with a dropped shoulder and a boxy, relaxed silhouette.',
  '[{"name": "Midnight Navy", "hex": "#0A1F3C"}, {"name": "Silver Grey", "hex": "#C7D1DF"}, {"name": "Pure White", "hex": "#F5F5F2"}]'::jsonb,
  '{"XS": 8, "S": 20, "M": 25, "L": 22, "XL": 12, "XXL": 6}'::jsonb,
  ARRAY['/src/assets/tee-navy.jpg', '/src/assets/hero-urban-motion.jpg'],
  true, true, true, 940, 1
),
(
  'relaxed-essential-tee', 'Relaxed Essential Tee', 't-shirts', 749, 999,
  '100% combed cotton, 200 GSM', 'Relaxed',
  'A soft, relaxed everyday tee designed to be worn on repeat.',
  '[{"name": "Cream", "hex": "#EFE9DD"}, {"name": "Silver Grey", "hex": "#C7D1DF"}, {"name": "Midnight Navy", "hex": "#0A1F3C"}]'::jsonb,
  '{"XS": 8, "S": 20, "M": 25, "L": 22, "XL": 12, "XXL": 0}'::jsonb,
  ARRAY['/src/assets/tee-cream.jpg'],
  true, true, false, 1210, 2
),
(
  'mythic-graphic-tee', 'Mythic Graphic Tee', 't-shirts', 839, 1199,
  '100% cotton, 240 GSM, puff-print', 'Oversized',
  'Classical sculpture artwork screen-printed on a heavyweight oversized base.',
  '[{"name": "Jet Black", "hex": "#0B0B0D"}, {"name": "Silver Grey", "hex": "#C7D1DF"}, {"name": "Midnight Navy", "hex": "#0A1F3C"}]'::jsonb,
  '{"XS": 8, "S": 20, "M": 25, "L": 22, "XL": 12, "XXL": 6}'::jsonb,
  ARRAY['/src/assets/tee-graphic.jpg'],
  true, true, true, 780, 3
),
(
  'classic-hoodie', 'Classic Hoodie', 'hoodies', 2299, 2299,
  '80% cotton / 20% polyester, 360 GSM fleece', 'Regular',
  'Brushed-back fleece hoodie with a double-layer hood and kangaroo pocket.',
  '[{"name": "Midnight Navy", "hex": "#0A1F3C"}, {"name": "Silver Grey", "hex": "#C7D1DF"}, {"name": "Jet Black", "hex": "#0B0B0D"}]'::jsonb,
  '{"XS": 8, "S": 20, "M": 25, "L": 22, "XL": 12, "XXL": 6}'::jsonb,
  ARRAY['/src/assets/hoodie-navy.jpg', '/src/assets/hero-urban-motion.jpg'],
  true, true, false, 650, 4
),
(
  'urban-motion-hoodie', 'Urban Motion Hoodie', 'hoodies', 2499, 2999,
  '100% cotton French terry, 400 GSM', 'Oversized',
  'The campaign hoodie. Heavyweight, oversized and finished with a silver wing emblem.',
  '[{"name": "Midnight Navy", "hex": "#0A1F3C"}, {"name": "Jet Black", "hex": "#0B0B0D"}]'::jsonb,
  '{"S": 5, "M": 9, "L": 7, "XL": 3}'::jsonb,
  ARRAY['/src/assets/hero-urban-motion.jpg', '/src/assets/hoodie-navy.jpg'],
  false, true, true, 820, 5
),
(
  'fan-edition-18-tee', 'Fan Edition No.18 Tee', 't-shirts', 1199, 1499,
  '100% cotton, 240 GSM', 'Oversized',
  'Stadium-night fan edition with a bold No.18 crest. Heavyweight oversized fit.',
  '[{"name": "Jet Black", "hex": "#0B0B0D"}, {"name": "Pure White", "hex": "#F5F5F2"}]'::jsonb,
  '{"XS": 8, "S": 20, "M": 25, "L": 22, "XL": 12, "XXL": 6}'::jsonb,
  ARRAY['/src/assets/tee-fan-black.jpg'],
  true, true, true, 870, 6
),
(
  'logo-classic-tee', 'Logo Classic Tee', 't-shirts', 959, 1199,
  '100% combed cotton, 220 GSM', 'Regular',
  'Clean classic tee with the CAVENHURST wordmark.',
  '[{"name": "Pure White", "hex": "#F5F5F2"}, {"name": "Midnight Navy", "hex": "#0A1F3C"}]'::jsonb,
  '{"XS": 8, "S": 20, "M": 25, "L": 22, "XL": 12, "XXL": 6}'::jsonb,
  ARRAY['/src/assets/tee-cream.jpg'],
  false, true, false, 560, 7
),
(
  'racer-panel-tee', 'Racer Panel Tee', 't-shirts', 1104, 1299,
  'Cotton-poly blend, 230 GSM', 'Oversized',
  'Sport-inspired panelled tee with contrast piping along the sleeves.',
  '[{"name": "Midnight Navy", "hex": "#0A1F3C"}, {"name": "Silver Grey", "hex": "#C7D1DF"}, {"name": "Pure White", "hex": "#F5F5F2"}]'::jsonb,
  '{"XS": 0, "S": 20, "M": 25, "L": 22, "XL": 12, "XXL": 6}'::jsonb,
  ARRAY['/src/assets/tee-navy.jpg'],
  false, true, false, 430, 8
),
(
  'flow-print-tee', 'Flow Print Tee', 't-shirts', 1039, 1299,
  '100% cotton, 240 GSM', 'Oversized',
  'Abstract flowing-fabric print on a premium heavyweight tee.',
  '[{"name": "Jet Black", "hex": "#0B0B0D"}, {"name": "Midnight Navy", "hex": "#0A1F3C"}]'::jsonb,
  '{"XS": 8, "S": 20, "M": 25, "L": 22, "XL": 12, "XXL": 6}'::jsonb,
  ARRAY['/src/assets/tee-graphic.jpg'],
  false, true, false, 390, 9
),
(
  'midnight-zip-hoodie', 'Midnight Zip Hoodie', 'hoodies', 2599, 2999,
  '80% cotton / 20% polyester fleece', 'Regular',
  'Full-zip fleece hoodie for layering through the city.',
  '[{"name": "Midnight Navy", "hex": "#0A1F3C"}, {"name": "Silver Grey", "hex": "#C7D1DF"}]'::jsonb,
  '{}'::jsonb,
  ARRAY['/src/assets/hoodie-navy.jpg'],
  false, true, false, 280, 10
),
(
  'fan-edition-crest-tee', 'Fan Edition Crest Tee', 't-shirts', 1099, 1399,
  '100% cotton, 220 GSM', 'Relaxed',
  'Matchday crest tee for the stands and the streets.',
  '[{"name": "Pure White", "hex": "#F5F5F2"}, {"name": "Jet Black", "hex": "#0B0B0D"}]'::jsonb,
  '{"XS": 8, "S": 20, "M": 25, "L": 22, "XL": 12, "XXL": 6}'::jsonb,
  ARRAY['/src/assets/tee-fan-white.jpg'],
  false, true, false, 410, 11
),
(
  'sky-essential-tee', 'Sky Essential Tee', 't-shirts', 749, 999,
  '100% combed cotton, 200 GSM', 'Relaxed',
  'Your everyday essential in a soft sky tone.',
  '[{"name": "Sky Blue", "hex": "#A9C8E8"}, {"name": "Pure White", "hex": "#F5F5F2"}]'::jsonb,
  '{"XS": 8, "S": 20, "M": 25, "L": 22, "XL": 12, "XXL": 6}'::jsonb,
  ARRAY['/src/assets/tee-cream.jpg'],
  true, true, false, 340, 12
)
ON CONFLICT (slug) DO UPDATE SET
  price = EXCLUDED.price,
  mrp = EXCLUDED.mrp,
  stock = EXCLUDED.stock,
  is_published = EXCLUDED.is_published;

-- ==============================================================================
-- 4. ORDERS, ORDER ITEMS & SHIPPING ADDRESSES
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text,
  order_number text UNIQUE,
  customer_name text,
  customer_email text,
  customer_phone text,
  items jsonb NOT NULL,
  total integer NOT NULL,
  subtotal integer DEFAULT 0,
  discount integer DEFAULT 0,
  shipping_fee integer DEFAULT 0,
  taxes integer DEFAULT 0,
  status text NOT NULL DEFAULT 'pending_payment',
  payment_method text DEFAULT 'online',
  payment_status text DEFAULT 'pending',
  shipment_status text DEFAULT 'unfulfilled',
  shipping jsonb NOT NULL DEFAULT '{}'::jsonb,
  razorpay_order_id text,
  razorpay_payment_id text,
  shipmaxx_shipment_id text,
  awb_number text,
  courier_partner text,
  tracking_url text,
  tracking_data jsonb DEFAULT '{}'::jsonb,
  delivered_at timestamptz,
  return_requested_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS orders_order_number_idx ON public.orders (order_number);
CREATE INDEX IF NOT EXISTS orders_user_id_idx ON public.orders (user_id);
CREATE INDEX IF NOT EXISTS orders_status_idx ON public.orders (status);
CREATE INDEX IF NOT EXISTS orders_created_at_idx ON public.orders (created_at DESC);

GRANT ALL ON public.orders TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.orders TO anon, authenticated;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read orders" ON public.orders;
CREATE POLICY "Public read orders" ON public.orders
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Public insert orders" ON public.orders;
CREATE POLICY "Public insert orders" ON public.orders
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Admins manage all orders" ON public.orders;
CREATE POLICY "Admins manage all orders" ON public.orders
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE TABLE IF NOT EXISTS public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_slug text NOT NULL,
  name text NOT NULL,
  size text NOT NULL,
  color text NOT NULL,
  price integer NOT NULL,
  qty integer NOT NULL,
  image text
);
GRANT ALL ON public.order_items TO service_role;
GRANT SELECT, INSERT ON public.order_items TO anon, authenticated;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read order items" ON public.order_items;
CREATE POLICY "Public read order items" ON public.order_items
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Public insert order items" ON public.order_items;
CREATE POLICY "Public insert order items" ON public.order_items
  FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.shipping_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id text,
  full_name text NOT NULL,
  phone text NOT NULL,
  email text NOT NULL,
  address_line1 text NOT NULL,
  address_line2 text,
  city text NOT NULL,
  state text NOT NULL,
  pincode text NOT NULL,
  country text NOT NULL DEFAULT 'India',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.shipping_addresses TO service_role;
GRANT SELECT, INSERT ON public.shipping_addresses TO anon, authenticated;
ALTER TABLE public.shipping_addresses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read shipping addresses" ON public.shipping_addresses;
CREATE POLICY "Public read shipping addresses" ON public.shipping_addresses
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Public insert shipping addresses" ON public.shipping_addresses;
CREATE POLICY "Public insert shipping addresses" ON public.shipping_addresses
  FOR INSERT TO anon, authenticated WITH CHECK (true);

-- ==============================================================================
-- 5. PAYMENTS & RAZORPAY INTEGRATION
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id text,
  gateway text NOT NULL DEFAULT 'razorpay',
  payment_method text NOT NULL DEFAULT 'online',
  razorpay_order_id text,
  razorpay_payment_id text,
  razorpay_signature text,
  amount integer NOT NULL,
  amount_paise integer NOT NULL,
  currency text NOT NULL DEFAULT 'INR',
  status text NOT NULL DEFAULT 'pending',
  error_code text,
  error_description text,
  payload jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.payments TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.payments TO anon, authenticated;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read payments" ON public.payments;
CREATE POLICY "Public read payments" ON public.payments
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Public insert payments" ON public.payments;
CREATE POLICY "Public insert payments" ON public.payments
  FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.payment_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text UNIQUE NOT NULL,
  event_type text NOT NULL,
  gateway text NOT NULL DEFAULT 'razorpay',
  payload jsonb NOT NULL,
  processed boolean DEFAULT false,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.payment_webhook_events TO service_role;
ALTER TABLE public.payment_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  payment_id uuid REFERENCES public.payments(id),
  razorpay_payment_id text NOT NULL,
  razorpay_refund_id text,
  amount integer NOT NULL,
  amount_paise integer NOT NULL,
  currency text NOT NULL DEFAULT 'INR',
  reason text,
  status text NOT NULL DEFAULT 'pending',
  admin_user_id text,
  raw_response jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.refunds TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.refunds TO anon, authenticated;
ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read refunds" ON public.refunds;
CREATE POLICY "Public read refunds" ON public.refunds
  FOR SELECT TO anon, authenticated USING (true);

-- ==============================================================================
-- 6. SHIPMENTS & SHIPMAXX360 INTEGRATION
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id text,
  provider text NOT NULL DEFAULT 'shipmaxx360',
  shipmaxx_shipment_id text,
  order_number text NOT NULL,
  awb_number text,
  courier_partner text,
  payment_mode text NOT NULL DEFAULT 'prepaid',
  cod_amount integer DEFAULT 0,
  pickup_pincode text NOT NULL DEFAULT '521212',
  delivery_pincode text NOT NULL,
  package_weight_grams integer DEFAULT 500,
  package_type text DEFAULT 'One packed T-shirt',
  status text NOT NULL DEFAULT 'created',
  shipping_label_url text,
  raw_response jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.shipments TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.shipments TO anon, authenticated;
ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read shipments" ON public.shipments;
CREATE POLICY "Public read shipments" ON public.shipments
  FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.shipping_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id uuid REFERENCES public.shipments(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  awb_number text NOT NULL,
  current_status text NOT NULL,
  status_location text,
  status_time timestamptz DEFAULT now(),
  activity text,
  raw_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.shipping_tracking TO service_role;
GRANT SELECT ON public.shipping_tracking TO anon, authenticated;
ALTER TABLE public.shipping_tracking ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read shipping tracking" ON public.shipping_tracking;
CREATE POLICY "Public read shipping tracking" ON public.shipping_tracking
  FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.shipping_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text UNIQUE NOT NULL,
  provider text NOT NULL DEFAULT 'shipmaxx360',
  event_type text NOT NULL,
  awb_number text,
  payload jsonb NOT NULL,
  processed boolean DEFAULT false,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.shipping_webhook_events TO service_role;
ALTER TABLE public.shipping_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.shipping_settings (
  id text PRIMARY KEY DEFAULT 'default',
  pickup_pincode text NOT NULL DEFAULT '521212',
  pickup_address_name text DEFAULT 'CAVENHURST Dispatch Hub',
  pickup_address_line1 text,
  pickup_address_city text,
  pickup_address_state text,
  pickup_phone text,
  default_package_weight_grams integer NOT NULL DEFAULT 500,
  package_type text NOT NULL DEFAULT 'One packed T-shirt',
  cod_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.shipping_settings (id, pickup_pincode)
VALUES ('default', '521212')
ON CONFLICT (id) DO NOTHING;

GRANT ALL ON public.shipping_settings TO service_role;
GRANT SELECT ON public.shipping_settings TO anon, authenticated;
GRANT ALL ON public.shipping_settings TO authenticated;
ALTER TABLE public.shipping_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read shipping settings" ON public.shipping_settings;
CREATE POLICY "Public read shipping settings" ON public.shipping_settings
  FOR SELECT TO anon, authenticated USING (true);

-- ==============================================================================
-- 7. COUPONS, INVENTORY MOVEMENTS & AUDIT LOGS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  discount_type text NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value integer NOT NULL,
  min_order_value integer NOT NULL DEFAULT 0,
  max_discount integer,
  usage_limit integer,
  times_used integer NOT NULL DEFAULT 0,
  expires_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.coupons (code, discount_type, discount_value, min_order_value, is_active)
VALUES ('CAVEN10', 'percentage', 10, 1500, true)
ON CONFLICT (code) DO NOTHING;

GRANT ALL ON public.coupons TO service_role;
GRANT SELECT ON public.coupons TO anon, authenticated;
GRANT ALL ON public.coupons TO authenticated;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read active coupons" ON public.coupons;
CREATE POLICY "Public read active coupons" ON public.coupons
  FOR SELECT TO anon, authenticated USING (is_active = true OR public.is_admin());

CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  product_slug text NOT NULL,
  size text NOT NULL,
  color text,
  change_qty integer NOT NULL,
  new_stock integer NOT NULL,
  reason text NOT NULL,
  reference_id text,
  admin_user_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.inventory_movements TO service_role;
GRANT ALL ON public.inventory_movements TO authenticated;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage inventory movements" ON public.inventory_movements;
CREATE POLICY "Admins manage inventory movements" ON public.inventory_movements
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id text,
  admin_email text,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text NOT NULL,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.admin_audit_logs TO service_role;
GRANT ALL ON public.admin_audit_logs TO authenticated;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins view audit logs" ON public.admin_audit_logs;
CREATE POLICY "Admins view audit logs" ON public.admin_audit_logs
  FOR SELECT TO authenticated USING (public.is_admin());

CREATE TABLE IF NOT EXISTS public.contact_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text,
  name text NOT NULL,
  email text NOT NULL,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.contact_messages TO service_role;
GRANT ALL ON public.contact_messages TO anon, authenticated;
ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public insert contact messages" ON public.contact_messages;
CREATE POLICY "Public insert contact messages" ON public.contact_messages
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Admins view contact messages" ON public.contact_messages;
CREATE POLICY "Admins view contact messages" ON public.contact_messages
  FOR SELECT TO authenticated USING (public.is_admin());

CREATE TABLE IF NOT EXISTS public.newsletter_subscribers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  user_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.newsletter_subscribers TO service_role;
GRANT ALL ON public.newsletter_subscribers TO anon, authenticated;
ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public insert newsletter subscribers" ON public.newsletter_subscribers;
CREATE POLICY "Public insert newsletter subscribers" ON public.newsletter_subscribers
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Admins view newsletter subscribers" ON public.newsletter_subscribers;
CREATE POLICY "Admins view newsletter subscribers" ON public.newsletter_subscribers
  FOR SELECT TO authenticated USING (public.is_admin());

-- ==============================================================================
-- 8. PRODUCT IMAGES STORAGE BUCKET
-- ==============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read product images" ON storage.objects;
CREATE POLICY "Public read product images" ON storage.objects
  FOR SELECT TO anon, authenticated USING (bucket_id = 'product-images');

DROP POLICY IF EXISTS "Public upload product images" ON storage.objects;
CREATE POLICY "Public upload product images" ON storage.objects
  FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'product-images');

-- ==============================================================================
-- COMPLETED SUCCESSFULLY
-- ==============================================================================

