-- CAVENHURST – Complete Admin Dashboard & Management System Schema

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_featured boolean DEFAULT false;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS views integer DEFAULT 0;

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

CREATE TABLE IF NOT EXISTS public.admin_whitelist (
  email text PRIMARY KEY,
  created_at timestamptz DEFAULT now()
);

