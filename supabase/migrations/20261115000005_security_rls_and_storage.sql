-- ==============================================================================
-- CAVENHURST Migration 05: Comprehensive Row Level Security (RLS) & Storage
-- File: supabase/migrations/20261115000005_security_rls_and_storage.sql
-- ==============================================================================

-- 1. Ensure RLS is active on all tables
ALTER TABLE public.customer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_welcome ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipping_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipping_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;

-- 2. Customer Profiles RLS (Data Isolation)
DROP POLICY IF EXISTS "Users read own profile" ON public.customer_profiles;
CREATE POLICY "Users read own profile" ON public.customer_profiles
  FOR SELECT TO anon, authenticated
  USING (id = public.requesting_user_id() OR public.is_admin());

DROP POLICY IF EXISTS "Users update own profile" ON public.customer_profiles;
CREATE POLICY "Users update own profile" ON public.customer_profiles
  FOR UPDATE TO authenticated
  USING (id = public.requesting_user_id() OR public.is_admin())
  WITH CHECK (id = public.requesting_user_id() OR public.is_admin());

DROP POLICY IF EXISTS "Users insert own profile" ON public.customer_profiles;
CREATE POLICY "Users insert own profile" ON public.customer_profiles
  FOR INSERT TO anon, authenticated
  WITH CHECK (id = public.requesting_user_id() OR public.is_admin());

-- 3. Customer Carts RLS
DROP POLICY IF EXISTS "Manage own carts" ON public.customer_carts;
CREATE POLICY "Manage own carts" ON public.customer_carts
  FOR ALL TO anon, authenticated
  USING (user_id = public.requesting_user_id() OR public.is_admin())
  WITH CHECK (user_id = public.requesting_user_id() OR public.is_admin());

-- 4. Customer Welcome RLS
DROP POLICY IF EXISTS "Manage own welcome" ON public.customer_welcome;
CREATE POLICY "Manage own welcome" ON public.customer_welcome
  FOR ALL TO anon, authenticated
  USING (user_id = public.requesting_user_id() OR public.is_admin())
  WITH CHECK (user_id = public.requesting_user_id() OR public.is_admin());

-- 5. Orders & Logistics RLS
DROP POLICY IF EXISTS "Customers read own orders" ON public.orders;
CREATE POLICY "Customers read own orders" ON public.orders
  FOR SELECT TO anon, authenticated
  USING (user_id = public.requesting_user_id() OR public.is_admin());

DROP POLICY IF EXISTS "Create orders" ON public.orders;
CREATE POLICY "Create orders" ON public.orders
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Admins manage all orders" ON public.orders;
CREATE POLICY "Admins manage all orders" ON public.orders
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Order Items
DROP POLICY IF EXISTS "Read order items" ON public.order_items;
CREATE POLICY "Read order items" ON public.order_items
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (SELECT 1 FROM public.orders WHERE orders.id = order_items.order_id AND (orders.user_id = public.requesting_user_id() OR public.is_admin()))
  );

DROP POLICY IF EXISTS "Insert order items" ON public.order_items;
CREATE POLICY "Insert order items" ON public.order_items
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- Shipping Addresses
DROP POLICY IF EXISTS "Read shipping addresses" ON public.shipping_addresses;
CREATE POLICY "Read shipping addresses" ON public.shipping_addresses
  FOR SELECT TO anon, authenticated
  USING (
    user_id = public.requesting_user_id() OR 
    EXISTS (SELECT 1 FROM public.orders WHERE orders.id = shipping_addresses.order_id AND orders.user_id = public.requesting_user_id()) OR 
    public.is_admin()
  );

DROP POLICY IF EXISTS "Insert shipping addresses" ON public.shipping_addresses;
CREATE POLICY "Insert shipping addresses" ON public.shipping_addresses
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- Payments
DROP POLICY IF EXISTS "Read payments" ON public.payments;
CREATE POLICY "Read payments" ON public.payments
  FOR SELECT TO anon, authenticated
  USING (
    user_id = public.requesting_user_id() OR 
    EXISTS (SELECT 1 FROM public.orders WHERE orders.id = payments.order_id AND orders.user_id = public.requesting_user_id()) OR 
    public.is_admin()
  );

DROP POLICY IF EXISTS "Insert payments" ON public.payments;
CREATE POLICY "Insert payments" ON public.payments
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- Shipments & Tracking
DROP POLICY IF EXISTS "Read shipments" ON public.shipments;
CREATE POLICY "Read shipments" ON public.shipments
  FOR SELECT TO anon, authenticated
  USING (
    user_id = public.requesting_user_id() OR 
    EXISTS (SELECT 1 FROM public.orders WHERE orders.id = shipments.order_id AND orders.user_id = public.requesting_user_id()) OR 
    public.is_admin()
  );

DROP POLICY IF EXISTS "Read shipping tracking" ON public.shipping_tracking;
CREATE POLICY "Read shipping tracking" ON public.shipping_tracking
  FOR SELECT TO anon, authenticated
  USING (true);

-- 6. Coupons RLS
DROP POLICY IF EXISTS "Public read active coupons" ON public.coupons;
CREATE POLICY "Public read active coupons" ON public.coupons
  FOR SELECT TO anon, authenticated
  USING (is_active = true OR public.is_admin());

DROP POLICY IF EXISTS "Admins manage coupons" ON public.coupons;
CREATE POLICY "Admins manage coupons" ON public.coupons
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 7. Audit & Inventory
DROP POLICY IF EXISTS "Admins manage inventory movements" ON public.inventory_movements;
CREATE POLICY "Admins manage inventory movements" ON public.inventory_movements
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins view audit logs" ON public.admin_audit_logs;
CREATE POLICY "Admins view audit logs" ON public.admin_audit_logs
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- 8. Contact & Newsletter
DROP POLICY IF EXISTS "Public insert contact messages" ON public.contact_messages;
CREATE POLICY "Public insert contact messages" ON public.contact_messages
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Admins view contact messages" ON public.contact_messages;
CREATE POLICY "Admins view contact messages" ON public.contact_messages
  FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Public insert newsletter subscribers" ON public.newsletter_subscribers;
CREATE POLICY "Public insert newsletter subscribers" ON public.newsletter_subscribers
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Admins view newsletter subscribers" ON public.newsletter_subscribers;
CREATE POLICY "Admins view newsletter subscribers" ON public.newsletter_subscribers
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- 9. Storage Buckets (product-images)
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read product images" ON storage.objects;
CREATE POLICY "Public read product images" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'product-images');

DROP POLICY IF EXISTS "Admin upload product images" ON storage.objects;
CREATE POLICY "Admin upload product images" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'product-images' AND public.is_admin());

