import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getDb } from "@/server/db";
import { getAuthenticatedCustomerId } from "./auth-helpers";
import { getVariantAvailableStock, parseStockMap } from "./inventory";
import { resolveProductAsset, type Size } from "@/lib/products";

export interface CartItemData {
  slug: string;
  size: Size;
  color: string;
  qty: number;
  id?: string;
  name?: string;
  price?: number;
  mrp?: number;
  image?: string | null | undefined;
  maxStock?: number;
  availableColors?: string[] | undefined;
  sizeStock?: Record<string, number> | undefined;
}

export interface SyncCartInput {
  authToken?: string | undefined;
  guestCart?: CartItemData[] | undefined;
  guestWishlist?: string[] | undefined;
}

export interface UpdateCartInput {
  authToken?: string | undefined;
  action: "add" | "setQty" | "remove" | "clear" | "updateVariant";
  item?: CartItemData | undefined;
  prevSize?: Size | undefined;
  prevColor?: string | undefined;
  index?: number | undefined;
}

export interface ToggleWishlistInput {
  authToken?: string | undefined;
  productSlug: string;
}

function postgrestLiteral(val: string): string {
  return `"${val.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * Ensures an active cart row exists for the customer in public.carts.
 */
async function getOrCreateActiveCart(customerUuid?: string, authUid?: string): Promise<string> {
  const sql = getDb();
  if (sql) {
    try {
      const existing = await sql<{ id: string }[]>`
        SELECT id FROM public.carts
        WHERE status = 'active'
          AND (
            (${customerUuid || null}::uuid IS NOT NULL AND customer_id = ${customerUuid || null}::uuid)
            OR (${authUid || null}::text IS NOT NULL AND customer_auth_uid = ${authUid || null})
          )
        ORDER BY updated_at DESC
        LIMIT 1
      `;
      if (existing[0]?.id) return existing[0].id;

      const [newCart] = await sql<{ id: string }[]>`
        INSERT INTO public.carts (customer_id, customer_auth_uid, status, updated_at)
        VALUES (${customerUuid || null}, ${authUid || null}, 'active', now())
        RETURNING id
      `;
      if (newCart?.id) return newCart.id;
    } catch (err) {
      console.warn("[Cart] Direct SQL failed, trying PostgREST fallback:", err);
    }
  }

  const orClauses: string[] = [];
  if (customerUuid) orClauses.push(`customer_id.eq.${postgrestLiteral(customerUuid)}`);
  if (authUid) orClauses.push(`customer_auth_uid.eq.${postgrestLiteral(authUid)}`);

  const { data: existingCart } = await supabaseAdmin
    .from("carts")
    .select("id")
    .or(orClauses.join(","))
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingCart?.id) {
    return existingCart.id;
  }

  // Create new active cart
  const { data: newCart, error } = await supabaseAdmin
    .from("carts")
    .insert({
      customer_id: customerUuid || null,
      customer_auth_uid: authUid || null,
      status: "active",
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !newCart?.id) {
    throw new Error(`Failed to create cart: ${error?.message || "Unknown error"}`);
  }

  return newCart.id;
}

/**
 * Ensures a wishlist exists for the customer in public.wishlists.
 */
async function getOrCreateWishlist(customerUuid?: string, authUid?: string): Promise<string> {
  const sql = getDb();
  if (sql) {
    try {
      const existing = await sql<{ id: string }[]>`
        SELECT id FROM public.wishlists
        WHERE (
          (${customerUuid || null}::uuid IS NOT NULL AND customer_id = ${customerUuid || null}::uuid)
          OR (${authUid || null}::text IS NOT NULL AND customer_auth_uid = ${authUid || null})
        )
        ORDER BY updated_at DESC
        LIMIT 1
      `;
      if (existing[0]?.id) return existing[0].id;

      const [newWish] = await sql<{ id: string }[]>`
        INSERT INTO public.wishlists (customer_id, customer_auth_uid, updated_at)
        VALUES (${customerUuid || null}, ${authUid || null}, now())
        RETURNING id
      `;
      if (newWish?.id) return newWish.id;
    } catch (err) {
      console.warn("[Wishlist] Direct SQL failed, trying PostgREST fallback:", err);
    }
  }

  const orClauses: string[] = [];
  if (customerUuid) orClauses.push(`customer_id.eq.${postgrestLiteral(customerUuid)}`);
  if (authUid) orClauses.push(`customer_auth_uid.eq.${postgrestLiteral(authUid)}`);

  const { data: existingWish } = await supabaseAdmin
    .from("wishlists")
    .select("id")
    .or(orClauses.join(","))
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingWish?.id) {
    return existingWish.id;
  }

  const { data: newWish, error } = await supabaseAdmin
    .from("wishlists")
    .insert({
      customer_id: customerUuid || null,
      customer_auth_uid: authUid || null,
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !newWish?.id) {
    throw new Error(`Failed to create wishlist: ${error?.message || "Unknown error"}`);
  }

  return newWish.id;
}

async function resolveCartItemStock(
  productId: string,
  rawStock: unknown,
  size: string,
  color?: string,
): Promise<number> {
  const variantStock = await getVariantAvailableStock(productId, size, color);
  if (variantStock.variantId) {
    return variantStock.available;
  }
  const parsed = parseStockMap(rawStock);
  return parsed[size] ?? 0;
}

/**
 * Reads full cart items from Supabase cart_items joined with products.
 */
async function getCartItemsFromDb(cartId: string): Promise<CartItemData[]> {
  const { data: items, error } = await supabaseAdmin
    .from("cart_items")
    .select(
      `
      id,
      product_id,
      variant_id,
      product_slug,
      size,
      color,
      quantity,
      unit_price,
      products (
        id,
        slug,
        name,
        price,
        stock,
        colors,
        images
      )
    `,
    )
    .eq("cart_id", cartId)
    .order("added_at", { ascending: true });

  if (error || !items) {
    console.error("[Cart] Error fetching cart items:", error);
    return [];
  }

  interface CartItemJoinRow {
    id: string;
    product_id: string | null;
    product_slug: string | null;
    size: string | null;
    color: string | null;
    quantity: number;
    unit_price: number | null;
    products: {
      id: string;
      slug: string;
      name: string;
      price: number;
      stock: unknown;
      colors: unknown;
      images: string[] | null;
    } | null;
  }

  return await Promise.all(
    (items as unknown as CartItemJoinRow[]).map(async (row) => {
      const prod = row.products;
      const sizeKey = row.size || "M";
      const parsedStock = parseStockMap(prod?.stock);
      const maxStock = prod?.id
        ? await resolveCartItemStock(prod.id, prod.stock, sizeKey, row.color || undefined)
        : (parsedStock[sizeKey] ?? 0);
      const qty = Math.max(1, Math.min(row.quantity, maxStock > 0 ? maxStock : row.quantity));
      const rawColors = Array.isArray(prod?.colors) ? prod.colors : [];
      const availableColors = rawColors
        .map((c) =>
          typeof c === "object" && c && "name" in c ? String((c as { name: unknown }).name) : "",
        )
        .filter(Boolean);

      return {
        id: row.id,
        slug: row.product_slug || prod?.slug || "",
        size: (row.size as Size) || "M",
        color: row.color || "Default",
        qty,
        name: prod?.name || "Apparel Item",
        price: row.unit_price || prod?.price || 0,
        image: prod?.images?.[0] ? resolveProductAsset(prod.images[0]) : null,
        maxStock,
        availableColors: availableColors.length > 0 ? availableColors : undefined,
        sizeStock: Object.keys(parsedStock).length > 0 ? parsedStock : undefined,
      };
    }),
  );
}

/**
 * Reads wishlist slugs from Supabase wishlist_items.
 */
async function getWishlistFromDb(wishlistId: string): Promise<string[]> {
  const { data: items, error } = await supabaseAdmin
    .from("wishlist_items")
    .select(
      `
      product_id,
      products ( slug )
    `,
    )
    .eq("wishlist_id", wishlistId);

  if (error || !items) {
    return [];
  }

  interface WishlistJoinRow {
    products: { slug?: string | null } | null;
  }
  return (items as unknown as WishlistJoinRow[])
    .map((row) => row.products?.slug)
    .filter((s): s is string => Boolean(s));
}

/**
 * Server Function: Synchronizes guest cart and wishlist with Supabase upon login.
 * Validates stock, clamps quantities, eliminates duplicate cart records, and returns authoritative items.
 */
export const syncCartServerFn = createServerFn({ method: "POST" })
  .validator((input: SyncCartInput) => input)
  .handler(async ({ data }): Promise<{ cart: CartItemData[]; wishlist: string[] }> => {
    const auth = await getAuthenticatedCustomerId(data.authToken);
    if (!auth) {
      return { cart: [], wishlist: [] };
    }

    const cartId = await getOrCreateActiveCart(auth.customerUuid, auth.id);
    const wishlistId = await getOrCreateWishlist(auth.customerUuid, auth.id);

    // Merge guest cart if items provided
    if (data.guestCart && data.guestCart.length > 0) {
      for (const item of data.guestCart) {
        if (!item.slug || item.qty <= 0) continue;

        // Verify product in database
        const { data: prod } = await supabaseAdmin
          .from("products")
          .select("id, slug, price, stock, is_published")
          .eq("slug", item.slug)
          .eq("is_published", true)
          .maybeSingle();

        if (!prod) continue;

        const available = await resolveCartItemStock(prod.id, prod.stock, item.size, item.color);
        if (available <= 0) continue;

        // Check if item already exists in cart_items
        const { data: existing } = await supabaseAdmin
          .from("cart_items")
          .select("id, quantity")
          .eq("cart_id", cartId)
          .eq("product_id", prod.id)
          .eq("size", item.size)
          .eq("color", item.color)
          .maybeSingle();

        if (existing) {
          const newQty = Math.min(existing.quantity + item.qty, available);
          await supabaseAdmin
            .from("cart_items")
            .update({
              quantity: newQty,
              unit_price: prod.price,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existing.id);
        } else {
          const qty = Math.min(item.qty, available);
          await supabaseAdmin.from("cart_items").insert({
            cart_id: cartId,
            product_id: prod.id,
            product_slug: prod.slug,
            size: item.size,
            color: item.color,
            quantity: qty,
            unit_price: prod.price,
            updated_at: new Date().toISOString(),
          });
        }
      }
    }

    // Merge guest wishlist
    if (data.guestWishlist && data.guestWishlist.length > 0) {
      for (const slug of data.guestWishlist) {
        const { data: prod } = await supabaseAdmin
          .from("products")
          .select("id")
          .eq("slug", slug)
          .maybeSingle();

        if (prod) {
          await supabaseAdmin
            .from("wishlist_items")
            .upsert(
              { wishlist_id: wishlistId, product_id: prod.id },
              { onConflict: "wishlist_id,product_id", ignoreDuplicates: true },
            );
        }
      }
    }

    // Return current database state
    const [cartItems, wishItems] = await Promise.all([
      getCartItemsFromDb(cartId),
      getWishlistFromDb(wishlistId),
    ]);

    return { cart: cartItems, wishlist: wishItems };
  });

/**
 * Server Function: Update Cart Item (Add, SetQty, Remove, Clear) in Supabase.
 */
export const updateCartItemServerFn = createServerFn({ method: "POST" })
  .validator((input: UpdateCartInput) => input)
  .handler(async ({ data }): Promise<{ success: boolean; cart: CartItemData[] }> => {
    const auth = await getAuthenticatedCustomerId(data.authToken);
    if (!auth) {
      return { success: false, cart: [] };
    }

    const cartId = await getOrCreateActiveCart(auth.customerUuid, auth.id);

    if (data.action === "clear") {
      await supabaseAdmin.from("cart_items").delete().eq("cart_id", cartId);
      return { success: true, cart: [] };
    }

    if (data.action === "add" && data.item) {
      const item = data.item;
      const { data: prod } = await supabaseAdmin
        .from("products")
        .select("id, slug, price, stock, is_published")
        .eq("slug", item.slug)
        .eq("is_published", true)
        .maybeSingle();

      if (!prod) {
        throw new Error("Product unavailable.");
      }

      const available = await resolveCartItemStock(prod.id, prod.stock, item.size, item.color);
      if (available <= 0) {
        throw new Error("Item is out of stock in this size.");
      }

      const { data: existing } = await supabaseAdmin
        .from("cart_items")
        .select("id, quantity")
        .eq("cart_id", cartId)
        .eq("product_id", prod.id)
        .eq("size", item.size)
        .eq("color", item.color)
        .maybeSingle();

      if (existing) {
        const newQty = Math.min(existing.quantity + item.qty, available);
        await supabaseAdmin
          .from("cart_items")
          .update({
            quantity: newQty,
            unit_price: prod.price,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
      } else {
        const qty = Math.min(item.qty, available);
        await supabaseAdmin.from("cart_items").insert({
          cart_id: cartId,
          product_id: prod.id,
          product_slug: prod.slug,
          size: item.size,
          color: item.color,
          quantity: qty,
          unit_price: prod.price,
          updated_at: new Date().toISOString(),
        });
      }
    } else if (data.action === "setQty" && data.item) {
      const item = data.item;
      const { data: prod } = await supabaseAdmin
        .from("products")
        .select("id, stock")
        .eq("slug", item.slug)
        .maybeSingle();

      const available = prod?.id
        ? await resolveCartItemStock(prod.id, prod.stock, item.size, item.color)
        : 0;
      const clampedQty = Math.max(1, Math.min(item.qty, available > 0 ? available : item.qty));

      await supabaseAdmin
        .from("cart_items")
        .update({
          quantity: clampedQty,
          updated_at: new Date().toISOString(),
        })
        .eq("cart_id", cartId)
        .eq("product_slug", item.slug)
        .eq("size", item.size)
        .eq("color", item.color);
    } else if (data.action === "remove" && data.item) {
      await supabaseAdmin
        .from("cart_items")
        .delete()
        .eq("cart_id", cartId)
        .eq("product_slug", data.item.slug)
        .eq("size", data.item.size)
        .eq("color", data.item.color);
    } else if (data.action === "updateVariant" && data.item) {
      const item = data.item;
      const prevSize = data.prevSize || item.size;
      const prevColor = data.prevColor || item.color;

      const { data: prod } = await supabaseAdmin
        .from("products")
        .select("id, slug, price, stock, is_published")
        .eq("slug", item.slug)
        .eq("is_published", true)
        .maybeSingle();

      if (!prod) {
        throw new Error("Product unavailable.");
      }

      const available = await resolveCartItemStock(prod.id, prod.stock, item.size, item.color);
      if (available <= 0) {
        throw new Error(`Selected variant (${item.color}, ${item.size}) is out of stock.`);
      }

      const { data: sourceRow } = await supabaseAdmin
        .from("cart_items")
        .select("id, quantity")
        .eq("cart_id", cartId)
        .eq("product_slug", item.slug)
        .eq("size", prevSize)
        .eq("color", prevColor)
        .maybeSingle();

      const { data: targetRow } = await supabaseAdmin
        .from("cart_items")
        .select("id, quantity")
        .eq("cart_id", cartId)
        .eq("product_slug", item.slug)
        .eq("size", item.size)
        .eq("color", item.color)
        .maybeSingle();

      const baseQty = sourceRow?.quantity ?? item.qty;
      if (targetRow && (!sourceRow || targetRow.id !== sourceRow.id)) {
        const mergedQty = Math.max(1, Math.min(targetRow.quantity + baseQty, available));
        await supabaseAdmin
          .from("cart_items")
          .update({
            quantity: mergedQty,
            unit_price: prod.price,
            updated_at: new Date().toISOString(),
          })
          .eq("id", targetRow.id);
        if (sourceRow) {
          await supabaseAdmin.from("cart_items").delete().eq("id", sourceRow.id);
        }
      } else if (sourceRow) {
        const clampedQty = Math.max(1, Math.min(baseQty, available));
        await supabaseAdmin
          .from("cart_items")
          .update({
            size: item.size,
            color: item.color,
            quantity: clampedQty,
            unit_price: prod.price,
            updated_at: new Date().toISOString(),
          })
          .eq("id", sourceRow.id);
      }
    }

    const updated = await getCartItemsFromDb(cartId);
    return { success: true, cart: updated };
  });

/**
 * Server Function: Toggle product in customer wishlist.
 */
export const toggleWishlistServerFn = createServerFn({ method: "POST" })
  .validator((input: ToggleWishlistInput) => input)
  .handler(async ({ data }): Promise<{ success: boolean; wishlist: string[] }> => {
    const auth = await getAuthenticatedCustomerId(data.authToken);
    if (!auth) {
      return { success: false, wishlist: [] };
    }

    const wishlistId = await getOrCreateWishlist(auth.customerUuid, auth.id);

    const { data: prod } = await supabaseAdmin
      .from("products")
      .select("id")
      .eq("slug", data.productSlug)
      .maybeSingle();

    if (!prod) {
      const current = await getWishlistFromDb(wishlistId);
      return { success: false, wishlist: current };
    }

    const { data: existing } = await supabaseAdmin
      .from("wishlist_items")
      .select("id")
      .eq("wishlist_id", wishlistId)
      .eq("product_id", prod.id)
      .maybeSingle();

    if (existing) {
      await supabaseAdmin.from("wishlist_items").delete().eq("id", existing.id);
    } else {
      await supabaseAdmin.from("wishlist_items").insert({
        wishlist_id: wishlistId,
        product_id: prod.id,
      });
    }

    const updated = await getWishlistFromDb(wishlistId);
    return { success: true, wishlist: updated };
  });
