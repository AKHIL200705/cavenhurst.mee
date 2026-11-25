-- Migration: 20261125000002_consolidate_legacy_and_clean_test_data.sql
-- STATUS: REVIEW ONLY — DO NOT RUN WITHOUT EXPLICIT OPERATOR CONFIRMATION.
-- Description:
--   1. Moves confirmed-unused overlapping legacy tables into a separate `legacy_archive` schema
--      (reversible without permanent data loss) instead of dropping immediately.
--   2. Removes confirmed pre-launch synthetic test seed records (`CVH-20261115-A101` &
--      `SMX772819201`) and synthetic test customer (`976ccf2d-5c50-403c-9ba8-c34a84139daa`).

-- BEGIN TRANSACTION;

-- 1. Create non-public archive schema for unused overlapping legacy tables
CREATE SCHEMA IF NOT EXISTS legacy_archive;

ALTER TABLE IF EXISTS public.inventory_items SET SCHEMA legacy_archive;
ALTER TABLE IF EXISTS public.inventory_transactions SET SCHEMA legacy_archive;
ALTER TABLE IF EXISTS public.customer_carts SET SCHEMA legacy_archive;
ALTER TABLE IF EXISTS public.customer_profiles SET SCHEMA legacy_archive;
ALTER TABLE IF EXISTS public.payment_webhooks SET SCHEMA legacy_archive;
ALTER TABLE IF EXISTS public.audit_logs SET SCHEMA legacy_archive;
ALTER TABLE IF EXISTS public.system_settings SET SCHEMA legacy_archive;
ALTER TABLE IF EXISTS public.support_messages SET SCHEMA legacy_archive;
ALTER TABLE IF EXISTS public.support_tickets SET SCHEMA legacy_archive;
ALTER TABLE IF EXISTS public.promotional_sections SET SCHEMA legacy_archive;
ALTER TABLE IF EXISTS public.admin_roles SET SCHEMA legacy_archive;

-- 2. Remove synthetic pre-launch seed order & shipment (order CVH-20261115-A101 / AWB SMX772819201)
DELETE FROM public.shipping_tracking WHERE order_id = 'e1a2b3c4-0001-4000-8000-000000000001';
DELETE FROM public.shipment_tracking_events WHERE order_id = 'e1a2b3c4-0001-4000-8000-000000000001';
DELETE FROM public.shipments WHERE order_id = 'e1a2b3c4-0001-4000-8000-000000000001';
DELETE FROM public.payments WHERE order_id = 'e1a2b3c4-0001-4000-8000-000000000001';
DELETE FROM public.order_status_history WHERE order_id = 'e1a2b3c4-0001-4000-8000-000000000001';
DELETE FROM public.order_addresses WHERE order_id = 'e1a2b3c4-0001-4000-8000-000000000001';
DELETE FROM public.shipping_addresses WHERE order_id = 'e1a2b3c4-0001-4000-8000-000000000001';
DELETE FROM public.order_items WHERE order_id = 'e1a2b3c4-0001-4000-8000-000000000001';
DELETE FROM public.orders WHERE id = 'e1a2b3c4-0001-4000-8000-000000000001';

-- 3. Remove synthetic test customer record
DELETE FROM public.customers WHERE id = '976ccf2d-5c50-403c-9ba8-c34a84139daa' AND email LIKE '%@cavenhurst-test.com';

-- NOTIFY pgrst, 'reload schema';
-- COMMIT;
