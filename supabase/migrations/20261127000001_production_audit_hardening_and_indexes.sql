-- =============================================================================
-- CAVENHUSRT Production Database Audit: Non-Destructive Security, Integrity &
-- Index Hardening Migration (20261127000001)
-- =============================================================================
-- Rules obeyed:
--   - Zero destructive table/column drops and zero deletions of customer/order data.
--   - All SECURITY DEFINER functions use SET search_path = '' and qualified calls.
--   - Covers all remaining unindexed foreign keys & high-frequency query paths.
--   - Removes only strictly duplicate plain non-constraint indexes.
-- =============================================================================

BEGIN;

-- =============================================================================
-- SECTION 1: HARDEN auth.users SYNC TRIGGER FUNCTION & NON-DESTRUCTIVE BACKFILL
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_auth_user_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_meta jsonb;
  v_app_meta jsonb;
  v_full_name text;
  v_phone text;
  v_avatar_url text;
  v_provider text;
  v_clean_email text;
  v_existing_cust_id uuid;
BEGIN
  v_meta := CASE
    WHEN pg_catalog.jsonb_typeof(NEW.raw_user_meta_data) = 'object' THEN NEW.raw_user_meta_data
    ELSE '{}'::jsonb
  END;

  v_app_meta := CASE
    WHEN pg_catalog.jsonb_typeof(NEW.raw_app_meta_data) = 'object' THEN NEW.raw_app_meta_data
    ELSE '{}'::jsonb
  END;

  v_clean_email := NULLIF(pg_catalog.lower(pg_catalog.btrim(NEW.email)), '');

  v_full_name := COALESCE(
    NULLIF(pg_catalog.btrim(v_meta ->> 'full_name'), ''),
    NULLIF(pg_catalog.btrim(v_meta ->> 'name'), ''),
    NULLIF(pg_catalog.btrim(v_meta ->> 'user_name'), ''),
    NULLIF(pg_catalog.btrim(pg_catalog.split_part(COALESCE(v_clean_email, ''), '@', 1)), ''),
    'Customer'
  );

  v_phone := COALESCE(
    NULLIF(pg_catalog.btrim(NEW.phone), ''),
    NULLIF(pg_catalog.btrim(v_meta ->> 'mobile_number'), ''),
    NULLIF(pg_catalog.btrim(v_meta ->> 'phone'), ''),
    NULLIF(pg_catalog.btrim(v_meta ->> 'mobile'), '')
  );

  v_avatar_url := COALESCE(
    NULLIF(pg_catalog.btrim(v_meta ->> 'avatar_url'), ''),
    NULLIF(pg_catalog.btrim(v_meta ->> 'picture'), ''),
    NULLIF(pg_catalog.btrim(v_meta ->> 'avatar'), '')
  );

  v_provider := COALESCE(
    NULLIF(pg_catalog.btrim(v_app_meta ->> 'provider'), ''),
    NULLIF(pg_catalog.btrim(v_meta ->> 'provider'), ''),
    'email'
  );

  -- 1. Canonical 1:1 public.profiles upsert
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
      v_clean_email,
      v_phone,
      v_full_name,
      v_avatar_url,
      v_provider,
      'active',
      COALESCE(NEW.created_at, pg_catalog.now()),
      pg_catalog.now()
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
      updated_at = pg_catalog.now();
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_auth_user_sync: profiles upsert failed: %', SQLERRM;
  END;

  -- 2. Synchronize public.customers without silent conflict gaps across id / auth_provider_uid / email
  BEGIN
    SELECT c.id INTO v_existing_cust_id
    FROM public.customers c
    WHERE c.id = NEW.id
       OR c.auth_provider_uid = NEW.id::text
       OR (NULLIF(v_meta ->> 'sub', '') IS NOT NULL AND c.auth_provider_uid = (v_meta ->> 'sub'))
       OR (v_clean_email IS NOT NULL AND pg_catalog.lower(c.email) = v_clean_email)
    LIMIT 1;

    IF v_existing_cust_id IS NOT NULL THEN
      UPDATE public.customers SET
        email = COALESCE(v_clean_email, public.customers.email),
        phone = COALESCE(v_phone, public.customers.phone),
        full_name = CASE
          WHEN v_full_name IS NOT NULL AND v_full_name <> 'Customer'
          THEN v_full_name
          ELSE public.customers.full_name
        END,
        profile_image = COALESCE(v_avatar_url, public.customers.profile_image),
        last_login = pg_catalog.now(),
        updated_at = pg_catalog.now()
      WHERE id = v_existing_cust_id;
    ELSE
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
        v_clean_email,
        v_phone,
        v_avatar_url,
        'active',
        pg_catalog.now(),
        COALESCE(NEW.created_at, pg_catalog.now()),
        pg_catalog.now()
      )
      ON CONFLICT DO NOTHING;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_auth_user_sync: customers sync failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.handle_auth_user_sync() FROM PUBLIC, anon, authenticated;

-- Safe non-destructive backfill for verified auth.users rows missing public.customers
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
)
SELECT
  u.id,
  COALESCE(
    CASE
      WHEN pg_catalog.jsonb_typeof(u.raw_user_meta_data) = 'object'
        THEN NULLIF(pg_catalog.btrim(u.raw_user_meta_data ->> 'sub'), '')
      ELSE NULL
    END,
    u.id::text
  ),
  COALESCE(
    NULLIF(pg_catalog.btrim(p.full_name), ''),
    NULLIF(pg_catalog.split_part(COALESCE(u.email, ''), '@', 1), ''),
    'Customer'
  ),
  NULLIF(pg_catalog.lower(pg_catalog.btrim(COALESCE(p.email, u.email))), ''),
  COALESCE(NULLIF(pg_catalog.btrim(p.mobile_number), ''), NULLIF(pg_catalog.btrim(p.phone), '')),
  NULLIF(pg_catalog.btrim(p.avatar_url), ''),
  COALESCE(p.account_status, 'active'),
  COALESCE(u.last_sign_in_at, pg_catalog.now()),
  COALESCE(u.created_at, pg_catalog.now()),
  pg_catalog.now()
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE u.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.customers c
    WHERE c.id = u.id
       OR c.auth_provider_uid = u.id::text
       OR (u.email IS NOT NULL AND pg_catalog.lower(c.email) = pg_catalog.lower(pg_catalog.btrim(u.email)))
  )
ON CONFLICT DO NOTHING;

-- =============================================================================
-- SECTION 2: DATA INTEGRITY CHECK CONSTRAINTS & UNIQUENESS GUARDS
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_orders_non_negative_amounts' AND conrelid = 'public.orders'::regclass) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT chk_orders_non_negative_amounts
      CHECK (
        COALESCE(subtotal, 0) >= 0
        AND COALESCE(discount, 0) >= 0
        AND COALESCE(shipping_fee, 0) >= 0
        AND COALESCE(taxes, 0) >= 0
        AND total >= 0
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_orders_status_valid' AND conrelid = 'public.orders'::regclass) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT chk_orders_status_valid
      CHECK (
        status IN (
          'pending', 'pending_payment', 'confirmed', 'processing', 'packed',
          'shipped', 'in_transit', 'out_for_delivery', 'delivered',
          'cancelled', 'refunded', 'rto', 'returned', 'return_requested', 'failed'
        )
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_orders_payment_status_valid' AND conrelid = 'public.orders'::regclass) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT chk_orders_payment_status_valid
      CHECK (
        payment_status IS NULL
        OR payment_status IN ('pending', 'authorized', 'paid', 'failed', 'refunded', 'partially_refunded', 'cancelled')
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_order_items_price_qty_positive' AND conrelid = 'public.order_items'::regclass) THEN
    ALTER TABLE public.order_items
      ADD CONSTRAINT chk_order_items_price_qty_positive
      CHECK (price >= 0 AND qty > 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_payments_non_negative_amounts' AND conrelid = 'public.payments'::regclass) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT chk_payments_non_negative_amounts
      CHECK (amount >= 0 AND amount_paise >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_products_non_negative_prices' AND conrelid = 'public.products'::regclass) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT chk_products_non_negative_prices
      CHECK (price >= 0 AND mrp >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_product_variants_non_negative_stock' AND conrelid = 'public.product_variants'::regclass) THEN
    ALTER TABLE public.product_variants
      ADD CONSTRAINT chk_product_variants_non_negative_stock
      CHECK (stock_quantity >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_inventory_non_negative_quantities' AND conrelid = 'public.inventory'::regclass) THEN
    ALTER TABLE public.inventory
      ADD CONSTRAINT chk_inventory_non_negative_quantities
      CHECK (stock_quantity >= 0 AND reserved_quantity >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_coupons_valid_values' AND conrelid = 'public.coupons'::regclass) THEN
    ALTER TABLE public.coupons
      ADD CONSTRAINT chk_coupons_valid_values
      CHECK (
        discount_value > 0
        AND min_order_value >= 0
        AND times_used >= 0
        AND (max_discount IS NULL OR max_discount >= 0)
        AND (usage_limit IS NULL OR usage_limit > 0)
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_product_reviews_rating_range' AND conrelid = 'public.product_reviews'::regclass) THEN
    ALTER TABLE public.product_reviews
      ADD CONSTRAINT chk_product_reviews_rating_range
      CHECK (rating >= 1 AND rating <= 5);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_product_reviews_status_valid' AND conrelid = 'public.product_reviews'::regclass) THEN
    ALTER TABLE public.product_reviews
      ADD CONSTRAINT chk_product_reviews_status_valid
      CHECK (status IN ('pending', 'approved', 'rejected'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_shipments_awb_number
  ON public.shipments (awb_number)
  WHERE awb_number IS NOT NULL AND pg_catalog.btrim(awb_number) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS uq_coupon_redemptions_order_coupon
  ON public.coupon_redemptions (order_id, coupon_id);

-- =============================================================================
-- SECTION 3: COVER ALL 31 UNINDEXED FOREIGN KEYS
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_admin_roles_user_id ON public.admin_roles (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON public.audit_logs (actor_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_product_id ON public.cart_items (product_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_variant_id ON public.cart_items (variant_id);
CREATE INDEX IF NOT EXISTS idx_customer_auth_providers_customer_id ON public.customer_auth_providers (customer_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_product_id ON public.inventory_items (product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_product_id ON public.inventory_movements (product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_product_id ON public.inventory_transactions (product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_variant_id ON public.inventory_transactions (variant_id);
CREATE INDEX IF NOT EXISTS idx_order_notes_author_id ON public.order_notes (author_id);
CREATE INDEX IF NOT EXISTS idx_order_notes_order_id ON public.order_notes (order_id);
CREATE INDEX IF NOT EXISTS idx_payment_refunds_order_id ON public.payment_refunds (order_id);
CREATE INDEX IF NOT EXISTS idx_payment_refunds_payment_id ON public.payment_refunds (payment_id);
CREATE INDEX IF NOT EXISTS idx_product_reviews_customer_id ON public.product_reviews (customer_id);
CREATE INDEX IF NOT EXISTS idx_product_tag_assignments_tag_id ON public.product_tag_assignments (tag_id);
CREATE INDEX IF NOT EXISTS idx_products_category_slug ON public.products (category_slug);
CREATE INDEX IF NOT EXISTS idx_refunds_order_id ON public.refunds (order_id);
CREATE INDEX IF NOT EXISTS idx_refunds_payment_id ON public.refunds (payment_id);
CREATE INDEX IF NOT EXISTS idx_return_items_order_item_id ON public.return_items (order_item_id);
CREATE INDEX IF NOT EXISTS idx_return_items_product_id ON public.return_items (product_id);
CREATE INDEX IF NOT EXISTS idx_return_items_variant_id ON public.return_items (variant_id);
CREATE INDEX IF NOT EXISTS idx_shipment_tracking_events_order_id ON public.shipment_tracking_events (order_id);
CREATE INDEX IF NOT EXISTS idx_shipment_tracking_events_shipment_id ON public.shipment_tracking_events (shipment_id);
CREATE INDEX IF NOT EXISTS idx_shipping_addresses_order_id ON public.shipping_addresses (order_id);
CREATE INDEX IF NOT EXISTS idx_shipping_rates_zone_id ON public.shipping_rates (zone_id);
CREATE INDEX IF NOT EXISTS idx_shipping_tracking_order_id ON public.shipping_tracking (order_id);
CREATE INDEX IF NOT EXISTS idx_shipping_tracking_shipment_id ON public.shipping_tracking (shipment_id);
CREATE INDEX IF NOT EXISTS idx_support_messages_sender_id ON public.support_messages (sender_id);
CREATE INDEX IF NOT EXISTS idx_support_messages_ticket_id ON public.support_messages (ticket_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_customer_id ON public.support_tickets (customer_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_items_product_id ON public.wishlist_items (product_id);

-- =============================================================================
-- SECTION 4: HIGH-FREQUENCY WORKLOAD INDEXES & DUPLICATE PLAIN INDEX CLEANUP
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_products_published_rank
  ON public.products (rank ASC)
  WHERE is_published = true;

CREATE INDEX IF NOT EXISTS idx_orders_user_created_at
  ON public.orders (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_status_created_at
  ON public.orders (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_payment_status_created_at
  ON public.orders (payment_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_razorpay_order_id
  ON public.orders (razorpay_order_id)
  WHERE razorpay_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_awb_number
  ON public.orders (awb_number)
  WHERE awb_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_idempotency_key
  ON public.orders ((shipping ->> 'idempotencyKey'))
  WHERE (shipping ->> 'idempotencyKey') IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payments_razorpay_order_id
  ON public.payments (razorpay_order_id)
  WHERE razorpay_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payments_user_id
  ON public.payments (user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_shipment_tracking_events_awb_time
  ON public.shipment_tracking_events (awb_number, event_time DESC);

CREATE INDEX IF NOT EXISTS idx_admin_users_auth_user_id
  ON public.admin_users (auth_user_id)
  WHERE auth_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_admin_users_lower_email
  ON public.admin_users (pg_catalog.lower(email));

CREATE INDEX IF NOT EXISTS idx_customers_lower_email
  ON public.customers (pg_catalog.lower(email))
  WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_lower_email
  ON public.profiles (pg_catalog.lower(email))
  WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_coupons_upper_active_code
  ON public.coupons (pg_catalog.upper(code))
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at
  ON public.admin_audit_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at
  ON public.audit_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_verification_otps_expires_at
  ON public.email_verification_otps (expires_at);

-- Remove strictly duplicate plain indexes (unique constraints remain intact)
DROP INDEX IF EXISTS public.orders_status_idx;
DROP INDEX IF EXISTS public.orders_created_at_idx;
DROP INDEX IF EXISTS public.idx_inventory_variant_id;
DROP INDEX IF EXISTS public.idx_variants_sku;
DROP INDEX IF EXISTS public.idx_admin_users_email;
DROP INDEX IF EXISTS public.idx_customers_auth_uid;

COMMIT;

-- Refresh PostgreSQL planner statistics on touched public tables
ANALYZE public.customers;
ANALYZE public.orders;
ANALYZE public.products;
ANALYZE public.payments;
ANALYZE public.shipments;
ANALYZE public.shipment_tracking_events;
ANALYZE public.admin_users;

