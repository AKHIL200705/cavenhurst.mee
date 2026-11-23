-- ==============================================================================
-- CAVENHURST – MIGRATION 20261123000001: COMPLETE ALL 39 CANONICAL TABLES
-- Creates all remaining canonical tables with RLS, foreign keys, and backfills
-- ==============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. CATALOG: product_tags & product_tag_assignments
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.product_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  slug text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.product_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view product tags" ON public.product_tags;
CREATE POLICY "Public can view product tags" ON public.product_tags
  FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Admins can manage product tags" ON public.product_tags;
CREATE POLICY "Admins can manage product tags" ON public.product_tags
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users 
      WHERE (auth_user_id = auth.uid()::text OR email = auth.jwt()->>'email') 
        AND is_active = true
    )
  );

CREATE TABLE IF NOT EXISTS public.product_tag_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.product_tags(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(product_id, tag_id)
);

ALTER TABLE public.product_tag_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view tag assignments" ON public.product_tag_assignments;
CREATE POLICY "Public can view tag assignments" ON public.product_tag_assignments
  FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Admins can manage tag assignments" ON public.product_tag_assignments;
CREATE POLICY "Admins can manage tag assignments" ON public.product_tag_assignments
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users 
      WHERE (auth_user_id = auth.uid()::text OR email = auth.jwt()->>'email') 
        AND is_active = true
    )
  );

-- -----------------------------------------------------------------------------
-- 2. INVENTORY: inventory_items
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id uuid NOT NULL UNIQUE REFERENCES public.product_variants(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  sku text,
  stock_quantity integer NOT NULL DEFAULT 0,
  reserved_quantity integer NOT NULL DEFAULT 0,
  safety_stock integer NOT NULL DEFAULT 0,
  reorder_point integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Backfill from public.inventory if available
INSERT INTO public.inventory_items (
  id, variant_id, product_id, sku, stock_quantity, reserved_quantity, safety_stock, reorder_point, created_at, updated_at
)
SELECT 
  id, variant_id, product_id, sku, stock_quantity, reserved_quantity, safety_stock, reorder_point, created_at, updated_at
FROM public.inventory
ON CONFLICT (variant_id) DO UPDATE SET
  stock_quantity = EXCLUDED.stock_quantity,
  reserved_quantity = EXCLUDED.reserved_quantity,
  updated_at = now();

ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view in-stock quantities" ON public.inventory_items;
CREATE POLICY "Public can view in-stock quantities" ON public.inventory_items
  FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Admins can manage inventory items" ON public.inventory_items;
CREATE POLICY "Admins can manage inventory items" ON public.inventory_items
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users 
      WHERE (auth_user_id = auth.uid()::text OR email = auth.jwt()->>'email') 
        AND is_active = true
    )
  );

-- -----------------------------------------------------------------------------
-- 3. ORDERS: order_notes
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.order_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name text,
  note text NOT NULL,
  is_customer_visible boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.order_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Customers view visible order notes" ON public.order_notes;
CREATE POLICY "Customers view visible order notes" ON public.order_notes
  FOR SELECT TO authenticated
  USING (
    is_customer_visible = true AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_notes.order_id
        AND (o.user_id = auth.uid()::text OR o.customer_email = auth.jwt()->>'email')
    )
  );

DROP POLICY IF EXISTS "Admins manage all order notes" ON public.order_notes;
CREATE POLICY "Admins manage all order notes" ON public.order_notes
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users 
      WHERE (auth_user_id = auth.uid()::text OR email = auth.jwt()->>'email') 
        AND is_active = true
    )
  );

-- -----------------------------------------------------------------------------
-- 4. PAYMENTS: payment_refunds
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  razorpay_payment_id text,
  razorpay_refund_id text,
  amount numeric(10,2) NOT NULL,
  amount_paise integer,
  currency text NOT NULL DEFAULT 'INR',
  reason text,
  status text NOT NULL DEFAULT 'processed',
  admin_user_id text,
  raw_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Backfill from public.refunds if available
INSERT INTO public.payment_refunds (
  id, order_id, payment_id, razorpay_payment_id, razorpay_refund_id, amount, amount_paise, currency, reason, status, admin_user_id, raw_response, created_at, updated_at
)
SELECT 
  id, order_id, payment_id, razorpay_payment_id, razorpay_refund_id, amount, amount_paise, currency, reason, status, admin_user_id, raw_response, created_at, updated_at
FROM public.refunds
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.payment_refunds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Customers view own refunds" ON public.payment_refunds;
CREATE POLICY "Customers view own refunds" ON public.payment_refunds
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = payment_refunds.order_id
        AND (o.user_id = auth.uid()::text OR o.customer_email = auth.jwt()->>'email')
    )
  );

DROP POLICY IF EXISTS "Admins manage refunds" ON public.payment_refunds;
CREATE POLICY "Admins manage refunds" ON public.payment_refunds
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users 
      WHERE (auth_user_id = auth.uid()::text OR email = auth.jwt()->>'email') 
        AND is_active = true
    )
  );

-- -----------------------------------------------------------------------------
-- 5. LOGISTICS: shipping_zones & shipping_rates
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.shipping_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text UNIQUE NOT NULL,
  states text[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Populate default domestic shipping zone
INSERT INTO public.shipping_zones (name, code, states, is_active)
VALUES (
  'India Domestic Standard',
  'IN-ALL',
  ARRAY[
    'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
    'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand',
    'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
    'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan',
    'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh',
    'Uttarakhand', 'West Bengal'
  ],
  true
)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE public.shipping_zones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view shipping zones" ON public.shipping_zones;
CREATE POLICY "Public can view shipping zones" ON public.shipping_zones
  FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Admins can manage shipping zones" ON public.shipping_zones;
CREATE POLICY "Admins can manage shipping zones" ON public.shipping_zones
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users 
      WHERE (auth_user_id = auth.uid()::text OR email = auth.jwt()->>'email') 
        AND is_active = true
    )
  );

CREATE TABLE IF NOT EXISTS public.shipping_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id uuid NOT NULL REFERENCES public.shipping_zones(id) ON DELETE CASCADE,
  name text NOT NULL,
  min_order_amount numeric(10,2) NOT NULL DEFAULT 0,
  max_order_amount numeric(10,2),
  rate numeric(10,2) NOT NULL DEFAULT 0,
  estimated_days_min integer NOT NULL DEFAULT 2,
  estimated_days_max integer NOT NULL DEFAULT 5,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Populate standard free shipping tier (free above Rs 999, standard Rs 99 below)
INSERT INTO public.shipping_rates (zone_id, name, min_order_amount, max_order_amount, rate, estimated_days_min, estimated_days_max, is_active)
SELECT 
  id, 'Standard Delivery', 0, 999, 99.00, 3, 5, true
FROM public.shipping_zones WHERE code = 'IN-ALL'
LIMIT 1;

INSERT INTO public.shipping_rates (zone_id, name, min_order_amount, max_order_amount, rate, estimated_days_min, estimated_days_max, is_active)
SELECT 
  id, 'Complimentary Heritage Shipping', 999, NULL, 0.00, 2, 4, true
FROM public.shipping_zones WHERE code = 'IN-ALL'
LIMIT 1;

ALTER TABLE public.shipping_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view shipping rates" ON public.shipping_rates;
CREATE POLICY "Public can view shipping rates" ON public.shipping_rates
  FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Admins can manage shipping rates" ON public.shipping_rates;
CREATE POLICY "Admins can manage shipping rates" ON public.shipping_rates
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users 
      WHERE (auth_user_id = auth.uid()::text OR email = auth.jwt()->>'email') 
        AND is_active = true
    )
  );

-- -----------------------------------------------------------------------------
-- 6. SUPPORT: support_tickets & support_messages
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  ticket_number text UNIQUE NOT NULL,
  subject text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  customer_name text,
  customer_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Backfill from contact_messages if available
INSERT INTO public.support_tickets (
  id, ticket_number, subject, customer_name, customer_email, status, created_at, updated_at
)
SELECT 
  id,
  'TICK-' || UPPER(SUBSTRING(id::text, 1, 8)),
  COALESCE(NULLIF(TRIM(message), ''), 'Customer Inquiry'),
  name,
  email,
  'open',
  created_at,
  created_at
FROM public.contact_messages
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Customers view own support tickets" ON public.support_tickets;
CREATE POLICY "Customers view own support tickets" ON public.support_tickets
  FOR SELECT TO authenticated
  USING (
    customer_email = auth.jwt()->>'email' OR EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = support_tickets.customer_id
        AND c.auth_provider_uid = auth.uid()::text
    )
  );

DROP POLICY IF EXISTS "Customers create support tickets" ON public.support_tickets;
CREATE POLICY "Customers create support tickets" ON public.support_tickets
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Admins manage support tickets" ON public.support_tickets;
CREATE POLICY "Admins manage support tickets" ON public.support_tickets
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users 
      WHERE (auth_user_id = auth.uid()::text OR email = auth.jwt()->>'email') 
        AND is_active = true
    )
  );

CREATE TABLE IF NOT EXISTS public.support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender_type text NOT NULL CHECK (sender_type IN ('customer', 'admin', 'system')),
  sender_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  message text NOT NULL,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view ticket messages" ON public.support_messages;
CREATE POLICY "Users view ticket messages" ON public.support_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = support_messages.ticket_id
        AND (
          t.customer_email = auth.jwt()->>'email'
          OR EXISTS (
            SELECT 1 FROM public.admin_users a
            WHERE (a.auth_user_id = auth.uid()::text OR a.email = auth.jwt()->>'email')
              AND a.is_active = true
          )
        )
    )
  );

DROP POLICY IF EXISTS "Users create ticket messages" ON public.support_messages;
CREATE POLICY "Users create ticket messages" ON public.support_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = support_messages.ticket_id
        AND (
          t.customer_email = auth.jwt()->>'email'
          OR EXISTS (
            SELECT 1 FROM public.admin_users a
            WHERE (a.auth_user_id = auth.uid()::text OR a.email = auth.jwt()->>'email')
              AND a.is_active = true
          )
        )
    )
  );

-- -----------------------------------------------------------------------------
-- 7. AUDITING & SYSTEM SETTINGS: audit_logs & system_settings
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email text,
  action text NOT NULL,
  target_type text,
  target_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Backfill from admin_audit_logs if available
INSERT INTO public.audit_logs (
  id, actor_email, action, target_type, target_id, details, created_at
)
SELECT 
  id, admin_email, action, target_type, target_id, details, created_at
FROM public.admin_audit_logs
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins view audit logs" ON public.audit_logs;
CREATE POLICY "Admins view audit logs" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users 
      WHERE (auth_user_id = auth.uid()::text OR email = auth.jwt()->>'email') 
        AND is_active = true
    )
  );

CREATE TABLE IF NOT EXISTS public.system_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Backfill from site_settings if available
INSERT INTO public.system_settings (key, value, description, updated_at)
SELECT key, value, description, updated_at
FROM public.site_settings
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = now();

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view public system settings" ON public.system_settings;
CREATE POLICY "Public can view public system settings" ON public.system_settings
  FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Admins can manage system settings" ON public.system_settings;
CREATE POLICY "Admins can manage system settings" ON public.system_settings
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users 
      WHERE (auth_user_id = auth.uid()::text OR email = auth.jwt()->>'email') 
        AND is_active = true
    )
  );

COMMIT;
