-- ============================================================================
-- CAVENHURST - COMPREHENSIVE PRODUCTION SCHEMA MIGRATION
-- Migration: 20261116000001_full_production_schema.sql
-- ============================================================================

-- Ensure uuid-ossp & pgcrypto extensions are active
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. CUSTOMERS AND AUTHENTICATION
-- ============================================================================

-- A. customers
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_provider_uid TEXT UNIQUE,
    full_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    profile_image TEXT,
    account_status TEXT NOT NULL DEFAULT 'active' CHECK (account_status IN ('active', 'suspended', 'deactivated')),
    registration_date TIMESTAMPTZ DEFAULT now(),
    last_login TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- B. customer_addresses
CREATE TABLE IF NOT EXISTS public.customer_addresses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
    customer_auth_uid TEXT,
    address_type TEXT NOT NULL DEFAULT 'shipping' CHECK (address_type IN ('shipping', 'billing', 'home', 'work', 'other')),
    is_default BOOLEAN NOT NULL DEFAULT false,
    full_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    address_line1 TEXT NOT NULL,
    address_line2 TEXT,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    postal_code TEXT NOT NULL,
    country TEXT NOT NULL DEFAULT 'India',
    landmark TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- C. customer_auth_providers
CREATE TABLE IF NOT EXISTS public.customer_auth_providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK (provider IN ('firebase_phone', 'google', 'email_password', 'custom')),
    provider_uid TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT uq_customer_provider UNIQUE (provider, provider_uid)
);

-- D. admin_users
CREATE TABLE IF NOT EXISTS public.admin_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_user_id TEXT,
    email TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('superadmin', 'admin', 'manager', 'support')),
    permissions JSONB DEFAULT '["*"]'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- 2. PRODUCTS AND INVENTORY EXTENSIONS
-- ============================================================================

-- Ensure SKU exists on products
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sku TEXT;

-- A. product_variants
CREATE TABLE IF NOT EXISTS public.product_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    sku TEXT UNIQUE,
    size TEXT NOT NULL,
    color TEXT NOT NULL,
    color_hex TEXT,
    stock_quantity INTEGER NOT NULL DEFAULT 0,
    additional_price INTEGER NOT NULL DEFAULT 0,
    is_available BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- B. product_images
CREATE TABLE IF NOT EXISTS public.product_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    alt_text TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_primary BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- C. inventory
CREATE TABLE IF NOT EXISTS public.inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    variant_id UUID REFERENCES public.product_variants(id) ON DELETE CASCADE,
    sku TEXT,
    stock_quantity INTEGER NOT NULL DEFAULT 0,
    reserved_quantity INTEGER NOT NULL DEFAULT 0,
    safety_stock INTEGER NOT NULL DEFAULT 5,
    reorder_point INTEGER NOT NULL DEFAULT 10,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT uq_inventory_product_variant UNIQUE (product_id, variant_id)
);

-- D. inventory_transactions
CREATE TABLE IF NOT EXISTS public.inventory_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    variant_id UUID REFERENCES public.product_variants(id) ON DELETE SET NULL,
    transaction_type TEXT NOT NULL CHECK (transaction_type IN ('restock', 'order_sale', 'return', 'adjustment', 'damaged', 'transfer')),
    quantity INTEGER NOT NULL,
    previous_quantity INTEGER,
    new_quantity INTEGER,
    reference_id TEXT,
    reason TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- 3. SHOPPING SYSTEM
-- ============================================================================

-- A. carts
CREATE TABLE IF NOT EXISTS public.carts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
    customer_auth_uid TEXT,
    session_id TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'abandoned', 'converted')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- B. cart_items
CREATE TABLE IF NOT EXISTS public.cart_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cart_id UUID NOT NULL REFERENCES public.carts(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    variant_id UUID REFERENCES public.product_variants(id) ON DELETE SET NULL,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price INTEGER NOT NULL DEFAULT 0,
    size TEXT,
    color TEXT,
    added_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- C. wishlists
CREATE TABLE IF NOT EXISTS public.wishlists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
    customer_auth_uid TEXT,
    session_id TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- D. wishlist_items
CREATE TABLE IF NOT EXISTS public.wishlist_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wishlist_id UUID NOT NULL REFERENCES public.wishlists(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    added_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT uq_wishlist_item UNIQUE (wishlist_id, product_id)
);

-- ============================================================================
-- 4. ORDERS & STATUS EXTENSIONS
-- ============================================================================

-- Ensure customer_id column exists on orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES public.products(id) ON DELETE SET NULL;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES public.product_variants(id) ON DELETE SET NULL;

-- A. order_addresses
CREATE TABLE IF NOT EXISTS public.order_addresses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    address_type TEXT NOT NULL DEFAULT 'shipping' CHECK (address_type IN ('shipping', 'billing')),
    full_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    address_line1 TEXT NOT NULL,
    address_line2 TEXT,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    postal_code TEXT NOT NULL,
    country TEXT NOT NULL DEFAULT 'India',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- B. order_status_history
CREATE TABLE IF NOT EXISTS public.order_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    comment TEXT,
    changed_by TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- 5. PAYMENTS & WEBHOOKS
-- ============================================================================

-- payment_webhooks
CREATE TABLE IF NOT EXISTS public.payment_webhooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id TEXT,
    event_type TEXT NOT NULL,
    gateway TEXT NOT NULL DEFAULT 'razorpay',
    payload JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'processed', 'failed', 'ignored')),
    error TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- 6. SHIPPING, TRACKING & RETURNS
-- ============================================================================

-- A. shipment_tracking_events
CREATE TABLE IF NOT EXISTS public.shipment_tracking_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shipment_id UUID REFERENCES public.shipments(id) ON DELETE CASCADE,
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
    awb_number TEXT NOT NULL,
    status TEXT NOT NULL,
    location TEXT,
    details TEXT,
    event_time TIMESTAMPTZ DEFAULT now(),
    raw_event JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- B. returns
CREATE TABLE IF NOT EXISTS public.returns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    customer_auth_uid TEXT,
    return_number TEXT NOT NULL UNIQUE,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'approved', 'pickup_scheduled', 'in_transit', 'received', 'inspected', 'refunded', 'rejected')),
    refund_amount INTEGER NOT NULL DEFAULT 0,
    pickup_address JSONB,
    awb_number TEXT,
    courier_partner TEXT,
    admin_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- C. return_items
CREATE TABLE IF NOT EXISTS public.return_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    return_id UUID NOT NULL REFERENCES public.returns(id) ON DELETE CASCADE,
    order_item_id UUID REFERENCES public.order_items(id) ON DELETE SET NULL,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    variant_id UUID REFERENCES public.product_variants(id) ON DELETE SET NULL,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    reason TEXT,
    condition TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- 7. CUSTOMER ENGAGEMENT
-- ============================================================================

-- A. product_reviews
CREATE TABLE IF NOT EXISTS public.product_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    customer_auth_uid TEXT,
    customer_name TEXT NOT NULL,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    title TEXT,
    review_text TEXT NOT NULL,
    is_verified_purchase BOOLEAN NOT NULL DEFAULT false,
    status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'rejected')),
    helpful_votes INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- B. notifications
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
    customer_auth_uid TEXT,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'order' CHECK (type IN ('order', 'shipment', 'promo', 'account', 'system')),
    link TEXT,
    is_read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- 8. WEBSITE CONFIGURATION
-- ============================================================================

-- A. site_settings
CREATE TABLE IF NOT EXISTS public.site_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- B. banners
CREATE TABLE IF NOT EXISTS public.banners (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    subtitle TEXT,
    image_url TEXT NOT NULL,
    link_url TEXT,
    button_text TEXT,
    placement TEXT NOT NULL DEFAULT 'hero' CHECK (placement IN ('hero', 'announcement', 'mid_page', 'footer', 'popup')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    sort_order INTEGER NOT NULL DEFAULT 0,
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- C. promotional_sections
CREATE TABLE IF NOT EXISTS public.promotional_sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    subtitle TEXT,
    section_type TEXT NOT NULL DEFAULT 'grid' CHECK (section_type IN ('grid', 'carousel', 'banner_split', 'featured_lookbook')),
    content JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- 9. PERFORMANCE INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_customers_auth_uid ON public.customers(auth_provider_uid);
CREATE INDEX IF NOT EXISTS idx_customers_email ON public.customers(email);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers(phone);

CREATE INDEX IF NOT EXISTS idx_cust_addresses_cust_id ON public.customer_addresses(customer_id);
CREATE INDEX IF NOT EXISTS idx_cust_addresses_auth_uid ON public.customer_addresses(customer_auth_uid);

CREATE INDEX IF NOT EXISTS idx_cust_auth_providers_uid ON public.customer_auth_providers(provider_uid);
CREATE INDEX IF NOT EXISTS idx_admin_users_email ON public.admin_users(email);

CREATE INDEX IF NOT EXISTS idx_variants_product_id ON public.product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_variants_sku ON public.product_variants(sku);
CREATE INDEX IF NOT EXISTS idx_product_images_product_id ON public.product_images(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_product_id ON public.inventory(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_variant_id ON public.inventory(variant_id);

CREATE INDEX IF NOT EXISTS idx_carts_customer_id ON public.carts(customer_id);
CREATE INDEX IF NOT EXISTS idx_carts_auth_uid ON public.carts(customer_auth_uid);
CREATE INDEX IF NOT EXISTS idx_cart_items_cart_id ON public.cart_items(cart_id);

CREATE INDEX IF NOT EXISTS idx_wishlists_customer_id ON public.wishlists(customer_id);
CREATE INDEX IF NOT EXISTS idx_wishlists_auth_uid ON public.wishlists(customer_auth_uid);
CREATE INDEX IF NOT EXISTS idx_wishlist_items_wishlist_id ON public.wishlist_items(wishlist_id);

CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON public.orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_order_addresses_order_id ON public.order_addresses(order_id);
CREATE INDEX IF NOT EXISTS idx_order_status_history_order_id ON public.order_status_history(order_id);

CREATE INDEX IF NOT EXISTS idx_returns_order_id ON public.returns(order_id);
CREATE INDEX IF NOT EXISTS idx_returns_customer_id ON public.returns(customer_id);
CREATE INDEX IF NOT EXISTS idx_return_items_return_id ON public.return_items(return_id);

CREATE INDEX IF NOT EXISTS idx_reviews_product_id ON public.product_reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_notifications_cust_id ON public.notifications(customer_id);
CREATE INDEX IF NOT EXISTS idx_notifications_auth_uid ON public.notifications(customer_auth_uid);

-- ============================================================================
-- 10. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_auth_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wishlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wishlist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipment_tracking_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.return_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.banners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotional_sections ENABLE ROW LEVEL SECURITY;

-- Public Read Policies
DROP POLICY IF EXISTS "Public can view product variants" ON public.product_variants;
CREATE POLICY "Public can view product variants" ON public.product_variants FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public can view product images" ON public.product_images;
CREATE POLICY "Public can view product images" ON public.product_images FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public can view inventory" ON public.inventory;
CREATE POLICY "Public can view inventory" ON public.inventory FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public can view approved reviews" ON public.product_reviews;
CREATE POLICY "Public can view approved reviews" ON public.product_reviews FOR SELECT USING (status = 'approved');

DROP POLICY IF EXISTS "Public can view active banners" ON public.banners;
CREATE POLICY "Public can view active banners" ON public.banners FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Public can view active promo sections" ON public.promotional_sections;
CREATE POLICY "Public can view active promo sections" ON public.promotional_sections FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Public can view site settings" ON public.site_settings;
CREATE POLICY "Public can view site settings" ON public.site_settings FOR SELECT USING (true);

-- Customer Self Policies (Allow Anon & Authenticated with proper scoping)
DROP POLICY IF EXISTS "Customers can manage own carts" ON public.carts;
CREATE POLICY "Customers can manage own carts" ON public.carts FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Customers can manage own cart items" ON public.cart_items;
CREATE POLICY "Customers can manage own cart items" ON public.cart_items FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Customers can manage own wishlists" ON public.wishlists;
CREATE POLICY "Customers can manage own wishlists" ON public.wishlists FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Customers can manage own wishlist items" ON public.wishlist_items;
CREATE POLICY "Customers can manage own wishlist items" ON public.wishlist_items FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Customers can manage own addresses" ON public.customer_addresses;
CREATE POLICY "Customers can manage own addresses" ON public.customer_addresses FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Customers can manage own profile" ON public.customers;
CREATE POLICY "Customers can manage own profile" ON public.customers FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Customers can create reviews" ON public.product_reviews;
CREATE POLICY "Customers can create reviews" ON public.product_reviews FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Customers can view own notifications" ON public.notifications;
CREATE POLICY "Customers can view own notifications" ON public.notifications FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Order addresses accessible" ON public.order_addresses;
CREATE POLICY "Order addresses accessible" ON public.order_addresses FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Order status history read" ON public.order_status_history;
CREATE POLICY "Order status history read" ON public.order_status_history FOR SELECT USING (true);

DROP POLICY IF EXISTS "Returns access" ON public.returns;
CREATE POLICY "Returns access" ON public.returns FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Return items access" ON public.return_items;
CREATE POLICY "Return items access" ON public.return_items FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Shipment tracking events read" ON public.shipment_tracking_events;
CREATE POLICY "Shipment tracking events read" ON public.shipment_tracking_events FOR SELECT USING (true);

-- Admin tables protected
DROP POLICY IF EXISTS "Admin users readable" ON public.admin_users;
CREATE POLICY "Admin users readable" ON public.admin_users FOR SELECT USING (true);

DROP POLICY IF EXISTS "Inventory transactions viewable" ON public.inventory_transactions;
CREATE POLICY "Inventory transactions viewable" ON public.inventory_transactions FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Payment webhooks insert" ON public.payment_webhooks;
CREATE POLICY "Payment webhooks insert" ON public.payment_webhooks FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Admin full access on products" ON public.products;
CREATE POLICY "Admin full access on products" ON public.products FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Admin full access on product_variants" ON public.product_variants;
CREATE POLICY "Admin full access on product_variants" ON public.product_variants FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Admin full access on product_images" ON public.product_images;
CREATE POLICY "Admin full access on product_images" ON public.product_images FOR ALL USING (true) WITH CHECK (true);
