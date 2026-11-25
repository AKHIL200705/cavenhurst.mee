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
 * Checks available stock for a specific variant (stock_quantity - reserved_quantity).
 */
export async function getVariantAvailableStock(
  productId: string,
  size: string,
  color?: string | undefined,
): Promise<{ variantId: string | null; available: number; totalStock: number }> {
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
          ${color ? sql`AND (v.color = ${color} OR v.color ILIKE ${color})` : sql``}
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
  if (color) query.eq("color", color);
  const { data: variants } = await query;

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
 * Holds stock for 30 minutes. If any item is out of stock, rolls back all reservations.
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
          if (!item.variantId) {
            // Find variant id if missing
            const [vRow] = await tx<{ id: string }[]>`
              SELECT id FROM public.product_variants 
              WHERE product_id = ${item.productId} AND size = ${item.size}
              LIMIT 1
            `;
            if (vRow) item.variantId = vRow["id"];
          }

          if (!item.variantId) continue;

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
              `Item "${item.name}" (${item.size}) is no longer available in the requested quantity.`,
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
              'reserved',
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
      if (!item.variantId) continue;

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

      await supabaseAdmin
        .from("inventory")
        .update({
          reserved_quantity: (inv.reserved_quantity || 0) + item.qty,
          updated_at: new Date().toISOString(),
        })
        .eq("id", inv.id);

      await supabaseAdmin.from("inventory_reservations").insert({
        order_id: orderId,
        variant_id: item.variantId,
        quantity: item.qty,
        status: "reserved",
        expires_at: expiresAt,
      });
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
 * Commits reserved inventory upon verified payment or confirmed COD order.
 * Decrements stock_quantity, reduces reserved_quantity, updates product JSONB,
 * and records immutable inventory_movements.
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
        for (const item of items) {
          if (!item.variantId) {
            const [vRow] = await tx<{ id: string }[]>`
              SELECT id FROM public.product_variants 
              WHERE product_id = ${item.productId} AND size = ${item.size}
              LIMIT 1
            `;
            if (vRow) item.variantId = vRow["id"];
          }

          if (item.variantId) {
            // Deduct inventory and clear reservation
            const [updatedInv] = await tx<{ stock_quantity: number }[]>`
              UPDATE public.inventory
              SET 
                stock_quantity = GREATEST(0, stock_quantity - ${item.qty}),
                reserved_quantity = GREATEST(0, reserved_quantity - ${item.qty}),
                updated_at = NOW()
              WHERE variant_id = ${item.variantId}
              RETURNING stock_quantity
            `;

            const newStock = updatedInv ? Number(updatedInv["stock_quantity"]) : 0;

            // Update product_variants
            await tx`
              UPDATE public.product_variants
              SET 
                stock_quantity = ${newStock},
                is_available = (${newStock} > 0),
                updated_at = NOW()
              WHERE id = ${item.variantId}
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

            // Update reservation status to fulfilled
            await tx`
              UPDATE public.inventory_reservations
              SET 
                status = 'fulfilled',
                updated_at = NOW()
              WHERE order_id = ${orderId} AND variant_id = ${item.variantId}
            `;
          }

          // Sync product.stock JSONB
          const [pRow] = await tx<{ stock: Record<string, number> | null }[]>`
            SELECT stock FROM public.products WHERE id = ${item.productId}
          `;
          if (pRow) {
            const stockMap = (pRow["stock"] || {}) as Record<string, number>;
            const curVal = stockMap[item.size] ?? 0;
            const updatedStock = { ...stockMap, [item.size]: Math.max(0, curVal - item.qty) };
            await tx`
              UPDATE public.products
              SET stock = ${JSON.stringify(updatedStock)}::jsonb, updated_at = NOW()
              WHERE id = ${item.productId}
            `;
          }
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
    for (const item of items) {
      if (item.variantId) {
        const { data: inv } = await supabaseAdmin
          .from("inventory")
          .select("id, stock_quantity, reserved_quantity")
          .eq("variant_id", item.variantId)
          .maybeSingle();

        if (inv) {
          const newStock = Math.max(0, (inv.stock_quantity || 0) - item.qty);
          const newRes = Math.max(0, (inv.reserved_quantity || 0) - item.qty);

          await supabaseAdmin
            .from("inventory")
            .update({
              stock_quantity: newStock,
              reserved_quantity: newRes,
              updated_at: new Date().toISOString(),
            })
            .eq("id", inv.id);

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
              status: "fulfilled",
              updated_at: new Date().toISOString(),
            })
            .eq("order_id", orderId)
            .eq("variant_id", item.variantId);
        }
      }

      // Update product stock JSONB
      const { data: prod } = await supabaseAdmin
        .from("products")
        .select("stock")
        .eq("id", item.productId)
        .single();

      if (prod) {
        const stockMap = (prod.stock || {}) as Record<string, number>;
        const curVal = stockMap[item.size] ?? 0;
        const updatedStock = { ...stockMap, [item.size]: Math.max(0, curVal - item.qty) };
        await supabaseAdmin
          .from("products")
          .update({ stock: updatedStock as unknown as Json, updated_at: new Date().toISOString() })
          .eq("id", item.productId);
      }
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
          AND r.status = 'reserved'
      `;

      await sql`
        UPDATE public.inventory_reservations
        SET status = 'released', updated_at = NOW()
        WHERE order_id = ${orderId} AND status = 'reserved'
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
      .eq("status", "reserved");

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
