-- ==============================================================================
-- CAVENHURST – MIGRATION 20261123000004: ADMIN DASHBOARD REALTIME & CANONICAL VIEWS
-- ==============================================================================
-- 1. Adds core ecommerce tables to the supabase_realtime publication.
-- 2. Sets REPLICA IDENTITY FULL for detailed payload replication.
-- 3. Creates security_invoker views for categories and return_requests.
-- 4. Migrates tracking records from shipping_tracking to shipment_tracking_events.
-- ==============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. ADD CORE TABLES TO SUPABASE_REALTIME PUBLICATION
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_table text;
  v_tables text[] := ARRAY[
    'orders', 
    'payments', 
    'inventory', 
    'inventory_movements', 
    'shipments', 
    'profiles', 
    'returns'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = v_table
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', v_table);
    END IF;
  END LOOP;
END $$;

-- Set REPLICA IDENTITY FULL so updates broadcast complete row data
ALTER TABLE public.orders REPLICA IDENTITY FULL;
ALTER TABLE public.payments REPLICA IDENTITY FULL;
ALTER TABLE public.inventory REPLICA IDENTITY FULL;
ALTER TABLE public.inventory_movements REPLICA IDENTITY FULL;
ALTER TABLE public.shipments REPLICA IDENTITY FULL;
ALTER TABLE public.profiles REPLICA IDENTITY FULL;
ALTER TABLE public.returns REPLICA IDENTITY FULL;

-- -----------------------------------------------------------------------------
-- 2. CANONICAL ENTITY VIEWS WITH SECURITY INVOKER
-- -----------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.categories WITH (security_invoker = true) AS 
  SELECT * FROM public.product_categories;

CREATE OR REPLACE VIEW public.return_requests WITH (security_invoker = true) AS 
  SELECT * FROM public.returns;

-- Grant SELECT on views to anon and authenticated
GRANT SELECT ON public.categories TO anon, authenticated;
GRANT SELECT ON public.return_requests TO authenticated;

-- -----------------------------------------------------------------------------
-- 3. CONSOLIDATE TRACKING EVENTS INTO SHIPMENT_TRACKING_EVENTS
-- -----------------------------------------------------------------------------

INSERT INTO public.shipment_tracking_events (
  shipment_id,
  order_id,
  awb_number,
  status,
  location,
  details,
  event_time,
  created_at
)
SELECT 
  st.shipment_id,
  st.order_id,
  st.awb_number,
  st.current_status,
  st.status_location,
  st.activity,
  st.status_time,
  COALESCE(st.created_at, now())
FROM public.shipping_tracking st
WHERE NOT EXISTS (
  SELECT 1 FROM public.shipment_tracking_events ste 
  WHERE ste.awb_number = st.awb_number AND ste.status = st.current_status
);

COMMIT;
