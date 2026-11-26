import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getDb } from "@/server/db";
import type { Json } from "@/integrations/supabase/types";

export interface InventoryOrderItem {
  productId: string;
  variantId?: string | undefined;
  slug: string;
  name: string;
  size: string;
  color: string;
  qty: number;
}

interface VariantAvailabilityRow {
  variant_id: string;
  stock_quantity: number;
  reserved_quantity: number;
}

/**
 * Normalizes products.stock JSONB values (safely handling stringified JSON or numeric char spreads).
 */
export function parseStockMap(raw: unknown): Record<string, number> {
  let obj: unknown = raw;
  if (typeof obj === "string") {
    try {
      obj = JSON.parse(obj);
    } catch {
      return {};
    }
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return {};

  const cleaned: Record<string, number> = {};
  for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
    if (/^\d+$/.test(key)) continue;
    const num = Number(val);
    if (Number.isFinite(num)) {
      cleaned[key] = num;
    }
  }
  return cleaned;
}

async function resolveVariantIdSql(
  tx: NonNullable<ReturnType<typeof getDb>>,
  productId: string,
  size: string,
  color?: string | undefined,
): Promise<string | null> {
  const cleanColor = color?.trim();
  if (cleanColor) {
    const [matched] = await tx<{ id: string }[]>`
      SELECT id FROM public.product_variants
      WHERE product_id = ${productId}::uuid
        AND size = ${size}
        AND lower(trim(color)) = lower(${cleanColor})
      LIMIT 1
    `;
    if (matched?.["id"]) return matched["id"];
  }

  const candidates = await tx<{ id: string }[]>`
    SELECT id FROM public.product_variants
    WHERE product_id = ${productId}::uuid AND size = ${size}
    LIMIT 2
  `;
  if (candidates.length === 1 && (!cleanColor || /^(default|standard)$/i.test(cleanColor))) {
    return candidates[0]!["id"];
  }
  return null;
}

async function resolveVariantIdRest(
  productId: string,
  size: string,
  color?: string | undefined,
): Promise<string | null> {
  const cleanColor = color?.trim();
  if (cleanColor) {
    const { data: exact } = await supabaseAdmin
      .from("product_variants")
      .select("id")
      .eq("product_id", productId)
      .eq("size", size)
      .ilike("color", cleanColor)
      .limit(1);
    if (exact && exact[0]?.id) return exact[0].id;
  }

  const { data: candidates } = await supabaseAdmin
    .from("product_variants")
    .select("id")
    .eq("product_id", productId)
    .eq("size", size)
    .limit(2);

  if (
    candidates &&
    candidates.length === 1 &&
    (!cleanColor || /^(default|standard)$/i.test(cleanColor))
  ) {
    return candidates[0]!.id;
  }
  return null;
}

/**
 * Recomputes products.stock aggregate JSONB per size across all color variants for a product.
 */
export async function syncProductAggregateStock(
  productId: string,
  tx?: NonNullable<ReturnType<typeof getDb>>,
): Promise<void> {
  const runner = tx || getDb();
  if (runner) {
    const rows = await runner<{ size: string; total_qty: number }[]>`
      SELECT v.size, SUM(GREATEST(0, COALESCE(i.stock_quantity, v.stock_quantity, 0)))::int AS total_qty
      FROM public.product_variants v
      LEFT JOIN public.inventory i ON i.variant_id = v.id
      WHERE v.product_id = ${productId}::uuid
      GROUP BY v.size
    `;
    const agg: Record<string, number> = {};
    for (const r of rows) {
      agg[r.size] = Number(r.total_qty) || 0;
    }
    await runner`
      UPDATE public.products
      SET stock = ${runner.json(agg)}, updated_at = NOW()
      WHERE id = ${productId}::uuid
    `;
    return;
  }

  const { data: variants } = await supabaseAdmin
    .from("product_variants")
    .select("id, size, stock_quantity")
    .eq("product_id", productId);

  if (!variants) return;

  const { data: invRows } = await supabaseAdmin
    .from("inventory")
    .select("variant_id, stock_quantity")
    .eq("product_id", productId);

  const invMap = new Map<string, number>();
  for (const inv of invRows || []) {
    if (inv.variant_id) invMap.set(inv.variant_id, Number(inv.stock_quantity) || 0);
  }

  const agg: Record<string, number> = {};
  for (const v of variants) {
    const qty = invMap.has(v.id) ? invMap.get(v.id)! : Number(v.stock_quantity) || 0;
    agg[v.size] = (agg[v.size] || 0) + Math.max(0, qty);
  }

  await supabaseAdmin
    .from("products")
    .update({ stock: agg as unknown as Json, updated_at: new Date().toISOString() })
    .eq("id", productId);
}

/**
 * Checks available stock for a specific variant (stock_quantity - reserved_quantity).
 */
export async function getVariantAvailableStock(
  productId: string,
  size: string,
  color?: string | undefined,
): Promise<{ variantId: string | null; available: number; totalStock: number }> {
  const cleanColor = color?.trim();
  const sql = getDb();
  if (sql) {
    try {
      const rows = await sql<VariantAvailabilityRow[]>`
        SELECT 
          v.id as variant_id,
          COALESCE(i.stock_quantity, v.stock_quantity, 0) as stock_quantity,
          COALESCE(i.reserved_quantity, 0) as reserved_quantity
        FROM public.product_variants v
        LEFT JOIN public.inventory i ON i.variant_id = v.id
        WHERE v.product_id = ${productId}
          AND v.size = ${size}
          ${cleanColor ? sql`AND lower(trim(v.color)) = lower(${cleanColor})` : sql``}
        LIMIT 1
      `;
      const row = rows[0];
      if (row) {
        const totalStock = Number(row["stock_quantity"]) || 0;
        const reserved = Number(row["reserved_quantity"]) || 0;
        return {
          variantId: row["variant_id"],
          totalStock,
          available: Math.max(0, totalStock - reserved),
        };
      }
    } catch (err) {
      console.warn(
        "[Inventory Service] Direct DB lookup error, falling back to Supabase client:",
        err,
      );
    }
  }

  // Fallback via Supabase REST client
  const query = supabaseAdmin
    .from("product_variants")
    .select("id, stock_quantity")
    .eq("product_id", productId)
    .eq("size", size);
  if (cleanColor) query.ilike("color", cleanColor);
  const { data: variants } = await query.limit(1);

  if (variants && variants.length > 0) {
    const variantId = variants[0]!.id;
    const { data: inv } = await supabaseAdmin
      .from("inventory")
      .select("stock_quantity, reserved_quantity")
      .eq("variant_id", variantId)
      .maybeSingle();

    const totalStock = inv
      ? Number(inv.stock_quantity) || 0
      : Number(variants[0]!.stock_quantity) || 0;
    const reserved = inv ? Number(inv.reserved_quantity) || 0 : 0;
    return {
      variantId,
      totalStock,
      available: Math.max(0, totalStock - reserved),
    };
  }

  return { variantId: null, available: 0, totalStock: 0 };
}

/**
 * Atomically reserves inventory for an order prior to payment.
 * Holds stock for 30 minutes. Fails closed if any variant cannot be resolved or lacks stock.
 */
export async function reserveOrderInventory(
  orderId: string,
  items: InventoryOrderItem[],
): Promise<{ success: boolean; error?: string }> {
  const sql = getDb();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  if (sql) {
    try {
      return await sql.begin(async (tx) => {
        for (const item of items) {
          if (item.qty <= 0) {
            throw new Error(`Invalid quantity requested for "${item.name}".`);
          }
          if (!item.variantId) {
            const resolved = await resolveVariantIdSql(
              tx as unknown as NonNullable<ReturnType<typeof getDb>>,
              item.productId,
              item.size,
              item.color,
            );
            if (resolved) item.variantId = resolved;
          }

          if (!item.variantId) {
            throw new Error(
              `Selected variant "${item.name}" (${item.size}${item.color ? `, ${item.color}` : ""}) is unavailable.`,
            );
          }

          // Atomic check and reserve: ensure stock_quantity - reserved_quantity >= qty
          const updated = await tx`
            UPDATE public.inventory
            SET 
              reserved_quantity = reserved_quantity + ${item.qty},
              updated_at = NOW()
            WHERE variant_id = ${item.variantId}
              AND (stock_quantity - reserved_quantity) >= ${item.qty}
            RETURNING id, stock_quantity, reserved_quantity
          `;

          if (!updated || updated.length === 0) {
            throw new Error(
              `Item "${item.name}" (${item.size}${item.color ? `, ${item.color}` : ""}) is no longer available in the requested quantity.`,
            );
          }

          // Insert reservation record
          await tx`
            INSERT INTO public.inventory_reservations (
              order_id,
              variant_id,
              quantity,
              status,
              expires_at,
              created_at,
              updated_at
            ) VALUES (
              ${orderId},
              ${item.variantId},
              ${item.qty},
              'active',
              ${expiresAt},
              NOW(),
              NOW()
            )
          `;
        }

        return { success: true };
      });
    } catch (err) {
      console.error("[Inventory Reservation Error]", err);
      return {
        success: false,
        error: err instanceof Error ? err.message : "Inventory reservation failed.",
      };
    }
  }

  // Fallback via Supabase REST client
  try {
    for (const item of items) {
      if (item.qty <= 0) {
        throw new Error(`Invalid quantity requested for "${item.name}".`);
      }
      if (!item.variantId) {
        const resolved = await resolveVariantIdRest(item.productId, item.size, item.color);
        if (resolved) item.variantId = resolved;
      }

      if (!item.variantId) {
        throw new Error(
          `Selected variant "${item.name}" (${item.size}${item.color ? `, ${item.color}` : ""}) is unavailable.`,
        );
      }

      const { data: inv } = await supabaseAdmin
        .from("inventory")
        .select("id, stock_quantity, reserved_quantity")
        .eq("variant_id", item.variantId)
        .maybeSingle();

      if (!inv) {
        throw new Error(`Inventory record not found for "${item.name}" (${item.size}).`);
      }

      const available = (inv.stock_quantity || 0) - (inv.reserved_quantity || 0);
      if (available < item.qty) {
        throw new Error(`Item "${item.name}" (${item.size}) is no longer available.`);
      }

      const { error: updErr } = await supabaseAdmin
        .from("inventory")
        .update({
          reserved_quantity: (inv.reserved_quantity || 0) + item.qty,
          updated_at: new Date().toISOString(),
        })
        .eq("id", inv.id);
      if (updErr) throw new Error(updErr.message);

      const { error: resErr } = await supabaseAdmin.from("inventory_reservations").insert({
        order_id: orderId,
        variant_id: item.variantId,
        quantity: item.qty,
        status: "active",
        expires_at: expiresAt,
      });
      if (resErr) throw new Error(resErr.message);
    }
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Inventory reservation failed.",
    };
  }
}

/**
 * Commits inventory atomically upon verified payment or confirmed COD order.
 * Prevents overselling by enforcing physical stock >= qty in SQL.
 */
export async function commitOrderInventory(
  orderId: string,
  orderNumber: string,
  items: InventoryOrderItem[],
  userId?: string | null,
): Promise<{ success: boolean; error?: string }> {
  const sql = getDb();

  if (sql) {
    try {
      await sql.begin(async (tx) => {
        const affectedProducts = new Set<string>();
        for (const item of items) {
          if (item.qty <= 0) {
            throw new Error(`Invalid commit quantity for "${item.name}".`);
          }
          if (!item.variantId) {
            const resolved = await resolveVariantIdSql(
              tx as unknown as NonNullable<ReturnType<typeof getDb>>,
              item.productId,
              item.size,
              item.color,
            );
            if (resolved) item.variantId = resolved;
          }

          if (!item.variantId) {
            throw new Error(
              `Inventory variant missing for "${item.name}" (${item.size}${item.color ? `, ${item.color}` : ""}).`,
            );
          }

          // Check whether this order already holds an active reservation for this variant
          const [activeRes] = await tx<{ id: string }[]>`
            SELECT id FROM public.inventory_reservations
            WHERE order_id = ${orderId}::uuid
              AND variant_id = ${item.variantId}::uuid
              AND status = 'active'
            LIMIT 1
          `;

          // Deduct inventory atomically without overselling physical or unreserved stock
          const [updatedInv] = await tx<{ stock_quantity: number }[]>`
            UPDATE public.inventory
            SET 
              stock_quantity = stock_quantity - ${item.qty},
              reserved_quantity = CASE
                WHEN ${Boolean(activeRes)} THEN GREATEST(0, reserved_quantity - ${item.qty})
                ELSE reserved_quantity
              END,
              updated_at = NOW()
            WHERE variant_id = ${item.variantId}::uuid
              AND stock_quantity >= ${item.qty}
              AND (
                ${Boolean(activeRes)}
                OR (stock_quantity - reserved_quantity) >= ${item.qty}
              )
            RETURNING stock_quantity
          `;

          if (!updatedInv) {
            throw new Error(
              `Insufficient stock to commit "${item.name}" (${item.size}${item.color ? `, ${item.color}` : ""}).`,
            );
          }

          const newStock = Number(updatedInv["stock_quantity"]);

          // Update product_variants
          await tx`
            UPDATE public.product_variants
            SET 
              stock_quantity = ${newStock},
              is_available = (${newStock} > 0),
              updated_at = NOW()
            WHERE id = ${item.variantId}::uuid
          `;

          // Record movement
          await tx`
            INSERT INTO public.inventory_movements (
              product_id,
              product_slug,
              size,
              color,
              change_qty,
              new_stock,
              reason,
              reference_id,
              admin_user_id,
              created_at
            ) VALUES (
              ${item.productId},
              ${item.slug},
              ${item.size},
              ${item.color || null},
              ${-item.qty},
              ${newStock},
              'order_sale',
              ${orderNumber},
              ${userId || "system"},
              NOW()
            )
          `;

          // Update reservation status to completed
          await tx`
            UPDATE public.inventory_reservations
            SET 
              status = 'completed',
              updated_at = NOW()
            WHERE order_id = ${orderId} AND variant_id = ${item.variantId}
          `;

          if (item.productId) affectedProducts.add(item.productId);
        }

        for (const pid of affectedProducts) {
          await syncProductAggregateStock(
            pid,
            tx as unknown as NonNullable<ReturnType<typeof getDb>>,
          );
        }
      });
      return { success: true };
    } catch (err) {
      console.error("[Inventory Commit Error]", err);
      return {
        success: false,
        error: err instanceof Error ? err.message : "Inventory commit failed.",
      };
    }
  }

  // Fallback via Supabase REST client
  try {
    const affectedProducts = new Set<string>();
    for (const item of items) {
      if (!item.variantId) {
        const resolved = await resolveVariantIdRest(item.productId, item.size, item.color);
        if (resolved) item.variantId = resolved;
      }

      if (!item.variantId) {
        throw new Error(
          `Inventory variant missing for "${item.name}" (${item.size}${item.color ? `, ${item.color}` : ""}).`,
        );
      }

      const { data: inv } = await supabaseAdmin
        .from("inventory")
        .select("id, stock_quantity, reserved_quantity")
        .eq("variant_id", item.variantId)
        .maybeSingle();

      if (!inv || (inv.stock_quantity || 0) < item.qty) {
        throw new Error(`Insufficient stock for "${item.name}" (${item.size}).`);
      }

      const { data: activeRes } = await supabaseAdmin
        .from("inventory_reservations")
        .select("id")
        .eq("order_id", orderId)
        .eq("variant_id", item.variantId)
        .eq("status", "active")
        .maybeSingle();

      if (!activeRes && (inv.stock_quantity || 0) - (inv.reserved_quantity || 0) < item.qty) {
        throw new Error(`Insufficient unreserved stock for "${item.name}" (${item.size}).`);
      }

      const newStock = (inv.stock_quantity || 0) - item.qty;
      const newRes = activeRes
        ? Math.max(0, (inv.reserved_quantity || 0) - item.qty)
        : inv.reserved_quantity || 0;

      const { error: updErr } = await supabaseAdmin
        .from("inventory")
        .update({
          stock_quantity: newStock,
          reserved_quantity: newRes,
          updated_at: new Date().toISOString(),
        })
        .eq("id", inv.id);
      if (updErr) throw new Error(updErr.message);

      await supabaseAdmin
        .from("product_variants")
        .update({
          stock_quantity: newStock,
          is_available: newStock > 0,
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.variantId);

      await supabaseAdmin.from("inventory_movements").insert({
        product_id: item.productId,
        product_slug: item.slug,
        size: item.size,
        color: item.color || null,
        change_qty: -item.qty,
        new_stock: newStock,
        reason: "order_sale",
        reference_id: orderNumber,
        admin_user_id: userId || "system",
      });

      await supabaseAdmin
        .from("inventory_reservations")
        .update({
          status: "completed",
          updated_at: new Date().toISOString(),
        })
        .eq("order_id", orderId)
        .eq("variant_id", item.variantId);

      if (item.productId) affectedProducts.add(item.productId);
    }

    for (const pid of affectedProducts) {
      await syncProductAggregateStock(pid);
    }
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Inventory commit failed.",
    };
  }
}

/**
 * Releases unfulfilled inventory reservations (e.g., cancelled checkout, payment failure).
 */
export async function releaseOrderInventoryReservations(
  orderId: string,
): Promise<{ success: boolean }> {
  const sql = getDb();
  if (sql) {
    try {
      await sql`
        UPDATE public.inventory i
        SET 
          reserved_quantity = GREATEST(0, i.reserved_quantity - r.quantity),
          updated_at = NOW()
        FROM public.inventory_reservations r
        WHERE r.order_id = ${orderId}
          AND r.variant_id = i.variant_id
          AND r.status = 'active'
      `;

      await sql`
        UPDATE public.inventory_reservations
        SET status = 'released', updated_at = NOW()
        WHERE order_id = ${orderId} AND status = 'active'
      `;

      return { success: true };
    } catch (err) {
      console.error("[Inventory Release Error]", err);
    }
  }

  // Fallback via Supabase REST client
  try {
    const { data: reservations } = await supabaseAdmin
      .from("inventory_reservations")
      .select("id, variant_id, quantity")
      .eq("order_id", orderId)
      .eq("status", "active");

    if (reservations) {
      for (const res of reservations) {
        if (!res.variant_id) continue;
        const { data: inv } = await supabaseAdmin
          .from("inventory")
          .select("id, reserved_quantity")
          .eq("variant_id", res.variant_id)
          .maybeSingle();

        if (inv) {
          await supabaseAdmin
            .from("inventory")
            .update({
              reserved_quantity: Math.max(0, (inv.reserved_quantity || 0) - (res.quantity || 0)),
              updated_at: new Date().toISOString(),
            })
            .eq("id", inv.id);
        }

        await supabaseAdmin
          .from("inventory_reservations")
          .update({ status: "released", updated_at: new Date().toISOString() })
          .eq("id", res.id);
      }
    }
    return { success: true };
  } catch {
    return { success: false };
  }
}
