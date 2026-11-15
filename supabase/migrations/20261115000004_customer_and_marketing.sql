-- ==============================================================================
-- CAVENHURST Migration 04: Customer Profiles, Carts, Marketing & Inventory
-- File: supabase/migrations/20261115000004_customer_and_marketing.sql
-- ==============================================================================

-- 1. Customer Profiles Table
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

-- 2. Customer Carts Table
CREATE TABLE IF NOT EXISTS public.customer_carts (
  user_id text PRIMARY KEY,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  wishlist jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.customer_carts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_carts TO anon, authenticated;
ALTER TABLE public.customer_carts ENABLE ROW LEVEL SECURITY;

-- 3. Customer Welcome Gate Table
CREATE TABLE IF NOT EXISTS public.customer_welcome (
  user_id text PRIMARY KEY,
  welcome_seen_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.customer_welcome TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.customer_welcome TO anon, authenticated;
ALTER TABLE public.customer_welcome ENABLE ROW LEVEL SECURITY;

-- 4. Coupons Table
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

INSERT INTO public.coupons (code, discount_type, discount_value, min_order_value, is_active)
VALUES ('CAVEN10', 'percentage', 10, 1500, true)
ON CONFLICT (code) DO NOTHING;

GRANT ALL ON public.coupons TO service_role;
GRANT SELECT ON public.coupons TO anon, authenticated;
GRANT ALL ON public.coupons TO authenticated;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

-- 5. Inventory Movements Audit
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
CREATE INDEX IF NOT EXISTS inv_mov_product_slug_idx ON public.inventory_movements (product_slug);
CREATE INDEX IF NOT EXISTS inv_mov_created_at_idx ON public.inventory_movements (created_at DESC);

GRANT ALL ON public.inventory_movements TO service_role;
GRANT ALL ON public.inventory_movements TO authenticated;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

-- 6. Admin Audit Logs
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
CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON public.admin_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_target_idx ON public.admin_audit_logs (target_type, target_id);

GRANT ALL ON public.admin_audit_logs TO service_role;
GRANT ALL ON public.admin_audit_logs TO authenticated;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

-- 7. Contact Messages
CREATE TABLE IF NOT EXISTS public.contact_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text,
  name text NOT NULL,
  email text NOT NULL,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.contact_messages TO service_role;
GRANT SELECT, INSERT ON public.contact_messages TO anon, authenticated;
ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;

-- 8. Newsletter Subscribers
CREATE TABLE IF NOT EXISTS public.newsletter_subscribers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  user_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.newsletter_subscribers TO service_role;
GRANT SELECT, INSERT ON public.newsletter_subscribers TO anon, authenticated;
ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;

