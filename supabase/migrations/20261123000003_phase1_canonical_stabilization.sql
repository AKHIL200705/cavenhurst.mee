-- ==============================================================================
-- CAVENHURST – MIGRATION 20261123000003: PHASE 1 CANONICAL STABILIZATION
-- ==============================================================================
-- Aligns with approved canonical ER diagram:
-- 1. Reconciles existing user orders and addresses with Supabase Auth UUID.
-- 2. Removes exact duplicate payment retry row and adds UNIQUE constraints.
-- 3. Hardens RLS on profiles, customer_addresses, orders, payments, and inventory.
-- 4. Patches storage bucket security (revoking anonymous uploads).
-- 5. Hardens handle_auth_user_sync trigger to maintain canonical profiles.
-- ==============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. DATA RECONCILIATION FOR EXISTING REAL ACCOUNTS
-- -----------------------------------------------------------------------------

-- Link Akhil Sai's existing order to his canonical Auth UUID
UPDATE public.orders
SET user_id = '87d005b5-99d4-4361-abb0-b9f71d84597c'
WHERE customer_email = 'akhilsaiabbireddy2007@gmail.com'
  AND (user_id IS NULL OR user_id = '115832530385952138402');

-- Link payment to canonical Auth UUID
UPDATE public.payments
SET user_id = '87d005b5-99d4-4361-abb0-b9f71d84597c'
WHERE order_id = 'e1a2b3c4-0001-4000-8000-000000000001'
  AND (user_id IS NULL OR user_id = '115832530385952138402');

-- Link shipment to canonical Auth UUID
UPDATE public.shipments
SET user_id = '87d005b5-99d4-4361-abb0-b9f71d84597c'
WHERE order_id = 'e1a2b3c4-0001-4000-8000-000000000001'
  AND (user_id IS NULL OR user_id = '115832530385952138402');

-- Link customer address to canonical Auth UUID
UPDATE public.customer_addresses
SET customer_auth_uid = '87d005b5-99d4-4361-abb0-b9f71d84597c'
WHERE phone = '9876543210'
  AND (customer_auth_uid IS NULL OR customer_auth_uid = '115832530385952138402');

-- Remove duplicate payment retry row (id: f5896859-65b1-4faa-99fa-5057024996f6, created 49s after the first)
DELETE FROM public.payments
WHERE id = 'f5896859-65b1-4faa-99fa-5057024996f6'
  AND razorpay_payment_id = 'pay_RzpA101001';

-- -----------------------------------------------------------------------------
-- 2. UNIQUE CONSTRAINTS & DUPLICATE PREVENTION
-- -----------------------------------------------------------------------------

-- Prevent duplicate payment records for the same provider payment ID
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_payments_gateway_payment_id'
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT uq_payments_gateway_payment_id UNIQUE (gateway, razorpay_payment_id);
  END IF;
END $$;

-- Ensure 1:1 inventory record per variant
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_inventory_variant_id'
  ) THEN
    ALTER TABLE public.inventory
      ADD CONSTRAINT uq_inventory_variant_id UNIQUE (variant_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_inventory_items_variant_id'
  ) THEN
    ALTER TABLE public.inventory_items
      ADD CONSTRAINT uq_inventory_items_variant_id UNIQUE (variant_id);
  END IF;
END $$;

-- Ensure unique coupon codes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_coupons_code'
  ) THEN
    ALTER TABLE public.coupons
      ADD CONSTRAINT uq_coupons_code UNIQUE (code);
  END IF;
END $$;

-- Ensure unique SKU and variant combination
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_product_variants_sku'
  ) THEN
    -- Only add if sku is populated and unique
    IF NOT EXISTS (
      SELECT sku FROM public.product_variants WHERE sku IS NOT NULL GROUP BY sku HAVING count(*) > 1
    ) THEN
      ALTER TABLE public.product_variants
        ADD CONSTRAINT uq_product_variants_sku UNIQUE (sku);
    END IF;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_product_variants_prod_color_size 
  ON public.product_variants (product_id, color, size);

-- -----------------------------------------------------------------------------
-- 3. STORAGE BUCKET SECURITY
-- -----------------------------------------------------------------------------

-- Revoke public file upload to product-images
DROP POLICY IF EXISTS "Public upload product images" ON storage.objects;
DROP POLICY IF EXISTS "Public read product images" ON storage.objects;
DROP POLICY IF EXISTS "Admin upload product images" ON storage.objects;
DROP POLICY IF EXISTS "Admin update product images" ON storage.objects;
DROP POLICY IF EXISTS "Admin delete product images" ON storage.objects;

-- Allow public read of product images
CREATE POLICY "Public read product images"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'product-images');

-- Restrict upload/edit/delete of product images to admin role
CREATE POLICY "Admin upload product images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'product-images' AND
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = (select auth.uid())::text AND role = 'admin'
    )
  );

CREATE POLICY "Admin update product images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'product-images' AND
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = (select auth.uid())::text AND role = 'admin'
    )
  )
  WITH CHECK (
    bucket_id = 'product-images' AND
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = (select auth.uid())::text AND role = 'admin'
    )
  );

CREATE POLICY "Admin delete product images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'product-images' AND
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = (select auth.uid())::text AND role = 'admin'
    )
  );

-- -----------------------------------------------------------------------------
-- 4. RLS POLICIES FOR CANONICAL TABLES
-- -----------------------------------------------------------------------------

-- Customer Addresses
ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own addresses" ON public.customer_addresses;
CREATE POLICY "Users can read own addresses"
  ON public.customer_addresses FOR SELECT
  TO authenticated
  USING (
    customer_auth_uid = (select auth.uid())::text OR
    customer_id = (select auth.uid()) OR
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = (select auth.uid())::text AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Users can insert own addresses" ON public.customer_addresses;
CREATE POLICY "Users can insert own addresses"
  ON public.customer_addresses FOR INSERT
  TO authenticated
  WITH CHECK (
    customer_auth_uid = (select auth.uid())::text OR
    customer_id = (select auth.uid()) OR
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = (select auth.uid())::text AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Users can update own addresses" ON public.customer_addresses;
CREATE POLICY "Users can update own addresses"
  ON public.customer_addresses FOR UPDATE
  TO authenticated
  USING (
    customer_auth_uid = (select auth.uid())::text OR
    customer_id = (select auth.uid()) OR
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = (select auth.uid())::text AND role = 'admin'
    )
  )
  WITH CHECK (
    customer_auth_uid = (select auth.uid())::text OR
    customer_id = (select auth.uid()) OR
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = (select auth.uid())::text AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Users can delete own addresses" ON public.customer_addresses;
CREATE POLICY "Users can delete own addresses"
  ON public.customer_addresses FOR DELETE
  TO authenticated
  USING (
    customer_auth_uid = (select auth.uid())::text OR
    customer_id = (select auth.uid()) OR
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = (select auth.uid())::text AND role = 'admin'
    )
  );

-- Orders
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own orders" ON public.orders;
CREATE POLICY "Users can read own orders"
  ON public.orders FOR SELECT
  TO authenticated
  USING (
    user_id = (select auth.uid())::text OR
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = (select auth.uid())::text AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Users can insert orders" ON public.orders;
CREATE POLICY "Users can insert orders"
  ON public.orders FOR INSERT
  TO public
  WITH CHECK (
    user_id IS NULL OR
    user_id = (select auth.uid())::text OR
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = (select auth.uid())::text AND role = 'admin'
    )
  );

-- Payments
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own payments" ON public.payments;
CREATE POLICY "Users can read own payments"
  ON public.payments FOR SELECT
  TO authenticated
  USING (
    user_id = (select auth.uid())::text OR
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = (select auth.uid())::text AND role = 'admin'
    )
  );

-- Inventory & Inventory Items: Public read, admin write
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read inventory" ON public.inventory;
CREATE POLICY "Public read inventory"
  ON public.inventory FOR SELECT
  TO public
  USING (true);

DROP POLICY IF EXISTS "Admin manage inventory" ON public.inventory;
CREATE POLICY "Admin manage inventory"
  ON public.inventory FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = (select auth.uid())::text AND role = 'admin'
    )
  );

ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read inventory items" ON public.inventory_items;
CREATE POLICY "Public read inventory items"
  ON public.inventory_items FOR SELECT
  TO public
  USING (true);

DROP POLICY IF EXISTS "Admin manage inventory items" ON public.inventory_items;
CREATE POLICY "Admin manage inventory items"
  ON public.inventory_items FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = (select auth.uid())::text AND role = 'admin'
    )
  );

-- -----------------------------------------------------------------------------
-- 5. CANONICAL AUTH USER SYNCHRONIZATION TRIGGER
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_auth_user_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_full_name text;
  v_phone text;
  v_avatar_url text;
  v_provider text;
BEGIN
  -- Extract full name safely from metadata or email
  v_full_name := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'user_name'), ''),
    NULLIF(TRIM(split_part(NEW.email, '@', 1)), ''),
    'Customer'
  );

  -- Extract phone
  v_phone := COALESCE(
    NULLIF(TRIM(NEW.phone), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'phone'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'mobile'), '')
  );

  -- Extract avatar URL
  v_avatar_url := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'avatar_url'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'picture'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'avatar'), '')
  );

  -- Extract provider
  v_provider := COALESCE(
    NULLIF(TRIM(NEW.raw_app_meta_data->>'provider'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'provider'), ''),
    'email'
  );

  -- 1. Upsert into canonical public.profiles (1:1 with auth.users.id)
  BEGIN
    INSERT INTO public.profiles (
      id,
      email,
      phone,
      full_name,
      avatar_url,
      auth_provider,
      account_status,
      created_at,
      updated_at
    ) VALUES (
      NEW.id,
      NEW.email,
      v_phone,
      v_full_name,
      v_avatar_url,
      v_provider,
      'active',
      COALESCE(NEW.created_at, now()),
      now()
    )
    ON CONFLICT (id) DO UPDATE SET
      email = COALESCE(EXCLUDED.email, public.profiles.email),
      phone = COALESCE(EXCLUDED.phone, public.profiles.phone),
      full_name = CASE 
        WHEN EXCLUDED.full_name IS NOT NULL AND EXCLUDED.full_name <> 'Customer' 
        THEN EXCLUDED.full_name 
        ELSE public.profiles.full_name 
      END,
      avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url),
      auth_provider = COALESCE(EXCLUDED.auth_provider, public.profiles.auth_provider),
      updated_at = now();
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_auth_user_sync: profiles upsert failed: %', SQLERRM;
  END;

  -- 2. Also keep public.customers updated for existing table compatibility
  BEGIN
    INSERT INTO public.customers (
      id,
      auth_provider_uid,
      full_name,
      email,
      phone,
      profile_image,
      account_status,
      last_login,
      created_at,
      updated_at
    ) VALUES (
      NEW.id,
      NEW.id::text,
      v_full_name,
      NEW.email,
      v_phone,
      v_avatar_url,
      'active',
      now(),
      COALESCE(NEW.created_at, now()),
      now()
    )
    ON CONFLICT (id) DO UPDATE SET
      email = COALESCE(EXCLUDED.email, public.customers.email),
      phone = COALESCE(EXCLUDED.phone, public.customers.phone),
      full_name = CASE 
        WHEN EXCLUDED.full_name IS NOT NULL AND EXCLUDED.full_name <> 'Customer' 
        THEN EXCLUDED.full_name 
        ELSE public.customers.full_name 
      END,
      profile_image = COALESCE(EXCLUDED.profile_image, public.customers.profile_image),
      last_login = now(),
      updated_at = now();
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_auth_user_sync: customers upsert failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

COMMIT;
