-- ==============================================================================
-- CAVENHURST – MIGRATION 3: CLEANUP FAKE DATA, AUTHENTICATION SYNC & 18 CANONICAL TABLES
-- ==============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. CLEAN UP DEMO / SAMPLE / SEED DATA
-- Strictly preserves genuine customer Akhil Sai Abbireddy and real order CVH-20261115-A101
-- -----------------------------------------------------------------------------

-- Delete sample tracking events linked to sample shipments
DELETE FROM public.shipping_tracking
WHERE shipment_id IN (
  SELECT id FROM public.shipments WHERE order_number IN ('CVH-20261114-B202', 'CVH-20261115-C303', 'CVH-20261115-D404', 'CVH-20261115-E505')
);

-- Delete sample shipments
DELETE FROM public.shipments
WHERE order_number IN ('CVH-20261114-B202', 'CVH-20261115-C303', 'CVH-20261115-D404', 'CVH-20261115-E505');

-- Delete sample payments
DELETE FROM public.payments
WHERE order_id IN (
  SELECT id FROM public.orders WHERE order_number IN ('CVH-20261114-B202', 'CVH-20261115-C303', 'CVH-20261115-D404', 'CVH-20261115-E505')
);

-- Delete sample order status history
DELETE FROM public.order_status_history
WHERE order_id IN (
  SELECT id FROM public.orders WHERE order_number IN ('CVH-20261114-B202', 'CVH-20261115-C303', 'CVH-20261115-D404', 'CVH-20261115-E505')
);

-- Delete sample order addresses
DELETE FROM public.order_addresses
WHERE order_id IN (
  SELECT id FROM public.orders WHERE order_number IN ('CVH-20261114-B202', 'CVH-20261115-C303', 'CVH-20261115-D404', 'CVH-20261115-E505')
);

-- Delete sample shipping addresses
DELETE FROM public.shipping_addresses
WHERE order_id IN (
  SELECT id FROM public.orders WHERE order_number IN ('CVH-20261114-B202', 'CVH-20261115-C303', 'CVH-20261115-D404', 'CVH-20261115-E505')
);

-- Delete sample order items
DELETE FROM public.order_items
WHERE order_id IN (
  SELECT id FROM public.orders WHERE order_number IN ('CVH-20261114-B202', 'CVH-20261115-C303', 'CVH-20261115-D404', 'CVH-20261115-E505')
);

-- Delete sample orders
DELETE FROM public.orders
WHERE order_number IN ('CVH-20261114-B202', 'CVH-20261115-C303', 'CVH-20261115-D404', 'CVH-20261115-E505');

-- Delete demo customer addresses
DELETE FROM public.customer_addresses
WHERE customer_id IN (
  '478e1289-06ff-4a62-99a2-9edfbd901fff',
  '866a7937-c420-4000-9571-9154f2e269cd',
  '5a867fbb-01b1-4784-b2a7-269cfc6eba22',
  'f6eacd1e-02b2-4bcf-a44d-8a169fab5dd7'
) OR customer_auth_uid IN (
  'cust_ananya_sharma',
  'cust_priya_nair',
  'cust_rohit_verma',
  'cust_vikram_singh'
);

-- Delete demo customer records
DELETE FROM public.customers
WHERE id IN (
  '478e1289-06ff-4a62-99a2-9edfbd901fff',
  '866a7937-c420-4000-9571-9154f2e269cd',
  '5a867fbb-01b1-4784-b2a7-269cfc6eba22',
  'f6eacd1e-02b2-4bcf-a44d-8a169fab5dd7'
) OR auth_provider_uid IN (
  'cust_ananya_sharma',
  'cust_priya_nair',
  'cust_rohit_verma',
  'cust_vikram_singh'
);

-- Clean historical sample inventory transactions
DELETE FROM public.inventory_transactions
WHERE reason LIKE '%Sample%' OR reason LIKE '%Seed%';

DELETE FROM public.inventory_movements
WHERE reason LIKE '%Sample%' OR reason LIKE '%Seed%';


-- -----------------------------------------------------------------------------
-- 2. CREATE CANONICAL `public.profiles` TABLE LINKED TO `auth.users`
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  phone text,
  full_name text,
  avatar_url text,
  auth_provider text DEFAULT 'email',
  account_status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "Admin can view all profiles" ON public.profiles;
CREATE POLICY "Admin can view all profiles" ON public.profiles
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users 
      WHERE (auth_user_id = auth.uid()::text OR email = auth.jwt()->>'email') 
        AND is_active = true
    )
  );

-- Service role bypass
DROP POLICY IF EXISTS "Service role full access profiles" ON public.profiles;
CREATE POLICY "Service role full access profiles" ON public.profiles
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);


-- -----------------------------------------------------------------------------
-- 3. CREATE AUTOMATIC DATABASE TRIGGER ON `auth.users`
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
  -- Extract full name safely from metadata
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

  -- 1. Upsert into public.profiles (1:1 with auth.users)
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
    email = EXCLUDED.email,
    phone = COALESCE(EXCLUDED.phone, public.profiles.phone),
    full_name = CASE 
      WHEN EXCLUDED.full_name IS NOT NULL AND EXCLUDED.full_name <> 'Customer' 
      THEN EXCLUDED.full_name 
      ELSE public.profiles.full_name 
    END,
    avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url),
    auth_provider = COALESCE(EXCLUDED.auth_provider, public.profiles.auth_provider),
    updated_at = now();

  -- 2. Upsert into public.customers for full application continuity
  INSERT INTO public.customers (
    id,
    auth_provider_uid,
    full_name,
    email,
    phone,
    profile_image,
    account_status,
    updated_at
  ) VALUES (
    NEW.id,
    NEW.id::text,
    v_full_name,
    NEW.email,
    v_phone,
    v_avatar_url,
    'active',
    now()
  )
  ON CONFLICT (auth_provider_uid) DO UPDATE SET
    email = EXCLUDED.email,
    phone = COALESCE(EXCLUDED.phone, public.customers.phone),
    full_name = CASE 
      WHEN EXCLUDED.full_name IS NOT NULL AND EXCLUDED.full_name <> 'Customer' 
      THEN EXCLUDED.full_name 
      ELSE public.customers.full_name 
    END,
    profile_image = COALESCE(EXCLUDED.profile_image, public.customers.profile_image),
    updated_at = now();

  -- 3. Also update customer_auth_providers
  INSERT INTO public.customer_auth_providers (
    customer_id,
    provider,
    provider_uid,
    email,
    phone
  ) VALUES (
    NEW.id,
    v_provider,
    NEW.id::text,
    NEW.email,
    v_phone
  )
  ON CONFLICT (customer_id, provider, provider_uid) DO UPDATE SET
    email = EXCLUDED.email,
    phone = COALESCE(EXCLUDED.phone, public.customer_auth_providers.phone),
    updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_or_updated ON auth.users;
CREATE TRIGGER on_auth_user_created_or_updated
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_auth_user_sync();


-- -----------------------------------------------------------------------------
-- 4. BACKFILL EXISTING `auth.users` INTO `public.profiles` & `public.customers`
-- -----------------------------------------------------------------------------

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
)
SELECT 
  u.id,
  u.email,
  u.phone,
  COALESCE(
    NULLIF(TRIM(u.raw_user_meta_data->>'full_name'), ''),
    NULLIF(TRIM(u.raw_user_meta_data->>'name'), ''),
    NULLIF(TRIM(split_part(u.email, '@', 1)), ''),
    'Customer'
  ),
  COALESCE(
    NULLIF(TRIM(u.raw_user_meta_data->>'avatar_url'), ''),
    NULLIF(TRIM(u.raw_user_meta_data->>'picture'), '')
  ),
  COALESCE(
    NULLIF(TRIM(u.raw_app_meta_data->>'provider'), ''),
    'email'
  ),
  'active',
  COALESCE(u.created_at, now()),
  now()
FROM auth.users u
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  phone = COALESCE(EXCLUDED.phone, public.profiles.phone),
  full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
  updated_at = now();


-- -----------------------------------------------------------------------------
-- 5. CANONICAL `admin_roles` TABLE
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.admin_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL UNIQUE,
  role text NOT NULL DEFAULT 'admin',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.admin_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view own admin role" ON public.admin_roles;
CREATE POLICY "Public can view own admin role" ON public.admin_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR email = auth.jwt()->>'email');

-- Populate admin_roles from admin_users / whitelist
INSERT INTO public.admin_roles (user_id, email, role)
SELECT 
  u.id,
  au.email,
  au.role
FROM public.admin_users au
JOIN auth.users u ON lower(u.email) = lower(au.email)
ON CONFLICT (email) DO UPDATE SET
  user_id = EXCLUDED.user_id,
  role = EXCLUDED.role;

-- Update admin_users.auth_user_id with the actual auth.users.id
UPDATE public.admin_users au
SET auth_user_id = u.id::text,
    updated_at = now()
FROM auth.users u
WHERE lower(au.email) = lower(u.email);


-- -----------------------------------------------------------------------------
-- 6. CANONICAL VIEWS FOR LOGICAL TABLE NAMES (WITH SECURITY INVOKER)
-- -----------------------------------------------------------------------------

-- Logical table: addresses -> views customer_addresses
CREATE OR REPLACE VIEW public.addresses WITH (security_invoker = true) AS
SELECT 
  id,
  customer_id,
  customer_auth_uid AS user_id,
  full_name,
  phone,
  address_line1,
  address_line2,
  city,
  state,
  postal_code,
  country,
  address_type,
  is_default,
  created_at,
  updated_at
FROM public.customer_addresses;

-- Logical table: categories -> views product_categories
CREATE OR REPLACE VIEW public.categories WITH (security_invoker = true) AS
SELECT 
  id,
  slug,
  name,
  description,
  created_at
FROM public.product_categories;

-- Logical table: reviews -> views product_reviews
CREATE OR REPLACE VIEW public.reviews WITH (security_invoker = true) AS
SELECT 
  id,
  product_id,
  customer_id,
  customer_auth_uid AS user_id,
  customer_name,
  rating,
  title,
  review_text,
  is_verified_purchase,
  status,
  helpful_votes,
  created_at,
  updated_at
FROM public.product_reviews;

COMMIT;
