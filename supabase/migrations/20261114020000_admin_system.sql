-- CAVENHURST – Complete Admin Dashboard & Management System Schema

-- 1. Extend products table with extra management columns
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_featured boolean DEFAULT false;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS views integer DEFAULT 0;

-- 2. Seed default product categories
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

-- 3. Seed initial static products into database if not already present
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
ON CONFLICT (slug) DO NOTHING;

-- 4. Coupons & Discounts Table
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
CREATE INDEX IF NOT EXISTS coupons_code_idx ON public.coupons (code);
CREATE INDEX IF NOT EXISTS coupons_is_active_idx ON public.coupons (is_active);

-- Seed default coupon CAVEN10
INSERT INTO public.coupons (code, discount_type, discount_value, min_order_value, is_active)
VALUES ('CAVEN10', 'percentage', 10, 1500, true)
ON CONFLICT (code) DO NOTHING;

GRANT SELECT ON public.coupons TO anon, authenticated;
GRANT ALL ON public.coupons TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.coupons TO authenticated;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can check active coupons" ON public.coupons
  FOR SELECT TO anon, authenticated USING (is_active = true OR public.is_admin());

CREATE POLICY "Admins manage coupons" ON public.coupons
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 5. Refunds Table
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
  admin_user_id uuid,
  raw_response jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS refunds_order_id_idx ON public.refunds (order_id);
CREATE INDEX IF NOT EXISTS refunds_razorpay_refund_id_idx ON public.refunds (razorpay_refund_id);

GRANT SELECT, INSERT, UPDATE ON public.refunds TO authenticated;
GRANT ALL ON public.refunds TO service_role;
ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customers view own refunds" ON public.refunds
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.orders WHERE orders.id = refunds.order_id AND orders.user_id = auth.uid())
    OR public.is_admin()
  );

CREATE POLICY "Admins manage refunds" ON public.refunds
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 6. Inventory Movements Table
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
  admin_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inv_mov_product_slug_idx ON public.inventory_movements (product_slug);
CREATE INDEX IF NOT EXISTS inv_mov_created_at_idx ON public.inventory_movements (created_at DESC);

GRANT SELECT, INSERT ON public.inventory_movements TO authenticated;
GRANT ALL ON public.inventory_movements TO service_role;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage inventory movements" ON public.inventory_movements
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 7. Admin Audit Logs Table
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid,
  admin_email text,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text NOT NULL,
  details jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON public.admin_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_target_idx ON public.admin_audit_logs (target_type, target_id);

GRANT ALL ON public.admin_audit_logs TO service_role;
GRANT SELECT, INSERT ON public.admin_audit_logs TO authenticated;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view audit logs" ON public.admin_audit_logs
  FOR SELECT TO authenticated USING (public.is_admin());

CREATE POLICY "Admins insert audit logs" ON public.admin_audit_logs
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

-- 8. Trusted Database Function & Whitelist to Bootstrap or Assign Admin Roles
CREATE TABLE IF NOT EXISTS public.admin_whitelist (
  email text PRIMARY KEY,
  created_at timestamptz DEFAULT now()
);

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
  IF target_uid IS NULL THEN
    RETURN 'SUCCESS: ' || target_email || ' added to admin whitelist. Once this email registers/signs up at /login, it will automatically receive full administrator access.';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (target_uid, 'admin')
  ON CONFLICT (user_id, role) DO UPDATE SET role = 'admin';

  RETURN 'SUCCESS: User ' || target_email || ' (' || target_uid::text || ') is now an authorized CAVENHURST administrator.';
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_admin_whitelist_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.admin_whitelist WHERE lower(email) = lower(NEW.email)) THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO UPDATE SET role = 'admin';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_admin_check ON auth.users;
CREATE TRIGGER on_auth_user_created_admin_check
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_admin_whitelist_signup();

-- Pre-seed administrator whitelist
SELECT public.assign_admin_role_by_email('akhilsaiabbireddy2007@gmail.com');
SELECT public.assign_admin_role_by_email('cavenhurst@gmail.com');

