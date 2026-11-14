CREATE TABLE public.customer_welcome (
 user_id uuid PRIMARY KEY,
 welcome_seen_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.customer_welcome TO authenticated;
GRANT ALL ON public.customer_welcome TO service_role;
ALTER TABLE public.customer_welcome ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Customers read their welcome status" ON public.customer_welcome FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Customers complete their own welcome" ON public.customer_welcome FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
COMMENT ON TABLE public.customer_welcome IS 'One immutable welcome completion per customer. Absence means welcome is not yet completed.';