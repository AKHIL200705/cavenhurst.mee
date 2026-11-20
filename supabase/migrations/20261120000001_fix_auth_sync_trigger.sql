-- ==============================================================================
-- CAVENHURST – MIGRATION 20261120000001: FIX AUTH USER SYNC TRIGGER & CONSTRAINTS
-- ==============================================================================

BEGIN;

-- 1. Relax provider check constraint on public.customer_auth_providers so any valid auth provider is accepted
ALTER TABLE public.customer_auth_providers
  DROP CONSTRAINT IF EXISTS customer_auth_providers_provider_check;

-- Ensure uq_customer_provider constraint exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_customer_provider'
  ) THEN
    ALTER TABLE public.customer_auth_providers
      ADD CONSTRAINT uq_customer_provider UNIQUE (provider, provider_uid);
  END IF;
END $$;

-- 2. Replace handle_auth_user_sync function with robust error-handled version
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
  v_customer_id uuid;
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

  -- 1. Upsert into public.profiles (1:1 with auth.users)
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

  -- 2. Upsert into public.customers for full application continuity
  BEGIN
    -- Check if customer already exists by email or auth_provider_uid
    SELECT id INTO v_customer_id
    FROM public.customers
    WHERE (NEW.email IS NOT NULL AND lower(email) = lower(NEW.email))
       OR auth_provider_uid = NEW.id::text
    LIMIT 1;

    IF v_customer_id IS NOT NULL THEN
      UPDATE public.customers SET
        email = COALESCE(NEW.email, email),
        phone = COALESCE(v_phone, phone),
        full_name = CASE
          WHEN v_full_name IS NOT NULL AND v_full_name <> 'Customer' THEN v_full_name
          ELSE full_name
        END,
        profile_image = COALESCE(v_avatar_url, profile_image),
        last_login = now(),
        updated_at = now()
      WHERE id = v_customer_id;
    ELSE
      v_customer_id := NEW.id;
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
        v_customer_id,
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
      ON CONFLICT (auth_provider_uid) DO UPDATE SET
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
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_auth_user_sync: customers upsert failed: %', SQLERRM;
  END;

  -- 3. Also update customer_auth_providers
  BEGIN
    IF v_customer_id IS NOT NULL THEN
      INSERT INTO public.customer_auth_providers (
        customer_id,
        provider,
        provider_uid,
        email,
        phone,
        updated_at
      ) VALUES (
        v_customer_id,
        v_provider,
        NEW.id::text,
        NEW.email,
        v_phone,
        now()
      )
      ON CONFLICT (provider, provider_uid) DO UPDATE SET
        email = COALESCE(EXCLUDED.email, public.customer_auth_providers.email),
        phone = COALESCE(EXCLUDED.phone, public.customer_auth_providers.phone),
        customer_id = EXCLUDED.customer_id,
        updated_at = now();
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_auth_user_sync: customer_auth_providers upsert failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_or_updated ON auth.users;
CREATE TRIGGER on_auth_user_created_or_updated
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_auth_user_sync();

COMMIT;
