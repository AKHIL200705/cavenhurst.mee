-- Migration: 20261123000002_fix_auth_registration_and_profiles_rls.sql
-- Fixes authentication registration, profile RLS policies, and GoTrue database scanner integrity

-- 1. Ensure supabase_auth_admin has full execution and schema access to public tables
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT ALL ON ALL TABLES IN SCHEMA public TO supabase_auth_admin;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO supabase_auth_admin;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO supabase_auth_admin;

-- 2. Allow authenticated users to insert their own profile record (matching their auth.users.id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'profiles' AND policyname = 'Users can insert own profile'
  ) THEN
    CREATE POLICY "Users can insert own profile"
      ON public.profiles FOR INSERT
      TO authenticated
      WITH CHECK ((select auth.uid()) = id);
  END IF;
END $$;

-- 3. Ensure customers table RLS supports lookup and update by auth.uid() directly
DROP POLICY IF EXISTS "Customer self read and update" ON public.customers;
CREATE POLICY "Customer self read and update"
  ON public.customers FOR SELECT
  TO public
  USING (
    id = (select auth.uid())
    OR auth_provider_uid = requesting_user_id()
    OR is_admin()
  );

DROP POLICY IF EXISTS "Customer self update" ON public.customers;
CREATE POLICY "Customer self update"
  ON public.customers FOR UPDATE
  TO public
  USING (
    id = (select auth.uid())
    OR auth_provider_uid = requesting_user_id()
    OR is_admin()
  )
  WITH CHECK (
    id = (select auth.uid())
    OR auth_provider_uid = requesting_user_id()
    OR is_admin()
  );

-- 4. Repair any NULL booleans or string-scalar JSONB in auth schema that causes GoTrue 500 scan crashes
UPDATE auth.users
SET is_super_admin = false
WHERE is_super_admin IS NULL;

UPDATE auth.identities
SET identity_data = (identity_data #>> '{}')::jsonb
WHERE jsonb_typeof(identity_data) = 'string';

UPDATE auth.users
SET raw_app_meta_data = (raw_app_meta_data #>> '{}')::jsonb
WHERE jsonb_typeof(raw_app_meta_data) = 'string';

UPDATE auth.users
SET raw_user_meta_data = (raw_user_meta_data #>> '{}')::jsonb
WHERE jsonb_typeof(raw_user_meta_data) = 'string';
