import postgres from "postgres";
import fs from "fs";

const env = fs.readFileSync(".env", "utf8");
const match = env.match(/DATABASE_URL="?([^\r\n"]+)"?/);
const sql = postgres(match[1], { ssl: { rejectUnauthorized: false } });

async function fix() {
  console.log("Fixing RLS recursion on is_admin() and admin_users...");

  await sql`
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
  `;
  console.log("Updated requesting_user_id() to SECURITY DEFINER");

  await sql`
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

      -- If no user is logged in, immediately return false (do not query)
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
  `;
  console.log("Updated is_admin() to SECURITY DEFINER plpgsql with fast non-authenticated bailout");

  // Fix policy on admin_users to avoid self-recursion
  await sql`
    DROP POLICY IF EXISTS "Admin users only" ON public.admin_users;
  `;

  await sql`
    CREATE POLICY "Admin users only" ON public.admin_users
    FOR ALL
    USING (
      (auth.jwt()->>'role' = 'service_role') OR
      public.is_admin()
    );
  `;
  console.log("Re-created policy on admin_users");

  await sql.end();
  console.log("Fix complete!");
}

fix();
