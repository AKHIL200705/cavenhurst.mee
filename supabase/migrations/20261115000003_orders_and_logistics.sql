-- ==============================================================================
-- CAVENHURST Migration 03: Orders, Logistics (ShipMaxx360) & Payments (Razorpay)
-- File: supabase/migrations/20261115000003_orders_and_logistics.sql
-- ==============================================================================

-- 1. Ensure orders table exists and extend with all required e-commerce columns
CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  total integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.orders ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS order_number text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_name text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_email text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_phone text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS subtotal integer DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS discount integer DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_fee integer DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS taxes integer DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending_payment';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_method text DEFAULT 'online';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'pending';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipment_status text DEFAULT 'unfulfilled';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS razorpay_order_id text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS razorpay_payment_id text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipmaxx_shipment_id text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS awb_number text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS courier_partner text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS tracking_url text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS tracking_data jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivered_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS return_requested_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS orders_order_number_idx ON public.orders (order_number) WHERE order_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_user_id_idx ON public.orders (user_id);
CREATE INDEX IF NOT EXISTS orders_status_idx ON public.orders (status);
CREATE INDEX IF NOT EXISTS orders_created_at_idx ON public.orders (created_at DESC);
CREATE INDEX IF NOT EXISTS orders_razorpay_order_id_idx ON public.orders (razorpay_order_id) WHERE razorpay_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_awb_number_idx ON public.orders (awb_number) WHERE awb_number IS NOT NULL;

GRANT ALL ON public.orders TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.orders TO anon, authenticated;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- 2. Order Items Table
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
CREATE INDEX IF NOT EXISTS order_items_order_id_idx ON public.order_items (order_id);
CREATE INDEX IF NOT EXISTS order_items_product_slug_idx ON public.order_items (product_slug);

GRANT ALL ON public.order_items TO service_role;
GRANT SELECT, INSERT ON public.order_items TO anon, authenticated;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- 3. Shipping Addresses Table
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
CREATE INDEX IF NOT EXISTS shipping_addresses_order_id_idx ON public.shipping_addresses (order_id);
CREATE INDEX IF NOT EXISTS shipping_addresses_user_id_idx ON public.shipping_addresses (user_id);

GRANT ALL ON public.shipping_addresses TO service_role;
GRANT SELECT, INSERT ON public.shipping_addresses TO anon, authenticated;
ALTER TABLE public.shipping_addresses ENABLE ROW LEVEL SECURITY;

-- 4. Payments Table (Razorpay)
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
CREATE INDEX IF NOT EXISTS payments_order_id_idx ON public.payments (order_id);
CREATE INDEX IF NOT EXISTS payments_razorpay_order_id_idx ON public.payments (razorpay_order_id);
CREATE INDEX IF NOT EXISTS payments_razorpay_payment_id_idx ON public.payments (razorpay_payment_id);

GRANT ALL ON public.payments TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.payments TO anon, authenticated;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

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
CREATE INDEX IF NOT EXISTS refunds_order_id_idx ON public.refunds (order_id);
CREATE INDEX IF NOT EXISTS refunds_razorpay_refund_id_idx ON public.refunds (razorpay_refund_id);

GRANT ALL ON public.refunds TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.refunds TO anon, authenticated;
ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;

-- 5. Shipments Table (ShipMaxx360)
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
CREATE INDEX IF NOT EXISTS shipments_order_id_idx ON public.shipments (order_id);
CREATE INDEX IF NOT EXISTS shipments_awb_number_idx ON public.shipments (awb_number);

GRANT ALL ON public.shipments TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.shipments TO anon, authenticated;
ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;

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
CREATE INDEX IF NOT EXISTS shipping_tracking_shipment_id_idx ON public.shipping_tracking (shipment_id);
CREATE INDEX IF NOT EXISTS shipping_tracking_awb_number_idx ON public.shipping_tracking (awb_number);

GRANT ALL ON public.shipping_tracking TO service_role;
GRANT SELECT ON public.shipping_tracking TO anon, authenticated;
ALTER TABLE public.shipping_tracking ENABLE ROW LEVEL SECURITY;

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

