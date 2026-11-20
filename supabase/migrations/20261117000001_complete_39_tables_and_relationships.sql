-- CAVENHURST ARCHITECTURAL COMPLETION: 39 CANONICAL TABLES AND RELATIONSHIPS
-- -----------------------------------------------------------------------------

-- 1. Ensure category_id foreign key on products table
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.product_categories(id) ON DELETE SET NULL;

UPDATE public.products p
SET category_id = c.id
FROM public.product_categories c
WHERE p.category_slug = c.slug AND (p.category_id IS NULL OR p.category_id <> c.id);

CREATE INDEX IF NOT EXISTS idx_products_category_id ON public.products(category_id);

-- 2. Table 14: inventory_reservations
CREATE TABLE IF NOT EXISTS public.inventory_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE CASCADE NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'expired', 'released')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inv_res_variant ON public.inventory_reservations(variant_id);
CREATE INDEX IF NOT EXISTS idx_inv_res_order ON public.inventory_reservations(order_id);
CREATE INDEX IF NOT EXISTS idx_inv_res_status_expires ON public.inventory_reservations(status, expires_at);

ALTER TABLE public.inventory_reservations ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'inventory_reservations' AND policyname = 'Admins manage inventory reservations'
  ) THEN
    CREATE POLICY "Admins manage inventory reservations"
    ON public.inventory_reservations FOR ALL TO authenticated
    USING (public.is_admin()) WITH CHECK (public.is_admin());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'inventory_reservations' AND policyname = 'Service role manages inventory reservations'
  ) THEN
    CREATE POLICY "Service role manages inventory reservations"
    ON public.inventory_reservations FOR ALL TO service_role
    USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 3. Table 33: coupon_redemptions
CREATE TABLE IF NOT EXISTS public.coupon_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid REFERENCES public.coupons(id) ON DELETE CASCADE NOT NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
  discount_amount integer NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_coupon ON public.coupon_redemptions(coupon_id);
CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_customer ON public.coupon_redemptions(customer_id);
CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_order ON public.coupon_redemptions(order_id);

ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'coupon_redemptions' AND policyname = 'Admins manage coupon redemptions'
  ) THEN
    CREATE POLICY "Admins manage coupon redemptions"
    ON public.coupon_redemptions FOR ALL TO authenticated
    USING (public.is_admin()) WITH CHECK (public.is_admin());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'coupon_redemptions' AND policyname = 'Customers view own redemptions'
  ) THEN
    CREATE POLICY "Customers view own redemptions"
    ON public.coupon_redemptions FOR SELECT TO authenticated
    USING (
      customer_id IN (
        SELECT id FROM public.customers WHERE auth_provider_uid = public.requesting_user_id()
      )
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'coupon_redemptions' AND policyname = 'Service role manages coupon redemptions'
  ) THEN
    CREATE POLICY "Service role manages coupon redemptions"
    ON public.coupon_redemptions FOR ALL TO service_role
    USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 4. Atomic Inventory Reservation / Checkout Lock Function
CREATE OR REPLACE FUNCTION public.reserve_inventory_variant(
  p_variant_id uuid,
  p_quantity integer,
  p_order_id uuid DEFAULT NULL,
  p_hold_minutes integer DEFAULT 15
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_available integer;
  v_res_id uuid;
BEGIN
  IF p_quantity <= 0 THEN
    RAISE EXCEPTION 'Reservation quantity must be positive';
  END IF;

  -- Lock the inventory row for update to prevent race conditions
  SELECT (stock_quantity - reserved_quantity)
  INTO v_available
  FROM public.inventory
  WHERE variant_id = p_variant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory item not found for variant %', p_variant_id;
  END IF;

  IF v_available < p_quantity THEN
    RAISE EXCEPTION 'Insufficient stock. Available: %, Requested: %', v_available, p_quantity;
  END IF;

  -- Increase reserved quantity
  UPDATE public.inventory
  SET reserved_quantity = reserved_quantity + p_quantity,
      updated_at = now()
  WHERE variant_id = p_variant_id;

  -- Insert reservation record
  INSERT INTO public.inventory_reservations (
    order_id,
    variant_id,
    quantity,
    status,
    expires_at
  ) VALUES (
    p_order_id,
    p_variant_id,
    p_quantity,
    'active',
    now() + (p_hold_minutes || ' minutes')::interval
  ) RETURNING id INTO v_res_id;

  RETURN v_res_id;
END;
$function$;
