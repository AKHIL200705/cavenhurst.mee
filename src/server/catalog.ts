import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getDb } from "@/server/db";
import { type Product, type Size } from "@/lib/products";
import type { Json } from "@/integrations/supabase/types";

/**
 * Maps database product row to the frontend Product type.
 */
function mapDbProductToFrontend(row: any): Product {
  const stockObj: Partial<Record<Size, number>> = {};
  if (row.stock && typeof row.stock === "object") {
    for (const [k, v] of Object.entries(row.stock)) {
      stockObj[k as Size] = Number(v) || 0;
    }
  }

  const colors = Array.isArray(row.colors)
    ? row.colors.map((c: any) =>
        typeof c === "string" ? { name: c, hex: "#1C1917" } : { name: c.name || "Default", hex: c.hex || "#1C1917" },
      )
    : [{ name: "Standard", hex: "#1C1917" }];

  return {
    slug: row.slug,
    name: row.name,
    category: (row.category_slug as any) || "t-shirts",
    tags: Array.isArray(row.tags) ? row.tags : ["essentials"],
    price: Number(row.price) || 0,
    mrp: Number(row.mrp) || Number(row.price) || 0,
    colors,
    stock: stockObj,
    images: Array.isArray(row.images) && row.images.length > 0 ? row.images : ["/favicon.png"],
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
          SELECT *
          FROM products
          WHERE is_published = true
          ORDER BY rank ASC
        `;
        if (rows && rows.length > 0) {
          return (rows as any[]).map(mapDbProductToFrontend);
        }
      } catch (dbErr) {
        console.error("[Catalog ServerFn] Direct DB error, falling back to Supabase client:", dbErr);
      }
    }

    try {
      const { data: dbProducts, error } = await supabaseAdmin
        .from("products")
        .select("*")
        .eq("is_published", true)
        .order("rank", { ascending: true });

      if (error || !dbProducts) {
        console.error("[Catalog ServerFn] Error querying products:", error);
        return [];
      }

      return dbProducts.map(mapDbProductToFrontend);
    } catch (err) {
      console.error("[Catalog ServerFn] Unexpected error:", err);
      return [];
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
        const [row] = await sql`
          SELECT *
          FROM products
          WHERE slug = ${data.slug} AND is_published = true
          LIMIT 1
        `;
        if (row) {
          return mapDbProductToFrontend(row);
        }
      } catch (dbErr) {
        console.error("[Product Detail ServerFn] Direct DB error, falling back to Supabase client:", dbErr);
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
        return mapDbProductToFrontend(row);
      }
      return null;
    } catch (err) {
      console.error("[Product Detail ServerFn] DB error:", err);
      return null;
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
      productSlug: string;
      customerName: string;
      rating: number;
      title?: string | undefined;
      reviewText: string;
      customerAuthUid?: string | undefined;
    }) => params,
  )
  .handler(async ({ data }) => {
    try {
      const { data: prod } = await supabaseAdmin
        .from("products")
        .select("id")
        .eq("slug", data.productSlug)
        .maybeSingle();

      if (!prod?.id) throw new Error("Product not found");

      const { data: inserted, error } = await supabaseAdmin
        .from("product_reviews")
        .insert({
          product_id: prod.id,
          customer_name: data.customerName,
          customer_auth_uid: data.customerAuthUid || null,
          rating: Math.min(5, Math.max(1, data.rating)),
          title: data.title || null,
          review_text: data.reviewText,
          status: "approved",
        })
        .select("id")
        .single();

      if (error) throw new Error(error.message);
      return { success: true, id: inserted.id };
    } catch (err: any) {
      throw new Error(err.message || "Failed to submit review");
    }
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
