-- ==============================================================================
-- CAVENHURST - Migration 4: Fix RLS Security Definer & Infinite Recursion
-- ==============================================================================
-- Resolves 'stack depth limit exceeded' on admin_users, customers, and orders
-- by making is_admin() and requesting_user_id() SECURITY DEFINER and bailing
-- out immediately when no session is active.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.requesting_user_id()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'),
    auth.uid()::text
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid text;
  v_email text;
BEGIN
  v_uid := COALESCE(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'),
    auth.uid()::text
  );

  v_email := COALESCE(
    nullif(current_setting('request.jwt.claim.email', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email'),
    auth.jwt()->>'email'
  );

  -- If no user is logged in, immediately return false
  IF v_uid IS NULL AND v_email IS NULL THEN
    RETURN false;
  END IF;

  -- Check admin_users
  IF EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE ((v_uid IS NOT NULL AND auth_user_id = v_uid) OR (v_email IS NOT NULL AND lower(email) = lower(v_email)))
      AND is_active = true
  ) THEN
    RETURN true;
  END IF;

  -- Check user_roles
  IF v_uid IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE (user_id = v_uid OR lower(user_id) = lower(v_email))
      AND role = 'admin'
  ) THEN
    RETURN true;
  END IF;

  -- Check admin_whitelist
  IF v_email IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.admin_whitelist
    WHERE lower(email) = lower(v_email)
  ) THEN
    RETURN true;
  END IF;

  -- Hardcoded root admin safety check
  IF v_email IS NOT NULL AND lower(v_email) IN ('akhilsaiabbireddy2007@gmail.com', 'cavenhurst@gmail.com') THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

-- Ensure policy on admin_users does not recurse
DROP POLICY IF EXISTS "Admin users only" ON public.admin_users;

CREATE POLICY "Admin users only" ON public.admin_users
FOR ALL
USING (
  (auth.jwt()->>'role' = 'service_role') OR
  public.is_admin()
);
