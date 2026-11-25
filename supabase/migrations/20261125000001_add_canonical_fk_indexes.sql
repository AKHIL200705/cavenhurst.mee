-- Migration: 20261125000001_add_canonical_fk_indexes.sql
-- Description: Non-destructive performance indexes for foreign-key lookups and tracking queries
--              on canonical order_items, payments, and shipments tables.

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON public.order_items (product_id);
CREATE INDEX IF NOT EXISTS idx_order_items_variant_id ON public.order_items (variant_id);

CREATE INDEX IF NOT EXISTS idx_payments_order_id ON public.payments (order_id);

CREATE INDEX IF NOT EXISTS idx_shipments_order_id ON public.shipments (order_id);
CREATE INDEX IF NOT EXISTS idx_shipments_awb_number ON public.shipments (awb_number);

NOTIFY pgrst, 'reload schema';
