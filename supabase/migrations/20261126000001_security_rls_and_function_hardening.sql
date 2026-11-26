-- =============================================================================
-- CAVENHURST — MIGRATION 01: SECURITY, FUNCTION & RLS HARDENING
-- STATUS: APPROVED & PROMOTED TO supabase/migrations/
-- =============================================================================
-- Covers:
--   1. Privilege & search_path hardening on all 7 public SECURITY DEFINER/helper functions
--   2. Safe base table/view grants (least-privilege REVOKE on TRUNCATE/TRIGGER/REFERENCES & anon writes)
--   3. Idempotent DROP + single-permissive, initPlan-wrapped RLS policies across all 62 public tables
--   4. View privilege hardening (addresses, categories, return_requests, reviews)
--   5. Storage bucket (product-images 5 MB / MIME limits) & object policies
--
-- Compatibility guaranteed for:
--   * Google Direct Auth (HMAC JWT) + server-side service_role / postgres execution
--   * Supabase GoTrue Email/Password Auth + browser Realtime (account.tsx & admin.tsx)
--   * AGENTS.md immutable customer_welcome rule
--   * Zero multi-permissive policy overlaps (max 1 permissive policy per (table, role, cmd))
--   * NO tables dropped, renamed, or archived; NO test rows deleted.
-- =============================================================================

BEGIN;

-- =============================================================================
-- SECTION 1: BASE ROLE PRIVILEGE HARDENING (LEAST PRIVILEGE)
-- =============================================================================

REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM anon;

-- Defense-in-depth: revoke anon SELECT on non-public tables behind RLS
REVOKE SELECT ON TABLE
  public.admin_audit_logs,
  public.admin_roles,
  public.admin_users,
  public.admin_whitelist,
  public.audit_logs,
  public.cart_items,
  public.carts,
  public.contact_messages,
  public.coupon_redemptions,
  public.coupons,
  public.customer_addresses,
  public.customer_auth_providers,
  public.customer_carts,
  public.customer_profiles,
  public.customer_welcome,
  public.customers,
  public.email_delivery_diagnostics,
  public.email_verification_otps,
  public.inventory,
  public.inventory_items,
  public.inventory_movements,
  public.inventory_reservations,
  public.inventory_transactions,
  public.newsletter_subscribers,
  public.notifications,
  public.order_addresses,
  public.order_items,
  public.order_notes,
  public.order_status_history,
  public.orders,
  public.payment_refunds,
  public.payment_webhook_events,
  public.payment_webhooks,
  public.payments,
  public.profiles,
  public.refunds,
  public.return_items,
  public.returns,
  public.shipment_tracking_events,
  public.shipments,
  public.shipping_addresses,
  public.shipping_settings,
  public.shipping_tracking,
  public.shipping_webhook_events,
  public.site_settings,
  public.support_messages,
  public.support_tickets,
  public.system_settings,
  public.user_roles,
  public.wishlist_items,
  public.wishlists
FROM PUBLIC, anon;

-- Ensure anon retains SELECT on public catalog & review lookup tables
GRANT SELECT ON TABLE
  public.banners,
  public.product_categories,
  public.product_images,
  public.product_reviews,
  public.product_tag_assignments,
  public.product_tags,
  public.product_variants,
  public.products,
  public.promotional_sections,
  public.shipping_rates,
  public.shipping_zones
TO anon, authenticated;

-- Authenticated customers may only write directly to explicitly scoped self tables (via RLS)
-- Keep authenticated SELECT available on tables covered by owner/admin RLS policies + Realtime
REVOKE INSERT, UPDATE, DELETE ON TABLE
  public.admin_audit_logs,
  public.admin_roles,
  public.admin_users,
  public.admin_whitelist,
  public.audit_logs,
  public.contact_messages,
  public.coupon_redemptions,
  public.customer_auth_providers,
  public.email_delivery_diagnostics,
  public.email_verification_otps,
  public.newsletter_subscribers,
  public.order_addresses,
  public.order_items,
  public.order_status_history,
  public.payment_webhook_events,
  public.payment_webhooks,
  public.payments,
  public.payment_refunds,
  public.refunds,
  public.shipment_tracking_events,
  public.shipments,
  public.shipping_addresses,
  public.shipping_tracking,
  public.shipping_webhook_events,
  public.user_roles
FROM authenticated;

-- Allow admins via authenticated JWT where needed while customers cannot write directly (RLS further gates authenticated admins)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.banners,
  public.carts,
  public.cart_items,
  public.coupons,
  public.customer_addresses,
  public.customer_carts,
  public.customer_profiles,
  public.customer_welcome,
  public.customers,
  public.inventory,
  public.inventory_items,
  public.inventory_movements,
  public.inventory_reservations,
  public.inventory_transactions,
  public.notifications,
  public.order_notes,
  public.orders,
  public.product_categories,
  public.product_images,
  public.product_reviews,
  public.product_tag_assignments,
  public.product_tags,
  public.product_variants,
  public.products,
  public.profiles,
  public.promotional_sections,
  public.return_items,
  public.returns,
  public.shipping_rates,
  public.shipping_settings,
  public.shipping_zones,
  public.site_settings,
  public.support_messages,
  public.support_tickets,
  public.system_settings,
  public.wishlist_items,
  public.wishlists
TO authenticated;

-- Re-grant INSERT/UPDATE/DELETE to authenticated ONLY where admin RLS policies apply
GRANT SELECT ON TABLE
  public.admin_audit_logs,
  public.admin_roles,
  public.admin_users,
  public.admin_whitelist,
  public.audit_logs,
  public.contact_messages,
  public.coupon_redemptions,
  public.customer_auth_providers,
  public.email_delivery_diagnostics,
  public.newsletter_subscribers,
  public.order_addresses,
  public.order_items,
  public.order_status_history,
  public.payment_refunds,
  public.payment_webhook_events,
  public.payment_webhooks,
  public.payments,
  public.refunds,
  public.shipment_tracking_events,
  public.shipments,
  public.shipping_addresses,
  public.shipping_tracking,
  public.shipping_webhook_events,
  public.user_roles
TO authenticated;

GRANT INSERT, UPDATE, DELETE ON TABLE
  public.coupon_redemptions,
  public.customer_auth_providers,
  public.order_addresses,
  public.order_items,
  public.order_status_history,
  public.payment_refunds,
  public.payments,
  public.refunds,
  public.shipment_tracking_events,
  public.shipments,
  public.shipping_addresses,
  public.shipping_tracking
TO authenticated;

GRANT UPDATE, DELETE ON TABLE
  public.contact_messages,
  public.newsletter_subscribers
TO authenticated;

REVOKE ALL ON TABLE public.email_verification_otps FROM PUBLIC, anon, authenticated;

-- Hardening public views (all already WITH (security_invoker = true))
REVOKE ALL ON public.addresses FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON public.addresses FROM authenticated;
GRANT SELECT ON public.addresses TO authenticated, service_role;

REVOKE ALL ON public.return_requests FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON public.return_requests FROM authenticated;
GRANT SELECT ON public.return_requests TO authenticated, service_role;

REVOKE INSERT, UPDATE, DELETE ON public.categories, public.reviews FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.categories, public.reviews TO anon, authenticated, service_role;

-- =============================================================================
-- SECTION 2: DATABASE FUNCTION HARDENING (ALL 7 PUBLIC FUNCTIONS)
-- =============================================================================

-- 2.1 public.requesting_user_id(): SECURITY INVOKER + authenticated JWT check + empty search_path (avoids deprecated auth.role())
CREATE OR REPLACE FUNCTION public.requesting_user_id()
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN current_user = 'authenticated'
      AND COALESCE(
        NULLIF(pg_catalog.current_setting('request.jwt.claim.role', true), ''),
        NULLIF(NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', ''),
        ''
      ) = 'authenticated'
      AND NOT COALESCE(((SELECT auth.jwt()) ->> 'is_anonymous')::boolean, false)
      THEN NULLIF((SELECT auth.uid())::text, '')
    ELSE NULL::text
  END;
$$;

REVOKE ALL ON FUNCTION public.requesting_user_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.requesting_user_id() TO authenticated, service_role;

-- 2.2 public.is_admin(): Enforces active status FIRST, verifies authoritative auth.users state, avoids deprecated auth.role(), removes hardcoded emails
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_raw_claims text;
  v_claims jsonb;
  v_jwt_role text;
  v_auth_uid uuid;
  v_uid text;
  v_email text;
  v_is_verified_active boolean;
  v_has_active_record boolean;
  v_has_inactive_record boolean;
BEGIN
  v_raw_claims := NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '');
  v_claims := CASE WHEN v_raw_claims IS NOT NULL THEN v_raw_claims::jsonb ELSE NULL::jsonb END;
  v_jwt_role := COALESCE(
    NULLIF(pg_catalog.current_setting('request.jwt.claim.role', true), ''),
    NULLIF(v_claims ->> 'role', ''),
    ''
  );

  -- Inside SECURITY DEFINER owned by postgres, current_user is always the owner;
  -- rely on JWT role claims or (when un-claimed) session_user.
  IF v_jwt_role = 'service_role' THEN
    RETURN true;
  END IF;

  IF v_jwt_role = ''
     AND v_raw_claims IS NULL
     AND session_user IN ('postgres', 'service_role', 'supabase_admin') THEN
    RETURN true;
  END IF;

  IF v_jwt_role <> 'authenticated'
     OR COALESCE((v_claims ->> 'is_anonymous')::boolean, false)
     OR COALESCE(((SELECT auth.jwt()) ->> 'is_anonymous')::boolean, false) THEN
    RETURN false;
  END IF;

  v_auth_uid := (SELECT auth.uid());
  IF v_auth_uid IS NULL THEN
    RETURN false;
  END IF;
  v_uid := v_auth_uid::text;

  -- Verify authoritative auth.users record (email confirmed, not banned, not soft-deleted)
  SELECT
    (u.email_confirmed_at IS NOT NULL
      AND (u.banned_until IS NULL OR u.banned_until <= pg_catalog.now())
      AND u.deleted_at IS NULL),
    NULLIF(pg_catalog.lower(pg_catalog.btrim(u.email)), '')
  INTO v_is_verified_active, v_email
  FROM auth.users u
  WHERE u.id = v_auth_uid;

  IF NOT COALESCE(v_is_verified_active, false) THEN
    RETURN false;
  END IF;

  -- Check admin_users FIRST so deactivated admins (is_active = false) cannot fall through!
  SELECT
    EXISTS (
      SELECT 1 FROM public.admin_users au
      WHERE ((au.auth_user_id = v_uid) OR (v_email IS NOT NULL AND pg_catalog.lower(au.email) = v_email))
        AND au.is_active = true
    ),
    EXISTS (
      SELECT 1 FROM public.admin_users au
      WHERE ((au.auth_user_id = v_uid) OR (v_email IS NOT NULL AND pg_catalog.lower(au.email) = v_email))
        AND au.is_active = false
    )
  INTO v_has_active_record, v_has_inactive_record;

  IF v_has_inactive_record AND NOT v_has_active_record THEN
    RETURN false;
  END IF;

  IF v_has_active_record THEN
    RETURN true;
  END IF;

  -- Check user_roles (admin / superadmin)
  IF EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = v_uid
      AND ur.role IN ('admin', 'superadmin')
  ) THEN
    RETURN true;
  END IF;

  -- Check admin_roles
  IF EXISTS (
    SELECT 1 FROM public.admin_roles ar
    WHERE ar.user_id = v_auth_uid
      AND ar.role IN ('admin', 'superadmin')
  ) THEN
    RETURN true;
  END IF;

  -- Check admin_whitelist only for verified active auth.users emails
  IF v_email IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.admin_whitelist aw
    WHERE pg_catalog.lower(aw.email) = v_email
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;

-- 2.3 public.assign_admin_role_by_email(target_email text): Restricted strictly to service_role / SQL owner
CREATE OR REPLACE FUNCTION public.assign_admin_role_by_email(target_email text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_raw_claims text;
  v_claims jsonb;
  v_caller_role text;
  v_uid uuid;
  v_clean_email text;
BEGIN
  v_raw_claims := NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '');
  v_claims := CASE WHEN v_raw_claims IS NOT NULL THEN v_raw_claims::jsonb ELSE NULL::jsonb END;
  v_caller_role := COALESCE(
    NULLIF(pg_catalog.current_setting('request.jwt.claim.role', true), ''),
    NULLIF(v_claims ->> 'role', ''),
    ''
  );
  IF NOT (
    v_caller_role = 'service_role'
    OR (
      v_caller_role = ''
      AND v_raw_claims IS NULL
      AND session_user IN ('postgres', 'service_role', 'supabase_admin')
    )
  ) THEN
    RAISE EXCEPTION 'Unauthorized: service_role privileges required to assign admin roles'
      USING ERRCODE = '42501';
  END IF;

  v_clean_email := pg_catalog.lower(pg_catalog.btrim(target_email));
  IF v_clean_email IS NULL OR v_clean_email = '' OR pg_catalog.strpos(v_clean_email, '@') < 2 THEN
    RAISE EXCEPTION 'Invalid email address';
  END IF;

  INSERT INTO public.admin_whitelist (email)
  VALUES (v_clean_email)
  ON CONFLICT (email) DO NOTHING;

  SELECT id INTO v_uid
  FROM auth.users
  WHERE pg_catalog.lower(email) = v_clean_email
  LIMIT 1;

  IF v_uid IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_uid::text, 'admin')
    ON CONFLICT (user_id, role) DO UPDATE SET role = 'admin';
  END IF;

  RETURN 'SUCCESS: ' || v_clean_email || ' authorized as admin.';
END;
$$;

REVOKE ALL ON FUNCTION public.assign_admin_role_by_email(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_admin_role_by_email(text) TO service_role;

-- 2.4 public.reserve_inventory_variant(...): Restricted strictly to service_role / postgres
CREATE OR REPLACE FUNCTION public.reserve_inventory_variant(
  p_variant_id uuid,
  p_quantity integer,
  p_order_id uuid DEFAULT NULL::uuid,
  p_hold_minutes integer DEFAULT 15
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_raw_claims text;
  v_claims jsonb;
  v_caller_role text;
  v_available integer;
  v_res_id uuid;
BEGIN
  v_raw_claims := NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '');
  v_claims := CASE WHEN v_raw_claims IS NOT NULL THEN v_raw_claims::jsonb ELSE NULL::jsonb END;
  v_caller_role := COALESCE(
    NULLIF(pg_catalog.current_setting('request.jwt.claim.role', true), ''),
    NULLIF(v_claims ->> 'role', ''),
    ''
  );
  IF NOT (
    v_caller_role = 'service_role'
    OR (
      v_caller_role = ''
      AND v_raw_claims IS NULL
      AND session_user IN ('postgres', 'service_role', 'supabase_admin')
    )
  ) THEN
    RAISE EXCEPTION 'Unauthorized: inventory reservation requires service_role'
      USING ERRCODE = '42501';
  END IF;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Reservation quantity must be positive';
  END IF;

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

  UPDATE public.inventory
  SET reserved_quantity = reserved_quantity + p_quantity,
      updated_at = pg_catalog.now()
  WHERE variant_id = p_variant_id;

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
    pg_catalog.now() + (COALESCE(p_hold_minutes, 15)::text || ' minutes')::interval
  ) RETURNING id INTO v_res_id;

  RETURN v_res_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_inventory_variant(uuid, integer, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_inventory_variant(uuid, integer, uuid, integer) TO service_role;

-- 2.5 public.sync_profile_details(): Fix mutable search_path on trigger function
CREATE OR REPLACE FUNCTION public.sync_profile_details()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.mobile_number IS NOT NULL THEN
    NEW.mobile_number := pg_catalog.regexp_replace(NEW.mobile_number, '\D', '', 'g');
    IF pg_catalog.length(NEW.mobile_number) > 10 THEN
      NEW.mobile_number := pg_catalog.substr(NEW.mobile_number, pg_catalog.length(NEW.mobile_number) - 9, 10);
    END IF;
  END IF;

  IF NEW.phone IS NOT NULL THEN
    NEW.phone := pg_catalog.regexp_replace(NEW.phone, '\D', '', 'g');
    IF pg_catalog.length(NEW.phone) > 10 THEN
      NEW.phone := pg_catalog.substr(NEW.phone, pg_catalog.length(NEW.phone) - 9, 10);
    END IF;
  END IF;

  IF NEW.mobile_number IS NOT NULL AND NEW.phone IS NULL THEN
    NEW.phone := NEW.mobile_number;
  ELSIF NEW.phone IS NOT NULL AND NEW.mobile_number IS NULL THEN
    NEW.mobile_number := NEW.phone;
  END IF;

  IF NEW.full_name IS NOT NULL THEN
    NEW.full_name := pg_catalog.btrim(NEW.full_name);
  END IF;

  IF NEW.full_name IS NOT NULL
     AND pg_catalog.length(NEW.full_name) >= 2
     AND NEW.full_name <> 'Customer'
     AND NEW.mobile_number IS NOT NULL
     AND pg_catalog.length(NEW.mobile_number) = 10 THEN
    NEW.profile_completed := true;
  ELSE
    NEW.profile_completed := false;
  END IF;

  NEW.updated_at := pg_catalog.now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_profile_details() FROM PUBLIC, anon, authenticated;

-- 2.6 public.handle_auth_user_sync() & 2.7 public.rls_auto_enable()
REVOKE ALL ON FUNCTION public.handle_auth_user_sync() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;

-- =============================================================================
-- SECTION 3: ENABLE RLS & REBUILD CLEAN POLICIES ON ALL 62 PUBLIC TABLES
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Group A: Public Storefront Catalog, Content & Shipping Lookup (11 tables)
-- Single SELECT policy TO anon, authenticated; separate admin writes TO authenticated
-- -----------------------------------------------------------------------------

-- 1. products
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin full access on products" ON public.products;
DROP POLICY IF EXISTS "Admins manage products" ON public.products;
DROP POLICY IF EXISTS "Published products viewable by everyone" ON public.products;
DROP POLICY IF EXISTS "products_anon_select" ON public.products;
DROP POLICY IF EXISTS "products_select_policy" ON public.products;
DROP POLICY IF EXISTS "products_admin_insert" ON public.products;
DROP POLICY IF EXISTS "products_admin_update" ON public.products;
DROP POLICY IF EXISTS "products_admin_delete" ON public.products;

CREATE POLICY "products_anon_select" ON public.products
  FOR SELECT TO anon
  USING (COALESCE(is_published, false) = true);
CREATE POLICY "products_select_policy" ON public.products
  FOR SELECT TO authenticated
  USING ((COALESCE(is_published, false) = true) OR (SELECT public.is_admin()));
CREATE POLICY "products_admin_insert" ON public.products
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "products_admin_update" ON public.products
  FOR UPDATE TO authenticated USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "products_admin_delete" ON public.products
  FOR DELETE TO authenticated USING ((SELECT public.is_admin()));

-- 2. product_categories
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage categories" ON public.product_categories;
DROP POLICY IF EXISTS "Categories viewable by everyone" ON public.product_categories;
DROP POLICY IF EXISTS "product_categories_select_policy" ON public.product_categories;
DROP POLICY IF EXISTS "product_categories_admin_insert" ON public.product_categories;
DROP POLICY IF EXISTS "product_categories_admin_update" ON public.product_categories;
DROP POLICY IF EXISTS "product_categories_admin_delete" ON public.product_categories;

CREATE POLICY "product_categories_select_policy" ON public.product_categories
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "product_categories_admin_insert" ON public.product_categories
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "product_categories_admin_update" ON public.product_categories
  FOR UPDATE TO authenticated USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "product_categories_admin_delete" ON public.product_categories
  FOR DELETE TO authenticated USING ((SELECT public.is_admin()));

-- 3. product_images
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin full access on product_images" ON public.product_images;
DROP POLICY IF EXISTS "Public can view product images" ON public.product_images;
DROP POLICY IF EXISTS "product_images_anon_select" ON public.product_images;
DROP POLICY IF EXISTS "product_images_select_policy" ON public.product_images;
DROP POLICY IF EXISTS "product_images_admin_insert" ON public.product_images;
DROP POLICY IF EXISTS "product_images_admin_update" ON public.product_images;
DROP POLICY IF EXISTS "product_images_admin_delete" ON public.product_images;

CREATE POLICY "product_images_anon_select" ON public.product_images
  FOR SELECT TO anon
  USING (
    EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_images.product_id AND COALESCE(p.is_published, false) = true)
  );
CREATE POLICY "product_images_select_policy" ON public.product_images
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_images.product_id AND COALESCE(p.is_published, false) = true)
    OR (SELECT public.is_admin())
  );
CREATE POLICY "product_images_admin_insert" ON public.product_images
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "product_images_admin_update" ON public.product_images
  FOR UPDATE TO authenticated USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "product_images_admin_delete" ON public.product_images
  FOR DELETE TO authenticated USING ((SELECT public.is_admin()));

-- 4. product_variants
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin full access on product_variants" ON public.product_variants;
DROP POLICY IF EXISTS "Public can view product variants" ON public.product_variants;
DROP POLICY IF EXISTS "product_variants_anon_select" ON public.product_variants;
DROP POLICY IF EXISTS "product_variants_select_policy" ON public.product_variants;
DROP POLICY IF EXISTS "product_variants_admin_insert" ON public.product_variants;
DROP POLICY IF EXISTS "product_variants_admin_update" ON public.product_variants;
DROP POLICY IF EXISTS "product_variants_admin_delete" ON public.product_variants;

CREATE POLICY "product_variants_anon_select" ON public.product_variants
  FOR SELECT TO anon
  USING (
    EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_variants.product_id AND COALESCE(p.is_published, false) = true)
  );
CREATE POLICY "product_variants_select_policy" ON public.product_variants
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_variants.product_id AND COALESCE(p.is_published, false) = true)
    OR (SELECT public.is_admin())
  );
CREATE POLICY "product_variants_admin_insert" ON public.product_variants
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "product_variants_admin_update" ON public.product_variants
  FOR UPDATE TO authenticated USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "product_variants_admin_delete" ON public.product_variants
  FOR DELETE TO authenticated USING ((SELECT public.is_admin()));

-- 5. product_tags
ALTER TABLE public.product_tags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can manage product tags" ON public.product_tags;
DROP POLICY IF EXISTS "Public can view product tags" ON public.product_tags;
DROP POLICY IF EXISTS "product_tags_select_policy" ON public.product_tags;
DROP POLICY IF EXISTS "product_tags_admin_insert" ON public.product_tags;
DROP POLICY IF EXISTS "product_tags_admin_update" ON public.product_tags;
DROP POLICY IF EXISTS "product_tags_admin_delete" ON public.product_tags;

CREATE POLICY "product_tags_select_policy" ON public.product_tags
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "product_tags_admin_insert" ON public.product_tags
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "product_tags_admin_update" ON public.product_tags
  FOR UPDATE TO authenticated USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "product_tags_admin_delete" ON public.product_tags
  FOR DELETE TO authenticated USING ((SELECT public.is_admin()));

-- 6. product_tag_assignments
ALTER TABLE public.product_tag_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can manage tag assignments" ON public.product_tag_assignments;
DROP POLICY IF EXISTS "Public can view tag assignments" ON public.product_tag_assignments;
DROP POLICY IF EXISTS "product_tag_assignments_anon_select" ON public.product_tag_assignments;
DROP POLICY IF EXISTS "product_tag_assignments_select_policy" ON public.product_tag_assignments;
DROP POLICY IF EXISTS "product_tag_assignments_admin_insert" ON public.product_tag_assignments;
DROP POLICY IF EXISTS "product_tag_assignments_admin_update" ON public.product_tag_assignments;
DROP POLICY IF EXISTS "product_tag_assignments_admin_delete" ON public.product_tag_assignments;

CREATE POLICY "product_tag_assignments_anon_select" ON public.product_tag_assignments
  FOR SELECT TO anon
  USING (
    EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_tag_assignments.product_id AND COALESCE(p.is_published, false) = true)
  );
CREATE POLICY "product_tag_assignments_select_policy" ON public.product_tag_assignments
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_tag_assignments.product_id AND COALESCE(p.is_published, false) = true)
    OR (SELECT public.is_admin())
  );
CREATE POLICY "product_tag_assignments_admin_insert" ON public.product_tag_assignments
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "product_tag_assignments_admin_update" ON public.product_tag_assignments
  FOR UPDATE TO authenticated USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "product_tag_assignments_admin_delete" ON public.product_tag_assignments
  FOR DELETE TO authenticated USING ((SELECT public.is_admin()));

-- 7. banners
ALTER TABLE public.banners ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view active banners" ON public.banners;
DROP POLICY IF EXISTS "banners_anon_select" ON public.banners;
DROP POLICY IF EXISTS "banners_select_policy" ON public.banners;
DROP POLICY IF EXISTS "banners_admin_insert" ON public.banners;
DROP POLICY IF EXISTS "banners_admin_update" ON public.banners;
DROP POLICY IF EXISTS "banners_admin_delete" ON public.banners;

CREATE POLICY "banners_anon_select" ON public.banners
  FOR SELECT TO anon USING (COALESCE(is_active, false) = true);
CREATE POLICY "banners_select_policy" ON public.banners
  FOR SELECT TO authenticated
  USING ((COALESCE(is_active, false) = true) OR (SELECT public.is_admin()));
CREATE POLICY "banners_admin_insert" ON public.banners
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "banners_admin_update" ON public.banners
  FOR UPDATE TO authenticated USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "banners_admin_delete" ON public.banners
  FOR DELETE TO authenticated USING ((SELECT public.is_admin()));

-- 8. promotional_sections
ALTER TABLE public.promotional_sections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view active promo sections" ON public.promotional_sections;
DROP POLICY IF EXISTS "promotional_sections_anon_select" ON public.promotional_sections;
DROP POLICY IF EXISTS "promotional_sections_select_policy" ON public.promotional_sections;
DROP POLICY IF EXISTS "promotional_sections_admin_insert" ON public.promotional_sections;
DROP POLICY IF EXISTS "promotional_sections_admin_update" ON public.promotional_sections;
DROP POLICY IF EXISTS "promotional_sections_admin_delete" ON public.promotional_sections;

CREATE POLICY "promotional_sections_anon_select" ON public.promotional_sections
  FOR SELECT TO anon USING (COALESCE(is_active, false) = true);
CREATE POLICY "promotional_sections_select_policy" ON public.promotional_sections
  FOR SELECT TO authenticated
  USING ((COALESCE(is_active, false) = true) OR (SELECT public.is_admin()));
CREATE POLICY "promotional_sections_admin_insert" ON public.promotional_sections
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "promotional_sections_admin_update" ON public.promotional_sections
  FOR UPDATE TO authenticated USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "promotional_sections_admin_delete" ON public.promotional_sections
  FOR DELETE TO authenticated USING ((SELECT public.is_admin()));

-- 9. shipping_zones
ALTER TABLE public.shipping_zones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can manage shipping zones" ON public.shipping_zones;
DROP POLICY IF EXISTS "Public can view shipping zones" ON public.shipping_zones;
DROP POLICY IF EXISTS "shipping_zones_anon_select" ON public.shipping_zones;
DROP POLICY IF EXISTS "shipping_zones_select_policy" ON public.shipping_zones;
DROP POLICY IF EXISTS "shipping_zones_admin_insert" ON public.shipping_zones;
DROP POLICY IF EXISTS "shipping_zones_admin_update" ON public.shipping_zones;
DROP POLICY IF EXISTS "shipping_zones_admin_delete" ON public.shipping_zones;

CREATE POLICY "shipping_zones_anon_select" ON public.shipping_zones
  FOR SELECT TO anon USING (COALESCE(is_active, false) = true);
CREATE POLICY "shipping_zones_select_policy" ON public.shipping_zones
  FOR SELECT TO authenticated
  USING ((COALESCE(is_active, false) = true) OR (SELECT public.is_admin()));
CREATE POLICY "shipping_zones_admin_insert" ON public.shipping_zones
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "shipping_zones_admin_update" ON public.shipping_zones
  FOR UPDATE TO authenticated USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "shipping_zones_admin_delete" ON public.shipping_zones
  FOR DELETE TO authenticated USING ((SELECT public.is_admin()));

-- 10. shipping_rates
ALTER TABLE public.shipping_rates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can manage shipping rates" ON public.shipping_rates;
DROP POLICY IF EXISTS "Public can view shipping rates" ON public.shipping_rates;
DROP POLICY IF EXISTS "shipping_rates_anon_select" ON public.shipping_rates;
DROP POLICY IF EXISTS "shipping_rates_select_policy" ON public.shipping_rates;
DROP POLICY IF EXISTS "shipping_rates_admin_insert" ON public.shipping_rates;
DROP POLICY IF EXISTS "shipping_rates_admin_update" ON public.shipping_rates;
DROP POLICY IF EXISTS "shipping_rates_admin_delete" ON public.shipping_rates;

CREATE POLICY "shipping_rates_anon_select" ON public.shipping_rates
  FOR SELECT TO anon USING (COALESCE(is_active, false) = true);
CREATE POLICY "shipping_rates_select_policy" ON public.shipping_rates
  FOR SELECT TO authenticated
  USING ((COALESCE(is_active, false) = true) OR (SELECT public.is_admin()));
CREATE POLICY "shipping_rates_admin_insert" ON public.shipping_rates
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "shipping_rates_admin_update" ON public.shipping_rates
  FOR UPDATE TO authenticated USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "shipping_rates_admin_delete" ON public.shipping_rates
  FOR DELETE TO authenticated USING ((SELECT public.is_admin()));

-- 11. product_reviews (customer submissions use submitProductReviewServerFn -> service_role so status & verified purchase cannot be forged)
ALTER TABLE public.product_reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Customers can create reviews" ON public.product_reviews;
DROP POLICY IF EXISTS "Public can view approved reviews" ON public.product_reviews;
DROP POLICY IF EXISTS "product_reviews_anon_select" ON public.product_reviews;
DROP POLICY IF EXISTS "product_reviews_select_policy" ON public.product_reviews;
DROP POLICY IF EXISTS "product_reviews_admin_insert" ON public.product_reviews;
DROP POLICY IF EXISTS "product_reviews_admin_update" ON public.product_reviews;
DROP POLICY IF EXISTS "product_reviews_admin_delete" ON public.product_reviews;

CREATE POLICY "product_reviews_anon_select" ON public.product_reviews
  FOR SELECT TO anon USING (status = 'approved');
CREATE POLICY "product_reviews_select_policy" ON public.product_reviews
  FOR SELECT TO authenticated
  USING (
    status = 'approved'
    OR (
      (SELECT auth.uid()) IS NOT NULL
      AND (
        customer_auth_uid = ((SELECT auth.uid())::text)
        OR EXISTS (
          SELECT 1 FROM public.customers c
          WHERE c.id = product_reviews.customer_id
            AND (c.id = (SELECT auth.uid()) OR c.auth_provider_uid = ((SELECT auth.uid())::text))
        )
        OR (SELECT public.is_admin())
      )
    )
  );
CREATE POLICY "product_reviews_admin_insert" ON public.product_reviews
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "product_reviews_admin_update" ON public.product_reviews
  FOR UPDATE TO authenticated USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "product_reviews_admin_delete" ON public.product_reviews
  FOR DELETE TO authenticated USING ((SELECT public.is_admin()));

-- -----------------------------------------------------------------------------
-- Group B: Customer Identity, Profile, Address Book, Cart & Wishlist (12 tables)
-- Strict TO authenticated owner OR is_admin(); zero anon access
-- -----------------------------------------------------------------------------

-- 12. profiles (id uuid = auth.uid())
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Service role full access profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_policy" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_policy" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_policy" ON public.profiles;
DROP POLICY IF EXISTS "profiles_delete_policy" ON public.profiles;

CREATE POLICY "profiles_select_policy" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()) OR (SELECT public.is_admin()));
CREATE POLICY "profiles_insert_policy" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = (SELECT auth.uid()) OR (SELECT public.is_admin()));
CREATE POLICY "profiles_update_policy" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()) OR (SELECT public.is_admin()))
  WITH CHECK (id = (SELECT auth.uid()) OR (SELECT public.is_admin()));
CREATE POLICY "profiles_delete_policy" ON public.profiles
  FOR DELETE TO authenticated
  USING ((SELECT public.is_admin()));

-- 13. customers (id uuid, auth_provider_uid text)
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Customer self insert" ON public.customers;
DROP POLICY IF EXISTS "Customer self read and update" ON public.customers;
DROP POLICY IF EXISTS "Customer self update" ON public.customers;
DROP POLICY IF EXISTS "customers_select_policy" ON public.customers;
DROP POLICY IF EXISTS "customers_insert_policy" ON public.customers;
DROP POLICY IF EXISTS "customers_update_policy" ON public.customers;
DROP POLICY IF EXISTS "customers_delete_policy" ON public.customers;

CREATE POLICY "customers_select_policy" ON public.customers
  FOR SELECT TO authenticated
  USING (
    id = (SELECT auth.uid())
    OR auth_provider_uid = ((SELECT auth.uid())::text)
    OR (SELECT public.is_admin())
  );
CREATE POLICY "customers_insert_policy" ON public.customers
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "customers_update_policy" ON public.customers
  FOR UPDATE TO authenticated
  USING (
    id = (SELECT auth.uid())
    OR auth_provider_uid = ((SELECT auth.uid())::text)
    OR (SELECT public.is_admin())
  )
  WITH CHECK (
    id = (SELECT auth.uid())
    OR auth_provider_uid = ((SELECT auth.uid())::text)
    OR (SELECT public.is_admin())
  );
CREATE POLICY "customers_delete_policy" ON public.customers
  FOR DELETE TO authenticated
  USING ((SELECT public.is_admin()));

-- 14. customer_auth_providers
ALTER TABLE public.customer_auth_providers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "customer_auth_providers_admin_select" ON public.customer_auth_providers;
DROP POLICY IF EXISTS "customer_auth_providers_admin_insert" ON public.customer_auth_providers;
DROP POLICY IF EXISTS "customer_auth_providers_admin_update" ON public.customer_auth_providers;
DROP POLICY IF EXISTS "customer_auth_providers_admin_delete" ON public.customer_auth_providers;

CREATE POLICY "customer_auth_providers_admin_select" ON public.customer_auth_providers
  FOR SELECT TO authenticated USING ((SELECT public.is_admin()));
CREATE POLICY "customer_auth_providers_admin_insert" ON public.customer_auth_providers
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "customer_auth_providers_admin_update" ON public.customer_auth_providers
  FOR UPDATE TO authenticated USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "customer_auth_providers_admin_delete" ON public.customer_auth_providers
  FOR DELETE TO authenticated USING ((SELECT public.is_admin()));

-- 15. customer_profiles (id text)
ALTER TABLE public.customer_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read profiles" ON public.customer_profiles;
DROP POLICY IF EXISTS "Users insert own profile" ON public.customer_profiles;
DROP POLICY IF EXISTS "Users read own profile" ON public.customer_profiles;
DROP POLICY IF EXISTS "Users update own profile" ON public.customer_profiles;
DROP POLICY IF EXISTS "Users write own profile" ON public.customer_profiles;
DROP POLICY IF EXISTS "customer_profiles_select_policy" ON public.customer_profiles;
DROP POLICY IF EXISTS "customer_profiles_insert_policy" ON public.customer_profiles;
DROP POLICY IF EXISTS "customer_profiles_update_policy" ON public.customer_profiles;
DROP POLICY IF EXISTS "customer_profiles_delete_policy" ON public.customer_profiles;

CREATE POLICY "customer_profiles_select_policy" ON public.customer_profiles
  FOR SELECT TO authenticated
  USING (id = ((SELECT auth.uid())::text) OR (SELECT public.is_admin()));
CREATE POLICY "customer_profiles_insert_policy" ON public.customer_profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = ((SELECT auth.uid())::text) OR (SELECT public.is_admin()));
CREATE POLICY "customer_profiles_update_policy" ON public.customer_profiles
  FOR UPDATE TO authenticated
  USING (id = ((SELECT auth.uid())::text) OR (SELECT public.is_admin()))
  WITH CHECK (id = ((SELECT auth.uid())::text) OR (SELECT public.is_admin()));
CREATE POLICY "customer_profiles_delete_policy" ON public.customer_profiles
  FOR DELETE TO authenticated
  USING ((SELECT public.is_admin()));

-- 16. customer_welcome (user_id text — AGENTS.md: immutable own-account welcome completion)
ALTER TABLE public.customer_welcome ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Manage own welcome" ON public.customer_welcome;
DROP POLICY IF EXISTS "customer_welcome_select_policy" ON public.customer_welcome;
DROP POLICY IF EXISTS "customer_welcome_insert_policy" ON public.customer_welcome;
DROP POLICY IF EXISTS "customer_welcome_admin_update" ON public.customer_welcome;
DROP POLICY IF EXISTS "customer_welcome_admin_delete" ON public.customer_welcome;

CREATE POLICY "customer_welcome_select_policy" ON public.customer_welcome
  FOR SELECT TO authenticated
  USING (user_id = ((SELECT auth.uid())::text) OR (SELECT public.is_admin()));
CREATE POLICY "customer_welcome_insert_policy" ON public.customer_welcome
  FOR INSERT TO authenticated
  WITH CHECK (user_id = ((SELECT auth.uid())::text) OR (SELECT public.is_admin()));
CREATE POLICY "customer_welcome_admin_update" ON public.customer_welcome
  FOR UPDATE TO authenticated USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "customer_welcome_admin_delete" ON public.customer_welcome
  FOR DELETE TO authenticated USING ((SELECT public.is_admin()));

-- 17. customer_carts (user_id text)
ALTER TABLE public.customer_carts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Manage own carts" ON public.customer_carts;
DROP POLICY IF EXISTS "customer_carts_select_policy" ON public.customer_carts;
DROP POLICY IF EXISTS "customer_carts_insert_policy" ON public.customer_carts;
DROP POLICY IF EXISTS "customer_carts_update_policy" ON public.customer_carts;
DROP POLICY IF EXISTS "customer_carts_delete_policy" ON public.customer_carts;

CREATE POLICY "customer_carts_select_policy" ON public.customer_carts
  FOR SELECT TO authenticated
  USING (user_id = ((SELECT auth.uid())::text) OR (SELECT public.is_admin()));
CREATE POLICY "customer_carts_insert_policy" ON public.customer_carts
  FOR INSERT TO authenticated
  WITH CHECK (user_id = ((SELECT auth.uid())::text) OR (SELECT public.is_admin()));
CREATE POLICY "customer_carts_update_policy" ON public.customer_carts
  FOR UPDATE TO authenticated
  USING (user_id = ((SELECT auth.uid())::text) OR (SELECT public.is_admin()))
  WITH CHECK (user_id = ((SELECT auth.uid())::text) OR (SELECT public.is_admin()));
CREATE POLICY "customer_carts_delete_policy" ON public.customer_carts
  FOR DELETE TO authenticated
  USING (user_id = ((SELECT auth.uid())::text) OR (SELECT public.is_admin()));

-- 18. customer_addresses (customer_id uuid, customer_auth_uid text)
ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Customer self address access" ON public.customer_addresses;
DROP POLICY IF EXISTS "Users can delete own addresses" ON public.customer_addresses;
DROP POLICY IF EXISTS "Users can insert own addresses" ON public.customer_addresses;
DROP POLICY IF EXISTS "Users can read own addresses" ON public.customer_addresses;
DROP POLICY IF EXISTS "Users can update own addresses" ON public.customer_addresses;
DROP POLICY IF EXISTS "customer_addresses_select_policy" ON public.customer_addresses;
DROP POLICY IF EXISTS "customer_addresses_insert_policy" ON public.customer_addresses;
DROP POLICY IF EXISTS "customer_addresses_update_policy" ON public.customer_addresses;
DROP POLICY IF EXISTS "customer_addresses_delete_policy" ON public.customer_addresses;

CREATE POLICY "customer_addresses_select_policy" ON public.customer_addresses
  FOR SELECT TO authenticated
  USING (
    customer_auth_uid = ((SELECT auth.uid())::text)
    OR customer_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = customer_addresses.customer_id
        AND (c.id = (SELECT auth.uid()) OR c.auth_provider_uid = ((SELECT auth.uid())::text))
    )
    OR (SELECT public.is_admin())
  );
CREATE POLICY "customer_addresses_insert_policy" ON public.customer_addresses
  FOR INSERT TO authenticated
  WITH CHECK (
    customer_auth_uid = ((SELECT auth.uid())::text)
    OR customer_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = customer_addresses.customer_id
        AND (c.id = (SELECT auth.uid()) OR c.auth_provider_uid = ((SELECT auth.uid())::text))
    )
    OR (SELECT public.is_admin())
  );
CREATE POLICY "customer_addresses_update_policy" ON public.customer_addresses
  FOR UPDATE TO authenticated
  USING (
    customer_auth_uid = ((SELECT auth.uid())::text)
    OR customer_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = customer_addresses.customer_id
        AND (c.id = (SELECT auth.uid()) OR c.auth_provider_uid = ((SELECT auth.uid())::text))
    )
    OR (SELECT public.is_admin())
  )
  WITH CHECK (
    customer_auth_uid = ((SELECT auth.uid())::text)
    OR customer_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = customer_addresses.customer_id
        AND (c.id = (SELECT auth.uid()) OR c.auth_provider_uid = ((SELECT auth.uid())::text))
    )
    OR (SELECT public.is_admin())
  );
CREATE POLICY "customer_addresses_delete_policy" ON public.customer_addresses
  FOR DELETE TO authenticated
  USING (
    customer_auth_uid = ((SELECT auth.uid())::text)
    OR customer_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = customer_addresses.customer_id
        AND (c.id = (SELECT auth.uid()) OR c.auth_provider_uid = ((SELECT auth.uid())::text))
    )
    OR (SELECT public.is_admin())
  );

-- 19. carts
ALTER TABLE public.carts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Cart owner access" ON public.carts;
DROP POLICY IF EXISTS "carts_select_policy" ON public.carts;
DROP POLICY IF EXISTS "carts_insert_policy" ON public.carts;
DROP POLICY IF EXISTS "carts_update_policy" ON public.carts;
DROP POLICY IF EXISTS "carts_delete_policy" ON public.carts;

CREATE POLICY "carts_select_policy" ON public.carts
  FOR SELECT TO authenticated
  USING (
    customer_auth_uid = ((SELECT auth.uid())::text)
    OR customer_id = (SELECT auth.uid())
    OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id = carts.customer_id AND (c.id = (SELECT auth.uid()) OR c.auth_provider_uid = ((SELECT auth.uid())::text)))
    OR (SELECT public.is_admin())
  );
CREATE POLICY "carts_insert_policy" ON public.carts
  FOR INSERT TO authenticated
  WITH CHECK (
    customer_auth_uid = ((SELECT auth.uid())::text)
    OR customer_id = (SELECT auth.uid())
    OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id = carts.customer_id AND (c.id = (SELECT auth.uid()) OR c.auth_provider_uid = ((SELECT auth.uid())::text)))
    OR (SELECT public.is_admin())
  );
CREATE POLICY "carts_update_policy" ON public.carts
  FOR UPDATE TO authenticated
  USING (
    customer_auth_uid = ((SELECT auth.uid())::text)
    OR customer_id = (SELECT auth.uid())
    OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id = carts.customer_id AND (c.id = (SELECT auth.uid()) OR c.auth_provider_uid = ((SELECT auth.uid())::text)))
    OR (SELECT public.is_admin())
  )
  WITH CHECK (
    customer_auth_uid = ((SELECT auth.uid())::text)
    OR customer_id = (SELECT auth.uid())
    OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id = carts.customer_id AND (c.id = (SELECT auth.uid()) OR c.auth_provider_uid = ((SELECT auth.uid())::text)))
    OR (SELECT public.is_admin())
  );
CREATE POLICY "carts_delete_policy" ON public.carts
  FOR DELETE TO authenticated
  USING (
    customer_auth_uid = ((SELECT auth.uid())::text)
    OR customer_id = (SELECT auth.uid())
    OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id = carts.customer_id AND (c.id = (SELECT auth.uid()) OR c.auth_provider_uid = ((SELECT auth.uid())::text)))
    OR (SELECT public.is_admin())
  );

-- 20. cart_items
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Cart items owner access" ON public.cart_items;
DROP POLICY IF EXISTS "cart_items_select_policy" ON public.cart_items;
DROP POLICY IF EXISTS "cart_items_insert_policy" ON public.cart_items;
DROP POLICY IF EXISTS "cart_items_update_policy" ON public.cart_items;
DROP POLICY IF EXISTS "cart_items_delete_policy" ON public.cart_items;

CREATE POLICY "cart_items_select_policy" ON public.cart_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.carts ct
      WHERE ct.id = cart_items.cart_id
        AND (
          ct.customer_auth_uid = ((SELECT auth.uid())::text)
          OR ct.customer_id = (SELECT auth.uid())
          OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id = ct.customer_id AND (c.id = (SELECT auth.uid()) OR c.auth_provider_uid = ((SELECT auth.uid())::text)))
        )
    )
    OR (SELECT public.is_admin())
  );
CREATE POLICY "cart_items_insert_policy" ON public.cart_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.carts ct
      WHERE ct.id = cart_items.cart_id
        AND (
          ct.customer_auth_uid = ((SELECT auth.uid())::text)
          OR ct.customer_id = (SELECT auth.uid())
          OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id = ct.customer_id AND (c.id = (SELECT auth.uid()) OR c.auth_provider_uid = ((SELECT auth.uid())::text)))
        )
    )
    OR (SELECT public.is_admin())
  );
CREATE POLICY "cart_items_update_policy" ON public.cart_items
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.carts ct
      WHERE ct.id = cart_items.cart_id
        AND (
          ct.customer_auth_uid = ((SELECT auth.uid())::text)
          OR ct.customer_id = (SELECT auth.uid())
          OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id = ct.customer_id AND (c.id = (SELECT auth.uid()) OR c.auth_provider_uid = ((SELECT auth.uid())::text)))
        )
    )
    OR (SELECT public.is_admin())
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.carts ct
      WHERE ct.id = cart_items.cart_id
        AND (
          ct.customer_auth_uid = ((SELECT auth.uid())::text)
          OR ct.customer_id = (SELECT auth.uid())
          OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id = ct.customer_id AND (c.id = (SELECT auth.uid()) OR c.auth_provider_uid = ((SELECT auth.uid())::text)))
        )
    )
    OR (SELECT public.is_admin())
  );
CREATE POLICY "cart_items_delete_policy" ON public.cart_items
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.carts ct
      WHERE ct.id = cart_items.cart_id
        AND (
          ct.customer_auth_uid = ((SELECT auth.uid())::text)
          OR ct.customer_id = (SELECT auth.uid())
          OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id = ct.customer_id AND (c.id = (SELECT auth.uid()) OR c.auth_provider_uid = ((SELECT auth.uid())::text)))
        )
    )
    OR (SELECT public.is_admin())
  );

-- 21. wishlists
ALTER TABLE public.wishlists ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Wishlist owner access" ON public.wishlists;
DROP POLICY IF EXISTS "wishlists_select_policy" ON public.wishlists;
DROP POLICY IF EXISTS "wishlists_insert_policy" ON public.wishlists;
DROP POLICY IF EXISTS "wishlists_update_policy" ON public.wishlists;
DROP POLICY IF EXISTS "wishlists_delete_policy" ON public.wishlists;

CREATE POLICY "wishlists_select_policy" ON public.wishlists
  FOR SELECT TO authenticated
  USING (
    customer_auth_uid = ((SELECT auth.uid())::text)
    OR customer_id = (SELECT auth.uid())
    OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id = wishlists.customer_id AND (c.id = (SELECT auth.uid()) OR c.auth_provider_uid = ((SELECT auth.uid())::text)))
    OR (SELECT public.is_admin())
  );
CREATE POLICY "wishlists_insert_policy" ON public.wishlists
  FOR INSERT TO authenticated
  WITH CHECK (
    customer_auth_uid = ((SELECT auth.uid())::text)
    OR customer_id = (SELECT auth.uid())
    OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id = wishlists.customer_id AND (c.id = (SELECT auth.uid()) OR c.auth_provider_uid = ((SELECT auth.uid())::text)))
    OR (SELECT public.is_admin())
  );
CREATE POLICY "wishlists_update_policy" ON public.wishlists
  FOR UPDATE TO authenticated
  USING (
    customer_auth_uid = ((SELECT auth.uid())::text)
    OR customer_id = (SELECT auth.uid())
    OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id = wishlists.customer_id AND (c.id = (SELECT auth.uid()) OR c.auth_provider_uid = ((SELECT auth.uid())::text)))
    OR (SELECT public.is_admin())
  )
  WITH CHECK (
    customer_auth_uid = ((SELECT auth.uid())::text)
    OR customer_id = (SELECT auth.uid())
    OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id = wishlists.customer_id AND (c.id = (SELECT auth.uid()) OR c.auth_provider_uid = ((SELECT auth.uid())::text)))
    OR (SELECT public.is_admin())
  );
CREATE POLICY "wishlists_delete_policy" ON public.wishlists
  FOR DELETE TO authenticated
  USING (
    customer_auth_uid = ((SELECT auth.uid())::text)
    OR customer_id = (SELECT auth.uid())
    OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id = wishlists.customer_id AND (c.id = (SELECT auth.uid()) OR c.auth_provider_uid = ((SELECT auth.uid())::text)))
    OR (SELECT public.is_admin())
  );

-- 22. wishlist_items
ALTER TABLE public.wishlist_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Wishlist items owner access" ON public.wishlist_items;
DROP POLICY IF EXISTS "wishlist_items_select_policy" ON public.wishlist_items;
DROP POLICY IF EXISTS "wishlist_items_insert_policy" ON public.wishlist_items;
DROP POLICY IF EXISTS "wishlist_items_update_policy" ON public.wishlist_items;
DROP POLICY IF EXISTS "wishlist_items_delete_policy" ON public.wishlist_items;

CREATE POLICY "wishlist_items_select_policy" ON public.wishlist_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.wishlists w
      WHERE w.id = wishlist_items.wishlist_id
        AND (
          w.customer_auth_uid = ((SELECT auth.uid())::text)
          OR w.customer_id = (SELECT auth.uid())
          OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id = w.customer_id AND (c.id = (SELECT auth.uid()) OR c.auth_provider_uid = ((SELECT auth.uid())::text)))
        )
    )
    OR (SELECT public.is_admin())
  );
CREATE POLICY "wishlist_items_insert_policy" ON public.wishlist_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.wishlists w
      WHERE w.id = wishlist_items.wishlist_id
        AND (
          w.customer_auth_uid = ((SELECT auth.uid())::text)
          OR w.customer_id = (SELECT auth.uid())
          OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id = w.customer_id AND (c.id = (SELECT auth.uid()) OR c.auth_provider_uid = ((SELECT auth.uid())::text)))
        )
    )
    OR (SELECT public.is_admin())
  );
CREATE POLICY "wishlist_items_update_policy" ON public.wishlist_items
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.wishlists w
      WHERE w.id = wishlist_items.wishlist_id
        AND (
          w.customer_auth_uid = ((SELECT auth.uid())::text)
          OR w.customer_id = (SELECT auth.uid())
          OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id = w.customer_id AND (c.id = (SELECT auth.uid()) OR c.auth_provider_uid = ((SELECT auth.uid())::text)))
        )
    )
    OR (SELECT public.is_admin())
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.wishlists w
      WHERE w.id = wishlist_items.wishlist_id
        AND (
          w.customer_auth_uid = ((SELECT auth.uid())::text)
          OR w.customer_id = (SELECT auth.uid())
          OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id = w.customer_id AND (c.id = (SELECT auth.uid()) OR c.auth_provider_uid = ((SELECT auth.uid())::text)))
        )
    )
    OR (SELECT public.is_admin())
  );
CREATE POLICY "wishlist_items_delete_policy" ON public.wishlist_items
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.wishlists w
      WHERE w.id = wishlist_items.wishlist_id
        AND (
          w.customer_auth_uid = ((SELECT auth.uid())::text)
          OR w.customer_id = (SELECT auth.uid())
          OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id = w.customer_id AND (c.id = (SELECT auth.uid()) OR c.auth_provider_uid = ((SELECT auth.uid())::text)))
        )
    )
    OR (SELECT public.is_admin())
  );

-- 23. notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Customers can view own notifications" ON public.notifications;
DROP POLICY IF EXISTS "notifications_select_policy" ON public.notifications;
DROP POLICY IF EXISTS "notifications_insert_policy" ON public.notifications;
DROP POLICY IF EXISTS "notifications_update_policy" ON public.notifications;
DROP POLICY IF EXISTS "notifications_delete_policy" ON public.notifications;

CREATE POLICY "notifications_select_policy" ON public.notifications
  FOR SELECT TO authenticated
  USING (
    customer_auth_uid = ((SELECT auth.uid())::text)
    OR customer_id = (SELECT auth.uid())
    OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id = notifications.customer_id AND (c.id = (SELECT auth.uid()) OR c.auth_provider_uid = ((SELECT auth.uid())::text)))
    OR (SELECT public.is_admin())
  );
CREATE POLICY "notifications_insert_policy" ON public.notifications
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "notifications_update_policy" ON public.notifications
  FOR UPDATE TO authenticated
  USING (
    customer_auth_uid = ((SELECT auth.uid())::text)
    OR customer_id = (SELECT auth.uid())
    OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id = notifications.customer_id AND (c.id = (SELECT auth.uid()) OR c.auth_provider_uid = ((SELECT auth.uid())::text)))
    OR (SELECT public.is_admin())
  )
  WITH CHECK (
    customer_auth_uid = ((SELECT auth.uid())::text)
    OR customer_id = (SELECT auth.uid())
    OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id = notifications.customer_id AND (c.id = (SELECT auth.uid()) OR c.auth_provider_uid = ((SELECT auth.uid())::text)))
    OR (SELECT public.is_admin())
  );
CREATE POLICY "notifications_delete_policy" ON public.notifications
  FOR DELETE TO authenticated USING ((SELECT public.is_admin()));

-- -----------------------------------------------------------------------------
-- Group C: Orders, Payments, Refunds, Shipments, Returns, Coupons & Support (18 tables)
-- Checkout & payment writes execute strictly via server functions (service_role)
-- Owners retain SELECT for Realtime/account views; admins manage operational actions
-- -----------------------------------------------------------------------------

-- 24. orders
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins have full access to orders" ON public.orders;
DROP POLICY IF EXISTS "Orders insert policy" ON public.orders;
DROP POLICY IF EXISTS "Orders read policy" ON public.orders;
DROP POLICY IF EXISTS "Orders update policy" ON public.orders;
DROP POLICY IF EXISTS "orders_select_policy" ON public.orders;
DROP POLICY IF EXISTS "orders_admin_insert" ON public.orders;
DROP POLICY IF EXISTS "orders_admin_update" ON public.orders;
DROP POLICY IF EXISTS "orders_admin_delete" ON public.orders;

CREATE POLICY "orders_select_policy" ON public.orders
  FOR SELECT TO authenticated
  USING (
    user_id = ((SELECT auth.uid())::text)
    OR customer_id = (SELECT auth.uid())
    OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id = orders.customer_id AND (c.id = (SELECT auth.uid()) OR c.auth_provider_uid = ((SELECT auth.uid())::text)))
    OR (SELECT public.is_admin())
  );
CREATE POLICY "orders_admin_insert" ON public.orders
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "orders_admin_update" ON public.orders
  FOR UPDATE TO authenticated USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "orders_admin_delete" ON public.orders
  FOR DELETE TO authenticated USING ((SELECT public.is_admin()));

-- 25. order_items
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Insert order items" ON public.order_items;
DROP POLICY IF EXISTS "Order items insert during checkout" ON public.order_items;
DROP POLICY IF EXISTS "Order items owner access" ON public.order_items;
DROP POLICY IF EXISTS "Read order items" ON public.order_items;
DROP POLICY IF EXISTS "order_items_select_policy" ON public.order_items;
DROP POLICY IF EXISTS "order_items_admin_insert" ON public.order_items;
DROP POLICY IF EXISTS "order_items_admin_update" ON public.order_items;
DROP POLICY IF EXISTS "order_items_admin_delete" ON public.order_items;

CREATE POLICY "order_items_select_policy" ON public.order_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND (
          o.user_id = ((SELECT auth.uid())::text)
          OR o.customer_id = (SELECT auth.uid())
          OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id = o.customer_id AND (c.id = (SELECT auth.uid()) OR c.auth_provider_uid = ((SELECT auth.uid())::text)))
        )
    )
    OR (SELECT public.is_admin())
  );
CREATE POLICY "order_items_admin_insert" ON public.order_items
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "order_items_admin_update" ON public.order_items
  FOR UPDATE TO authenticated USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "order_items_admin_delete" ON public.order_items
  FOR DELETE TO authenticated USING ((SELECT public.is_admin()));

-- 26. order_addresses
ALTER TABLE public.order_addresses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Order addresses insert during checkout" ON public.order_addresses;
DROP POLICY IF EXISTS "Order addresses owner access" ON public.order_addresses;
DROP POLICY IF EXISTS "order_addresses_select_policy" ON public.order_addresses;
DROP POLICY IF EXISTS "order_addresses_admin_insert" ON public.order_addresses;
DROP POLICY IF EXISTS "order_addresses_admin_update" ON public.order_addresses;
DROP POLICY IF EXISTS "order_addresses_admin_delete" ON public.order_addresses;

CREATE POLICY "order_addresses_select_policy" ON public.order_addresses
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_addresses.order_id
        AND (
          o.user_id = ((SELECT auth.uid())::text)
          OR o.customer_id = (SELECT auth.uid())
          OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id = o.customer_id AND (c.id = (SELECT auth.uid()) OR c.auth_provider_uid = ((SELECT auth.uid())::text)))
        )
    )
    OR (SELECT public.is_admin())
  );
CREATE POLICY "order_addresses_admin_insert" ON public.order_addresses
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "order_addresses_admin_update" ON public.order_addresses
  FOR UPDATE TO authenticated USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "order_addresses_admin_delete" ON public.order_addresses
  FOR DELETE TO authenticated USING ((SELECT public.is_admin()));

-- 27. order_notes
ALTER TABLE public.order_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage all order notes" ON public.order_notes;
DROP POLICY IF EXISTS "Customers view visible order notes" ON public.order_notes;
DROP POLICY IF EXISTS "order_notes_select_policy" ON public.order_notes;
DROP POLICY IF EXISTS "order_notes_admin_insert" ON public.order_notes;
DROP POLICY IF EXISTS "order_notes_admin_update" ON public.order_notes;
DROP POLICY IF EXISTS "order_notes_admin_delete" ON public.order_notes;

CREATE POLICY "order_notes_select_policy" ON public.order_notes
  FOR SELECT TO authenticated
  USING (
    (
      is_customer_visible = true
      AND EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.id = order_notes.order_id
          AND (
            o.user_id = ((SELECT auth.uid())::text)
            OR o.customer_id = (SELECT auth.uid())
            OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id = o.customer_id AND (c.id = (SELECT auth.uid()) OR c.auth_provider_uid = ((SELECT auth.uid())::text)))
          )
      )
    )
    OR (SELECT public.is_admin())
  );
CREATE POLICY "order_notes_admin_insert" ON public.order_notes
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "order_notes_admin_update" ON public.order_notes
  FOR UPDATE TO authenticated USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "order_notes_admin_delete" ON public.order_notes
  FOR DELETE TO authenticated USING ((SELECT public.is_admin()));

-- 28. order_status_history
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Order status history read" ON public.order_status_history;
DROP POLICY IF EXISTS "order_status_history_select_policy" ON public.order_status_history;
DROP POLICY IF EXISTS "order_status_history_admin_insert" ON public.order_status_history;
DROP POLICY IF EXISTS "order_status_history_admin_update" ON public.order_status_history;
DROP POLICY IF EXISTS "order_status_history_admin_delete" ON public.order_status_history;

CREATE POLICY "order_status_history_select_policy" ON public.order_status_history
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_status_history.order_id
        AND (
          o.user_id = ((SELECT auth.uid())::text)
          OR o.customer_id = (SELECT auth.uid())
          OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id = o.customer_id AND (c.id = (SELECT auth.uid()) OR c.auth_provider_uid = ((SELECT auth.uid())::text)))
        )
    )
    OR (SELECT public.is_admin())
  );
CREATE POLICY "order_status_history_admin_insert" ON public.order_status_history
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "order_status_history_admin_update" ON public.order_status_history
  FOR UPDATE TO authenticated USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "order_status_history_admin_delete" ON public.order_status_history
  FOR DELETE TO authenticated USING ((SELECT public.is_admin()));

-- 29. payments
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Insert payments" ON public.payments;
DROP POLICY IF EXISTS "Payments customer view" ON public.payments;
DROP POLICY IF EXISTS "Read payments" ON public.payments;
DROP POLICY IF EXISTS "Users can read own payments" ON public.payments;
DROP POLICY IF EXISTS "payments_select_policy" ON public.payments;
DROP POLICY IF EXISTS "payments_admin_insert" ON public.payments;
DROP POLICY IF EXISTS "payments_admin_update" ON public.payments;
DROP POLICY IF EXISTS "payments_admin_delete" ON public.payments;

CREATE POLICY "payments_select_policy" ON public.payments
  FOR SELECT TO authenticated
  USING (
    user_id = ((SELECT auth.uid())::text)
    OR EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = payments.order_id
        AND (
          o.user_id = ((SELECT auth.uid())::text)
          OR o.customer_id = (SELECT auth.uid())
          OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id = o.customer_id AND (c.id = (SELECT auth.uid()) OR c.auth_provider_uid = ((SELECT auth.uid())::text)))
        )
    )
    OR (SELECT public.is_admin())
  );
CREATE POLICY "payments_admin_insert" ON public.payments
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "payments_admin_update" ON public.payments
  FOR UPDATE TO authenticated USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "payments_admin_delete" ON public.payments
  FOR DELETE TO authenticated USING ((SELECT public.is_admin()));

-- 30. payment_refunds (canonical refunds source)
ALTER TABLE public.payment_refunds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage refunds" ON public.payment_refunds;
DROP POLICY IF EXISTS "Customers view own refunds" ON public.payment_refunds;
DROP POLICY IF EXISTS "payment_refunds_select_policy" ON public.payment_refunds;
DROP POLICY IF EXISTS "payment_refunds_admin_insert" ON public.payment_refunds;
DROP POLICY IF EXISTS "payment_refunds_admin_update" ON public.payment_refunds;
DROP POLICY IF EXISTS "payment_refunds_admin_delete" ON public.payment_refunds;

CREATE POLICY "payment_refunds_select_policy" ON public.payment_refunds
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = payment_refunds.order_id
        AND (
          o.user_id = ((SELECT auth.uid())::text)
          OR o.customer_id = (SELECT auth.uid())
          OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id = o.customer_id AND (c.id = (SELECT auth.uid()) OR c.auth_provider_uid = ((SELECT auth.uid())::text)))
        )
    )
    OR (SELECT public.is_admin())
  );
CREATE POLICY "payment_refunds_admin_insert" ON public.payment_refunds
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "payment_refunds_admin_update" ON public.payment_refunds
  FOR UPDATE TO authenticated USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "payment_refunds_admin_delete" ON public.payment_refunds
  FOR DELETE TO authenticated USING ((SELECT public.is_admin()));

-- 31. refunds (legacy read fallback; locked to owner/admin)
ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read refunds" ON public.refunds;
DROP POLICY IF EXISTS "Refunds view" ON public.refunds;
DROP POLICY IF EXISTS "refunds_select_policy" ON public.refunds;
DROP POLICY IF EXISTS "refunds_admin_insert" ON public.refunds;
DROP POLICY IF EXISTS "refunds_admin_update" ON public.refunds;
DROP POLICY IF EXISTS "refunds_admin_delete" ON public.refunds;

CREATE POLICY "refunds_select_policy" ON public.refunds
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = refunds.order_id
        AND (
          o.user_id = ((SELECT auth.uid())::text)
          OR o.customer_id = (SELECT auth.uid())
          OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id = o.customer_id AND (c.id = (SELECT auth.uid()) OR c.auth_provider_uid = ((SELECT auth.uid())::text)))
        )
    )
    OR (SELECT public.is_admin())
  );
CREATE POLICY "refunds_admin_insert" ON public.refunds
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "refunds_admin_update" ON public.refunds
  FOR UPDATE TO authenticated USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "refunds_admin_delete" ON public.refunds
  FOR DELETE TO authenticated USING ((SELECT public.is_admin()));

-- 32. shipments
ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Read shipments" ON public.shipments;
DROP POLICY IF EXISTS "shipments_select_policy" ON public.shipments;
DROP POLICY IF EXISTS "shipments_admin_insert" ON public.shipments;
DROP POLICY IF EXISTS "shipments_admin_update" ON public.shipments;
DROP POLICY IF EXISTS "shipments_admin_delete" ON public.shipments;

CREATE POLICY "shipments_select_policy" ON public.shipments
  FOR SELECT TO authenticated
  USING (
    user_id = ((SELECT auth.uid())::text)
    OR EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = shipments.order_id
        AND (
          o.user_id = ((SELECT auth.uid())::text)
          OR o.customer_id = (SELECT auth.uid())
          OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id = o.customer_id AND (c.id = (SELECT auth.uid()) OR c.auth_provider_uid = ((SELECT auth.uid())::text)))
        )
    )
    OR (SELECT public.is_admin())
  );
CREATE POLICY "shipments_admin_insert" ON public.shipments
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "shipments_admin_update" ON public.shipments
  FOR UPDATE TO authenticated USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "shipments_admin_delete" ON public.shipments
  FOR DELETE TO authenticated USING ((SELECT public.is_admin()));

-- 33. shipment_tracking_events (canonical shipment tracking events source)
ALTER TABLE public.shipment_tracking_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Shipment tracking events read" ON public.shipment_tracking_events;
DROP POLICY IF EXISTS "shipment_tracking_events_select_policy" ON public.shipment_tracking_events;
DROP POLICY IF EXISTS "shipment_tracking_events_admin_insert" ON public.shipment_tracking_events;
DROP POLICY IF EXISTS "shipment_tracking_events_admin_update" ON public.shipment_tracking_events;
DROP POLICY IF EXISTS "shipment_tracking_events_admin_delete" ON public.shipment_tracking_events;

CREATE POLICY "shipment_tracking_events_select_policy" ON public.shipment_tracking_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = shipment_tracking_events.order_id
        AND (
          o.user_id = ((SELECT auth.uid())::text)
          OR o.customer_id = (SELECT auth.uid())
          OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id = o.customer_id AND (c.id = (SELECT auth.uid()) OR c.auth_provider_uid = ((SELECT auth.uid())::text)))
        )
    )
    OR (SELECT public.is_admin())
  );
CREATE POLICY "shipment_tracking_events_admin_insert" ON public.shipment_tracking_events
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "shipment_tracking_events_admin_update" ON public.shipment_tracking_events
  FOR UPDATE TO authenticated USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "shipment_tracking_events_admin_delete" ON public.shipment_tracking_events
  FOR DELETE TO authenticated USING ((SELECT public.is_admin()));

-- 34. shipping_tracking (legacy tracking fallback)
ALTER TABLE public.shipping_tracking ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Read shipping tracking" ON public.shipping_tracking;
DROP POLICY IF EXISTS "shipping_tracking_select_policy" ON public.shipping_tracking;
DROP POLICY IF EXISTS "shipping_tracking_admin_insert" ON public.shipping_tracking;
DROP POLICY IF EXISTS "shipping_tracking_admin_update" ON public.shipping_tracking;
DROP POLICY IF EXISTS "shipping_tracking_admin_delete" ON public.shipping_tracking;

CREATE POLICY "shipping_tracking_select_policy" ON public.shipping_tracking
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = shipping_tracking.order_id
        AND (
          o.user_id = ((SELECT auth.uid())::text)
          OR o.customer_id = (SELECT auth.uid())
          OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id = o.customer_id AND (c.id = (SELECT auth.uid()) OR c.auth_provider_uid = ((SELECT auth.uid())::text)))
        )
    )
    OR (SELECT public.is_admin())
  );
CREATE POLICY "shipping_tracking_admin_insert" ON public.shipping_tracking
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "shipping_tracking_admin_update" ON public.shipping_tracking
  FOR UPDATE TO authenticated USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "shipping_tracking_admin_delete" ON public.shipping_tracking
  FOR DELETE TO authenticated USING ((SELECT public.is_admin()));

-- 35. shipping_addresses (legacy address table; previously public!)
ALTER TABLE public.shipping_addresses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Insert shipping addresses" ON public.shipping_addresses;
DROP POLICY IF EXISTS "Read shipping addresses" ON public.shipping_addresses;
DROP POLICY IF EXISTS "shipping_addresses_select_policy" ON public.shipping_addresses;
DROP POLICY IF EXISTS "shipping_addresses_admin_insert" ON public.shipping_addresses;
DROP POLICY IF EXISTS "shipping_addresses_admin_update" ON public.shipping_addresses;
DROP POLICY IF EXISTS "shipping_addresses_admin_delete" ON public.shipping_addresses;

CREATE POLICY "shipping_addresses_select_policy" ON public.shipping_addresses
  FOR SELECT TO authenticated
  USING (
    user_id = ((SELECT auth.uid())::text)
    OR EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = shipping_addresses.order_id
        AND (
          o.user_id = ((SELECT auth.uid())::text)
          OR o.customer_id = (SELECT auth.uid())
          OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id = o.customer_id AND (c.id = (SELECT auth.uid()) OR c.auth_provider_uid = ((SELECT auth.uid())::text)))
        )
    )
    OR (SELECT public.is_admin())
  );
CREATE POLICY "shipping_addresses_admin_insert" ON public.shipping_addresses
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "shipping_addresses_admin_update" ON public.shipping_addresses
  FOR UPDATE TO authenticated USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "shipping_addresses_admin_delete" ON public.shipping_addresses
  FOR DELETE TO authenticated USING ((SELECT public.is_admin()));

-- 36. returns
ALTER TABLE public.returns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Returns customer access" ON public.returns;
DROP POLICY IF EXISTS "Returns customer create" ON public.returns;
DROP POLICY IF EXISTS "returns_select_policy" ON public.returns;
DROP POLICY IF EXISTS "returns_insert_policy" ON public.returns;
DROP POLICY IF EXISTS "returns_admin_update" ON public.returns;
DROP POLICY IF EXISTS "returns_admin_delete" ON public.returns;

CREATE POLICY "returns_select_policy" ON public.returns
  FOR SELECT TO authenticated
  USING (
    customer_auth_uid = ((SELECT auth.uid())::text)
    OR customer_id = (SELECT auth.uid())
    OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id = returns.customer_id AND (c.id = (SELECT auth.uid()) OR c.auth_provider_uid = ((SELECT auth.uid())::text)))
    OR (SELECT public.is_admin())
  );
CREATE POLICY "returns_insert_policy" ON public.returns
  FOR INSERT TO authenticated
  WITH CHECK (
    customer_auth_uid = ((SELECT auth.uid())::text)
    OR customer_id = (SELECT auth.uid())
    OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id = returns.customer_id AND (c.id = (SELECT auth.uid()) OR c.auth_provider_uid = ((SELECT auth.uid())::text)))
    OR (SELECT public.is_admin())
  );
CREATE POLICY "returns_admin_update" ON public.returns
  FOR UPDATE TO authenticated USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "returns_admin_delete" ON public.returns
  FOR DELETE TO authenticated USING ((SELECT public.is_admin()));

-- 37. return_items
ALTER TABLE public.return_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Return items access" ON public.return_items;
DROP POLICY IF EXISTS "return_items_select_policy" ON public.return_items;
DROP POLICY IF EXISTS "return_items_insert_policy" ON public.return_items;
DROP POLICY IF EXISTS "return_items_admin_update" ON public.return_items;
DROP POLICY IF EXISTS "return_items_admin_delete" ON public.return_items;

CREATE POLICY "return_items_select_policy" ON public.return_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.returns r
      WHERE r.id = return_items.return_id
        AND (
          r.customer_auth_uid = ((SELECT auth.uid())::text)
          OR r.customer_id = (SELECT auth.uid())
          OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id = r.customer_id AND (c.id = (SELECT auth.uid()) OR c.auth_provider_uid = ((SELECT auth.uid())::text)))
        )
    )
    OR (SELECT public.is_admin())
  );
CREATE POLICY "return_items_insert_policy" ON public.return_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.returns r
      WHERE r.id = return_items.return_id
        AND (
          r.customer_auth_uid = ((SELECT auth.uid())::text)
          OR r.customer_id = (SELECT auth.uid())
          OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id = r.customer_id AND (c.id = (SELECT auth.uid()) OR c.auth_provider_uid = ((SELECT auth.uid())::text)))
        )
    )
    OR (SELECT public.is_admin())
  );
CREATE POLICY "return_items_admin_update" ON public.return_items
  FOR UPDATE TO authenticated USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "return_items_admin_delete" ON public.return_items
  FOR DELETE TO authenticated USING ((SELECT public.is_admin()));

-- 38. coupons (coupon validation runs server-side in validateCouponServerFn)
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage coupons" ON public.coupons;
DROP POLICY IF EXISTS "Public read active coupons" ON public.coupons;
DROP POLICY IF EXISTS "coupons_admin_select" ON public.coupons;
DROP POLICY IF EXISTS "coupons_admin_insert" ON public.coupons;
DROP POLICY IF EXISTS "coupons_admin_update" ON public.coupons;
DROP POLICY IF EXISTS "coupons_admin_delete" ON public.coupons;

CREATE POLICY "coupons_admin_select" ON public.coupons
  FOR SELECT TO authenticated USING ((SELECT public.is_admin()));
CREATE POLICY "coupons_admin_insert" ON public.coupons
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "coupons_admin_update" ON public.coupons
  FOR UPDATE TO authenticated USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "coupons_admin_delete" ON public.coupons
  FOR DELETE TO authenticated USING ((SELECT public.is_admin()));

-- 39. coupon_redemptions
ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage coupon redemptions" ON public.coupon_redemptions;
DROP POLICY IF EXISTS "Customers view own redemptions" ON public.coupon_redemptions;
DROP POLICY IF EXISTS "Service role manages coupon redemptions" ON public.coupon_redemptions;
DROP POLICY IF EXISTS "coupon_redemptions_select_policy" ON public.coupon_redemptions;
DROP POLICY IF EXISTS "coupon_redemptions_admin_insert" ON public.coupon_redemptions;
DROP POLICY IF EXISTS "coupon_redemptions_admin_update" ON public.coupon_redemptions;
DROP POLICY IF EXISTS "coupon_redemptions_admin_delete" ON public.coupon_redemptions;

CREATE POLICY "coupon_redemptions_select_policy" ON public.coupon_redemptions
  FOR SELECT TO authenticated
  USING (
    customer_id = (SELECT auth.uid())
    OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id = coupon_redemptions.customer_id AND (c.id = (SELECT auth.uid()) OR c.auth_provider_uid = ((SELECT auth.uid())::text)))
    OR (SELECT public.is_admin())
  );
CREATE POLICY "coupon_redemptions_admin_insert" ON public.coupon_redemptions
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "coupon_redemptions_admin_update" ON public.coupon_redemptions
  FOR UPDATE TO authenticated USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "coupon_redemptions_admin_delete" ON public.coupon_redemptions
  FOR DELETE TO authenticated USING ((SELECT public.is_admin()));

-- 40. support_tickets
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage support tickets" ON public.support_tickets;
DROP POLICY IF EXISTS "Customers create support tickets" ON public.support_tickets;
DROP POLICY IF EXISTS "Customers view own support tickets" ON public.support_tickets;
DROP POLICY IF EXISTS "support_tickets_select_policy" ON public.support_tickets;
DROP POLICY IF EXISTS "support_tickets_insert_policy" ON public.support_tickets;
DROP POLICY IF EXISTS "support_tickets_admin_update" ON public.support_tickets;
DROP POLICY IF EXISTS "support_tickets_admin_delete" ON public.support_tickets;

CREATE POLICY "support_tickets_select_policy" ON public.support_tickets
  FOR SELECT TO authenticated
  USING (
    customer_id = (SELECT auth.uid())
    OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id = support_tickets.customer_id AND (c.id = (SELECT auth.uid()) OR c.auth_provider_uid = ((SELECT auth.uid())::text)))
    OR (SELECT public.is_admin())
  );
CREATE POLICY "support_tickets_insert_policy" ON public.support_tickets
  FOR INSERT TO authenticated
  WITH CHECK (
    customer_id = (SELECT auth.uid())
    OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id = support_tickets.customer_id AND (c.id = (SELECT auth.uid()) OR c.auth_provider_uid = ((SELECT auth.uid())::text)))
    OR (SELECT public.is_admin())
  );
CREATE POLICY "support_tickets_admin_update" ON public.support_tickets
  FOR UPDATE TO authenticated USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "support_tickets_admin_delete" ON public.support_tickets
  FOR DELETE TO authenticated USING ((SELECT public.is_admin()));

-- 41. support_messages
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users create ticket messages" ON public.support_messages;
DROP POLICY IF EXISTS "Users view ticket messages" ON public.support_messages;
DROP POLICY IF EXISTS "support_messages_select_policy" ON public.support_messages;
DROP POLICY IF EXISTS "support_messages_insert_policy" ON public.support_messages;
DROP POLICY IF EXISTS "support_messages_admin_update" ON public.support_messages;
DROP POLICY IF EXISTS "support_messages_admin_delete" ON public.support_messages;

CREATE POLICY "support_messages_select_policy" ON public.support_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = support_messages.ticket_id
        AND (
          t.customer_id = (SELECT auth.uid())
          OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id = t.customer_id AND (c.id = (SELECT auth.uid()) OR c.auth_provider_uid = ((SELECT auth.uid())::text)))
        )
    )
    OR (SELECT public.is_admin())
  );
CREATE POLICY "support_messages_insert_policy" ON public.support_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = support_messages.ticket_id
        AND (
          t.customer_id = (SELECT auth.uid())
          OR EXISTS (SELECT 1 FROM public.customers c WHERE c.id = t.customer_id AND (c.id = (SELECT auth.uid()) OR c.auth_provider_uid = ((SELECT auth.uid())::text)))
        )
    )
    OR (SELECT public.is_admin())
  );
CREATE POLICY "support_messages_admin_update" ON public.support_messages
  FOR UPDATE TO authenticated USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "support_messages_admin_delete" ON public.support_messages
  FOR DELETE TO authenticated USING ((SELECT public.is_admin()));

-- -----------------------------------------------------------------------------
-- Group D: Inventory, Webhooks, Auth/OTP, Admin Access Control, Settings, Audits & Leads (21 tables)
-- -----------------------------------------------------------------------------

-- 42. inventory
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage inventory" ON public.inventory;
DROP POLICY IF EXISTS "Public can view inventory" ON public.inventory;
DROP POLICY IF EXISTS "Public read inventory" ON public.inventory;
DROP POLICY IF EXISTS "inventory_admin_select" ON public.inventory;
DROP POLICY IF EXISTS "inventory_admin_insert" ON public.inventory;
DROP POLICY IF EXISTS "inventory_admin_update" ON public.inventory;
DROP POLICY IF EXISTS "inventory_admin_delete" ON public.inventory;

CREATE POLICY "inventory_admin_select" ON public.inventory FOR SELECT TO authenticated USING ((SELECT public.is_admin()));
CREATE POLICY "inventory_admin_insert" ON public.inventory FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "inventory_admin_update" ON public.inventory FOR UPDATE TO authenticated USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "inventory_admin_delete" ON public.inventory FOR DELETE TO authenticated USING ((SELECT public.is_admin()));

-- 43. inventory_items
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin manage inventory items" ON public.inventory_items;
DROP POLICY IF EXISTS "Admins can manage inventory items" ON public.inventory_items;
DROP POLICY IF EXISTS "Public can view in-stock quantities" ON public.inventory_items;
DROP POLICY IF EXISTS "Public read inventory items" ON public.inventory_items;
DROP POLICY IF EXISTS "inventory_items_admin_select" ON public.inventory_items;
DROP POLICY IF EXISTS "inventory_items_admin_insert" ON public.inventory_items;
DROP POLICY IF EXISTS "inventory_items_admin_update" ON public.inventory_items;
DROP POLICY IF EXISTS "inventory_items_admin_delete" ON public.inventory_items;

CREATE POLICY "inventory_items_admin_select" ON public.inventory_items FOR SELECT TO authenticated USING ((SELECT public.is_admin()));
CREATE POLICY "inventory_items_admin_insert" ON public.inventory_items FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "inventory_items_admin_update" ON public.inventory_items FOR UPDATE TO authenticated USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "inventory_items_admin_delete" ON public.inventory_items FOR DELETE TO authenticated USING ((SELECT public.is_admin()));

-- 44. inventory_movements
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage inventory movements" ON public.inventory_movements;
DROP POLICY IF EXISTS "Public insert inventory_movements" ON public.inventory_movements;
DROP POLICY IF EXISTS "Public read inventory_movements" ON public.inventory_movements;
DROP POLICY IF EXISTS "inventory_movements_admin_select" ON public.inventory_movements;
DROP POLICY IF EXISTS "inventory_movements_admin_insert" ON public.inventory_movements;
DROP POLICY IF EXISTS "inventory_movements_admin_update" ON public.inventory_movements;
DROP POLICY IF EXISTS "inventory_movements_admin_delete" ON public.inventory_movements;

CREATE POLICY "inventory_movements_admin_select" ON public.inventory_movements FOR SELECT TO authenticated USING ((SELECT public.is_admin()));
CREATE POLICY "inventory_movements_admin_insert" ON public.inventory_movements FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "inventory_movements_admin_update" ON public.inventory_movements FOR UPDATE TO authenticated USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "inventory_movements_admin_delete" ON public.inventory_movements FOR DELETE TO authenticated USING ((SELECT public.is_admin()));

-- 45. inventory_reservations
ALTER TABLE public.inventory_reservations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage inventory reservations" ON public.inventory_reservations;
DROP POLICY IF EXISTS "Service role manages inventory reservations" ON public.inventory_reservations;
DROP POLICY IF EXISTS "inventory_reservations_admin_select" ON public.inventory_reservations;
DROP POLICY IF EXISTS "inventory_reservations_admin_insert" ON public.inventory_reservations;
DROP POLICY IF EXISTS "inventory_reservations_admin_update" ON public.inventory_reservations;
DROP POLICY IF EXISTS "inventory_reservations_admin_delete" ON public.inventory_reservations;

CREATE POLICY "inventory_reservations_admin_select" ON public.inventory_reservations FOR SELECT TO authenticated USING ((SELECT public.is_admin()));
CREATE POLICY "inventory_reservations_admin_insert" ON public.inventory_reservations FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "inventory_reservations_admin_update" ON public.inventory_reservations FOR UPDATE TO authenticated USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "inventory_reservations_admin_delete" ON public.inventory_reservations FOR DELETE TO authenticated USING ((SELECT public.is_admin()));

-- 46. inventory_transactions
ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Inventory transactions admin access" ON public.inventory_transactions;
DROP POLICY IF EXISTS "inventory_transactions_admin_select" ON public.inventory_transactions;
DROP POLICY IF EXISTS "inventory_transactions_admin_insert" ON public.inventory_transactions;
DROP POLICY IF EXISTS "inventory_transactions_admin_update" ON public.inventory_transactions;
DROP POLICY IF EXISTS "inventory_transactions_admin_delete" ON public.inventory_transactions;

CREATE POLICY "inventory_transactions_admin_select" ON public.inventory_transactions FOR SELECT TO authenticated USING ((SELECT public.is_admin()));
CREATE POLICY "inventory_transactions_admin_insert" ON public.inventory_transactions FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "inventory_transactions_admin_update" ON public.inventory_transactions FOR UPDATE TO authenticated USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "inventory_transactions_admin_delete" ON public.inventory_transactions FOR DELETE TO authenticated USING ((SELECT public.is_admin()));

-- 47. payment_webhook_events (admin read only; webhook endpoints write via service_role)
ALTER TABLE public.payment_webhook_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "payment_webhook_events_admin_select" ON public.payment_webhook_events;
CREATE POLICY "payment_webhook_events_admin_select" ON public.payment_webhook_events
  FOR SELECT TO authenticated USING ((SELECT public.is_admin()));

-- 48. payment_webhooks (closes public webhook injection!)
ALTER TABLE public.payment_webhooks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Payment webhooks admin or insert" ON public.payment_webhooks;
DROP POLICY IF EXISTS "payment_webhooks_admin_select" ON public.payment_webhooks;
CREATE POLICY "payment_webhooks_admin_select" ON public.payment_webhooks
  FOR SELECT TO authenticated USING ((SELECT public.is_admin()));

-- 49. shipping_webhook_events
ALTER TABLE public.shipping_webhook_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "shipping_webhook_events_admin_select" ON public.shipping_webhook_events;
CREATE POLICY "shipping_webhook_events_admin_select" ON public.shipping_webhook_events
  FOR SELECT TO authenticated USING ((SELECT public.is_admin()));

-- 50. email_verification_otps (strict service_role only — zero anon/authenticated/admin PostgREST access)
ALTER TABLE public.email_verification_otps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "email_verification_otps_service_only" ON public.email_verification_otps;
CREATE POLICY "email_verification_otps_service_only" ON public.email_verification_otps
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 51. email_delivery_diagnostics
ALTER TABLE public.email_delivery_diagnostics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "email_delivery_diagnostics_admin_select" ON public.email_delivery_diagnostics;
CREATE POLICY "email_delivery_diagnostics_admin_select" ON public.email_delivery_diagnostics
  FOR SELECT TO authenticated USING ((SELECT public.is_admin()));

-- 52. admin_users (admin SELECT only via authenticated; mutations strictly via service_role server functions)
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin users only" ON public.admin_users;
DROP POLICY IF EXISTS "admin_users_admin_select" ON public.admin_users;
CREATE POLICY "admin_users_admin_select" ON public.admin_users
  FOR SELECT TO authenticated USING ((SELECT public.is_admin()));

-- 53. admin_roles
ALTER TABLE public.admin_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view own admin role" ON public.admin_roles;
DROP POLICY IF EXISTS "admin_roles_select_policy" ON public.admin_roles;
CREATE POLICY "admin_roles_select_policy" ON public.admin_roles
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR (SELECT public.is_admin()));

-- 54. admin_whitelist (closes Public read whitelist!)
ALTER TABLE public.admin_whitelist ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin whitelist viewable" ON public.admin_whitelist;
DROP POLICY IF EXISTS "Admins manage whitelist" ON public.admin_whitelist;
DROP POLICY IF EXISTS "Public read whitelist" ON public.admin_whitelist;
DROP POLICY IF EXISTS "admin_whitelist_admin_select" ON public.admin_whitelist;
CREATE POLICY "admin_whitelist_admin_select" ON public.admin_whitelist
  FOR SELECT TO authenticated USING ((SELECT public.is_admin()));

-- 55. user_roles (closes Public read roles!)
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Public read roles" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_select_policy" ON public.user_roles;
CREATE POLICY "user_roles_select_policy" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = ((SELECT auth.uid())::text) OR (SELECT public.is_admin()));

-- 56. admin_audit_logs (closes Public read & insert admin_audit_logs!)
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin audit logs viewable" ON public.admin_audit_logs;
DROP POLICY IF EXISTS "Admins view audit logs" ON public.admin_audit_logs;
DROP POLICY IF EXISTS "Public insert admin_audit_logs" ON public.admin_audit_logs;
DROP POLICY IF EXISTS "Public read admin_audit_logs" ON public.admin_audit_logs;
DROP POLICY IF EXISTS "admin_audit_logs_admin_select" ON public.admin_audit_logs;
CREATE POLICY "admin_audit_logs_admin_select" ON public.admin_audit_logs
  FOR SELECT TO authenticated USING ((SELECT public.is_admin()));

-- 57. audit_logs (actively written server-side by logger.ts & admin.ts via service_role/getDb)
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins view audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_admin_select" ON public.audit_logs;
CREATE POLICY "audit_logs_admin_select" ON public.audit_logs
  FOR SELECT TO authenticated USING ((SELECT public.is_admin()));

-- 58. shipping_settings (closes public merchant warehouse pincode & phone leak!)
ALTER TABLE public.shipping_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Read shipping settings" ON public.shipping_settings;
DROP POLICY IF EXISTS "shipping_settings_admin_select" ON public.shipping_settings;
DROP POLICY IF EXISTS "shipping_settings_admin_insert" ON public.shipping_settings;
DROP POLICY IF EXISTS "shipping_settings_admin_update" ON public.shipping_settings;
DROP POLICY IF EXISTS "shipping_settings_admin_delete" ON public.shipping_settings;

CREATE POLICY "shipping_settings_admin_select" ON public.shipping_settings FOR SELECT TO authenticated USING ((SELECT public.is_admin()));
CREATE POLICY "shipping_settings_admin_insert" ON public.shipping_settings FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "shipping_settings_admin_update" ON public.shipping_settings FOR UPDATE TO authenticated USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "shipping_settings_admin_delete" ON public.shipping_settings FOR DELETE TO authenticated USING ((SELECT public.is_admin()));

-- 59. site_settings
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view site settings" ON public.site_settings;
DROP POLICY IF EXISTS "site_settings_admin_select" ON public.site_settings;
DROP POLICY IF EXISTS "site_settings_admin_insert" ON public.site_settings;
DROP POLICY IF EXISTS "site_settings_admin_update" ON public.site_settings;
DROP POLICY IF EXISTS "site_settings_admin_delete" ON public.site_settings;

CREATE POLICY "site_settings_admin_select" ON public.site_settings FOR SELECT TO authenticated USING ((SELECT public.is_admin()));
CREATE POLICY "site_settings_admin_insert" ON public.site_settings FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "site_settings_admin_update" ON public.site_settings FOR UPDATE TO authenticated USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "site_settings_admin_delete" ON public.site_settings FOR DELETE TO authenticated USING ((SELECT public.is_admin()));

-- 60. system_settings
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can manage system settings" ON public.system_settings;
DROP POLICY IF EXISTS "Public can view public system settings" ON public.system_settings;
DROP POLICY IF EXISTS "system_settings_admin_select" ON public.system_settings;
DROP POLICY IF EXISTS "system_settings_admin_insert" ON public.system_settings;
DROP POLICY IF EXISTS "system_settings_admin_update" ON public.system_settings;
DROP POLICY IF EXISTS "system_settings_admin_delete" ON public.system_settings;

CREATE POLICY "system_settings_admin_select" ON public.system_settings FOR SELECT TO authenticated USING ((SELECT public.is_admin()));
CREATE POLICY "system_settings_admin_insert" ON public.system_settings FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "system_settings_admin_update" ON public.system_settings FOR UPDATE TO authenticated USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "system_settings_admin_delete" ON public.system_settings FOR DELETE TO authenticated USING ((SELECT public.is_admin()));

-- 61. contact_messages (public form calls submitContactMessageServerFn -> service_role)
ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins view contact messages" ON public.contact_messages;
DROP POLICY IF EXISTS "Public insert contact messages" ON public.contact_messages;
DROP POLICY IF EXISTS "contact_messages_admin_select" ON public.contact_messages;
DROP POLICY IF EXISTS "contact_messages_admin_update" ON public.contact_messages;
DROP POLICY IF EXISTS "contact_messages_admin_delete" ON public.contact_messages;

CREATE POLICY "contact_messages_admin_select" ON public.contact_messages FOR SELECT TO authenticated USING ((SELECT public.is_admin()));
CREATE POLICY "contact_messages_admin_update" ON public.contact_messages FOR UPDATE TO authenticated USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "contact_messages_admin_delete" ON public.contact_messages FOR DELETE TO authenticated USING ((SELECT public.is_admin()));

-- 62. newsletter_subscribers (footer form calls subscribeNewsletterServerFn -> service_role)
ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins view newsletter subscribers" ON public.newsletter_subscribers;
DROP POLICY IF EXISTS "Public insert newsletter subscribers" ON public.newsletter_subscribers;
DROP POLICY IF EXISTS "newsletter_subscribers_admin_select" ON public.newsletter_subscribers;
DROP POLICY IF EXISTS "newsletter_subscribers_admin_update" ON public.newsletter_subscribers;
DROP POLICY IF EXISTS "newsletter_subscribers_admin_delete" ON public.newsletter_subscribers;

CREATE POLICY "newsletter_subscribers_admin_select" ON public.newsletter_subscribers FOR SELECT TO authenticated USING ((SELECT public.is_admin()));
CREATE POLICY "newsletter_subscribers_admin_update" ON public.newsletter_subscribers FOR UPDATE TO authenticated USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
CREATE POLICY "newsletter_subscribers_admin_delete" ON public.newsletter_subscribers FOR DELETE TO authenticated USING ((SELECT public.is_admin()));

-- =============================================================================
-- SECTION 4: STORAGE HARDENING (storage.buckets & storage.objects)
-- =============================================================================

UPDATE storage.buckets
SET
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif']
WHERE id = 'product-images';

DROP POLICY IF EXISTS "Admin delete product images" ON storage.objects;
DROP POLICY IF EXISTS "Admin update product images" ON storage.objects;
DROP POLICY IF EXISTS "Admin upload product images" ON storage.objects;
DROP POLICY IF EXISTS "Public read product images" ON storage.objects;
DROP POLICY IF EXISTS "product_images_bucket_public_read" ON storage.objects;
DROP POLICY IF EXISTS "product_images_bucket_admin_insert" ON storage.objects;
DROP POLICY IF EXISTS "product_images_bucket_admin_update" ON storage.objects;
DROP POLICY IF EXISTS "product_images_bucket_admin_delete" ON storage.objects;

CREATE POLICY "product_images_bucket_public_read" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'product-images');

CREATE POLICY "product_images_bucket_admin_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'product-images' AND (SELECT public.is_admin()));

CREATE POLICY "product_images_bucket_admin_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'product-images' AND (SELECT public.is_admin()))
  WITH CHECK (bucket_id = 'product-images' AND (SELECT public.is_admin()));

CREATE POLICY "product_images_bucket_admin_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'product-images' AND (SELECT public.is_admin()));

COMMIT;
