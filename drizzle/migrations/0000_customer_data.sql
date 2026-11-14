CREATE TABLE public.customer_carts (
  user_id uuid PRIMARY KEY,
  items jsonb NOT NULL DEFAULT '[]',
  wishlist jsonb NOT NULL DEFAULT '[]',
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_carts TO authenticated;
GRANT ALL ON public.customer_carts TO service_role;
ALTER TABLE public.customer_carts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own cart" ON public.customer_carts FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  items jsonb NOT NULL,
  total integer NOT NULL,
  status text NOT NULL DEFAULT 'awaiting_payment',
  shipping jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own orders" ON public.orders FOR SELECT TO authenticated USING (auth.uid() = user_id);