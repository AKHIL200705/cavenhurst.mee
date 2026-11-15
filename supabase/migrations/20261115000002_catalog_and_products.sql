-- ==============================================================================
-- CAVENHURST Migration 02: Product Categories, Products Catalog & Seeds
-- File: supabase/migrations/20261115000002_catalog_and_products.sql
-- ==============================================================================

-- 1. Product Categories Table
CREATE TABLE IF NOT EXISTS public.product_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS product_categories_slug_idx ON public.product_categories (slug);

GRANT ALL ON public.product_categories TO service_role;
GRANT SELECT ON public.product_categories TO anon, authenticated;
GRANT ALL ON public.product_categories TO authenticated;
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Categories viewable by everyone" ON public.product_categories;
CREATE POLICY "Categories viewable by everyone" ON public.product_categories
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Admins manage categories" ON public.product_categories;
CREATE POLICY "Admins manage categories" ON public.product_categories
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Seed Standard Categories
INSERT INTO public.product_categories (slug, name, description)
VALUES 
  ('t-shirts', 'T-Shirts', 'Premium heavyweight tees for everyday movement and relaxed drape.'),
  ('hoodies', 'Hoodies', 'Heavyweight fleece comfort, built for the city and seasonal layering.'),
  ('oversized', 'Oversized', 'Boxy silhouettes, dropped shoulders, and effortless structure.'),
  ('graphic', 'Graphics', 'Screen-printed artwork and classical sculptured illustrations.'),
  ('fan-edition', 'Fan Edition', 'Matchday crests and stadium-night editions.')
ON CONFLICT (slug) DO UPDATE SET 
  name = EXCLUDED.name,
  description = EXCLUDED.description;

-- 2. Products Table
CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  category_slug text REFERENCES public.product_categories(slug) ON UPDATE CASCADE ON DELETE SET NULL,
  price integer NOT NULL,
  mrp integer NOT NULL,
  fabric text,
  fit text,
  description text,
  tags text[] DEFAULT '{}',
  colors jsonb DEFAULT '[]'::jsonb,
  stock jsonb DEFAULT '{}'::jsonb,
  images text[] DEFAULT '{}',
  is_new boolean DEFAULT true,
  is_published boolean DEFAULT true,
  is_featured boolean DEFAULT false,
  views integer DEFAULT 0,
  sold integer DEFAULT 0,
  rank integer DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS products_slug_idx ON public.products (slug);
CREATE INDEX IF NOT EXISTS products_category_slug_idx ON public.products (category_slug);
CREATE INDEX IF NOT EXISTS products_is_published_idx ON public.products (is_published);
CREATE INDEX IF NOT EXISTS products_rank_idx ON public.products (rank ASC);

GRANT ALL ON public.products TO service_role;
GRANT SELECT ON public.products TO anon, authenticated;
GRANT ALL ON public.products TO authenticated;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Published products viewable by everyone" ON public.products;
CREATE POLICY "Published products viewable by everyone" ON public.products
  FOR SELECT TO anon, authenticated USING (is_published = true OR public.is_admin());

DROP POLICY IF EXISTS "Admins manage products" ON public.products;
CREATE POLICY "Admins manage products" ON public.products
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Seed 12 Catalog Products
INSERT INTO public.products (
  slug, name, category_slug, price, mrp, fabric, fit, description, 
  colors, stock, images, is_new, is_published, is_featured, sold, rank
) VALUES 
(
  'signature-oversized-tee', 'Signature Oversized Tee', 't-shirts', 879, 1099,
  '100% combed cotton, 240 GSM', 'Oversized',
  'Our signature heavyweight tee with a dropped shoulder and a boxy, relaxed silhouette.',
  '[{"name": "Midnight Navy", "hex": "#0A1F3C"}, {"name": "Silver Grey", "hex": "#C7D1DF"}, {"name": "Pure White", "hex": "#F5F5F2"}]'::jsonb,
  '{"XS": 8, "S": 20, "M": 25, "L": 22, "XL": 12, "XXL": 6}'::jsonb,
  ARRAY['/src/assets/tee-navy.jpg', '/src/assets/hero-urban-motion.jpg'],
  true, true, true, 940, 1
),
(
  'relaxed-essential-tee', 'Relaxed Essential Tee', 't-shirts', 749, 999,
  '100% combed cotton, 200 GSM', 'Relaxed',
  'A soft, relaxed everyday tee designed to be worn on repeat.',
  '[{"name": "Cream", "hex": "#EFE9DD"}, {"name": "Silver Grey", "hex": "#C7D1DF"}, {"name": "Midnight Navy", "hex": "#0A1F3C"}]'::jsonb,
  '{"XS": 8, "S": 20, "M": 25, "L": 22, "XL": 12, "XXL": 0}'::jsonb,
  ARRAY['/src/assets/tee-cream.jpg'],
  true, true, false, 1210, 2
),
(
  'mythic-graphic-tee', 'Mythic Graphic Tee', 't-shirts', 839, 1199,
  '100% cotton, 240 GSM, puff-print', 'Oversized',
  'Classical sculpture artwork screen-printed on a heavyweight oversized base.',
  '[{"name": "Jet Black", "hex": "#0B0B0D"}, {"name": "Silver Grey", "hex": "#C7D1DF"}, {"name": "Midnight Navy", "hex": "#0A1F3C"}]'::jsonb,
  '{"XS": 8, "S": 20, "M": 25, "L": 22, "XL": 12, "XXL": 6}'::jsonb,
  ARRAY['/src/assets/tee-graphic.jpg'],
  true, true, true, 780, 3
),
(
  'classic-hoodie', 'Classic Hoodie', 'hoodies', 2299, 2299,
  '80% cotton / 20% polyester, 360 GSM fleece', 'Regular',
  'Brushed-back fleece hoodie with a double-layer hood and kangaroo pocket.',
  '[{"name": "Midnight Navy", "hex": "#0A1F3C"}, {"name": "Silver Grey", "hex": "#C7D1DF"}, {"name": "Jet Black", "hex": "#0B0B0D"}]'::jsonb,
  '{"XS": 8, "S": 20, "M": 25, "L": 22, "XL": 12, "XXL": 6}'::jsonb,
  ARRAY['/src/assets/hoodie-navy.jpg', '/src/assets/hero-urban-motion.jpg'],
  true, true, false, 650, 4
),
(
  'urban-motion-hoodie', 'Urban Motion Hoodie', 'hoodies', 2499, 2999,
  '100% cotton French terry, 400 GSM', 'Oversized',
  'The campaign hoodie. Heavyweight, oversized and finished with a silver wing emblem.',
  '[{"name": "Midnight Navy", "hex": "#0A1F3C"}, {"name": "Jet Black", "hex": "#0B0B0D"}]'::jsonb,
  '{"S": 5, "M": 9, "L": 7, "XL": 3}'::jsonb,
  ARRAY['/src/assets/hero-urban-motion.jpg', '/src/assets/hoodie-navy.jpg'],
  false, true, true, 820, 5
),
(
  'fan-edition-18-tee', 'Fan Edition No.18 Tee', 't-shirts', 1199, 1499,
  '100% cotton, 240 GSM', 'Oversized',
  'Stadium-night fan edition with a bold No.18 crest. Heavyweight oversized fit.',
  '[{"name": "Jet Black", "hex": "#0B0B0D"}, {"name": "Pure White", "hex": "#F5F5F2"}]'::jsonb,
  '{"XS": 8, "S": 20, "M": 25, "L": 22, "XL": 12, "XXL": 6}'::jsonb,
  ARRAY['/src/assets/tee-fan-black.jpg'],
  true, true, true, 870, 6
),
(
  'logo-classic-tee', 'Logo Classic Tee', 't-shirts', 959, 1199,
  '100% combed cotton, 220 GSM', 'Regular',
  'Clean classic tee with the CAVENHURST wordmark.',
  '[{"name": "Pure White", "hex": "#F5F5F2"}, {"name": "Midnight Navy", "hex": "#0A1F3C"}]'::jsonb,
  '{"XS": 8, "S": 20, "M": 25, "L": 22, "XL": 12, "XXL": 6}'::jsonb,
  ARRAY['/src/assets/tee-cream.jpg'],
  false, true, false, 560, 7
),
(
  'racer-panel-tee', 'Racer Panel Tee', 't-shirts', 1104, 1299,
  'Cotton-poly blend, 230 GSM', 'Oversized',
  'Sport-inspired panelled tee with contrast piping along the sleeves.',
  '[{"name": "Midnight Navy", "hex": "#0A1F3C"}, {"name": "Silver Grey", "hex": "#C7D1DF"}, {"name": "Pure White", "hex": "#F5F5F2"}]'::jsonb,
  '{"XS": 0, "S": 20, "M": 25, "L": 22, "XL": 12, "XXL": 6}'::jsonb,
  ARRAY['/src/assets/tee-navy.jpg'],
  false, true, false, 430, 8
),
(
  'flow-print-tee', 'Flow Print Tee', 't-shirts', 1039, 1299,
  '100% cotton, 240 GSM', 'Oversized',
  'Abstract flowing-fabric print on a premium heavyweight tee.',
  '[{"name": "Jet Black", "hex": "#0B0B0D"}, {"name": "Midnight Navy", "hex": "#0A1F3C"}]'::jsonb,
  '{"XS": 8, "S": 20, "M": 25, "L": 22, "XL": 12, "XXL": 6}'::jsonb,
  ARRAY['/src/assets/tee-graphic.jpg'],
  false, true, false, 390, 9
),
(
  'midnight-zip-hoodie', 'Midnight Zip Hoodie', 'hoodies', 2599, 2999,
  '80% cotton / 20% polyester fleece', 'Regular',
  'Full-zip fleece hoodie for layering through the city.',
  '[{"name": "Midnight Navy", "hex": "#0A1F3C"}, {"name": "Silver Grey", "hex": "#C7D1DF"}]'::jsonb,
  '{}'::jsonb,
  ARRAY['/src/assets/hoodie-navy.jpg'],
  false, true, false, 280, 10
),
(
  'fan-edition-crest-tee', 'Fan Edition Crest Tee', 't-shirts', 1099, 1399,
  '100% cotton, 220 GSM', 'Relaxed',
  'Matchday crest tee for the stands and the streets.',
  '[{"name": "Pure White", "hex": "#F5F5F2"}, {"name": "Jet Black", "hex": "#0B0B0D"}]'::jsonb,
  '{"XS": 8, "S": 20, "M": 25, "L": 22, "XL": 12, "XXL": 6}'::jsonb,
  ARRAY['/src/assets/tee-fan-white.jpg'],
  false, true, false, 410, 11
),
(
  'sky-essential-tee', 'Sky Essential Tee', 't-shirts', 749, 999,
  '100% combed cotton, 200 GSM', 'Relaxed',
  'Your everyday essential in a soft sky tone.',
  '[{"name": "Sky Blue", "hex": "#A9C8E8"}, {"name": "Pure White", "hex": "#F5F5F2"}]'::jsonb,
  '{"XS": 8, "S": 20, "M": 25, "L": 22, "XL": 12, "XXL": 6}'::jsonb,
  ARRAY['/src/assets/tee-cream.jpg'],
  true, true, false, 340, 12
)
ON CONFLICT (slug) DO UPDATE SET
  price = EXCLUDED.price,
  mrp = EXCLUDED.mrp,
  stock = EXCLUDED.stock,
  is_published = EXCLUDED.is_published;

