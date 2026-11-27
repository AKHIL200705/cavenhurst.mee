import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getDb } from "@/server/db";
import { PRODUCTS } from "@/lib/products";
import { invalidateCatalogCache } from "./catalog";
import { refundRazorpayPayment } from "./razorpay";
import { createShipMaxxShipment, cancelShipMaxxShipment } from "./shipmaxx";
import {
  releaseOrderInventoryReservations,
  restockOrderInventory,
  syncProductAggregateStock,
} from "./inventory";
import {
  ADMIN_SESSION_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  clearSessionCookies,
  readSessionCookieToken,
  setSessionCookie,
  signSessionToken,
  verifyGoogleSessionOrToken,
} from "./auth-helpers";
import type { Json, Database, Tables } from "@/integrations/supabase/types";

type OrderUpdate = Database["public"]["Tables"]["orders"]["Update"];

interface InventoryProductRow {
  id?: string;
  slug: string;
  name: string;
  stock: Json;
  colors: Json;
}

export interface InventoryVariantStatusRow {
  id: string;
  product_id: string;
  product_name: string;
  product_slug: string;
  color: string;
  color_hex: string | null;
  size: string;
  physical_quantity: number;
  reserved_quantity: number;
  available_quantity: number;
  stock_status: "in_stock" | "low_stock" | "out_of_stock";
}

export interface AdminAuthResult {
  userId: string;
  email: string | null;
}

export interface AdminAuthParams {
  authToken?: string | undefined;
}

const WHITELISTED_ADMIN_EMAILS = ["akhilsaiabbireddy2007@gmail.com", "cavenhurst@gmail.com"];

function isWhitelistedAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  const normalized = email.toLowerCase().trim();
  if (WHITELISTED_ADMIN_EMAILS.includes(normalized)) return true;

  const rawEnv = process.env["ADMIN_EMAILS"] || "";
  const envAdmins = rawEnv
    .split(",")
    .map((e) => e.toLowerCase().trim())
    .filter(Boolean);

  return envAdmins.includes(normalized);
}

/**
 * Verifies whether a verified user identity currently holds active admin privileges.
 * Rejects deactivated admin_users rows even if email is otherwise present.
 */
async function resolveAuthorizedAdmin(
  userId: string,
  email?: string | null,
): Promise<AdminAuthResult | null> {
  const normalizedEmail = email?.toLowerCase().trim() || null;

  const sql = getDb();
  if (sql) {
    try {
      const [adminRow] = await sql<{ id: string; is_active: boolean }[]>`
        SELECT id, is_active FROM public.admin_users
        WHERE auth_user_id = ${userId}
           OR (${normalizedEmail ? sql`lower(email) = ${normalizedEmail}` : sql`false`})
        ORDER BY updated_at DESC NULLS LAST
        LIMIT 1
      `;
      if (adminRow) {
        if (!adminRow.is_active) return null;
        return { userId, email: normalizedEmail };
      }

      if (normalizedEmail && isWhitelistedAdminEmail(normalizedEmail)) {
        return { userId, email: normalizedEmail };
      }

      const [roleRow] = await sql<{ role: string }[]>`
        SELECT role FROM public.user_roles
        WHERE (user_id = ${userId} OR (${normalizedEmail ? sql`lower(user_id) = ${normalizedEmail}` : sql`false`}))
          AND role = 'admin'
        LIMIT 1
      `;
      if (roleRow) return { userId, email: normalizedEmail };

      if (normalizedEmail) {
        const [wl] = await sql<{ email: string }[]>`
          SELECT email FROM public.admin_whitelist WHERE lower(email) = ${normalizedEmail} LIMIT 1
        `;
        if (wl) return { userId, email: normalizedEmail };
      }

      return null;
    } catch (dbErr) {
      console.warn("[Admin Auth] Direct SQL lookup fallback notice:", dbErr);
    }
  }

  // Fallback via PostgREST without raw interpolated .or() strings
  let adminRow: { id: string; is_active: boolean } | null = null;
  const { data: byUid } = await supabaseAdmin
    .from("admin_users")
    .select("id, is_active")
    .eq("auth_user_id", userId)
    .maybeSingle();
  if (byUid) {
    adminRow = byUid;
  } else if (normalizedEmail) {
    const { data: byEmail } = await supabaseAdmin
      .from("admin_users")
      .select("id, is_active")
      .ilike("email", normalizedEmail)
      .maybeSingle();
    if (byEmail) adminRow = byEmail;
  }

  if (adminRow) {
    if (!adminRow.is_active) return null;
    return { userId, email: normalizedEmail };
  }

  if (normalizedEmail && isWhitelistedAdminEmail(normalizedEmail)) {
    return { userId, email: normalizedEmail };
  }

  const { data: roleByUid } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (roleByUid) return { userId, email: normalizedEmail };

  if (normalizedEmail) {
    const { data: roleByEmail } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .ilike("user_id", normalizedEmail)
      .eq("role", "admin")
      .maybeSingle();
    if (roleByEmail) return { userId, email: normalizedEmail };

    const { data: whitelist } = await supabaseAdmin
      .from("admin_whitelist")
      .select("email")
      .ilike("email", normalizedEmail)
      .maybeSingle();
    if (whitelist) return { userId, email: normalizedEmail };
  }

  return null;
}

/**
 * Extracts bearer token cleanly from explicit param, request Authorization header, or Supabase cookie.
 */
function extractBearerToken(providedToken?: string | undefined): string | null {
  let token = providedToken?.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    const request = getRequest();
    const authHeader = request?.headers?.get("authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.replace(/^Bearer\s+/i, "").trim();
    } else {
      token = readSessionCookieToken(true);
      if (!token) {
        const cookieHeader = request?.headers?.get("cookie") || "";
        const matchAdmin = cookieHeader.match(/(?:^|;\s*)cavenhusrt_admin_session=([^;]+)/);
        if (matchAdmin && matchAdmin[1]) {
          token = decodeURIComponent(matchAdmin[1]).trim();
        } else {
          const matchUser = cookieHeader.match(/(?:^|;\s*)cavenhusrt_session=([^;]+)/);
          if (matchUser && matchUser[1]) {
            token = decodeURIComponent(matchUser[1]).trim();
          } else {
            const matchSb = cookieHeader.match(/sb-[a-z0-9]+-auth-token=([^;]+)/i);
            if (matchSb && matchSb[1]) {
              try {
                const parsed = JSON.parse(decodeURIComponent(matchSb[1]));
                token = Array.isArray(parsed) ? parsed[0] : parsed?.access_token || parsed;
              } catch {
                token = decodeURIComponent(matchSb[1]);
              }
            }
          }
        }
      }
    }
  }

  if (!token || token.split(".").length !== 3) {
    return null;
  }
  return token;
}

/**
 * Strict fail-closed server-side verification of administrator identity.
 * NEVER accepts unsigned or unverified JWT payloads.
 */
async function verifyAdminSession(providedToken?: string | undefined): Promise<AdminAuthResult> {
  const token = extractBearerToken(providedToken);
  if (!token) {
    throw new Error("Unauthorized: Administrator authentication session required.");
  }

  // 1. Try cryptographically signed HMAC / Google OAuth verification and re-verify live DB authorization
  try {
    const googleSession = await verifyGoogleSessionOrToken(token);
    if (googleSession) {
      const verified = await resolveAuthorizedAdmin(googleSession.sub, googleSession.email);
      if (verified) return verified;
      throw new Error("Forbidden: Administrator account is inactive or unauthorized.");
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Forbidden:")) {
      throw err;
    }
    // Token is not an internal/Google token; try Supabase GoTrue verification next
  }

  // 2. Try Supabase Auth JWT verification via supabaseAdmin.auth.getUser()
  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(token);

  if (!error && user) {
    const emailConfirmed = Boolean(
      user.email_confirmed_at || user.confirmed_at || user.app_metadata?.["provider"] === "google",
    );
    if (!emailConfirmed) {
      throw new Error("Forbidden: Verified email required for administrator access.");
    }

    const verified = await resolveAuthorizedAdmin(user.id, user.email || null);
    if (verified) return verified;
  } else if (error) {
    console.warn("[Admin Auth] supabaseAdmin.auth.getUser rejected token:", error.message);
  }

  throw new Error("Forbidden: Access restricted to CAVENHUSRT administrators.");
}

/**
 * Writes an immutable record to admin_audit_logs.
 */
async function recordAdminAuditLog(
  admin: AdminAuthResult,
  action: string,
  targetType: string,
  targetId: string,
  details: Record<string, unknown> = {},
) {
  try {
    await supabaseAdmin.from("admin_audit_logs").insert({
      admin_user_id: admin.userId,
      admin_email: admin.email,
      action,
      target_type: targetType,
      target_id: targetId,
      details: details as unknown as Json,
    });
  } catch (err) {
    console.error("[Admin Audit Log] Failed to record:", err);
  }
}

// -----------------------------------------------------------------------------
// 1. DASHBOARD OVERVIEW & ANALYTICS
// -----------------------------------------------------------------------------

interface DbOrderOverviewRow {
  id: string;
  total: number;
  status: string;
  payment_method: string;
  payment_status: string;
  shipment_status: string;
  created_at: string;
}

interface DbRefundRow {
  order_id?: string | null;
  amount: number;
}

function isOrderExcludedFromRevenue(order: Pick<DbOrderOverviewRow, "status" | "payment_status">) {
  return ["cancelled", "refunded"].includes(order.status) || order.payment_status === "refunded";
}

function computeOverviewSalesAndCounts(allOrders: DbOrderOverviewRow[], refunds: DbRefundRow[]) {
  const paidOrders = allOrders.filter(
    (o) => o.payment_status === "paid" && !isOrderExcludedFromRevenue(o),
  );
  const codOrders = allOrders.filter(
    (o) => o.payment_method === "cod" && !isOrderExcludedFromRevenue(o),
  );
  const activePaidIds = new Set(paidOrders.map((o) => o.id));

  const totalRefunded = (refunds || []).reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  const activePaidRefunds = (refunds || []).reduce(
    (sum, r) => (r.order_id && activePaidIds.has(r.order_id) ? sum + (Number(r.amount) || 0) : sum),
    0,
  );

  const totalPaidRevenue = Math.max(
    0,
    paidOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0) - activePaidRefunds,
  );
  const totalCodRevenue = codOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);

  const today = new Date();
  today.setHours(23, 59, 59, 999);

  const dailySalesMap = new Map<string, { date: string; revenue: number; orders: number }>();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    dailySalesMap.set(key, { date: key, revenue: 0, orders: 0 });
  }

  const weeklyBuckets: Array<{
    startMs: number;
    endMs: number;
    entry: { date: string; revenue: number; orders: number };
  }> = [];
  for (let i = 7; i >= 0; i--) {
    const bucketEnd = new Date(today);
    bucketEnd.setDate(bucketEnd.getDate() - i * 7);
    const bucketStart = new Date(bucketEnd);
    bucketStart.setDate(bucketStart.getDate() - 6);
    bucketStart.setHours(0, 0, 0, 0);
    const label = `Wk ${bucketEnd.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
    weeklyBuckets.push({
      startMs: bucketStart.getTime(),
      endMs: bucketEnd.getTime(),
      entry: { date: label, revenue: 0, orders: 0 },
    });
  }

  const monthlySalesMap = new Map<string, { date: string; revenue: number; orders: number }>();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const key = d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
    monthlySalesMap.set(key, { date: key, revenue: 0, orders: 0 });
  }

  for (const o of allOrders) {
    const orderDate = o.created_at ? new Date(o.created_at) : null;
    if (!orderDate || Number.isNaN(orderDate.getTime())) continue;

    const countsAsRevenue = o.payment_status === "paid" && !isOrderExcludedFromRevenue(o);
    const countsAsOrder = !isOrderExcludedFromRevenue(o);
    const orderTotal = Number(o.total) || 0;

    const dateKey = orderDate.toISOString().slice(0, 10);
    const dailyEntry = dailySalesMap.get(dateKey);
    if (dailyEntry) {
      if (countsAsOrder) dailyEntry.orders += 1;
      if (countsAsRevenue) dailyEntry.revenue += orderTotal;
    }

    const orderMs = orderDate.getTime();
    const weekBucket = weeklyBuckets.find((b) => orderMs >= b.startMs && orderMs <= b.endMs);
    if (weekBucket) {
      if (countsAsOrder) weekBucket.entry.orders += 1;
      if (countsAsRevenue) weekBucket.entry.revenue += orderTotal;
    }

    const monthKey = orderDate.toLocaleDateString("en-US", {
      month: "short",
      year: "2-digit",
    });
    const monthEntry = monthlySalesMap.get(monthKey);
    if (monthEntry) {
      if (countsAsOrder) monthEntry.orders += 1;
      if (countsAsRevenue) monthEntry.revenue += orderTotal;
    }
  }

  return {
    paidOrders,
    codOrders,
    totalRefunded,
    totalPaidRevenue,
    totalCodRevenue,
    pendingPayments: allOrders.filter((o) => o.payment_status === "pending").length,
    pendingOrders: allOrders.filter(
      (o) => o.status === "pending_payment" || o.payment_status === "pending",
    ).length,
    processingOrders: allOrders.filter((o) => o.status === "processing").length,
    shippedOrders: allOrders.filter((o) =>
      ["shipped", "in_transit", "out_for_delivery"].includes(o.shipment_status || ""),
    ).length,
    deliveredOrders: allOrders.filter((o) => o.shipment_status === "delivered").length,
    cancelledOrders: allOrders.filter((o) => o.status === "cancelled").length,
    rtoOrders: allOrders.filter((o) =>
      ["rto_initiated", "rto_delivered"].includes(o.shipment_status || ""),
    ).length,
    returnOrders: allOrders.filter((o) => o.status === "returned").length,
    dailySales: Array.from(dailySalesMap.values()),
    weeklySales: weeklyBuckets.map((b) => b.entry),
    monthlySales: Array.from(monthlySalesMap.values()),
  };
}

interface DbProductRow {
  slug: string;
  name: string;
  stock: Record<string, number> | null;
}

interface DbCountRow {
  count: number;
}

interface DbRecentOrderRow {
  id: string;
  order_number: string | null;
  customer_name: string | null;
  customer_email: string | null;
  total: number;
  status: string;
  payment_status: string;
  created_at: string;
}

interface DbRecentCustomerRow {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  created_at: string | null;
}

export const getAdminOverviewServerFn = createServerFn({ method: "POST" })
  .validator((params?: AdminAuthParams | undefined) => params || {})
  .handler(async ({ data }) => {
    await verifyAdminSession(data.authToken);

    const sql = getDb();
    if (sql) {
      try {
        const [
          orders,
          refunds,
          products,
          custCountRows,
          prodCountRows,
          recentOrders,
          recentCust,
          inventoryRows,
          pendingReturnsRow,
          newCustRow,
          topSellingRows,
        ] = await Promise.all([
          sql<DbOrderOverviewRow[]>`
            SELECT id, total, status, payment_method, payment_status, shipment_status, created_at
            FROM orders
          `.catch(async (err) => {
            console.warn(
              "[Admin Overview] Orders direct query notice, falling back to legacy schema:",
              err?.message,
            );
            const legacy = await sql<Omit<DbOrderOverviewRow, "payment_method">[]>`
              SELECT id, total, status, payment_status, shipment_status, created_at
              FROM orders
            `.catch(() => []);
            return legacy.map((r) => ({
              ...r,
              payment_method: (r as { payment_method?: string | null }).payment_method || "online",
            }));
          }),
          sql<DbRefundRow[]>`SELECT order_id, amount FROM payment_refunds`
            .catch(() => sql<DbRefundRow[]>`SELECT order_id, amount FROM refunds`)
            .catch(() => []),
          sql<DbProductRow[]>`SELECT slug, name, stock FROM products`.catch(() => []),
          sql<DbCountRow[]>`SELECT count(*)::int as count FROM profiles`
            .catch(() => sql<DbCountRow[]>`SELECT count(*)::int as count FROM customers`)
            .catch(() => [{ count: 0 }]),
          sql<DbCountRow[]>`SELECT count(*)::int as count FROM products`.catch(() => [
            { count: 0 },
          ]),
          sql<DbRecentOrderRow[]>`
            SELECT id, order_number, customer_name, customer_email, total, status, payment_status, created_at
            FROM orders
            ORDER BY created_at DESC
            LIMIT 5
          `.catch(() => []),
          sql<DbRecentCustomerRow[]>`
            SELECT id, full_name, email, phone, created_at
            FROM profiles
            ORDER BY created_at DESC
            LIMIT 5
          `
            .catch(
              () =>
                sql<DbRecentCustomerRow[]>`
                SELECT id, full_name, email, phone, created_at
                FROM customers
                ORDER BY created_at DESC
                LIMIT 5
              `,
            )
            .catch(() => []),
          sql<
            Array<{
              variant_id: string;
              sku: string | null;
              color: string;
              size: string;
              product_name: string;
              product_slug: string;
              stock_quantity: number;
              safety_stock: number;
            }>
          >`
            SELECT 
              v.id as variant_id,
              v.sku,
              v.color,
              v.size,
              p.name as product_name,
              p.slug as product_slug,
              COALESCE(i.stock_quantity, v.stock, 0) as stock_quantity,
              COALESCE(i.safety_stock, 5) as safety_stock
            FROM public.product_variants v
            JOIN public.products p ON p.id = v.product_id
            LEFT JOIN public.inventory i ON i.variant_id = v.id
          `.catch(() => []),
          sql<Array<{ count: number }>>`
            SELECT count(*)::int as count 
            FROM public.returns 
            WHERE status IN ('requested', 'pending', 'under_review')
          `.catch(() => [{ count: 0 }]),
          sql<Array<{ count: number }>>`
            SELECT count(*)::int as count 
            FROM public.profiles 
            WHERE created_at >= now() - interval '30 days'
          `.catch(() => [{ count: 0 }]),
          sql<
            Array<{
              name: string;
              product_slug: string;
              quantity: number;
              revenue: number;
            }>
          >`
            SELECT 
              oi.name,
              oi.product_slug,
              SUM(oi.qty)::int as quantity,
              SUM(oi.qty * oi.price)::int as revenue
            FROM public.order_items oi
            JOIN public.orders o ON o.id = oi.order_id
            WHERE o.status NOT IN ('cancelled', 'refunded')
            GROUP BY oi.name, oi.product_slug
            ORDER BY quantity DESC
            LIMIT 5
          `.catch(() => []),
        ]);

        const allOrders = orders || [];
        const totalOrders = allOrders.length;
        const agg = computeOverviewSalesAndCounts(allOrders, refunds || []);

        // Calculate live inventory alerts directly from public.inventory
        let outOfStockCount = 0;
        let lowStockCount = 0;
        const lowStockAlerts: Array<{
          name: string;
          slug: string;
          size: string;
          stock: number;
          sku?: string | undefined;
        }> = [];

        if (inventoryRows && inventoryRows.length > 0) {
          for (const row of inventoryRows) {
            const stock = Number(row.stock_quantity) || 0;
            const safety = Number(row.safety_stock) || 5;
            if (stock === 0) {
              outOfStockCount++;
            } else if (stock <= safety || stock <= 3) {
              lowStockCount++;
            }
            if (stock <= 5 && lowStockAlerts.length < 15) {
              lowStockAlerts.push({
                name: `${row.product_name} (${row.color})`,
                slug: row.product_slug,
                size: row.size,
                stock,
                sku: row.sku || undefined,
              });
            }
          }
        } else {
          // Fallback to products.stock if inventory table query returned empty
          const productList = products || [];
          for (const p of productList) {
            const stockObj = (p.stock || {}) as Record<string, number>;
            for (const [size, count] of Object.entries(stockObj)) {
              if (typeof count === "number") {
                if (count === 0) outOfStockCount++;
                else if (count <= 3) lowStockCount++;
                if (count <= 3 && lowStockAlerts.length < 10) {
                  lowStockAlerts.push({ name: p.name, slug: p.slug, size, stock: count });
                }
              }
            }
          }
        }

        return {
          totalCustomers: custCountRows[0]?.count ?? 0,
          newCustomers: newCustRow[0]?.count ?? 0,
          totalProducts: prodCountRows[0]?.count ?? 0,
          totalOrders,
          totalPaidRevenue: agg.totalPaidRevenue,
          totalCodRevenue: agg.totalCodRevenue,
          totalPaidOrders: agg.paidOrders.length,
          totalCodOrders: agg.codOrders.length,
          pendingPayments: agg.pendingPayments,
          pendingOrders: agg.pendingOrders,
          processingOrders: agg.processingOrders,
          shippedOrders: agg.shippedOrders,
          deliveredOrders: agg.deliveredOrders,
          cancelledOrders: agg.cancelledOrders,
          rtoOrders: agg.rtoOrders,
          returnOrders: agg.returnOrders,
          pendingReturns: pendingReturnsRow[0]?.count ?? 0,
          totalRefunded: agg.totalRefunded,
          lowStockCount,
          outOfStockCount,
          lowStockAlerts,
          dailySales: agg.dailySales,
          weeklySales: agg.weeklySales,
          monthlySales: agg.monthlySales,
          paymentMethodBreakdown: {
            online: {
              count: agg.paidOrders.length,
              revenue: agg.totalPaidRevenue,
            },
            cod: {
              count: agg.codOrders.length,
              revenue: agg.totalCodRevenue,
            },
          },
          topSellingProducts: (topSellingRows || []).map((t) => ({
            name: t.name,
            slug: t.product_slug,
            quantity: Number(t.quantity) || 0,
            revenue: Number(t.revenue) || 0,
          })),
          recentOrders,
          recentRegistrations: recentCust.map((c) => ({
            id: c.id,
            full_name: c.full_name || "Customer",
            email: c.email,
            phone: c.phone,
            created_at: c.created_at,
          })),
        };
      } catch (dbErr) {
        console.error(
          "[Admin Overview] Direct DB error, falling back to Supabase REST client:",
          dbErr,
        );
      }
    }

    let allOrders: DbOrderOverviewRow[] = [];
    const { data: orders, error: ordersError } = await supabaseAdmin
      .from("orders")
      .select("id, total, status, payment_method, payment_status, shipment_status, created_at");

    if (ordersError) {
      console.warn(
        "[Admin Overview] Orders query notice, attempting resilient fallback:",
        ordersError.message,
      );
      const { data: fallbackOrders, error: fallbackError } = await supabaseAdmin
        .from("orders")
        .select("id, total, status, payment_status, shipment_status, created_at");

      if (fallbackError) {
        console.warn(
          "[Admin Overview] Orders fallback query notice, defaulting to empty list:",
          fallbackError.message,
        );
        allOrders = [];
      } else {
        allOrders = (fallbackOrders || []).map((o) => ({
          ...o,
          payment_method: (o as { payment_method?: string | null }).payment_method || "online",
        })) as DbOrderOverviewRow[];
      }
    } else {
      allOrders = (orders as unknown as DbOrderOverviewRow[]) || [];
    }

    const totalOrders = allOrders.length;

    // Fetch verified refunds from canonical payment_refunds first (fallback to legacy refunds only if needed)
    let refundRows: DbRefundRow[] = [];
    try {
      const { data: payRefunds } = await supabaseAdmin
        .from("payment_refunds")
        .select("order_id, amount");
      if (payRefunds && payRefunds.length > 0) {
        refundRows = payRefunds.map((r) => ({
          order_id: r.order_id,
          amount: Number(r.amount) || 0,
        }));
      } else {
        const { data: allRefunds } = await supabaseAdmin.from("refunds").select("order_id, amount");
        if (allRefunds && allRefunds.length > 0) {
          refundRows = allRefunds as DbRefundRow[];
        }
      }
    } catch {
      refundRows = [];
    }

    const agg = computeOverviewSalesAndCounts(allOrders, refundRows);

    let dbProducts: { slug: string; name: string; stock: unknown }[] | null = null;
    try {
      const { data } = await supabaseAdmin.from("products").select("slug, name, stock");
      dbProducts = data;
    } catch {
      dbProducts = null;
    }
    const productList = dbProducts || [];

    let outOfStockCount = 0;
    let lowStockCount = 0;
    const lowStockAlerts: Array<{ name: string; slug: string; size: string; stock: number }> = [];

    for (const p of productList) {
      const stockObj = (p.stock || {}) as Record<string, number>;
      for (const [size, count] of Object.entries(stockObj)) {
        if (typeof count === "number") {
          if (count === 0) outOfStockCount++;
          else if (count <= 3) {
            lowStockCount++;
          }
          if (count <= 3 && lowStockAlerts.length < 10) {
            lowStockAlerts.push({ name: p.name, slug: p.slug, size, stock: count });
          }
        }
      }
    }

    let custCount = 0;
    let prodCount = 0;
    let recentOrdersList: DbRecentOrderRow[] = [];
    let recentCustList: DbRecentCustomerRow[] = [];
    let pendingReturnsCount = 0;

    try {
      const [profRes, prodCountRes, recentOrdersRes, recentCustRes, pendingReturnsRes] =
        await Promise.all([
          Promise.resolve(
            supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }),
          ).catch(() => null),
          Promise.resolve(
            supabaseAdmin.from("products").select("id", { count: "exact", head: true }),
          ).catch(() => null),
          Promise.resolve(
            supabaseAdmin
              .from("orders")
              .select(
                "id, order_number, customer_name, customer_email, total, status, payment_status, created_at",
              )
              .order("created_at", { ascending: false })
              .limit(5),
          ).catch(() => null),
          Promise.resolve(
            supabaseAdmin
              .from("profiles")
              .select("id, full_name, email, phone, created_at")
              .order("created_at", { ascending: false })
              .limit(5),
          ).catch(() => null),
          Promise.resolve(
            supabaseAdmin
              .from("returns")
              .select("id", { count: "exact", head: true })
              .in("status", ["requested", "pending", "under_review"]),
          ).catch(() => null),
        ]);

      custCount = profRes?.count ?? 0;
      prodCount = prodCountRes?.count ?? 0;
      recentOrdersList = (recentOrdersRes?.data as unknown as DbRecentOrderRow[]) || [];
      recentCustList = (recentCustRes?.data as unknown as DbRecentCustomerRow[]) || [];
      pendingReturnsCount = pendingReturnsRes?.count ?? 0;
    } catch (restErr) {
      console.warn("[Admin Overview] Auxiliary REST queries warning:", restErr);
    }

    return {
      totalCustomers: custCount,
      newCustomers: 0,
      totalProducts: prodCount,
      totalOrders,
      totalPaidRevenue: agg.totalPaidRevenue,
      totalCodRevenue: agg.totalCodRevenue,
      totalPaidOrders: agg.paidOrders.length,
      totalCodOrders: agg.codOrders.length,
      pendingPayments: agg.pendingPayments,
      pendingOrders: agg.pendingOrders,
      processingOrders: agg.processingOrders,
      shippedOrders: agg.shippedOrders,
      deliveredOrders: agg.deliveredOrders,
      cancelledOrders: agg.cancelledOrders,
      rtoOrders: agg.rtoOrders,
      returnOrders: agg.returnOrders,
      pendingReturns: pendingReturnsCount,
      totalRefunded: agg.totalRefunded,
      lowStockCount,
      outOfStockCount,
      lowStockAlerts,
      dailySales: agg.dailySales,
      weeklySales: agg.weeklySales,
      monthlySales: agg.monthlySales,
      paymentMethodBreakdown: {
        online: {
          count: agg.paidOrders.length,
          revenue: agg.totalPaidRevenue,
        },
        cod: {
          count: agg.codOrders.length,
          revenue: agg.totalCodRevenue,
        },
      },
      topSellingProducts: [],
      recentOrders: recentOrdersList,
      recentRegistrations: recentCustList.map((c) => ({
        id: c?.id || "",
        full_name: c?.full_name || "Customer",
        email: c?.email || null,
        phone: c?.phone || null,
        created_at: c?.created_at || null,
      })),
    };
  });

// -----------------------------------------------------------------------------
// 2. ORDER MANAGEMENT
// -----------------------------------------------------------------------------

export interface AdminOrdersFilterParams extends AdminAuthParams {
  filter?: string | undefined;
  search?: string | undefined;
  paymentMethod?: string | undefined;
  page?: number | undefined;
  limit?: number | undefined;
}

export const getAdminOrdersServerFn = createServerFn({ method: "POST" })
  .validator((params?: AdminOrdersFilterParams | undefined) => params || {})
  .handler(async ({ data }) => {
    await verifyAdminSession(data.authToken);

    const page = Math.max(1, data.page || 1);
    const limit = Math.min(100, Math.max(1, data.limit || 25));
    const offset = (page - 1) * limit;

    // 1. Try direct Postgres first (bypasses REST API key requirements)
    const sql = await getDb();
    if (sql) {
      try {
        let statusFilter = sql`TRUE`;
        if (data.filter && data.filter !== "all") {
          if (data.filter === "cod") {
            statusFilter = sql`payment_method = 'cod'`;
          } else if (data.filter === "paid") {
            statusFilter = sql`payment_status = 'paid'`;
          } else if (data.filter === "pending_payment") {
            statusFilter = sql`payment_status = 'pending'`;
          } else if (data.filter === "shipped") {
            statusFilter = sql`shipment_status IN ('shipped', 'in_transit', 'out_for_delivery')`;
          } else if (data.filter === "delivered") {
            statusFilter = sql`shipment_status = 'delivered'`;
          } else if (data.filter === "cancelled") {
            statusFilter = sql`status = 'cancelled'`;
          } else if (data.filter === "rto_initiated") {
            statusFilter = sql`shipment_status IN ('rto_initiated', 'rto_delivered')`;
          } else if (data.filter === "returned") {
            statusFilter = sql`status = 'returned'`;
          } else {
            statusFilter = sql`status = ${data.filter}`;
          }
        }

        let payMethodFilter = sql`TRUE`;
        if (data.paymentMethod && data.paymentMethod !== "all") {
          payMethodFilter = sql`payment_method = ${data.paymentMethod}`;
        }

        let searchFilter = sql`TRUE`;
        if (data.search && data.search.trim()) {
          const s = `%${data.search.trim()}%`;
          searchFilter = sql`(
            order_number ILIKE ${s} OR
            customer_name ILIKE ${s} OR
            customer_email ILIKE ${s} OR
            customer_phone ILIKE ${s} OR
            awb_number ILIKE ${s}
          )`;
        }

        const [ordersList, countRows] = await Promise.all([
          sql<Tables<"orders">[]>`
            SELECT * FROM orders
            WHERE ${statusFilter} AND ${payMethodFilter} AND ${searchFilter}
            ORDER BY created_at DESC
            LIMIT ${limit} OFFSET ${offset}
          `,
          sql<Array<{ count: number }>>`
            SELECT count(*)::int as count FROM orders
            WHERE ${statusFilter} AND ${payMethodFilter} AND ${searchFilter}
          `,
        ]);

        return {
          orders: ordersList || [],
          totalCount: countRows[0]?.count || 0,
          page,
          limit,
        };
      } catch (dbErr) {
        console.warn(
          "[Admin Orders] Direct DB query notice, falling back to Supabase REST client:",
          dbErr,
        );
      }
    }

    let query = supabaseAdmin.from("orders").select("*", { count: "exact" });

    if (data.filter && data.filter !== "all") {
      if (data.filter === "cod") {
        query = query.eq("payment_method", "cod");
      } else if (data.filter === "paid") {
        query = query.eq("payment_status", "paid");
      } else if (data.filter === "pending_payment") {
        query = query.eq("payment_status", "pending");
      } else if (data.filter === "shipped") {
        query = query.in("shipment_status", ["shipped", "in_transit", "out_for_delivery"]);
      } else if (data.filter === "delivered") {
        query = query.eq("shipment_status", "delivered");
      } else if (data.filter === "cancelled") {
        query = query.eq("status", "cancelled");
      } else if (data.filter === "rto_initiated") {
        query = query.in("shipment_status", ["rto_initiated", "rto_delivered"]);
      } else if (data.filter === "returned") {
        query = query.eq("status", "returned");
      } else {
        query = query.eq("status", data.filter);
      }
    }

    if (data.paymentMethod && data.paymentMethod !== "all") {
      query = query.eq("payment_method", data.paymentMethod);
    }

    if (data.search && data.search.trim()) {
      const safeSearch = data.search
        .trim()
        .replace(/[,()*\\"]/g, "")
        .slice(0, 80);
      if (safeSearch) {
        const pat = `"%${safeSearch}%"`;
        query = query.or(
          `order_number.ilike.${pat},customer_name.ilike.${pat},customer_email.ilike.${pat},customer_phone.ilike.${pat},awb_number.ilike.${pat}`,
        );
      }
    }

    const {
      data: orders,
      count,
      error,
    } = await query.order("created_at", { ascending: false }).range(offset, offset + limit - 1);

    if (error) {
      console.error("[Admin Orders] Fetch error:", error);
      throw new Error(`Failed to load orders: ${error.message || "Database request failed"}`);
    }

    return {
      orders: orders || [],
      totalCount: count || 0,
      page,
      limit,
    };
  });

function resolveOrderItemsWithFallback(
  order: Tables<"orders">,
  items: Tables<"order_items">[] | null | undefined,
): Tables<"order_items">[] {
  if (items && items.length > 0) return items;
  if (!Array.isArray(order.items)) return [];
  return (
    order.items as Array<{
      name?: string;
      size?: string;
      color?: string;
      qty?: number;
      price?: number;
      product_id?: string | null;
      productId?: string | null;
      product_slug?: string | null;
      slug?: string | null;
    }>
  ).map((raw, idx) => ({
    id: `${order.id}-item-${idx}`,
    order_id: order.id,
    product_id: raw.product_id || raw.productId || null,
    variant_id: null,
    product_slug: raw.product_slug || raw.slug || "",
    name: raw.name || "Garment",
    size: raw.size || "M",
    color: raw.color || "Default",
    qty: Number(raw.qty) || 1,
    price: Number(raw.price) || 0,
    image: null,
    created_at: order.created_at,
  }));
}

export const getAdminOrderDetailsServerFn = createServerFn({ method: "POST" })
  .validator((params: AdminAuthParams & { orderId: string }) => params)
  .handler(async ({ data }) => {
    await verifyAdminSession(data.authToken);

    const sql = await getDb();
    if (sql) {
      try {
        const orderRows = await sql<
          Tables<"orders">[]
        >`SELECT * FROM orders WHERE id = ${data.orderId} LIMIT 1`;
        if (orderRows && orderRows.length > 0) {
          const order = orderRows[0]!;
          const [items, addressRows, paymentRows, shipmentRows, refunds, history, trackingEvents] =
            await Promise.all([
              sql<
                Tables<"order_items">[]
              >`SELECT * FROM order_items WHERE order_id = ${order.id}`.catch(() => []),
              sql<
                Tables<"shipping_addresses">[]
              >`SELECT * FROM shipping_addresses WHERE order_id = ${order.id} LIMIT 1`.catch(
                () => [],
              ),
              sql<
                Tables<"payments">[]
              >`SELECT * FROM payments WHERE order_id = ${order.id} LIMIT 1`.catch(() => []),
              sql<
                Tables<"shipments">[]
              >`SELECT * FROM shipments WHERE order_id = ${order.id} LIMIT 1`.catch(() => []),
              sql<
                Tables<"payment_refunds">[]
              >`SELECT * FROM payment_refunds WHERE order_id = ${order.id}`.catch(() => []),
              sql<
                Tables<"order_status_history">[]
              >`SELECT * FROM order_status_history WHERE order_id = ${order.id} ORDER BY created_at ASC`.catch(
                () => [],
              ),
              sql<
                Tables<"shipment_tracking_events">[]
              >`SELECT * FROM shipment_tracking_events WHERE order_id = ${order.id} ORDER BY event_time ASC`.catch(
                () => [],
              ),
            ]);

          return {
            order,
            items: resolveOrderItemsWithFallback(order, items),
            address: addressRows[0] || null,
            payment: paymentRows[0] || null,
            shipment: shipmentRows[0] || null,
            refunds: refunds || [],
            history: history || [],
            tracking: trackingEvents || [],
          };
        }
      } catch (dbErr) {
        console.warn(
          "[Admin Order Details] Direct DB notice, falling back to Supabase REST client:",
          dbErr,
        );
      }
    }

    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select("*")
      .eq("id", data.orderId)
      .maybeSingle();

    if (error || !order) {
      throw new Error("Order not found");
    }

    const [itemsRes, addressRes, paymentRes, shipmentRes, refundsRes, historyRes, trackingRes] =
      await Promise.all([
        supabaseAdmin.from("order_items").select("*").eq("order_id", order.id),
        supabaseAdmin.from("shipping_addresses").select("*").eq("order_id", order.id).maybeSingle(),
        supabaseAdmin.from("payments").select("*").eq("order_id", order.id).maybeSingle(),
        supabaseAdmin.from("shipments").select("*").eq("order_id", order.id).maybeSingle(),
        supabaseAdmin.from("payment_refunds").select("*").eq("order_id", order.id),
        supabaseAdmin
          .from("order_status_history")
          .select("*")
          .eq("order_id", order.id)
          .order("created_at", { ascending: true }),
        supabaseAdmin
          .from("shipment_tracking_events")
          .select("*")
          .eq("order_id", order.id)
          .order("event_time", { ascending: true }),
      ]);

    return {
      order,
      items: resolveOrderItemsWithFallback(order, itemsRes.data),
      address: addressRes.data || null,
      payment: paymentRes.data || null,
      shipment: shipmentRes.data || null,
      refunds: refundsRes.data || [],
      history: historyRes.data || [],
      tracking: trackingRes.data || [],
    };
  });

const ALLOWED_ADMIN_ORDER_TRANSITIONS: Record<string, string[]> = {
  pending: ["pending", "pending_payment", "confirmed", "processing", "cancelled"],
  pending_payment: ["pending_payment", "confirmed", "processing", "cancelled"],
  confirmed: [
    "confirmed",
    "processing",
    "shipped",
    "in_transit",
    "out_for_delivery",
    "delivered",
    "cancelled",
    "refunded",
  ],
  processing: [
    "processing",
    "shipped",
    "in_transit",
    "out_for_delivery",
    "delivered",
    "cancelled",
    "refunded",
  ],
  shipped: ["shipped", "in_transit", "out_for_delivery", "delivered", "cancelled", "refunded"],
  in_transit: ["in_transit", "out_for_delivery", "delivered", "cancelled", "refunded"],
  out_for_delivery: ["out_for_delivery", "delivered", "cancelled", "refunded"],
  delivered: ["delivered", "return_requested", "returned", "refunded"],
  return_requested: ["return_requested", "returned", "refunded", "delivered"],
  returned: ["returned", "refunded"],
  cancelled: ["cancelled", "refunded"],
  refunded: ["refunded"],
};

export const updateAdminOrderStatusServerFn = createServerFn({ method: "POST" })
  .validator(
    (
      params: AdminAuthParams & {
        orderId: string;
        status: string;
        shipmentStatus?: string | undefined;
        notes?: string | undefined;
      },
    ) => params,
  )
  .handler(async ({ data }) => {
    const admin = await verifyAdminSession(data.authToken);

    const { data: currentOrderData, error: fetchErr } = await supabaseAdmin
      .from("orders")
      .select(
        "id, status, shipment_status, payment_method, payment_status, total, items, order_number",
      )
      .eq("id", data.orderId)
      .maybeSingle();

    let currentOrder = currentOrderData;
    if (fetchErr || !currentOrder) {
      const { data: fallbackOrder, error: fallbackErr } = await supabaseAdmin
        .from("orders")
        .select("id, status, shipment_status, payment_status, total, items, order_number")
        .eq("id", data.orderId)
        .maybeSingle();
      if (fallbackErr || !fallbackOrder) {
        throw new Error("Order not found");
      }
      currentOrder = {
        ...fallbackOrder,
        payment_method:
          (fallbackOrder as { payment_method?: string | null }).payment_method || "online",
      };
    }

    // Order lifecycle transition validation
    const allowedTargets = ALLOWED_ADMIN_ORDER_TRANSITIONS[currentOrder.status];
    if (allowedTargets && !allowedTargets.includes(data.status)) {
      throw new Error(
        `Invalid order status transition from '${currentOrder.status}' to '${data.status}'.`,
      );
    }
    if (
      ["cancelled", "refunded"].includes(currentOrder.status) &&
      currentOrder.status !== data.status &&
      !(currentOrder.status === "cancelled" && data.status === "refunded")
    ) {
      throw new Error(
        `Order is in terminal state '${currentOrder.status}' and cannot be transitioned to '${data.status}'.`,
      );
    }

    // If transitioning to cancelled, trigger restock / reservation release / shipment cancellation
    if (data.status === "cancelled" && currentOrder.status !== "cancelled") {
      if (currentOrder.status === "pending_payment") {
        await releaseOrderInventoryReservations(currentOrder.id);
      } else {
        await restockOrderInventory(currentOrder, admin.userId, "order_cancelled");
      }
      await cancelShipMaxxShipment({
        orderId: currentOrder.id,
        reason: data.notes?.trim() || "Cancelled by administrator",
      });
    }

    const updatePayload: OrderUpdate = {
      status: data.status,
      updated_at: new Date().toISOString(),
    };

    if (data.shipmentStatus) {
      updatePayload.shipment_status = data.shipmentStatus;
      if (data.shipmentStatus === "delivered") {
        updatePayload.delivered_at = new Date().toISOString();
        // If COD order delivered, mark payment collected as paid
        if (currentOrder.payment_method === "cod" && currentOrder.payment_status !== "paid") {
          updatePayload.payment_status = "paid";
          await supabaseAdmin
            .from("payments")
            .update({ status: "captured", updated_at: new Date().toISOString() })
            .eq("order_id", currentOrder.id);
        }
      }
    }

    const { data: updated, error } = await supabaseAdmin
      .from("orders")
      .update(updatePayload)
      .eq("id", data.orderId)
      .select()
      .single();

    if (error || !updated) {
      console.error("[Admin Update Order Status] Error:", error);
      throw new Error("Failed to update order status");
    }

    // Mandatory write to order_status_history
    const comment =
      data.notes?.trim() ||
      `Status transitioned from '${currentOrder.status}' to '${data.status}' by administrator.${data.shipmentStatus ? ` Logistics: ${data.shipmentStatus}.` : ""}`;

    await supabaseAdmin.from("order_status_history").insert({
      order_id: data.orderId,
      status: data.status,
      comment,
      changed_by: admin.email || admin.userId,
    });

    await recordAdminAuditLog(admin, "order_status_update", "order", data.orderId, {
      previousStatus: currentOrder.status,
      newStatus: data.status,
      previousShipmentStatus: currentOrder.shipment_status,
      shipmentStatus: data.shipmentStatus,
      notes: data.notes,
    });

    return { success: true, order: updated };
  });

export const cancelAdminOrderServerFn = createServerFn({ method: "POST" })
  .validator((params: AdminAuthParams & { orderId: string; reason?: string | undefined }) => params)
  .handler(async ({ data }) => {
    const admin = await verifyAdminSession(data.authToken);

    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select("id, status, items, order_number, payment_status")
      .eq("id", data.orderId)
      .single();

    if (error || !order) throw new Error("Order not found");

    if (order.status === "cancelled") {
      throw new Error("Order is already cancelled.");
    }

    // If order was in pending_payment, release active reservation
    if (order.status === "pending_payment") {
      await releaseOrderInventoryReservations(order.id);
    } else {
      // Confirmed or processing: restock across all inventory tiers
      await restockOrderInventory(order, admin.userId, "order_cancelled");
    }

    await cancelShipMaxxShipment({
      orderId: order.id,
      reason: data.reason || "Order cancelled by administrator",
    });

    const { data: redemption } = await supabaseAdmin
      .from("coupon_redemptions")
      .select("id, coupon_id")
      .eq("order_id", order.id)
      .maybeSingle();
    if (redemption) {
      const { data: cp } = await supabaseAdmin
        .from("coupons")
        .select("id, times_used")
        .eq("id", redemption.coupon_id)
        .maybeSingle();
      if (cp) {
        await supabaseAdmin
          .from("coupons")
          .update({ times_used: Math.max(0, (cp.times_used || 0) - 1) })
          .eq("id", cp.id);
      }
      await supabaseAdmin.from("coupon_redemptions").delete().eq("id", redemption.id);
    }

    const { error: updateError } = await supabaseAdmin
      .from("orders")
      .update({
        status: "cancelled",
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id);

    if (updateError) throw new Error("Failed to cancel order");

    // Mandatory write to order_status_history
    await supabaseAdmin.from("order_status_history").insert({
      order_id: order.id,
      status: "cancelled",
      comment: data.reason || "Order cancelled by administrator via operations portal",
      changed_by: admin.email || admin.userId,
    });

    await recordAdminAuditLog(admin, "order_cancelled", "order", data.orderId, {
      reason: data.reason || "Cancelled by administrator",
    });

    return { success: true };
  });

// -----------------------------------------------------------------------------
// 3. SHIPMENT CREATION & DISPATCH
// -----------------------------------------------------------------------------

export const createAdminShipmentServerFn = createServerFn({ method: "POST" })
  .validator((params: AdminAuthParams & { orderId: string }) => params)
  .handler(async ({ data }) => {
    const admin = await verifyAdminSession(data.authToken);

    const [{ data: order, error: orderErr }, { data: addressList }, { data: items }] =
      await Promise.all([
        supabaseAdmin.from("orders").select("*").eq("id", data.orderId).single(),
        supabaseAdmin.from("shipping_addresses").select("*").eq("order_id", data.orderId).limit(1),
        supabaseAdmin.from("order_items").select("*").eq("order_id", data.orderId),
      ]);

    if (orderErr || !order) throw new Error("Order not found");

    const address = addressList && addressList.length > 0 ? addressList[0] : null;

    if (!address) {
      throw new Error("No shipping address associated with this order");
    }

    const itemsList = (items || []).map((i) => ({
      name: i.name,
      size: i.size,
      color: i.color,
      qty: i.qty,
      price: i.price,
    }));

    const result = await createShipMaxxShipment({
      orderId: order.id,
      orderNumber: order.order_number || `ORD-${order.id.slice(0, 8)}`,
      customerName: address.full_name || order.customer_name || "Customer",
      customerPhone: address.phone || order.customer_phone || "",
      customerEmail: address.email || order.customer_email || "",
      address: {
        line1: address.address_line1,
        line2: address.address_line2 || undefined,
        city: address.city,
        state: address.state,
        pincode: address.pincode,
      },
      items: itemsList,
      paymentMode: order.payment_method === "cod" ? "cod" : "prepaid",
      codAmount: order.payment_method === "cod" ? order.total : 0,
    });

    if (!result.success) {
      throw new Error(result.error || "Failed to create shipment through ShipMaxx360");
    }

    await recordAdminAuditLog(admin, "shipment_create", "shipment", order.id, {
      awb: result.awbNumber,
      courier: result.courierPartner,
    });

    return { success: true, result };
  });

// -----------------------------------------------------------------------------
// 4. RAZORPAY REFUND INITIATION
// -----------------------------------------------------------------------------

export const initiateAdminRefundServerFn = createServerFn({ method: "POST" })
  .validator(
    (
      params: AdminAuthParams & {
        orderId: string;
        amountInRupees: number;
        reason?: string | undefined;
      },
    ) => params,
  )
  .handler(async ({ data }) => {
    const admin = await verifyAdminSession(data.authToken);

    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select("id, total, status, payment_status, razorpay_payment_id")
      .eq("id", data.orderId)
      .single();

    if (error || !order) throw new Error("Order not found");

    if (!order.razorpay_payment_id) {
      throw new Error(
        "Cannot process Razorpay refund: Order does not contain a verified razorpay_payment_id.",
      );
    }

    // Check remaining refundable balance BEFORE issuing refund against Razorpay
    const { data: priorRefundRows } = await supabaseAdmin
      .from("payment_refunds")
      .select("amount")
      .eq("order_id", order.id);

    const priorRefunded = (priorRefundRows || []).reduce(
      (sum, r) => sum + (Number(r.amount) || 0),
      0,
    );
    const remainingRefundable = Math.max(0, Number(order.total) - priorRefunded);

    if (remainingRefundable <= 0) {
      throw new Error("Order has already been fully refunded.");
    }

    const amountPaise = Math.round(data.amountInRupees * 100);
    const remainingPaise = Math.round(remainingRefundable * 100);

    if (amountPaise <= 0 || amountPaise > remainingPaise) {
      throw new Error(
        `Refund amount must be between ₹1 and remaining refundable balance ₹${remainingRefundable}.`,
      );
    }

    const refundRes = await refundRazorpayPayment({
      paymentId: order.razorpay_payment_id,
      amountInPaise: amountPaise,
      notes: {
        reason: data.reason || "Customer refund initiated by CAVENHUSRT administration",
      },
    });

    if (!refundRes.success) {
      throw new Error(refundRes.error || "Razorpay rejected the refund request.");
    }

    // Lookup payment record to link foreign key payment_id
    const { data: paymentRecord } = await supabaseAdmin
      .from("payments")
      .select("id")
      .eq("order_id", order.id)
      .maybeSingle();

    // Canonical single-source refund insert into public.payment_refunds
    const { error: prErr } = await supabaseAdmin.from("payment_refunds").insert({
      order_id: order.id,
      payment_id: paymentRecord?.id || null,
      razorpay_payment_id: order.razorpay_payment_id,
      razorpay_refund_id: refundRes.refundId || null,
      amount: data.amountInRupees,
      amount_paise: amountPaise,
      currency: "INR",
      reason: data.reason || "Administrative refund",
      status: refundRes.status || "processed",
      admin_user_id: admin.userId,
      raw_response: (refundRes.raw || {}) as unknown as Json,
    });

    if (prErr) {
      throw new Error(`Refund succeeded on Razorpay but ledger write failed: ${prErr.message}`);
    }

    // Query authoritative refund ledger (already contains the newly inserted row — never double-add!)
    const { data: allPaymentRefunds } = await supabaseAdmin
      .from("payment_refunds")
      .select("amount")
      .eq("order_id", order.id);

    const totalRefunded = (allPaymentRefunds || []).reduce(
      (sum, r) => sum + (Number(r.amount) || 0),
      0,
    );
    const isFullRefund = totalRefunded >= order.total;

    const newPaymentStatus = isFullRefund ? "refunded" : "partially_refunded";
    const newOrderStatus = isFullRefund ? "refunded" : order.status;

    await supabaseAdmin
      .from("orders")
      .update({
        status: newOrderStatus,
        payment_status: newPaymentStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id);

    await supabaseAdmin
      .from("payments")
      .update({
        status: newPaymentStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("order_id", order.id);

    await supabaseAdmin.from("order_status_history").insert({
      order_id: order.id,
      status: newOrderStatus,
      comment: isFullRefund
        ? `Full refund of ₹${data.amountInRupees} processed successfully via Razorpay.`
        : `Partial refund of ₹${data.amountInRupees} processed via Razorpay. Total refunded: ₹${totalRefunded} of ₹${order.total}.`,
      changed_by: admin.email || admin.userId,
    });

    await recordAdminAuditLog(admin, "refund_initiated", "order", order.id, {
      amount: data.amountInRupees,
      refundId: refundRes.refundId,
      reason: data.reason,
    });

    return {
      success: true,
      refundId: refundRes.refundId,
      status: refundRes.status,
    };
  });

// -----------------------------------------------------------------------------
// 5. PRODUCT & CATALOG MANAGEMENT
// -----------------------------------------------------------------------------

export const getAdminProductsServerFn = createServerFn({ method: "POST" })
  .validator((params?: AdminAuthParams | undefined) => params || {})
  .handler(async ({ data }) => {
    await verifyAdminSession(data.authToken);

    const sql = getDb();
    if (sql) {
      try {
        const rows = await sql<Tables<"products">[]>`
          SELECT * FROM products ORDER BY rank ASC
        `;
        if (rows && rows.length > 0) return rows;
      } catch (dbErr) {
        console.warn("[Admin Products] Direct DB query notice, trying Supabase REST:", dbErr);
      }
    }

    try {
      const { data: dbProducts, error } = await supabaseAdmin
        .from("products")
        .select("*")
        .order("rank", { ascending: true });

      if (!error && dbProducts && dbProducts.length > 0) {
        return dbProducts;
      }
    } catch (err) {
      console.warn("[Admin Products] Supabase client error:", err);
    }

    return (PRODUCTS as unknown as InventoryProductRow[]) || [];
  });

export const saveAdminProductServerFn = createServerFn({ method: "POST" })
  .validator(
    (
      params: AdminAuthParams & {
        product: {
          id?: string | undefined;
          slug: string;
          name: string;
          category_slug: string;
          price: number;
          mrp: number;
          fabric?: string | undefined;
          fit?: string | undefined;
          description?: string | undefined;
          colors: Array<{ name: string; hex: string }>;
          stock: Record<string, number>;
          images: string[];
          is_new?: boolean | undefined;
          is_published?: boolean | undefined;
          is_featured?: boolean | undefined;
          rank?: number | undefined;
        };
      },
    ) => params,
  )
  .handler(async ({ data }) => {
    const admin = await verifyAdminSession(data.authToken);
    const p = data.product;

    const payload = {
      slug: p.slug,
      name: p.name,
      category_slug: p.category_slug,
      price: p.price,
      mrp: p.mrp,
      fabric: p.fabric || null,
      fit: p.fit || null,
      description: p.description || null,
      colors: p.colors as unknown as Json,
      stock: p.stock as unknown as Json,
      images: p.images,
      is_new: p.is_new ?? true,
      is_published: p.is_published ?? true,
      is_featured: p.is_featured ?? false,
      rank: p.rank ?? 100,
      updated_at: new Date().toISOString(),
    };

    let resultProduct;
    if (p.id) {
      const { data: updated, error } = await supabaseAdmin
        .from("products")
        .update(payload)
        .eq("id", p.id)
        .select()
        .single();

      if (error) throw new Error(error.message);
      resultProduct = updated;
      await recordAdminAuditLog(admin, "product_update", "product", p.id, { name: p.name });
    } else {
      const { data: created, error } = await supabaseAdmin
        .from("products")
        .insert(payload)
        .select()
        .single();

      if (error) throw new Error(error.message);
      resultProduct = created;
      await recordAdminAuditLog(admin, "product_create", "product", created.id, { name: p.name });
    }

    invalidateCatalogCache();
    return { success: true, product: resultProduct };
  });

export const deleteAdminProductServerFn = createServerFn({ method: "POST" })
  .validator(
    (params: AdminAuthParams & { productId: string; hardDelete?: boolean | undefined }) => params,
  )
  .handler(async ({ data }) => {
    const admin = await verifyAdminSession(data.authToken);

    const { data: prod } = await supabaseAdmin
      .from("products")
      .select("id, slug, name")
      .eq("id", data.productId)
      .single();

    if (!prod) throw new Error("Product not found");

    if (data.hardDelete) {
      invalidateCatalogCache();
      const { data: orderItem } = await supabaseAdmin
        .from("order_items")
        .select("id")
        .eq("product_slug", prod.slug)
        .limit(1);

      if (orderItem && orderItem.length > 0) {
        await supabaseAdmin
          .from("products")
          .update({ is_published: false, updated_at: new Date().toISOString() })
          .eq("id", data.productId);

        await recordAdminAuditLog(admin, "product_unpublish_safe", "product", data.productId, {
          reason: "Product referenced in orders; archived instead of deleted",
        });

        return {
          success: true,
          archived: true,
          message: "Product is referenced in customer orders. It has been safely archived.",
        };
      }

      await supabaseAdmin.from("products").delete().eq("id", data.productId);
      await recordAdminAuditLog(admin, "product_delete", "product", data.productId, {
        name: prod.name,
      });

      return { success: true, deleted: true };
    } else {
      await supabaseAdmin
        .from("products")
        .update({ is_published: false, updated_at: new Date().toISOString() })
        .eq("id", data.productId);

      await recordAdminAuditLog(admin, "product_unpublish", "product", data.productId, {
        name: prod.name,
      });

      return { success: true, archived: true };
    }
  });

// -----------------------------------------------------------------------------
// 6. INVENTORY MANAGEMENT
// -----------------------------------------------------------------------------

function computeStockStatus(available: number): "in_stock" | "low_stock" | "out_of_stock" {
  if (available <= 0) return "out_of_stock";
  if (available <= 5) return "low_stock";
  return "in_stock";
}

export const getAdminInventoryServerFn = createServerFn({ method: "POST" })
  .validator((params?: AdminAuthParams | undefined) => params || {})
  .handler(async ({ data }) => {
    await verifyAdminSession(data.authToken);

    const sql = getDb();
    if (sql) {
      try {
        interface VariantJoinSqlRow {
          id: string;
          product_id: string;
          product_name: string;
          product_slug: string;
          color: string | null;
          color_hex: string | null;
          size: string;
          physical_quantity: number;
          reserved_quantity: number;
        }
        const [prods, movements, rawVariantRows] = await Promise.all([
          sql<
            InventoryProductRow[]
          >`SELECT id, slug, name, stock, colors FROM products ORDER BY name ASC`,
          sql<
            Tables<"inventory_movements">[]
          >`SELECT * FROM inventory_movements ORDER BY created_at DESC LIMIT 50`.catch(() => []),
          sql<VariantJoinSqlRow[]>`
            SELECT
              v.id,
              v.product_id,
              p.name AS product_name,
              p.slug AS product_slug,
              v.color,
              v.color_hex,
              v.size,
              COALESCE(i.stock_quantity, v.stock_quantity, 0)::int AS physical_quantity,
              COALESCE(i.reserved_quantity, 0)::int AS reserved_quantity
            FROM public.product_variants v
            JOIN public.products p ON p.id = v.product_id
            LEFT JOIN public.inventory i ON i.variant_id = v.id
            ORDER BY p.name ASC, v.color ASC, v.size ASC
          `.catch(() => [] as VariantJoinSqlRow[]),
        ]);
        if (prods && prods.length > 0) {
          const variantRows: InventoryVariantStatusRow[] = (rawVariantRows || []).map((r) => {
            const physical = Math.max(0, Number(r.physical_quantity) || 0);
            const reserved = Math.max(0, Number(r.reserved_quantity) || 0);
            const available = Math.max(0, physical - reserved);
            return {
              id: r.id,
              product_id: r.product_id,
              product_name: r.product_name,
              product_slug: r.product_slug,
              color: r.color || "Standard",
              color_hex: r.color_hex,
              size: r.size,
              physical_quantity: physical,
              reserved_quantity: reserved,
              available_quantity: available,
              stock_status: computeStockStatus(available),
            };
          });
          return {
            inventory: prods,
            recentMovements: movements || [],
            variantRows,
          };
        }
      } catch (dbErr) {
        console.warn("[Admin Inventory] Direct DB notice:", dbErr);
      }
    }

    try {
      const [productsRes, movementsRes, variantsRes, invRes] = await Promise.all([
        supabaseAdmin.from("products").select("id, slug, name, stock, colors").order("name"),
        supabaseAdmin
          .from("inventory_movements")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(50),
        supabaseAdmin
          .from("product_variants")
          .select("id, product_id, size, color, color_hex, stock_quantity"),
        supabaseAdmin.from("inventory").select("variant_id, stock_quantity, reserved_quantity"),
      ]);

      const prodsList = productsRes.data || (PRODUCTS as unknown as InventoryProductRow[]) || [];
      const prodById = new Map<string, InventoryProductRow>();
      for (const p of prodsList) {
        if (p.id) prodById.set(p.id, p);
      }
      const invByVariant = new Map<string, { stock_quantity: number; reserved_quantity: number }>();
      for (const inv of invRes.data || []) {
        if (inv.variant_id) {
          invByVariant.set(inv.variant_id, {
            stock_quantity: Number(inv.stock_quantity) || 0,
            reserved_quantity: Number(inv.reserved_quantity) || 0,
          });
        }
      }

      const variantRows: InventoryVariantStatusRow[] = (variantsRes.data || []).map((v) => {
        const prod = prodById.get(v.product_id);
        const inv = invByVariant.get(v.id);
        const physical = Math.max(0, inv ? inv.stock_quantity : Number(v.stock_quantity) || 0);
        const reserved = Math.max(0, inv ? inv.reserved_quantity : 0);
        const available = Math.max(0, physical - reserved);
        return {
          id: v.id,
          product_id: v.product_id,
          product_name: prod?.name || "Garment",
          product_slug: prod?.slug || "",
          color: v.color || "Standard",
          color_hex: v.color_hex,
          size: v.size,
          physical_quantity: physical,
          reserved_quantity: reserved,
          available_quantity: available,
          stock_status: computeStockStatus(available),
        };
      });

      return {
        inventory: prodsList,
        recentMovements: movementsRes.data || [],
        variantRows,
      };
    } catch {
      return {
        inventory: (PRODUCTS as unknown as InventoryProductRow[]) || [],
        recentMovements: [],
        variantRows: [] as InventoryVariantStatusRow[],
      };
    }
  });

export const adjustAdminStockServerFn = createServerFn({ method: "POST" })
  .validator(
    (
      params: AdminAuthParams & {
        productId: string;
        size: string;
        color?: string | undefined;
        newStock: number;
        reason: string;
      },
    ) => params,
  )
  .handler(async ({ data }) => {
    const admin = await verifyAdminSession(data.authToken);

    const { data: prod, error } = await supabaseAdmin
      .from("products")
      .select("id, slug, name, stock")
      .eq("id", data.productId)
      .single();

    if (error || !prod) throw new Error("Product not found");

    const stockMap = (prod.stock || {}) as Record<string, number>;
    const oldStock = stockMap[data.size] ?? 0;
    const safeNewStock = Math.max(0, data.newStock);
    const cleanColor = data.color?.trim() || null;

    // 1. Find or create matching variant in product_variants (matching product_id + size + color)
    let variantId: string | null = null;
    let variantSku = `${prod.slug}-${data.size.toLowerCase()}`;
    if (cleanColor) {
      variantSku += `-${cleanColor.toLowerCase().replace(/\s+/g, "")}`;
    }

    const varQuery = supabaseAdmin
      .from("product_variants")
      .select("id, sku, stock_quantity")
      .eq("product_id", prod.id)
      .eq("size", data.size);
    if (cleanColor) {
      varQuery.ilike("color", cleanColor);
    }
    const { data: existingVariants } = await varQuery.limit(1);

    const matchedVariant =
      existingVariants && existingVariants.length > 0 ? existingVariants[0] : null;
    const prevVariantStock = matchedVariant?.stock_quantity ?? oldStock;
    const changeQty = safeNewStock - prevVariantStock;

    if (matchedVariant) {
      variantId = matchedVariant.id;
      variantSku = matchedVariant.sku || variantSku;
      await supabaseAdmin
        .from("product_variants")
        .update({
          stock_quantity: safeNewStock,
          is_available: safeNewStock > 0,
          updated_at: new Date().toISOString(),
        })
        .eq("id", variantId);
    } else {
      const { data: newVariant } = await supabaseAdmin
        .from("product_variants")
        .insert({
          product_id: prod.id,
          sku: variantSku,
          size: data.size,
          color: cleanColor || "Standard",
          stock_quantity: safeNewStock,
          is_available: safeNewStock > 0,
        })
        .select("id, sku")
        .single();
      if (newVariant) {
        variantId = newVariant.id;
        variantSku = newVariant.sku || variantSku;
      }
    }

    // 2. Upsert into public.inventory
    if (variantId) {
      await supabaseAdmin.from("inventory").upsert(
        {
          product_id: prod.id,
          variant_id: variantId,
          sku: variantSku,
          stock_quantity: safeNewStock,
          safety_stock: 5,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "variant_id" },
      );
    }

    // 3. Recompute aggregate products.stock JSONB across all colors for each size
    await syncProductAggregateStock(prod.id);
    const { data: refreshedProd } = await supabaseAdmin
      .from("products")
      .select("stock")
      .eq("id", prod.id)
      .single();
    const updatedStock = (refreshedProd?.stock || {
      ...stockMap,
      [data.size]: safeNewStock,
    }) as Record<string, number>;

    // 4. Record inventory movement
    await supabaseAdmin.from("inventory_movements").insert({
      product_id: prod.id,
      product_slug: prod.slug,
      size: data.size,
      color: cleanColor,
      change_qty: changeQty,
      new_stock: safeNewStock,
      reason: data.reason || "admin_adjustment",
      admin_user_id: admin.userId,
    });

    // 5. Audit log
    await recordAdminAuditLog(admin, "stock_adjustment", "inventory", prod.id, {
      size: data.size,
      color: cleanColor,
      oldStock: prevVariantStock,
      newStock: safeNewStock,
      change: changeQty,
      reason: data.reason,
    });

    return { success: true, updatedStock };
  });

// -----------------------------------------------------------------------------
// 7. PAYMENTS AUDIT & RECONCILIATION
// -----------------------------------------------------------------------------

export const getAdminPaymentsServerFn = createServerFn({ method: "POST" })
  .validator((params?: AdminAuthParams | undefined) => params || {})
  .handler(async ({ data }) => {
    await verifyAdminSession(data.authToken);

    const sql = getDb();
    if (sql) {
      try {
        const rows = await sql<Tables<"payments">[]>`
          SELECT * FROM payments ORDER BY created_at DESC LIMIT 100
        `;
        if (rows) return rows;
      } catch (dbErr) {
        console.warn("[Admin Payments] Direct DB notice:", dbErr);
      }
    }

    try {
      const { data: payments, error } = await supabaseAdmin
        .from("payments")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (!error && payments) return payments;
    } catch (err) {
      console.warn("[Admin Payments] Supabase error:", err);
    }

    return [];
  });

// -----------------------------------------------------------------------------
// 8. SHIPMENTS MANAGEMENT
// -----------------------------------------------------------------------------

export const getAdminShipmentsServerFn = createServerFn({ method: "POST" })
  .validator((params?: AdminAuthParams | undefined) => params || {})
  .handler(async ({ data }) => {
    await verifyAdminSession(data.authToken);

    const sql = getDb();
    if (sql) {
      try {
        const rows = await sql<Tables<"shipments">[]>`
          SELECT * FROM shipments ORDER BY created_at DESC LIMIT 100
        `;
        if (rows) return rows;
      } catch (dbErr) {
        console.warn("[Admin Shipments] Direct DB notice:", dbErr);
      }
    }

    try {
      const { data: shipments, error } = await supabaseAdmin
        .from("shipments")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (!error && shipments) return shipments;
    } catch (err) {
      console.warn("[Admin Shipments] Supabase error:", err);
    }

    return [];
  });

// -----------------------------------------------------------------------------
// 9. CUSTOMERS DIRECTORY
// -----------------------------------------------------------------------------

interface DbCustomerRow {
  id: string;
  auth_provider_uid: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  account_status: string | null;
  registration_date: string | null;
  created_at: string | null;
  updated_at: string | null;
}

interface DbProfileRow {
  id: string;
  email: string | null;
  phone: string | null;
  mobile_number?: string | null;
  profile_completed?: boolean | null;
  full_name: string | null;
  auth_provider: string | null;
  account_status: string | null;
  created_at: string | null;
  updated_at: string | null;
}

interface DbOrderSummaryRow {
  id: string;
  user_id: string | null;
  customer_id: string | null;
  customer_email: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  total: number;
  status: string;
  created_at: string;
}

export const getAdminCustomersServerFn = createServerFn({ method: "POST" })
  .validator((params?: AdminAuthParams | undefined) => params || {})
  .handler(async ({ data }) => {
    await verifyAdminSession(data.authToken);

    const sql = getDb();
    if (sql) {
      try {
        const [customers, profiles, orders] = await Promise.all([
          sql<DbCustomerRow[]>`
            SELECT id, auth_provider_uid, full_name, email, phone, account_status, registration_date, created_at, updated_at
            FROM customers
            ORDER BY created_at DESC
            LIMIT 200
          `,
          sql<DbProfileRow[]>`
            SELECT id, email, phone, mobile_number, profile_completed, full_name, auth_provider, account_status, created_at, updated_at
            FROM profiles
          `,
          sql<DbOrderSummaryRow[]>`
            SELECT id, user_id, customer_id, customer_email, customer_name, customer_phone, total, status, created_at
            FROM orders
          `,
        ]);
        const profileMap = new Map((profiles || []).map((p) => [p.id, p]));
        const profileEmailMap = new Map((profiles || []).map((p) => [p.email?.toLowerCase(), p]));

        const list = (customers || []).map((c) => {
          const matchedProfile =
            (c.auth_provider_uid ? profileMap.get(c.auth_provider_uid) : null) ||
            (c.email ? profileEmailMap.get(c.email.toLowerCase()) : null);

          const customerOrders = (orders || []).filter(
            (o) =>
              o.customer_id === c.id ||
              (c.auth_provider_uid && o.user_id === c.auth_provider_uid) ||
              (c.email && o.customer_email?.toLowerCase() === c.email.toLowerCase()),
          );

          const totalSpent = customerOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
          const mobile = matchedProfile?.mobile_number || matchedProfile?.phone || c.phone || "";
          const isCompleted =
            matchedProfile?.profile_completed != null
              ? matchedProfile.profile_completed
              : Boolean(
                  (c.full_name || matchedProfile?.full_name) &&
                  mobile.replace(/\D/g, "").slice(-10).length === 10,
                );

          return {
            id: c.id,
            authUid: matchedProfile?.id || c.auth_provider_uid,
            name: c.full_name || matchedProfile?.full_name || "Customer",
            email: c.email || matchedProfile?.email || "",
            phone: mobile,
            mobileNumber: mobile,
            profileCompleted: isCompleted,
            loginProvider: matchedProfile?.auth_provider || "email",
            orderCount: customerOrders.length,
            totalSpent,
            status: c.account_status || matchedProfile?.account_status || "active",
            createdAt: c.registration_date || c.created_at || matchedProfile?.created_at,
            lastLogin: matchedProfile?.updated_at || c.updated_at || null,
          };
        });

        // Add any registered profiles not yet mirrored into customers table
        const seenAuth = new Set(list.map((item) => item.authUid).filter(Boolean));
        for (const p of profiles || []) {
          if (!seenAuth.has(p.id)) {
            const mobile = p.mobile_number || p.phone || "";
            const isCompleted =
              p.profile_completed != null
                ? p.profile_completed
                : Boolean(p.full_name && mobile.replace(/\D/g, "").slice(-10).length === 10);
            const customerOrders = (orders || []).filter(
              (o) =>
                o.user_id === p.id ||
                (p.email && o.customer_email?.toLowerCase() === p.email.toLowerCase()),
            );
            list.push({
              id: p.id,
              authUid: p.id,
              name: p.full_name || "Customer",
              email: p.email || "",
              phone: mobile,
              mobileNumber: mobile,
              profileCompleted: isCompleted,
              loginProvider: p.auth_provider || "email",
              orderCount: customerOrders.length,
              totalSpent: customerOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0),
              status: p.account_status || "active",
              createdAt: p.created_at,
              lastLogin: p.updated_at || null,
            });
            seenAuth.add(p.id);
          }
        }

        return list;
      } catch (err) {
        console.error("[Admin Customers] Direct DB error, falling back to Supabase client:", err);
      }
    }

    const [customersRes, profilesRes, ordersRes] = await Promise.all([
      supabaseAdmin
        .from("customers")
        .select(
          "id, auth_provider_uid, full_name, email, phone, account_status, registration_date, created_at, updated_at",
        )
        .order("created_at", { ascending: false })
        .limit(200),
      supabaseAdmin
        .from("profiles")
        .select(
          "id, email, phone, mobile_number, profile_completed, full_name, auth_provider, account_status, created_at, updated_at",
        ),
      supabaseAdmin
        .from("orders")
        .select(
          "id, user_id, customer_id, customer_email, customer_name, customer_phone, total, status, created_at",
        ),
    ]);

    const orders = ordersRes.data || [];
    const profiles = (profilesRes.data || []) as unknown as DbProfileRow[];
    const profileMap = new Map(profiles.map((p) => [p.id, p]));
    const profileEmailMap = new Map(profiles.map((p) => [p.email?.toLowerCase(), p]));

    const customerList = (customersRes.data || []).map((c) => {
      const matchedProfile =
        (c.auth_provider_uid ? profileMap.get(c.auth_provider_uid) : null) ||
        (c.email ? profileEmailMap.get(c.email.toLowerCase()) : null);

      const customerOrders = orders.filter(
        (o) =>
          o.customer_id === c.id ||
          (c.auth_provider_uid && o.user_id === c.auth_provider_uid) ||
          (c.email && o.customer_email?.toLowerCase() === c.email.toLowerCase()),
      );

      const totalSpent = customerOrders.reduce((sum, o) => sum + (o.total || 0), 0);
      const mobile = matchedProfile?.mobile_number || matchedProfile?.phone || c.phone || "";
      const isCompleted =
        matchedProfile?.profile_completed != null
          ? matchedProfile.profile_completed
          : Boolean(
              (c.full_name || matchedProfile?.full_name) &&
              mobile.replace(/\D/g, "").slice(-10).length === 10,
            );

      return {
        id: c.id,
        authUid: matchedProfile?.id || c.auth_provider_uid,
        name: c.full_name || matchedProfile?.full_name || "Customer",
        email: c.email || matchedProfile?.email || "",
        phone: mobile,
        mobileNumber: mobile,
        profileCompleted: isCompleted,
        loginProvider: matchedProfile?.auth_provider || "email",
        orderCount: customerOrders.length,
        totalSpent,
        status: c.account_status || matchedProfile?.account_status || "active",
        createdAt: c.registration_date || c.created_at || matchedProfile?.created_at,
        lastLogin: matchedProfile?.updated_at || c.updated_at || null,
      };
    });

    // Add any registered profiles not yet mirrored into customers table
    const seenAuth = new Set(customerList.map((item) => item.authUid).filter(Boolean));
    for (const p of profiles) {
      if (!seenAuth.has(p.id)) {
        const mobile = p.mobile_number || p.phone || "";
        const isCompleted =
          p.profile_completed != null
            ? p.profile_completed
            : Boolean(p.full_name && mobile.replace(/\D/g, "").slice(-10).length === 10);
        const customerOrders = orders.filter(
          (o) =>
            o.user_id === p.id ||
            (p.email && o.customer_email?.toLowerCase() === p.email.toLowerCase()),
        );
        customerList.push({
          id: p.id,
          authUid: p.id,
          name: p.full_name || "Customer",
          email: p.email || "",
          phone: mobile,
          mobileNumber: mobile,
          profileCompleted: isCompleted,
          loginProvider: p.auth_provider || "email",
          orderCount: customerOrders.length,
          totalSpent: customerOrders.reduce((sum, o) => sum + (o.total || 0), 0),
          status: p.account_status || "active",
          createdAt: p.created_at,
          lastLogin: p.updated_at || null,
        });
        seenAuth.add(p.id);
      }
    }

    return customerList;
  });

export const getAdminCustomerDetailsServerFn = createServerFn({ method: "POST" })
  .validator((params: { authToken?: string | undefined; customerId: string }) => params)
  .handler(async ({ data }) => {
    await verifyAdminSession(data.authToken);

    const { data: customer } = await supabaseAdmin
      .from("customers")
      .select("*")
      .eq("id", data.customerId)
      .maybeSingle();

    if (!customer) throw new Error("Customer not found");

    const qLit = (val: string) => `"${val.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
    const orAddrClauses: string[] = [`customer_id.eq.${qLit(customer.id)}`];
    if (customer.auth_provider_uid)
      orAddrClauses.push(`customer_auth_uid.eq.${qLit(customer.auth_provider_uid)}`);

    const orOrderClauses: string[] = [`customer_id.eq.${qLit(customer.id)}`];
    if (customer.auth_provider_uid)
      orOrderClauses.push(`user_id.eq.${qLit(customer.auth_provider_uid)}`);
    if (customer.email)
      orOrderClauses.push(`customer_email.eq.${qLit(customer.email.toLowerCase())}`);

    const [addressesRes, ordersRes] = await Promise.all([
      supabaseAdmin
        .from("customer_addresses")
        .select("*")
        .or(orAddrClauses.join(","))
        .order("is_default", { ascending: false }),
      supabaseAdmin
        .from("orders")
        .select(
          "id, order_number, total, status, payment_status, shipment_status, awb_number, created_at, items",
        )
        .or(orOrderClauses.join(","))
        .order("created_at", { ascending: false }),
    ]);

    const orders = ordersRes.data || [];
    const orderIds = orders.map((o) => o.id);

    let payments: Tables<"payments">[] = [];
    if (orderIds.length > 0) {
      const { data: pmts } = await supabaseAdmin
        .from("payments")
        .select("*")
        .in("order_id", orderIds)
        .order("created_at", { ascending: false });
      payments = pmts || [];
    }

    return {
      customer,
      addresses: addressesRes.data || [],
      orders,
      payments,
    };
  });

// -----------------------------------------------------------------------------
// 10. COUPONS & DISCOUNTS MANAGEMENT
// -----------------------------------------------------------------------------

export const getAdminCouponsServerFn = createServerFn({ method: "POST" })
  .validator((params?: AdminAuthParams | undefined) => params || {})
  .handler(async ({ data }) => {
    await verifyAdminSession(data.authToken);

    const sql = getDb();
    if (sql) {
      try {
        const rows = await sql<Tables<"coupons">[]>`
          SELECT * FROM coupons ORDER BY created_at DESC
        `;
        if (rows) return rows;
      } catch (dbErr) {
        console.warn("[Admin Coupons] Direct DB notice:", dbErr);
      }
    }

    try {
      const { data: coupons, error } = await supabaseAdmin
        .from("coupons")
        .select("*")
        .order("created_at", { ascending: false });

      if (!error && coupons) return coupons;
    } catch (err) {
      console.warn("[Admin Coupons] Supabase error:", err);
    }

    return [];
  });

export const saveAdminCouponServerFn = createServerFn({ method: "POST" })
  .validator(
    (
      params: AdminAuthParams & {
        coupon: {
          id?: string | undefined;
          code: string;
          discount_type: "percentage" | "fixed";
          discount_value: number;
          min_order_value: number;
          max_discount?: number | null | undefined;
          usage_limit?: number | null | undefined;
          expires_at?: string | null | undefined;
          is_active: boolean;
        };
      },
    ) => params,
  )
  .handler(async ({ data }) => {
    const admin = await verifyAdminSession(data.authToken);
    const c = data.coupon;

    const payload = {
      code: c.code.toUpperCase().trim(),
      discount_type: c.discount_type,
      discount_value: c.discount_value,
      min_order_value: c.min_order_value || 0,
      max_discount: c.max_discount ?? null,
      usage_limit: c.usage_limit ?? null,
      expires_at: c.expires_at ?? null,
      is_active: c.is_active,
      updated_at: new Date().toISOString(),
    };

    let result;
    if (c.id) {
      const { data: updated, error } = await supabaseAdmin
        .from("coupons")
        .update(payload)
        .eq("id", c.id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      result = updated;
      await recordAdminAuditLog(admin, "coupon_update", "coupon", c.id, { code: c.code });
    } else {
      const { data: inserted, error } = await supabaseAdmin
        .from("coupons")
        .insert(payload)
        .select()
        .single();
      if (error) throw new Error(error.message);
      result = inserted;
      await recordAdminAuditLog(admin, "coupon_create", "coupon", inserted.id, { code: c.code });
    }

    return { success: true, coupon: result };
  });

export const deleteAdminCouponServerFn = createServerFn({ method: "POST" })
  .validator((params: AdminAuthParams & { couponId: string }) => params)
  .handler(async ({ data }) => {
    const admin = await verifyAdminSession(data.authToken);

    const { error } = await supabaseAdmin.from("coupons").delete().eq("id", data.couponId);
    if (error) throw new Error(error.message);

    await recordAdminAuditLog(admin, "coupon_delete", "coupon", data.couponId);
    return { success: true };
  });

// -----------------------------------------------------------------------------
// 11. AUDIT LOGS
// -----------------------------------------------------------------------------

export const getAdminAuditLogsServerFn = createServerFn({ method: "POST" })
  .validator(
    (params?: (AdminAuthParams & { limit?: number | undefined }) | undefined) => params || {},
  )
  .handler(async ({ data }) => {
    await verifyAdminSession(data.authToken);

    const sql = getDb();
    if (sql) {
      try {
        const rows = await sql<Tables<"admin_audit_logs">[]>`
          SELECT * FROM admin_audit_logs ORDER BY created_at DESC LIMIT ${data.limit || 100}
        `;
        if (rows) return rows;
      } catch (dbErr) {
        console.warn("[Admin Audit Logs] Direct DB notice:", dbErr);
      }
    }

    try {
      const { data: logs, error } = await supabaseAdmin
        .from("admin_audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(data.limit || 100);

      if (!error && logs) return logs;
    } catch (err) {
      console.warn("[Admin Audit Logs] Supabase error:", err);
    }

    return [];
  });

export const getSystemErrorLogsServerFn = createServerFn({ method: "POST" })
  .validator(
    (params?: (AdminAuthParams & { limit?: number | undefined }) | undefined) => params || {},
  )
  .handler(async ({ data }) => {
    await verifyAdminSession(data.authToken);

    const limit = data.limit || 50;
    const sql = getDb();
    if (sql) {
      try {
        const rows = await sql<
          Array<{
            id: string;
            actor_email: string | null;
            action: string;
            target_type: string;
            target_id: string;
            details: Json | null;
            created_at: string;
          }>
        >`
          SELECT id, actor_email, action, target_type, target_id, details, created_at
          FROM public.audit_logs
          WHERE action LIKE 'error_%'
          ORDER BY created_at DESC
          LIMIT ${limit}
        `;
        return rows.map((row) => ({
          ...row,
          details: row.details ?? undefined,
        }));
      } catch (dbErr) {
        console.warn("[System Error Logs] Direct DB notice:", dbErr);
      }
    }

    try {
      interface AuditLogsQueryClient {
        from: (table: string) => {
          select: (cols: string) => {
            ilike: (
              col: string,
              pattern: string,
            ) => {
              order: (
                col: string,
                opts: { ascending: boolean },
              ) => {
                limit: (n: number) => Promise<{
                  data: Array<{
                    id: string;
                    actor_email: string | null;
                    action: string;
                    target_type: string;
                    target_id: string;
                    details: Json | null;
                    created_at: string;
                  }> | null;
                  error: unknown;
                }>;
              };
            };
          };
        };
      }
      const client = supabaseAdmin as unknown as AuditLogsQueryClient;
      const { data: logs, error } = await client
        .from("audit_logs")
        .select("id, actor_email, action, target_type, target_id, details, created_at")
        .ilike("action", "error_%")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (!error && logs) {
        return logs.map((row) => ({
          ...row,
          details: row.details ?? undefined,
        }));
      }
    } catch (err) {
      console.warn("[System Error Logs] Query notice:", err);
    }

    return [];
  });

// -----------------------------------------------------------------------------
// 12. STORE SETTINGS
// -----------------------------------------------------------------------------

export const getAdminSettingsServerFn = createServerFn({ method: "POST" })
  .validator((params?: AdminAuthParams | undefined) => params || {})
  .handler(async ({ data }) => {
    await verifyAdminSession(data.authToken);

    const sql = getDb();
    if (sql) {
      try {
        const rows = await sql<Tables<"shipping_settings">[]>`
          SELECT * FROM shipping_settings WHERE id = 'default' LIMIT 1
        `;
        if (rows && rows.length > 0) return rows[0];
      } catch (dbErr) {
        console.warn("[Admin Settings] Direct DB notice:", dbErr);
      }
    }

    try {
      const { data: settings } = await supabaseAdmin
        .from("shipping_settings")
        .select("*")
        .eq("id", "default")
        .maybeSingle();

      if (settings) return settings;
    } catch (err) {
      console.warn("[Admin Settings] Supabase error:", err);
    }

    return null;
  });

export const updateAdminSettingsServerFn = createServerFn({ method: "POST" })
  .validator(
    (
      params: AdminAuthParams & {
        settings: {
          pickup_pincode: string;
          pickup_address_name?: string | undefined;
          pickup_address_line1?: string | undefined;
          pickup_address_city?: string | undefined;
          pickup_address_state?: string | undefined;
          pickup_phone?: string | undefined;
          default_package_weight_grams: number;
          package_type: string;
          cod_enabled: boolean;
        };
      },
    ) => params,
  )
  .handler(async ({ data }) => {
    const admin = await verifyAdminSession(data.authToken);

    const { data: updated, error } = await supabaseAdmin
      .from("shipping_settings")
      .upsert({
        id: "default",
        pickup_pincode: data.settings.pickup_pincode,
        pickup_address_name: data.settings.pickup_address_name ?? null,
        pickup_address_line1: data.settings.pickup_address_line1 ?? null,
        pickup_address_city: data.settings.pickup_address_city ?? null,
        pickup_address_state: data.settings.pickup_address_state ?? null,
        pickup_phone: data.settings.pickup_phone ?? null,
        default_package_weight_grams: data.settings.default_package_weight_grams,
        package_type: data.settings.package_type,
        cod_enabled: data.settings.cod_enabled,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    await recordAdminAuditLog(admin, "settings_update", "settings", "default", data.settings);

    return { success: true, settings: updated };
  });

// -----------------------------------------------------------------------------
// 13. CATEGORIES MANAGEMENT
// -----------------------------------------------------------------------------

export const getAdminCategoriesServerFn = createServerFn({ method: "POST" })
  .validator((params?: AdminAuthParams | undefined) => params || {})
  .handler(async ({ data }) => {
    await verifyAdminSession(data.authToken);

    const sql = getDb();
    if (sql) {
      try {
        const rows = await sql<Tables<"product_categories">[]>`
          SELECT * FROM product_categories ORDER BY name ASC
        `;
        if (rows) return rows;
      } catch (dbErr) {
        console.warn("[Admin Categories] Direct DB notice:", dbErr);
      }
    }

    try {
      const { data: cats, error } = await supabaseAdmin
        .from("product_categories")
        .select("*")
        .order("name", { ascending: true });
      if (!error && cats) return cats;
    } catch (err) {
      console.warn("[Admin Categories] Supabase error:", err);
    }

    return [];
  });

export const saveAdminCategoryServerFn = createServerFn({ method: "POST" })
  .validator(
    (params: {
      authToken?: string | undefined;
      id?: string | undefined;
      slug: string;
      name: string;
      description?: string | undefined;
    }) => params,
  )
  .handler(async ({ data }) => {
    const admin = await verifyAdminSession(data.authToken);
    const categoryData = {
      slug: data.slug.toLowerCase().trim(),
      name: data.name.trim(),
      description: data.description?.trim() || null,
    };

    if (data.id) {
      const { data: updated, error } = await supabaseAdmin
        .from("product_categories")
        .update(categoryData)
        .eq("id", data.id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      await recordAdminAuditLog(admin, "category_update", "category", data.id, categoryData);
      return { success: true, category: updated };
    } else {
      const { data: created, error } = await supabaseAdmin
        .from("product_categories")
        .insert(categoryData)
        .select()
        .single();
      if (error) throw new Error(error.message);
      await recordAdminAuditLog(admin, "category_create", "category", created.id, categoryData);
      return { success: true, category: created };
    }
  });

export const deleteAdminCategoryServerFn = createServerFn({ method: "POST" })
  .validator((params: { authToken?: string | undefined; id: string }) => params)
  .handler(async ({ data }) => {
    const admin = await verifyAdminSession(data.authToken);
    const { error } = await supabaseAdmin.from("product_categories").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await recordAdminAuditLog(admin, "category_delete", "category", data.id, {});
    return { success: true };
  });

// -----------------------------------------------------------------------------
// 14. PRODUCT VARIANTS MANAGEMENT
// -----------------------------------------------------------------------------

export const getAdminVariantsServerFn = createServerFn({ method: "POST" })
  .validator((params: { authToken?: string | undefined; productId?: string | undefined }) => params)
  .handler(async ({ data }) => {
    await verifyAdminSession(data.authToken);

    type VariantJoinRow = Tables<"product_variants"> & {
      product_name?: string | null;
      product_slug?: string | null;
    };
    const sql = getDb();
    if (sql) {
      try {
        const rows = data.productId
          ? await sql<VariantJoinRow[]>`
              SELECT v.*, p.name as product_name, p.slug as product_slug 
              FROM product_variants v
              LEFT JOIN products p ON p.id = v.product_id
              WHERE v.product_id = ${data.productId}
              ORDER BY v.created_at DESC
              LIMIT 300
            `
          : await sql<VariantJoinRow[]>`
              SELECT v.*, p.name as product_name, p.slug as product_slug 
              FROM product_variants v
              LEFT JOIN products p ON p.id = v.product_id
              ORDER BY v.created_at DESC
              LIMIT 300
            `;
        if (rows) {
          return rows.map((v) => ({
            ...v,
            products: v.product_name ? { name: v.product_name, slug: v.product_slug } : null,
          }));
        }
      } catch (dbErr) {
        console.warn("[Admin Variants] Direct DB notice:", dbErr);
      }
    }

    try {
      let query = supabaseAdmin
        .from("product_variants")
        .select("*, products(name, slug)")
        .order("created_at", { ascending: false });

      if (data.productId) {
        query = query.eq("product_id", data.productId);
      }

      const { data: variants, error } = await query.limit(300);
      if (!error && variants) return variants;
    } catch (err) {
      console.warn("[Admin Variants] Supabase error:", err);
    }

    return [];
  });

export const saveAdminVariantServerFn = createServerFn({ method: "POST" })
  .validator(
    (params: {
      authToken?: string | undefined;
      id?: string | undefined;
      productId: string;
      sku: string;
      size: string;
      color: string;
      colorHex?: string | undefined;
      stockQuantity: number;
      additionalPrice?: number | undefined;
      isAvailable?: boolean | undefined;
    }) => params,
  )
  .handler(async ({ data }) => {
    const admin = await verifyAdminSession(data.authToken);
    const variantPayload = {
      product_id: data.productId,
      sku: data.sku.trim(),
      size: data.size.trim(),
      color: data.color.trim(),
      color_hex: data.colorHex?.trim() || null,
      stock_quantity: Math.max(0, data.stockQuantity),
      additional_price: data.additionalPrice || 0,
      is_available: data.isAvailable ?? true,
      updated_at: new Date().toISOString(),
    };

    if (data.id) {
      const { data: updated, error } = await supabaseAdmin
        .from("product_variants")
        .update(variantPayload)
        .eq("id", data.id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      await recordAdminAuditLog(admin, "variant_update", "variant", data.id, variantPayload);
      return { success: true, variant: updated };
    } else {
      const { data: created, error } = await supabaseAdmin
        .from("product_variants")
        .insert(variantPayload)
        .select()
        .single();
      if (error) throw new Error(error.message);
      await recordAdminAuditLog(admin, "variant_create", "variant", created.id, variantPayload);
      return { success: true, variant: created };
    }
  });

export const deleteAdminVariantServerFn = createServerFn({ method: "POST" })
  .validator((params: { authToken?: string | undefined; id: string }) => params)
  .handler(async ({ data }) => {
    const admin = await verifyAdminSession(data.authToken);
    const { error } = await supabaseAdmin.from("product_variants").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await recordAdminAuditLog(admin, "variant_delete", "variant", data.id, {});
    return { success: true };
  });

// -----------------------------------------------------------------------------
// 15. RETURNS MANAGEMENT
// -----------------------------------------------------------------------------

export const getAdminReturnsServerFn = createServerFn({ method: "POST" })
  .validator((params?: AdminAuthParams | undefined) => params || {})
  .handler(async ({ data }) => {
    await verifyAdminSession(data.authToken);
    const { data: returns, error } = await supabaseAdmin
      .from("returns")
      .select("*, orders(order_number, total, customer_name, customer_email, customer_phone)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return returns || [];
  });

export const updateAdminReturnStatusServerFn = createServerFn({ method: "POST" })
  .validator(
    (params: {
      authToken?: string | undefined;
      returnId: string;
      status: string;
      adminNotes?: string | undefined;
    }) => params,
  )
  .handler(async ({ data }) => {
    const admin = await verifyAdminSession(data.authToken);
    const { data: updated, error } = await supabaseAdmin
      .from("returns")
      .update({
        status: data.status,
        admin_notes: data.adminNotes ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.returnId)
      .select()
      .single();
    if (error) throw new Error(error.message);

    if (updated?.order_id) {
      const nextOrderStatus =
        data.status === "refunded"
          ? "refunded"
          : data.status === "received"
            ? "returned"
            : data.status === "rejected"
              ? "delivered"
              : "return_requested";

      await supabaseAdmin
        .from("orders")
        .update({
          status: nextOrderStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", updated.order_id);

      await supabaseAdmin.from("order_status_history").insert({
        order_id: updated.order_id,
        status: nextOrderStatus,
        comment: `Return #${updated.return_number} updated to '${data.status}'.${data.adminNotes ? ` Note: ${data.adminNotes}` : ""}`,
        changed_by: admin.email || admin.userId,
      });
    }

    await recordAdminAuditLog(admin, "return_status_update", "return", data.returnId, {
      status: data.status,
    });
    return { success: true, returnRecord: updated };
  });

// -----------------------------------------------------------------------------
// 16. REVIEWS MODERATION
// -----------------------------------------------------------------------------

export const getAdminReviewsServerFn = createServerFn({ method: "POST" })
  .validator((params?: AdminAuthParams | undefined) => params || {})
  .handler(async ({ data }) => {
    await verifyAdminSession(data.authToken);

    type ReviewJoinRow = Tables<"product_reviews"> & {
      product_name?: string | null;
      product_slug?: string | null;
    };
    const sql = getDb();
    if (sql) {
      try {
        const rows = await sql<ReviewJoinRow[]>`
          SELECT r.*, p.name as product_name, p.slug as product_slug 
          FROM product_reviews r
          LEFT JOIN products p ON p.id = r.product_id
          ORDER BY r.created_at DESC
        `;
        if (rows) {
          return rows.map((r) => ({
            ...r,
            products: r.product_name ? { name: r.product_name, slug: r.product_slug } : null,
          }));
        }
      } catch (dbErr) {
        console.warn("[Admin Reviews] Direct DB notice:", dbErr);
      }
    }

    try {
      const { data: reviews, error } = await supabaseAdmin
        .from("product_reviews")
        .select("*, products(name, slug)")
        .order("created_at", { ascending: false });
      if (!error && reviews) return reviews;
    } catch (err) {
      console.warn("[Admin Reviews] Supabase error:", err);
    }

    return [];
  });

export const updateAdminReviewStatusServerFn = createServerFn({ method: "POST" })
  .validator(
    (params: {
      authToken?: string | undefined;
      reviewId: string;
      status: "approved" | "pending" | "rejected";
    }) => params,
  )
  .handler(async ({ data }) => {
    const admin = await verifyAdminSession(data.authToken);
    const { data: updated, error } = await supabaseAdmin
      .from("product_reviews")
      .update({
        status: data.status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.reviewId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    await recordAdminAuditLog(admin, "review_status_update", "review", data.reviewId, {
      status: data.status,
    });
    return { success: true, review: updated };
  });

export const deleteAdminReviewServerFn = createServerFn({ method: "POST" })
  .validator((params: { authToken?: string | undefined; reviewId: string }) => params)
  .handler(async ({ data }) => {
    const admin = await verifyAdminSession(data.authToken);
    const { error } = await supabaseAdmin.from("product_reviews").delete().eq("id", data.reviewId);
    if (error) throw new Error(error.message);
    await recordAdminAuditLog(admin, "review_delete", "review", data.reviewId, {});
    return { success: true };
  });

// -----------------------------------------------------------------------------
// 17. ADMIN USERS & ACCESS CONTROL
// -----------------------------------------------------------------------------

export const getAdminUsersServerFn = createServerFn({ method: "POST" })
  .validator((params?: AdminAuthParams | undefined) => params || {})
  .handler(async ({ data }) => {
    await verifyAdminSession(data.authToken);

    const sql = getDb();
    if (sql) {
      try {
        const rows = await sql<Tables<"admin_users">[]>`
          SELECT * FROM admin_users ORDER BY created_at ASC
        `;
        if (rows) return rows;
      } catch (dbErr) {
        console.warn("[Admin Users] Direct DB notice:", dbErr);
      }
    }

    try {
      const { data: users, error } = await supabaseAdmin
        .from("admin_users")
        .select("*")
        .order("created_at", { ascending: true });
      if (!error && users) return users;
    } catch (err) {
      console.warn("[Admin Users] Supabase error:", err);
    }

    return [];
  });

export const saveAdminUserServerFn = createServerFn({ method: "POST" })
  .validator(
    (params: {
      authToken?: string | undefined;
      id?: string | undefined;
      email: string;
      fullName: string;
      role: string;
      isActive?: boolean | undefined;
    }) => params,
  )
  .handler(async ({ data }) => {
    const admin = await verifyAdminSession(data.authToken);
    const email = data.email.toLowerCase().trim();
    if (!email) throw new Error("Email required.");

    const payload = {
      email,
      full_name: data.fullName.trim(),
      role: data.role || "admin",
      is_active: data.isActive ?? true,
      updated_at: new Date().toISOString(),
    };

    if (data.id) {
      const { data: updated, error } = await supabaseAdmin
        .from("admin_users")
        .update(payload)
        .eq("id", data.id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      await recordAdminAuditLog(admin, "admin_user_update", "admin_user", data.id, payload);
      return { success: true, adminUser: updated };
    } else {
      const { data: created, error } = await supabaseAdmin
        .from("admin_users")
        .insert({
          ...payload,
          permissions: ["*"],
          created_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      await recordAdminAuditLog(admin, "admin_user_create", "admin_user", created.id, payload);
      return { success: true, adminUser: created };
    }
  });

export const toggleAdminUserStatusServerFn = createServerFn({ method: "POST" })
  .validator((params: { authToken?: string | undefined; id: string; isActive: boolean }) => params)
  .handler(async ({ data }) => {
    const admin = await verifyAdminSession(data.authToken);
    const { data: updated, error } = await supabaseAdmin
      .from("admin_users")
      .update({ is_active: data.isActive, updated_at: new Date().toISOString() })
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    await recordAdminAuditLog(admin, "admin_user_toggle", "admin_user", data.id, {
      is_active: data.isActive,
    });
    return { success: true, adminUser: updated };
  });

// -----------------------------------------------------------------------------
// 18. ADMIN LOGIN
// -----------------------------------------------------------------------------

export const verifyCurrentAdminServerFn = createServerFn({ method: "POST" })
  .validator((params?: AdminAuthParams | undefined) => params || {})
  .handler(
    async ({
      data,
    }): Promise<{ isAdmin: boolean; userId: string | null; email: string | null }> => {
      try {
        const admin = await verifyAdminSession(data?.authToken);
        return { isAdmin: true, userId: admin.userId, email: admin.email };
      } catch {
        return { isAdmin: false, userId: null, email: null };
      }
    },
  );

export const uploadProductImageServerFn = createServerFn({ method: "POST" })
  .validator(
    (params: AdminAuthParams & { fileName: string; contentType: string; base64Data: string }) =>
      params,
  )
  .handler(async ({ data }) => {
    const admin = await verifyAdminSession(data.authToken);

    const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
    const mime = data.contentType.toLowerCase().trim();
    if (!allowedTypes.has(mime)) {
      throw new Error("Unsupported image format. Please upload JPEG, PNG, WebP, or AVIF.");
    }

    const buffer = Buffer.from(data.base64Data, "base64");
    if (buffer.length === 0 || buffer.length > 5 * 1024 * 1024) {
      throw new Error("Image file size must be between 1 byte and 5 MB.");
    }

    const safeFileName = data.fileName.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-80);
    const filePath = `products/${safeFileName}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from("product-images")
      .upload(filePath, buffer, { contentType: mime, upsert: true });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const { data: publicUrlData } = supabaseAdmin.storage
      .from("product-images")
      .getPublicUrl(filePath);

    await recordAdminAuditLog(admin, "product_image_upload", "storage", filePath, {
      mime,
      bytes: buffer.length,
    });

    return { success: true, publicUrl: publicUrlData.publicUrl };
  });

export const adminLoginServerFn = createServerFn({ method: "POST" })
  .validator((input: { email: string; password?: string; authToken?: string }) => input)
  .handler(async ({ data }) => {
    const email = data.email.toLowerCase().trim();
    if (!email) throw new Error("Email address required.");

    let verifiedIdentity: AdminAuthResult | null = null;

    // Require real cryptographic authentication via bearer token or password
    const token = extractBearerToken(data.authToken);
    if (token) {
      const candidate = await verifyAdminSession(token);
      if (candidate.email && candidate.email.toLowerCase().trim() !== email) {
        throw new Error("Unauthorized: Authenticated identity does not match administrator email.");
      }
      verifiedIdentity = candidate;
    } else if (data.password && data.password.length >= 6) {
      let authedUserId = "";
      try {
        const { data: signInRes, error: signInErr } = await supabaseAdmin.auth.signInWithPassword({
          email,
          password: data.password,
        });
        if (!signInErr && signInRes?.user) {
          authedUserId = signInRes.user.id;
        }
      } catch {
        // Fallback to pgcrypto verification against auth.users when configured
      }

      if (!authedUserId) {
        const sql = getDb();
        if (sql) {
          const [verified] = await sql<{ id: string; password_matches: boolean }[]>`
            SELECT id, (encrypted_password = crypt(${data.password}, encrypted_password)) AS password_matches
            FROM auth.users
            WHERE lower(email) = ${email}
            LIMIT 1
          `;
          if (verified?.password_matches === true) {
            authedUserId = verified.id;
          }
        }
      }

      if (!authedUserId) {
        throw new Error("Invalid administrator email or password.");
      }

      verifiedIdentity = await resolveAuthorizedAdmin(authedUserId, email);
      if (!verifiedIdentity) {
        throw new Error("Access Denied: You do not have administrator permissions for CAVENHUSRT.");
      }
    } else {
      throw new Error(
        "Unauthorized: Administrator authentication requires a verified session token or password.",
      );
    }

    const isWhitelisted = isWhitelistedAdminEmail(email);
    const { data: adminUser } = await supabaseAdmin
      .from("admin_users")
      .select("id, email, full_name, role, is_active")
      .ilike("email", email)
      .maybeSingle();

    if (adminUser && !adminUser.is_active) {
      throw new Error("Access Denied: Your administrator account has been deactivated.");
    }

    if (adminUser) {
      await supabaseAdmin
        .from("admin_users")
        .update({ last_login: new Date().toISOString() })
        .eq("id", adminUser.id);
    }

    await recordAdminAuditLog(verifiedIdentity, "admin_login", "admin_session", email, {
      method: token ? "token_exchange" : "password",
    });

    const sessionToken = await signSessionToken(
      {
        sub: adminUser?.id || verifiedIdentity.userId,
        email,
        name: adminUser?.full_name || "Administrator",
        picture: null,
        isAdmin: true,
      },
      24 * 3600,
    );

    setSessionCookie(ADMIN_SESSION_COOKIE_NAME, sessionToken, 24 * 3600);
    setSessionCookie(SESSION_COOKIE_NAME, sessionToken, 24 * 3600);

    return {
      success: true,
      sessionToken,
      user: {
        email,
        name: adminUser?.full_name || "Administrator",
        role: adminUser?.role || (isWhitelisted ? "superadmin" : "admin"),
      },
    };
  });

export const adminLogoutServerFn = createServerFn({ method: "POST" }).handler(async () => {
  clearSessionCookies();
  return { success: true };
});

// -----------------------------------------------------------------------------
// 19. EMAIL DELIVERY DIAGNOSTICS (ADMIN)
// -----------------------------------------------------------------------------

export const getAdminEmailDiagnosticsServerFn = createServerFn({ method: "POST" })
  .validator((params?: AdminAuthParams | undefined) => params || {})
  .handler(async ({ data }) => {
    await verifyAdminSession(data?.authToken);

    const sql = getDb();
    if (!sql) return [];

    interface EmailDeliveryDiagnosticRow {
      id: string;
      recipient_masked: string;
      purpose: string;
      otp_generated: boolean;
      backend_status: string;
      emailjs_status: string | null;
      emailjs_http_status: number | null;
      error_category: string | null;
      diagnostic_message: string | null;
      created_at: string;
    }

    try {
      const logs = await sql<EmailDeliveryDiagnosticRow[]>`
        SELECT 
          id,
          recipient_masked,
          purpose,
          otp_generated,
          backend_status,
          emailjs_status,
          emailjs_http_status,
          error_category,
          diagnostic_message,
          created_at
        FROM public.email_delivery_diagnostics
        ORDER BY created_at DESC
        LIMIT 50
      `;
      return logs || [];
    } catch (err) {
      console.warn("[Admin Diagnostics Fetch Notice]:", err);
      return [];
    }
  });

export const testAdminEmailDeliveryServerFn = createServerFn({ method: "POST" })
  .validator((params: { authToken?: string | undefined; testEmail: string }) => params)
  .handler(async ({ data }) => {
    await verifyAdminSession(data.authToken);

    const testEmail = (data.testEmail || "").toLowerCase().trim();
    if (!testEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testEmail)) {
      throw new Error("Please enter a valid test recipient email address.");
    }

    const { sendEmailJsOtp, generateSixDigitOtp } = await import("./otp");
    const testOtp = generateSixDigitOtp();

    const result = await sendEmailJsOtp({
      toEmail: testEmail,
      toName: "Admin Diagnostic Test",
      otp: testOtp,
      purpose: "test",
      expiryMinutes: 5,
    });

    return {
      success: result.success,
      httpStatus: result.httpStatus,
      errorCategory: result.errorCategory,
      message: result.success
        ? "Test email successfully accepted by EmailJS API (HTTP 200)."
        : `Email delivery test failed: ${result.error}`,
    };
  });
