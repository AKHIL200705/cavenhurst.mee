-- ==============================================================================
-- CAVENHURST – MIGRATION 20261124000001: CUSTOMER PROFILE COMPLETION & UNIQUE MOBILE
-- ==============================================================================
-- 1. Ensures public.profiles table exists with all required logical fields:
--    id (UUID references auth.users), full_name, mobile_number, phone, email,
--    profile_completed (BOOLEAN), created_at, updated_at.
-- 2. Enforces unique mobile number constraint at the database level.
-- 3. Configures Row Level Security (RLS) for customer self-management & admin access.
-- 4. Creates automatic trigger to mirror mobile_number and phone, and compute completion.
-- ==============================================================================

BEGIN;

-- 1. Ensure public.profiles table exists with proper foreign key
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  full_name text,
  mobile_number text,
  phone text,
  avatar_url text,
  auth_provider text DEFAULT 'email',
  account_status text NOT NULL DEFAULT 'active',
  profile_completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Add columns if table already existed without them
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'mobile_number'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN mobile_number text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'profile_completed'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN profile_completed boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- 3. Synchronize phone and mobile_number for existing records
UPDATE public.profiles
SET mobile_number = phone
WHERE mobile_number IS NULL AND phone IS NOT NULL;

UPDATE public.profiles
SET phone = mobile_number
WHERE phone IS NULL AND mobile_number IS NOT NULL;

-- 4. Mark existing profiles as completed if full_name and 10-digit mobile are already populated
UPDATE public.profiles
SET profile_completed = true
WHERE full_name IS NOT NULL 
  AND trim(full_name) != '' 
  AND trim(full_name) != 'Customer'
  AND (
    (mobile_number IS NOT NULL AND length(regexp_replace(mobile_number, '\D', '', 'g')) >= 10)
    OR (phone IS NOT NULL AND length(regexp_replace(phone, '\D', '', 'g')) >= 10)
  );

-- 5. Enforce unique mobile number constraint (database-level uniqueness)
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_mobile_number_unique 
  ON public.profiles(mobile_number) 
  WHERE mobile_number IS NOT NULL AND trim(mobile_number) != '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_phone_unique 
  ON public.profiles(phone) 
  WHERE phone IS NOT NULL AND trim(phone) != '';

-- Add indexes for customer search performance
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_full_name ON public.profiles(full_name);
CREATE INDEX IF NOT EXISTS idx_profiles_profile_completed ON public.profiles(profile_completed);

-- 6. Configure RLS Policies
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

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

DROP POLICY IF EXISTS "Service role full access profiles" ON public.profiles;
CREATE POLICY "Service role full access profiles" ON public.profiles
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- 7. Trigger to keep mobile_number and phone synchronized and compute profile_completed
CREATE OR REPLACE FUNCTION public.sync_profile_details()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Normalize mobile_number and phone
  IF NEW.mobile_number IS NOT NULL THEN
    NEW.mobile_number := regexp_replace(NEW.mobile_number, '\D', '', 'g');
    IF length(NEW.mobile_number) > 10 THEN
      NEW.mobile_number := substring(NEW.mobile_number from length(NEW.mobile_number) - 9 for 10);
    END IF;
  END IF;

  IF NEW.phone IS NOT NULL THEN
    NEW.phone := regexp_replace(NEW.phone, '\D', '', 'g');
    IF length(NEW.phone) > 10 THEN
      NEW.phone := substring(NEW.phone from length(NEW.phone) - 9 for 10);
    END IF;
  END IF;

  IF NEW.mobile_number IS NOT NULL AND NEW.phone IS NULL THEN
    NEW.phone := NEW.mobile_number;
  ELSIF NEW.phone IS NOT NULL AND NEW.mobile_number IS NULL THEN
    NEW.mobile_number := NEW.phone;
  END IF;

  -- Trim full_name
  IF NEW.full_name IS NOT NULL THEN
    NEW.full_name := trim(NEW.full_name);
  END IF;

  -- Compute profile_completed boolean
  IF NEW.full_name IS NOT NULL 
     AND length(NEW.full_name) >= 2 
     AND NEW.full_name != 'Customer' 
     AND NEW.mobile_number IS NOT NULL 
     AND length(NEW.mobile_number) = 10 THEN
    NEW.profile_completed := true;
  ELSE
    NEW.profile_completed := false;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_profile_details ON public.profiles;
CREATE TRIGGER trg_sync_profile_details
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profile_details();

COMMIT;
