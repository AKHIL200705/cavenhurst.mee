-- ============================================================================
-- CAVENHURST - PRODUCTION CONSOLIDATION, DATA BACKFILL & RLS HARDENING
-- Migration: 20261116000002_consolidate_and_secure.sql
-- ============================================================================

-- 1. Helper function for identifying requesting user from JWT claim
CREATE OR REPLACE FUNCTION public.requesting_user_id()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  );
$$;

-- Helper function to check if requesting user is an active administrator
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE (auth_user_id = public.requesting_user_id() OR email = (
      SELECT COALESCE(
        nullif(current_setting('request.jwt.claim.email', true), ''),
        (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
      )
    ))
    AND is_active = true
  ) OR EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = public.requesting_user_id()
    AND role = 'admin'
  ) OR EXISTS (
    SELECT 1 FROM public.admin_whitelist
    WHERE email = (
      SELECT COALESCE(
        nullif(current_setting('request.jwt.claim.email', true), ''),
        (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
      )
    )
  );
$$;

-- ============================================================================
-- 2. CUSTOMER & ORDER RELATIONAL CONSOLIDATION
-- ============================================================================

-- Ensure email on customers is populated for Akhil
UPDATE public.customers
SET email = 'akhilsaiabbireddy2007@gmail.com', updated_at = now()
WHERE auth_provider_uid = '115832530385952138402' AND (email IS NULL OR email = '');

-- Upsert customers from existing orders that don't have a customer profile yet
INSERT INTO public.customers (auth_provider_uid, full_name, email, phone, account_status)
SELECT DISTINCT ON (COALESCE(user_id, customer_email))
    COALESCE(user_id, customer_email) as auth_provider_uid,
    COALESCE(customer_name, 'Valued Customer') as full_name,
    customer_email as email,
    customer_phone as phone,
    'active' as account_status
FROM public.orders
WHERE COALESCE(user_id, customer_email) IS NOT NULL
ON CONFLICT (auth_provider_uid) DO UPDATE SET
    email = COALESCE(EXCLUDED.email, customers.email),
    phone = COALESCE(EXCLUDED.phone, customers.phone),
    full_name = COALESCE(EXCLUDED.full_name, customers.full_name),
    updated_at = now();

-- Connect orders to the authoritative customer UUID
UPDATE public.orders o
SET customer_id = c.id
FROM public.customers c
WHERE (o.user_id = c.auth_provider_uid OR o.customer_email = c.email)
  AND (o.customer_id IS NULL OR o.customer_id != c.id);

-- ============================================================================
-- 3. ADDRESS CONSOLIDATION (order_addresses & customer_addresses)
-- ============================================================================

-- Migrate existing shipping_addresses into order_addresses (immutable order address snapshot)
INSERT INTO public.order_addresses (order_id, address_type, full_name, phone, email, address_line1, address_line2, city, state, postal_code, country, created_at)
SELECT 
    sa.order_id,
    'shipping' as address_type,
    sa.full_name,
    sa.phone,
    sa.email,
    sa.address_line1,
    sa.address_line2,
    sa.city,
    sa.state,
    sa.pincode as postal_code,
    COALESCE(sa.country, 'India') as country,
    sa.created_at
FROM public.shipping_addresses sa
LEFT JOIN public.order_addresses oa ON oa.order_id = sa.order_id AND oa.address_line1 = sa.address_line1
WHERE oa.id IS NULL;

-- Populate customer_addresses (account address book) from distinct shipping addresses
INSERT INTO public.customer_addresses (customer_id, customer_auth_uid, address_type, is_default, full_name, phone, address_line1, address_line2, city, state, postal_code, country)
SELECT DISTINCT ON (c.id, sa.address_line1, sa.pincode)
    c.id as customer_id,
    c.auth_provider_uid as customer_auth_uid,
    'shipping' as address_type,
    true as is_default,
    sa.full_name,
    sa.phone,
    sa.address_line1,
    sa.address_line2,
    sa.city,
    sa.state,
    sa.pincode as postal_code,
    COALESCE(sa.country, 'India') as country
FROM public.shipping_addresses sa
JOIN public.customers c ON (c.auth_provider_uid = sa.user_id OR c.email = sa.email)
LEFT JOIN public.customer_addresses ca ON ca.customer_id = c.id AND ca.address_line1 = sa.address_line1
WHERE ca.id IS NULL;

-- ============================================================================
-- 4. ORDER STATUS HISTORY AUDIT TRAIL
-- ============================================================================

-- Backfill initial order_status_history for all orders
INSERT INTO public.order_status_history (order_id, status, comment, changed_by, created_at)
SELECT 
    o.id as order_id,
    o.status,
    'Order initial status: ' || o.status as comment,
    'system' as changed_by,
    o.created_at
FROM public.orders o
LEFT JOIN public.order_status_history osh ON osh.order_id = o.id
WHERE osh.id IS NULL;

-- ============================================================================
-- 5. INVENTORY & LOGISTICS CONSOLIDATION
-- ============================================================================

-- Backfill inventory_transactions from inventory_movements
INSERT INTO public.inventory_transactions (product_id, transaction_type, quantity, reference_id, reason, created_by, created_at)
SELECT 
    im.product_id,
    'adjustment' as transaction_type,
    im.change_qty as quantity,
    im.reference_id,
    im.reason,
    im.admin_user_id as created_by,
    im.created_at
FROM public.inventory_movements im
LEFT JOIN public.inventory_transactions it ON it.reference_id = im.reference_id AND it.product_id = im.product_id
WHERE it.id IS NULL;

-- Add product_slug to cart_items if missing
ALTER TABLE public.cart_items ADD COLUMN IF NOT EXISTS product_slug TEXT;

-- ============================================================================
-- 6. SECURITY: HARDEN ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- A. CUSTOMERS TABLE
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Customers can manage own profile" ON public.customers;
DROP POLICY IF EXISTS "Allow anon reading customers" ON public.customers;
DROP POLICY IF EXISTS "Public can view customers" ON public.customers;
DROP POLICY IF EXISTS "Customer self read and update" ON public.customers;
DROP POLICY IF EXISTS "Admin full access customers" ON public.customers;

CREATE POLICY "Customer self read and update" ON public.customers
FOR SELECT USING (
  auth_provider_uid = public.requesting_user_id() 
  OR public.is_admin()
);

CREATE POLICY "Customer self update" ON public.customers
FOR UPDATE USING (
  auth_provider_uid = public.requesting_user_id() 
  OR public.is_admin()
);

CREATE POLICY "Customer self insert" ON public.customers
FOR INSERT WITH CHECK (
  auth_provider_uid = public.requesting_user_id() 
  OR public.is_admin()
  OR auth_provider_uid IS NOT NULL
);

-- B. CUSTOMER ADDRESSES TABLE
ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Customers can manage own addresses" ON public.customer_addresses;
DROP POLICY IF EXISTS "Customer self address access" ON public.customer_addresses;

CREATE POLICY "Customer self address access" ON public.customer_addresses
FOR ALL USING (
  customer_auth_uid = public.requesting_user_id()
  OR customer_id IN (SELECT id FROM public.customers WHERE auth_provider_uid = public.requesting_user_id())
  OR public.is_admin()
) WITH CHECK (
  customer_auth_uid = public.requesting_user_id()
  OR customer_id IN (SELECT id FROM public.customers WHERE auth_provider_uid = public.requesting_user_id())
  OR public.is_admin()
  OR customer_auth_uid IS NOT NULL
);

-- C. CARTS & CART ITEMS
ALTER TABLE public.carts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Customers can manage own carts" ON public.carts;
DROP POLICY IF EXISTS "Cart owner access" ON public.carts;

CREATE POLICY "Cart owner access" ON public.carts
FOR ALL USING (
  customer_auth_uid = public.requesting_user_id()
  OR session_id = public.requesting_user_id()
  OR public.is_admin()
  OR customer_auth_uid IS NULL
) WITH CHECK (
  customer_auth_uid = public.requesting_user_id()
  OR session_id = public.requesting_user_id()
  OR public.is_admin()
  OR customer_auth_uid IS NULL
);

ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Customers can manage own cart items" ON public.cart_items;
DROP POLICY IF EXISTS "Cart items owner access" ON public.cart_items;

CREATE POLICY "Cart items owner access" ON public.cart_items
FOR ALL USING (
  cart_id IN (
    SELECT id FROM public.carts 
    WHERE customer_auth_uid = public.requesting_user_id() 
       OR session_id = public.requesting_user_id() 
       OR customer_auth_uid IS NULL
  ) OR public.is_admin()
) WITH CHECK (
  cart_id IN (
    SELECT id FROM public.carts 
    WHERE customer_auth_uid = public.requesting_user_id() 
       OR session_id = public.requesting_user_id() 
       OR customer_auth_uid IS NULL
  ) OR public.is_admin()
);

-- D. WISHLISTS & WISHLIST ITEMS
ALTER TABLE public.wishlists ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Customers can manage own wishlists" ON public.wishlists;
CREATE POLICY "Wishlist owner access" ON public.wishlists
FOR ALL USING (
  customer_auth_uid = public.requesting_user_id()
  OR session_id = public.requesting_user_id()
  OR public.is_admin()
  OR customer_auth_uid IS NULL
) WITH CHECK (
  customer_auth_uid = public.requesting_user_id()
  OR session_id = public.requesting_user_id()
  OR public.is_admin()
  OR customer_auth_uid IS NULL
);

ALTER TABLE public.wishlist_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Customers can manage own wishlist items" ON public.wishlist_items;
CREATE POLICY "Wishlist items owner access" ON public.wishlist_items
FOR ALL USING (
  wishlist_id IN (
    SELECT id FROM public.wishlists 
    WHERE customer_auth_uid = public.requesting_user_id() 
       OR session_id = public.requesting_user_id() 
       OR customer_auth_uid IS NULL
  ) OR public.is_admin()
) WITH CHECK (
  wishlist_id IN (
    SELECT id FROM public.wishlists 
    WHERE customer_auth_uid = public.requesting_user_id() 
       OR session_id = public.requesting_user_id() 
       OR customer_auth_uid IS NULL
  ) OR public.is_admin()
);

-- E. ORDERS TABLE
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Order owner or admin access" ON public.orders;
DROP POLICY IF EXISTS "Users can read own orders" ON public.orders;
DROP POLICY IF EXISTS "Service role can manage orders" ON public.orders;
DROP POLICY IF EXISTS "Allow checkout creation of orders" ON public.orders;

CREATE POLICY "Order owner or admin access" ON public.orders
FOR SELECT USING (
  user_id = public.requesting_user_id()
  OR customer_id IN (SELECT id FROM public.customers WHERE auth_provider_uid = public.requesting_user_id())
  OR public.is_admin()
);

CREATE POLICY "Allow checkout creation of orders" ON public.orders
FOR INSERT WITH CHECK (true);

CREATE POLICY "Admin order update" ON public.orders
FOR UPDATE USING (public.is_admin());

-- F. ORDER ITEMS & ORDER ADDRESSES
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Order items owner access" ON public.order_items;

CREATE POLICY "Order items owner access" ON public.order_items
FOR SELECT USING (
  order_id IN (
    SELECT id FROM public.orders 
    WHERE user_id = public.requesting_user_id() 
       OR customer_id IN (SELECT id FROM public.customers WHERE auth_provider_uid = public.requesting_user_id())
  ) OR public.is_admin()
);

CREATE POLICY "Order items insert during checkout" ON public.order_items
FOR INSERT WITH CHECK (true);

ALTER TABLE public.order_addresses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Order addresses accessible" ON public.order_addresses;
DROP POLICY IF EXISTS "Order addresses owner access" ON public.order_addresses;

CREATE POLICY "Order addresses owner access" ON public.order_addresses
FOR SELECT USING (
  order_id IN (
    SELECT id FROM public.orders 
    WHERE user_id = public.requesting_user_id() 
       OR customer_id IN (SELECT id FROM public.customers WHERE auth_provider_uid = public.requesting_user_id())
  ) OR public.is_admin()
);

CREATE POLICY "Order addresses insert during checkout" ON public.order_addresses
FOR INSERT WITH CHECK (true);

-- G. ORDER STATUS HISTORY
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Order status history read" ON public.order_status_history;
CREATE POLICY "Order status history read" ON public.order_status_history
FOR SELECT USING (
  order_id IN (
    SELECT id FROM public.orders 
    WHERE user_id = public.requesting_user_id() 
       OR customer_id IN (SELECT id FROM public.customers WHERE auth_provider_uid = public.requesting_user_id())
  ) OR public.is_admin()
);

-- H. PAYMENTS & REFUNDS (Protected)
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Payments customer view" ON public.payments;
CREATE POLICY "Payments customer view" ON public.payments
FOR SELECT USING (
  user_id = public.requesting_user_id()
  OR order_id IN (SELECT id FROM public.orders WHERE user_id = public.requesting_user_id())
  OR public.is_admin()
);

ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Refunds view" ON public.refunds;
CREATE POLICY "Refunds view" ON public.refunds
FOR SELECT USING (
  order_id IN (SELECT id FROM public.orders WHERE user_id = public.requesting_user_id())
  OR public.is_admin()
);

-- I. ADMIN TABLES (Strictly Admin only)
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin users readable" ON public.admin_users;
CREATE POLICY "Admin users only" ON public.admin_users
FOR ALL USING (public.is_admin());

ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin audit logs viewable" ON public.admin_audit_logs;
CREATE POLICY "Admin audit logs viewable" ON public.admin_audit_logs
FOR SELECT USING (public.is_admin());

ALTER TABLE public.admin_whitelist ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin whitelist viewable" ON public.admin_whitelist;
CREATE POLICY "Admin whitelist viewable" ON public.admin_whitelist
FOR SELECT USING (public.is_admin());

ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Inventory transactions viewable" ON public.inventory_transactions;
CREATE POLICY "Inventory transactions admin access" ON public.inventory_transactions
FOR ALL USING (public.is_admin());

ALTER TABLE public.payment_webhooks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Payment webhooks insert" ON public.payment_webhooks;
CREATE POLICY "Payment webhooks admin or insert" ON public.payment_webhooks
FOR ALL USING (public.is_admin()) WITH CHECK (true);

ALTER TABLE public.returns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Returns access" ON public.returns;
CREATE POLICY "Returns customer access" ON public.returns
FOR SELECT USING (
  customer_auth_uid = public.requesting_user_id()
  OR customer_id IN (SELECT id FROM public.customers WHERE auth_provider_uid = public.requesting_user_id())
  OR public.is_admin()
);

CREATE POLICY "Returns customer create" ON public.returns
FOR INSERT WITH CHECK (
  customer_auth_uid = public.requesting_user_id()
  OR public.is_admin()
);
