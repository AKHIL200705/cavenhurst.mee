-- Migration: 20261124000002_fix_orders_payment_method_and_admin_rls.sql
-- Description: Ensure payment_method column exists on public.orders with default, constraints, indexes,
--               tighten orders RLS policies so only administrators can view all customer orders,
--               and reload PostgREST schema cache.

-- 1. Ensure payment_method column exists with default 'online'
ALTER TABLE public.orders 
  ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'online';

-- 2. Ensure existing null records have a valid payment_method (preserve existing non-null values)
UPDATE public.orders 
SET payment_method = 'online' 
WHERE payment_method IS NULL;

-- 3. Ensure payment_status, shipment_status, and transaction ID columns exist and are consistent
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS shipment_status TEXT DEFAULT 'unfulfilled',
  ADD COLUMN IF NOT EXISTS razorpay_payment_id TEXT,
  ADD COLUMN IF NOT EXISTS razorpay_order_id TEXT;

-- 4. Add check constraint on payment_method supporting Razorpay online/prepaid variants and COD
ALTER TABLE public.orders 
  DROP CONSTRAINT IF EXISTS chk_orders_payment_method;

ALTER TABLE public.orders 
  ADD CONSTRAINT chk_orders_payment_method 
  CHECK (payment_method IN ('online', 'cod', 'razorpay', 'prepaid', 'upi', 'card', 'netbanking'));

-- 5. Add performance indexes for admin overview and order filtering
CREATE INDEX IF NOT EXISTS idx_orders_payment_method ON public.orders (payment_method);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON public.orders (payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders (created_at DESC);

-- 6. Tighten RLS policies on public.orders
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Drop permissive public read policy that allowed unauthenticated / any user to read all orders
DROP POLICY IF EXISTS "Public read orders" ON public.orders;

-- Drop obsolete / conflicting policies to create clean, robust policies
DROP POLICY IF EXISTS "Admins manage all orders" ON public.orders;
DROP POLICY IF EXISTS "Admin order update" ON public.orders;
DROP POLICY IF EXISTS "Order owner or admin access" ON public.orders;
DROP POLICY IF EXISTS "Users can read own orders" ON public.orders;
DROP POLICY IF EXISTS "Users can insert orders" ON public.orders;
DROP POLICY IF EXISTS "Allow checkout creation of orders" ON public.orders;
DROP POLICY IF EXISTS "Create orders" ON public.orders;
DROP POLICY IF EXISTS "Orders read policy" ON public.orders;
DROP POLICY IF EXISTS "Orders insert policy" ON public.orders;
DROP POLICY IF EXISTS "Orders update policy" ON public.orders;
DROP POLICY IF EXISTS "Admins have full access to orders" ON public.orders;

-- Customer SELECT: Users can only read their own orders (by user_id or linked customer) OR admins
CREATE POLICY "Orders read policy" ON public.orders
  FOR SELECT TO authenticated, anon
  USING (
    is_admin()
    OR (auth.uid() IS NOT NULL AND user_id = auth.uid()::text)
    OR (customer_id IN (SELECT id FROM public.customers WHERE auth_provider_uid = auth.uid()::text))
  );

-- Checkout / Customer INSERT: Anyone checking out can create an order with their own user_id or guest
CREATE POLICY "Orders insert policy" ON public.orders
  FOR INSERT TO authenticated, anon
  WITH CHECK (
    user_id IS NULL
    OR auth.uid() IS NULL
    OR user_id = auth.uid()::text
    OR is_admin()
  );

-- Admin ALL: Administrators have full administrative access (SELECT, INSERT, UPDATE, DELETE) to all orders
CREATE POLICY "Admins have full access to orders" ON public.orders
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- Customer UPDATE: Disallow regular users from updating orders directly unless admin
CREATE POLICY "Orders update policy" ON public.orders
  FOR UPDATE TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- 7. Notify PostgREST to reload schema and config cache immediately
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
