-- CAVENHURST – Razorpay + ShipMaxx360 Full Integration Schema

-- 1. Extend orders table with explicit payment, fulfillment and ShipMaxx360 tracking columns
ALTER TABLE public.orders ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.orders ALTER COLUMN user_id SET DEFAULT NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS order_number text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_name text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_email text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_phone text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS subtotal integer DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS discount integer DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_fee integer DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS taxes integer DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_method text DEFAULT 'online';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'pending';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipment_status text DEFAULT 'unfulfilled';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS razorpay_order_id text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS razorpay_payment_id text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipmaxx_shipment_id text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS awb_number text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS courier_partner text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS tracking_url text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS tracking_data jsonb DEFAULT '{}';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS orders_order_number_idx ON public.orders (order_number) WHERE order_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_razorpay_order_id_idx ON public.orders (razorpay_order_id) WHERE razorpay_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_awb_number_idx ON public.orders (awb_number) WHERE awb_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_status_idx ON public.orders (status);
CREATE INDEX IF NOT EXISTS orders_payment_status_idx ON public.orders (payment_status);
CREATE INDEX IF NOT EXISTS orders_shipment_status_idx ON public.orders (shipment_status);

-- 2. Shipping Addresses Table
CREATE TABLE IF NOT EXISTS public.shipping_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id uuid,
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
GRANT SELECT, INSERT ON public.shipping_addresses TO authenticated;
GRANT ALL ON public.shipping_addresses TO service_role;
ALTER TABLE public.shipping_addresses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customers view own shipping addresses" ON public.shipping_addresses
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.orders WHERE orders.id = shipping_addresses.order_id AND orders.user_id = auth.uid())
    OR public.is_admin()
  );

CREATE POLICY "Customers insert own shipping addresses" ON public.shipping_addresses
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.orders WHERE orders.id = shipping_addresses.order_id AND orders.user_id = auth.uid())
  );

-- 3. Payments Table
CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id uuid,
  gateway text NOT NULL DEFAULT 'razorpay',
  payment_method text NOT NULL DEFAULT 'online', -- 'upi', 'card', 'netbanking', 'cod'
  razorpay_order_id text,
  razorpay_payment_id text,
  razorpay_signature text,
  amount integer NOT NULL, -- in INR Rupees
  amount_paise integer NOT NULL, -- in Paise
  currency text NOT NULL DEFAULT 'INR',
  status text NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'captured', 'failed', 'refunded'
  error_code text,
  error_description text,
  payload jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payments_order_id_idx ON public.payments (order_id);
CREATE INDEX IF NOT EXISTS payments_razorpay_order_id_idx ON public.payments (razorpay_order_id);
CREATE INDEX IF NOT EXISTS payments_razorpay_payment_id_idx ON public.payments (razorpay_payment_id);

GRANT SELECT, INSERT, UPDATE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customers view own payments" ON public.payments
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.orders WHERE orders.id = payments.order_id AND orders.user_id = auth.uid())
    OR public.is_admin()
  );

CREATE POLICY "Customers insert own payments" ON public.payments
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.orders WHERE orders.id = payments.order_id AND orders.user_id = auth.uid())
  );

CREATE POLICY "Admins manage all payments" ON public.payments
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 4. Shipments Table (ShipMaxx360 fulfillment)
CREATE TABLE IF NOT EXISTS public.shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id uuid,
  provider text NOT NULL DEFAULT 'shipmaxx360',
  shipmaxx_shipment_id text,
  order_number text NOT NULL,
  awb_number text,
  courier_partner text,
  payment_mode text NOT NULL DEFAULT 'prepaid', -- 'prepaid', 'cod'
  cod_amount integer DEFAULT 0,
  pickup_pincode text NOT NULL DEFAULT '521212',
  delivery_pincode text NOT NULL,
  package_weight_grams integer DEFAULT 500,
  package_type text DEFAULT 'One packed T-shirt',
  status text NOT NULL DEFAULT 'created', -- 'created', 'pickup_scheduled', 'shipped', 'in_transit', 'out_for_delivery', 'delivered', 'rto_initiated', 'rto_delivered', 'cancelled', 'returned'
  shipping_label_url text,
  raw_response jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shipments_order_id_idx ON public.shipments (order_id);
CREATE INDEX IF NOT EXISTS shipments_awb_number_idx ON public.shipments (awb_number);

GRANT SELECT, INSERT, UPDATE ON public.shipments TO authenticated;
GRANT ALL ON public.shipments TO service_role;
ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customers view own shipments" ON public.shipments
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.orders WHERE orders.id = shipments.order_id AND orders.user_id = auth.uid())
    OR public.is_admin()
  );

CREATE POLICY "Admins manage all shipments" ON public.shipments
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 5. Shipping Tracking History Table
CREATE TABLE IF NOT EXISTS public.shipping_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id uuid REFERENCES public.shipments(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  awb_number text NOT NULL,
  current_status text NOT NULL,
  status_location text,
  status_time timestamptz DEFAULT now(),
  activity text,
  raw_data jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shipping_tracking_awb_idx ON public.shipping_tracking (awb_number);

GRANT SELECT ON public.shipping_tracking TO authenticated;
GRANT ALL ON public.shipping_tracking TO service_role;
ALTER TABLE public.shipping_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customers view own tracking history" ON public.shipping_tracking
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.orders WHERE orders.id = shipping_tracking.order_id AND orders.user_id = auth.uid())
    OR public.is_admin()
  );

CREATE POLICY "Admins manage tracking history" ON public.shipping_tracking
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 6. Webhook Idempotency Tables
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

-- 7. Shipping Configuration Settings (configurable through Admin Dashboard)
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

GRANT SELECT ON public.shipping_settings TO anon, authenticated;
GRANT ALL ON public.shipping_settings TO service_role;
GRANT UPDATE ON public.shipping_settings TO authenticated;
ALTER TABLE public.shipping_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view shipping settings" ON public.shipping_settings
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Admins can update shipping settings" ON public.shipping_settings
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

