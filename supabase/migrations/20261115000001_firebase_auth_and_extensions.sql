-- ==============================================================================
-- CAVENHURST Migration 01: Firebase Auth Compatibility, Extensions & RBAC
-- File: supabase/migrations/20261115000001_firebase_auth_and_extensions.sql
-- ==============================================================================

-- 1. Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Non-destructive type migration for existing tables
-- Changes user_id from UUID to TEXT so Firebase UIDs and Supabase UUIDs are both supported without data loss
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'customer_welcome' AND column_name = 'user_id' AND data_type != 'text') THEN
    ALTER TABLE public.customer_welcome ALTER COLUMN user_id TYPE text USING user_id::text;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'customer_carts' AND column_name = 'user_id' AND data_type != 'text') THEN
    ALTER TABLE public.customer_carts ALTER COLUMN user_id TYPE text USING user_id::text;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'user_id' AND data_type != 'text') THEN
    ALTER TABLE public.orders ALTER COLUMN user_id TYPE text USING user_id::text;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'newsletter_subscribers' AND column_name = 'user_id' AND data_type != 'text') THEN
    ALTER TABLE public.newsletter_subscribers ALTER COLUMN user_id TYPE text USING user_id::text;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'contact_messages' AND column_name = 'user_id' AND data_type != 'text') THEN
    ALTER TABLE public.contact_messages ALTER COLUMN user_id TYPE text USING user_id::text;
  END IF;
END $$;

-- 3. Firebase & Supabase Auth Identity Helper Function
-- Extracts the authentic user ID from Firebase JWT claim ('sub'), custom JWT, or Supabase auth.uid()
CREATE OR REPLACE FUNCTION public.requesting_user_id()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    auth.jwt() ->> 'sub',
    (auth.jwt() ->> 'user_metadata')::jsonb ->> 'sub',
    auth.jwt() ->> 'uid',
    auth.uid()::text
  );
$$;

-- 4. Admin Whitelist & User Roles (RBAC)
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

-- 5. Helper function to check if current request has Admin privileges
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = public.requesting_user_id() AND role = 'admin'
  ) OR EXISTS (
    SELECT 1 FROM public.admin_whitelist
    WHERE lower(email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
  );
$$;

-- 6. RLS Policies for Admin Whitelist & Roles
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

-- 7. Helper to assign admin privileges by email
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

  RETURN 'SUCCESS: ' || clean_email || ' authorized as admin.';
END;
$$;

-- Pre-seed designated administrators
SELECT public.assign_admin_role_by_email('akhilsaiabbireddy2007@gmail.com');
SELECT public.assign_admin_role_by_email('cavenhurst@gmail.com');

