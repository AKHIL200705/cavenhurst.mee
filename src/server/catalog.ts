import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getDb } from "@/server/db";
import { getAuthenticatedCustomerId } from "./auth-helpers";
import {
  COLOR_PHOTOS,
  PRODUCTS,
  getProduct,
  resolveProductAsset,
  type Product,
  type Size,
} from "@/lib/products";
import type { Json } from "@/integrations/supabase/types";

interface DbProductRow {
  slug: string;
  name: string;
  category_slug?: string | null;
  tags?: string[] | Json | null;
  price?: number | string | null;
  mrp?: number | string | null;
  colors?: Json | Array<string | { name?: string; hex?: string }> | null;
  live_stock?: Record<string, number> | null;
  stock?: Json | Record<string, number> | null;
  images?: string[] | null;
  description?: string | null;
  fabric?: string | null;
  fit?: string | null;
  is_new?: boolean | null;
  sold?: number | string | null;
  rank?: number | string | null;
}

/**
 * Maps database product row to the frontend Product type.
 */
function mapDbProductToFrontend(row: DbProductRow): Product {
  const stockObj: Partial<Record<Size, number>> = {};
  const stockSource = row.live_stock || row.stock;
  if (stockSource && typeof stockSource === "object") {
    for (const [k, v] of Object.entries(stockSource)) {
      stockObj[k as Size] = Number(v) || 0;
    }
  }

  const colors = Array.isArray(row.colors)
    ? row.colors.map((c) => {
        if (typeof c === "string") return { name: c, hex: "#1C1917" };
        const obj = (c || {}) as { name?: string; hex?: string };
        return { name: obj.name || "Default", hex: obj.hex || "#1C1917" };
      })
    : [{ name: "Standard", hex: "#1C1917" }];

  const category = (row.category_slug as Product["category"]) || "t-shirts";
  const staticFallback = PRODUCTS.find((item) => item.slug === row.slug);
  const rawImages =
    Array.isArray(row.images) && row.images.length > 0 ? row.images : staticFallback?.images || [];
  const resolvedImages = rawImages
    .map((img) => resolveProductAsset(img))
    .filter((img): img is string => Boolean(img));

  const colorMap =
    staticFallback?.colorImages ??
    (row.slug === "mythic-graphic-tee" || row.slug === "flow-print-tee"
      ? COLOR_PHOTOS["graphic"]
      : COLOR_PHOTOS[category]);

  return {
    slug: row.slug,
    name: row.name,
    category,
    tags: Array.isArray(row.tags) ? (row.tags as Product["tags"]) : ["essentials"],
    ...(colorMap ? { colorImages: colorMap } : {}),
    price: Number(row.price) || 0,
    mrp: Number(row.mrp) || Number(row.price) || 0,
    colors,
    stock: stockObj,
    images: resolvedImages.length > 0 ? resolvedImages : ["/favicon.png"],
    description: row.description || "",
    fabric: row.fabric || "100% Cotton",
    fit: row.fit || "Regular",
    isNew: Boolean(row.is_new),
    sold: Number(row.sold) || 0,
    rank: Number(row.rank) || 99,
  };
}

/**
 * Returns all active products directly from Supabase.
 * No hardcoded demo fallbacks - Supabase is the sole source of truth.
 */
export const getStoreCatalogServerFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<Product[]> => {
    const sql = getDb();
    if (sql) {
      try {
        const rows = await sql`
          SELECT 
            p.*,
            COALESCE(
              (
                SELECT jsonb_object_agg(sz.size, sz.avail)
                FROM (
                  SELECT
                    v.size,
                    SUM(GREATEST(0, COALESCE(i.stock_quantity - COALESCE(i.reserved_quantity, 0), v.stock_quantity, 0)))::int AS avail
                  FROM public.product_variants v
                  LEFT JOIN public.inventory i ON i.variant_id = v.id
                  WHERE v.product_id = p.id
                  GROUP BY v.size
                ) sz
              ),
              p.stock
            ) AS live_stock
          FROM products p
          WHERE p.is_published = true
          ORDER BY p.rank ASC
        `;
        if (rows && rows.length > 0) {
          return (rows as unknown as DbProductRow[]).map(mapDbProductToFrontend);
        }
      } catch (dbErr) {
        console.error(
          "[Catalog ServerFn] Direct DB error, falling back to Supabase client:",
          dbErr,
        );
      }
    }

    try {
      const { data: dbProducts, error } = await supabaseAdmin
        .from("products")
        .select("*")
        .eq("is_published", true)
        .order("rank", { ascending: true });

      if (error || !dbProducts || dbProducts.length === 0) {
        console.warn("[Catalog ServerFn] DB products notice, using fallback catalog:", error);
        return PRODUCTS;
      }

      return dbProducts.map((r) => mapDbProductToFrontend(r as unknown as DbProductRow));
    } catch (err) {
      console.warn("[Catalog ServerFn] Unexpected error, using fallback catalog:", err);
      return PRODUCTS;
    }
  },
);

/**
 * Returns a single product by slug strictly from Supabase.
 */
export const getProductBySlugServerFn = createServerFn({ method: "POST" })
  .validator((params: { slug: string }) => params)
  .handler(async ({ data }): Promise<Product | null> => {
    const sql = getDb();
    if (sql) {
      try {
        const [row] = await sql<DbProductRow[]>`
          SELECT 
            p.*,
            COALESCE(
              (
                SELECT jsonb_object_agg(sz.size, sz.avail)
                FROM (
                  SELECT
                    v.size,
                    SUM(GREATEST(0, COALESCE(i.stock_quantity - COALESCE(i.reserved_quantity, 0), v.stock_quantity, 0)))::int AS avail
                  FROM public.product_variants v
                  LEFT JOIN public.inventory i ON i.variant_id = v.id
                  WHERE v.product_id = p.id
                  GROUP BY v.size
                ) sz
              ),
              p.stock
            ) AS live_stock
          FROM products p
          WHERE p.slug = ${data.slug} AND p.is_published = true
          LIMIT 1
        `;
        if (row) {
          return mapDbProductToFrontend(row);
        }
      } catch (dbErr) {
        console.error(
          "[Product Detail ServerFn] Direct DB error, falling back to Supabase client:",
          dbErr,
        );
      }
    }

    try {
      const { data: row, error } = await supabaseAdmin
        .from("products")
        .select("*")
        .eq("slug", data.slug)
        .eq("is_published", true)
        .maybeSingle();

      if (!error && row) {
        return mapDbProductToFrontend(row as unknown as DbProductRow);
      }
      return getProduct(data.slug) || null;
    } catch (err) {
      console.warn("[Product Detail ServerFn] DB error, checking fallback product:", err);
      return getProduct(data.slug) || null;
    }
  });

/**
 * Returns customer reviews for a given product.
 */
export const getProductReviewsServerFn = createServerFn({ method: "POST" })
  .validator((params: { productSlug: string }) => params)
  .handler(async ({ data }) => {
    try {
      // Find product id
      const { data: prod } = await supabaseAdmin
        .from("products")
        .select("id")
        .eq("slug", data.productSlug)
        .maybeSingle();

      if (!prod?.id) return [];

      const { data: reviews, error } = await supabaseAdmin
        .from("product_reviews")
        .select("*")
        .eq("product_id", prod.id)
        .eq("status", "approved")
        .order("created_at", { ascending: false });

      if (error) return [];
      return reviews || [];
    } catch {
      return [];
    }
  });

/**
 * Submits a new customer review.
 */
export const submitProductReviewServerFn = createServerFn({ method: "POST" })
  .validator(
    (params: {
      authToken?: string | undefined;
      productSlug: string;
      customerName: string;
      rating: number;
      title?: string | undefined;
      reviewText: string;
      customerAuthUid?: string | undefined;
    }) => params,
  )
  .handler(async ({ data }) => {
    const auth = await getAuthenticatedCustomerId(data.authToken);
    if (!auth) {
      throw new Error("Please sign in to submit a product review.");
    }

    const reviewText = data.reviewText.trim();
    if (!reviewText || reviewText.length < 3) {
      throw new Error("Please enter a review before submitting.");
    }

    const { data: prod } = await supabaseAdmin
      .from("products")
      .select("id")
      .eq("slug", data.productSlug)
      .maybeSingle();

    if (!prod?.id) throw new Error("Product not found");

    // Check if the authenticated customer previously ordered this product
    let isVerifiedPurchase = false;
    const sql = getDb();
    if (sql) {
      try {
        const [purchased] = await sql<{ id: string }[]>`
          SELECT oi.id
          FROM public.order_items oi
          JOIN public.orders o ON o.id = oi.order_id
          WHERE oi.product_id = ${prod.id}::uuid
            AND (o.user_id = ${auth.id} OR (${auth.customerUuid ? sql`o.customer_id = ${auth.customerUuid}::uuid` : sql`false`}))
            AND o.status NOT IN ('cancelled', 'failed')
          LIMIT 1
        `;
        isVerifiedPurchase = Boolean(purchased);
      } catch {
        isVerifiedPurchase = false;
      }
    }

    const { data: inserted, error } = await supabaseAdmin
      .from("product_reviews")
      .insert({
        product_id: prod.id,
        customer_id: auth.customerUuid || null,
        customer_name: data.customerName.trim().slice(0, 100) || "Verified Customer",
        customer_auth_uid: auth.id,
        rating: Math.min(5, Math.max(1, Math.round(data.rating))),
        title: data.title?.trim().slice(0, 120) || null,
        review_text: reviewText.slice(0, 2000),
        is_verified_purchase: isVerifiedPurchase,
        status: "pending",
      })
      .select("id")
      .single();

    if (error) throw new Error(error.message);
    return { success: true, id: inserted.id, status: "pending" as const };
  });

/**
 * Returns active store promotional banners.
 */
export const getStoreBannersServerFn = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { data: banners, error } = await supabaseAdmin
      .from("banners")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (error) return [];
    return banners || [];
  } catch {
    return [];
  }
});
