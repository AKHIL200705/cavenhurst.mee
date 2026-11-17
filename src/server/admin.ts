import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getDb } from "@/server/db";
import { type Product, type Size } from "@/lib/products";
import { refundRazorpayPayment } from "./razorpay";
import { createShipMaxxShipment } from "./shipmaxx";
import { verifyGoogleSessionOrToken, signSessionToken } from "./auth";
import type { Json, Database } from "@/integrations/supabase/types";

type OrderUpdate = Database["public"]["Tables"]["orders"]["Update"];

export interface AdminAuthResult {
  userId: string;
  email: string | null;
}

export interface AdminAuthParams {
  authToken?: string | undefined;
}

const WHITELISTED_ADMIN_EMAILS = [
  "akhilsaiabbireddy2007@gmail.com",
  "cavenhurst@gmail.com",
];

function isWhitelistedAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return WHITELISTED_ADMIN_EMAILS.includes(email.toLowerCase().trim());
}

/**
 * Strict server-side verification of admin identity.
 */
async function verifyAdminSession(providedToken?: string | undefined): Promise<AdminAuthResult> {
  let token = providedToken;

  if (!token) {
    const request = getRequest();
    const authHeader = request?.headers?.get("authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.replace(/^Bearer\s+/i, "").trim();
    } else {
      const cookieHeader = request?.headers?.get("cookie") || "";
      const match = cookieHeader.match(/sb-[a-z0-9]+-auth-token=([^;]+)/i);
      if (match && match[1]) {
        try {
          const parsed = JSON.parse(decodeURIComponent(match[1]));
          token = Array.isArray(parsed) ? parsed[0] : parsed?.access_token || parsed;
        } catch {
          token = decodeURIComponent(match[1]);
        }
      }
    }
  }

  if (!token || token.split(".").length !== 3) {
    throw new Error("Unauthorized: Administrator authentication session required.");
  }

  // 1. Try Google Admin session verification
  try {
    const googleSession = await verifyGoogleSessionOrToken(token);
    if (googleSession && googleSession.isAdmin) {
      return {
        userId: googleSession.sub,
        email: googleSession.email || null,
      };
    }
  } catch (err) {
    // Continue to Supabase check
  }

  // 2. Fallback to Supabase admin check
  try {
    const {
      data: { user },
      error,
    } = await supabaseAdmin.auth.getUser(token);

    if (!error && user) {
      const email = user.email?.toLowerCase();
      if (email && isWhitelistedAdminEmail(email)) {
        return {
          userId: user.id,
          email: user.email || null,
        };
      }

      // Check admin_users table
      const { data: adminUser } = await supabaseAdmin
        .from("admin_users")
        .select("id, role, is_active")
        .or(`email.eq.${email},auth_user_id.eq.${user.id}`)
        .eq("is_active", true)
        .maybeSingle();

      if (adminUser) {
        return {
          userId: user.id,
          email: user.email || null,
        };
      }

      const { data: roleRow, error: roleError } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .or(`user_id.eq.${user.id},user_id.eq.${email}`)
        .eq("role", "admin")
        .maybeSingle();

      if (!roleError && roleRow) {
        return {
          userId: user.id,
          email: user.email || null,
        };
      }
    }
  } catch {
    // Supabase check failed
  }

  throw new Error("Forbidden: Access restricted to CAVENHURST administrators.");
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
  amount: number;
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
        ] = await Promise.all([
          sql<DbOrderOverviewRow[]>`
            SELECT id, total, status, payment_method, payment_status, shipment_status, created_at
            FROM orders
          `,
          sql<DbRefundRow[]>`SELECT amount FROM refunds`,
          sql<DbProductRow[]>`SELECT slug, name, stock FROM products`,
          sql<DbCountRow[]>`SELECT count(*)::int as count FROM customers`,
          sql<DbCountRow[]>`SELECT count(*)::int as count FROM products`,
          sql<DbRecentOrderRow[]>`
            SELECT id, order_number, customer_name, customer_email, total, status, payment_status, created_at
            FROM orders
            ORDER BY created_at DESC
            LIMIT 5
          `,
          sql<DbRecentCustomerRow[]>`
            SELECT id, full_name, email, phone, created_at
            FROM customers
            ORDER BY created_at DESC
            LIMIT 5
          `,
        ]);

        const allOrders = orders || [];
        const totalOrders = allOrders.length;

        const paidOrders = allOrders.filter((o) => o.payment_status === "paid");
        const codOrders = allOrders.filter((o) => o.payment_method === "cod");

        const totalRefunded = (refunds || []).reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
        const totalPaidRevenue = Math.max(
          0,
          paidOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0) - totalRefunded,
        );
        const totalCodRevenue = codOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);

        const pendingPayments = allOrders.filter((o) => o.payment_status === "pending").length;
        const processingOrders = allOrders.filter((o) => o.status === "processing").length;
        const shippedOrders = allOrders.filter((o) =>
          ["shipped", "in_transit", "out_for_delivery"].includes(o.shipment_status || ""),
        ).length;
        const deliveredOrders = allOrders.filter((o) => o.shipment_status === "delivered").length;
        const cancelledOrders = allOrders.filter((o) => o.status === "cancelled").length;
        const rtoOrders = allOrders.filter((o) =>
          ["rto_initiated", "rto_delivered"].includes(o.shipment_status || ""),
        ).length;
        const returnOrders = allOrders.filter((o) => o.status === "returned").length;

        const productList = products || [];
        let lowStockCount = 0;
        const lowStockAlerts: Array<{ name: string; slug: string; size: string; stock: number }> = [];

        for (const p of productList) {
          const stockObj = (p.stock || {}) as Record<string, number>;
          for (const [size, count] of Object.entries(stockObj)) {
            if (typeof count === "number" && count <= 3) {
              lowStockCount++;
              if (lowStockAlerts.length < 10) {
                lowStockAlerts.push({ name: p.name, slug: p.slug, size, stock: count });
              }
            }
          }
        }

        const dailySalesMap = new Map<string, { date: string; revenue: number; orders: number }>();
        const today = new Date();
        for (let i = 6; i >= 0; i--) {
          const d = new Date(today);
          d.setDate(d.getDate() - i);
          const key = d.toISOString().slice(0, 10);
          dailySalesMap.set(key, { date: key, revenue: 0, orders: 0 });
        }

        for (const o of allOrders) {
          const dateKey = (o.created_at ? new Date(o.created_at).toISOString() : "").slice(0, 10);
          const entry = dailySalesMap.get(dateKey);
          if (entry) {
            entry.orders += 1;
            if (o.payment_status === "paid") {
              entry.revenue += Number(o.total) || 0;
            }
          }
        }

        const dailySales = Array.from(dailySalesMap.values());

        return {
          totalCustomers: custCountRows[0]?.count ?? 0,
          totalProducts: prodCountRows[0]?.count ?? 0,
          totalOrders,
          totalPaidRevenue,
          totalCodRevenue,
          totalPaidOrders: paidOrders.length,
          totalCodOrders: codOrders.length,
          pendingPayments,
          processingOrders,
          shippedOrders,
          deliveredOrders,
          cancelledOrders,
          rtoOrders,
          returnOrders,
          lowStockCount,
          lowStockAlerts,
          dailySales,
          recentOrders: (recentOrders || []).map((o) => ({
            id: o.id,
            order_number: o.order_number,
            customer_name: o.customer_name,
            customer_email: o.customer_email,
            total: Number(o.total) || 0,
            status: o.status,
            payment_status: o.payment_status,
            created_at: o.created_at ? new Date(o.created_at).toISOString() : new Date().toISOString(),
          })),
          recentRegistrations: (recentCust || []).map((c) => ({
            id: c.id,
            full_name: c.full_name || "Customer",
            email: c.email,
            phone: c.phone,
            created_at: c.created_at ? new Date(c.created_at).toISOString() : null,
          })),
        };
      } catch (dbErr) {
        console.error("[Admin Overview] Direct DB error, falling back to Supabase REST client:", dbErr);
      }
    }

    const { data: orders, error: ordersError } = await supabaseAdmin
      .from("orders")
      .select("id, total, status, payment_method, payment_status, shipment_status, created_at");

    if (ordersError) {
      console.error("[Admin Overview] Orders query error:", ordersError);
      throw new Error(`Failed to load overview data: ${ordersError.message || ordersError.details || "Orders query failed"}`);
    }

    const allOrders = orders || [];
    const totalOrders = allOrders.length;

    const paidOrders = allOrders.filter((o) => o.payment_status === "paid");
    const codOrders = allOrders.filter((o) => o.payment_method === "cod");

    // Fetch verified refunds to calculate net realized revenue
    const { data: allRefunds } = await supabaseAdmin.from("refunds").select("amount");
    const totalRefunded = (allRefunds || []).reduce((sum, r) => sum + (r.amount || 0), 0);

    const totalPaidRevenue = Math.max(
      0,
      paidOrders.reduce((sum, o) => sum + (o.total || 0), 0) - totalRefunded,
    );
    const totalCodRevenue = codOrders.reduce((sum, o) => sum + (o.total || 0), 0);

    const pendingPayments = allOrders.filter((o) => o.payment_status === "pending").length;
    const processingOrders = allOrders.filter((o) => o.status === "processing").length;
    const shippedOrders = allOrders.filter((o) =>
      ["shipped", "in_transit", "out_for_delivery"].includes(o.shipment_status || ""),
    ).length;
    const deliveredOrders = allOrders.filter((o) => o.shipment_status === "delivered").length;
    const cancelledOrders = allOrders.filter((o) => o.status === "cancelled").length;
    const rtoOrders = allOrders.filter((o) =>
      ["rto_initiated", "rto_delivered"].includes(o.shipment_status || ""),
    ).length;
    const returnOrders = allOrders.filter((o) => o.status === "returned").length;

    const { data: dbProducts } = await supabaseAdmin.from("products").select("slug, name, stock");
    const productList = dbProducts || [];

    let lowStockCount = 0;
    const lowStockAlerts: Array<{ name: string; slug: string; size: string; stock: number }> = [];

    for (const p of productList) {
      const stockObj = (p.stock || {}) as Record<string, number>;
      for (const [size, count] of Object.entries(stockObj)) {
        if (typeof count === "number" && count <= 3) {
          lowStockCount++;
          if (lowStockAlerts.length < 10) {
            lowStockAlerts.push({ name: p.name, slug: p.slug, size, stock: count });
          }
        }
      }
    }

    const dailySalesMap = new Map<string, { date: string; revenue: number; orders: number }>();
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      dailySalesMap.set(key, { date: key, revenue: 0, orders: 0 });
    }

    for (const o of allOrders) {
      const dateKey = (o.created_at || "").slice(0, 10);
      const entry = dailySalesMap.get(dateKey);
      if (entry) {
        entry.orders += 1;
        // Only count paid orders as realized revenue (do not report uncollected COD orders as received revenue)
        if (o.payment_status === "paid") {
          entry.revenue += o.total || 0;
        }
      }
    }

    const dailySales = Array.from(dailySalesMap.values());

    const [custCountRes, prodCountRes, recentOrdersRes, recentCustRes] = await Promise.all([
      supabaseAdmin.from("customers").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("products").select("id", { count: "exact", head: true }),
      supabaseAdmin
        .from("orders")
        .select("id, order_number, customer_name, customer_email, total, status, payment_status, created_at")
        .order("created_at", { ascending: false })
        .limit(5),
      supabaseAdmin
        .from("customers")
        .select("id, full_name, email, phone, created_at")
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

    return {
      totalCustomers: custCountRes.count ?? 0,
      totalProducts: prodCountRes.count ?? 0,
      totalOrders,
      totalPaidRevenue,
      totalCodRevenue,
      totalPaidOrders: paidOrders.length,
      totalCodOrders: codOrders.length,
      pendingPayments,
      processingOrders,
      shippedOrders,
      deliveredOrders,
      cancelledOrders,
      rtoOrders,
      returnOrders,
      lowStockCount,
      lowStockAlerts,
      dailySales,
      recentOrders: recentOrdersRes.data || [],
      recentRegistrations: recentCustRes.data || [],
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
      const s = data.search.trim();
      query = query.or(
        `order_number.ilike.%${s}%,customer_name.ilike.%${s}%,customer_email.ilike.%${s}%,customer_phone.ilike.%${s}%,awb_number.ilike.%${s}%`,
      );
    }

    const {
      data: orders,
      count,
      error,
    } = await query.order("created_at", { ascending: false }).range(offset, offset + limit - 1);

    if (error) {
      console.error("[Admin Orders] Fetch error:", error);
      throw new Error("Failed to load orders");
    }

    return {
      orders: orders || [],
      totalCount: count || 0,
      page,
      limit,
    };
  });

export const getAdminOrderDetailsServerFn = createServerFn({ method: "POST" })
  .validator((params: AdminAuthParams & { orderId: string }) => params)
  .handler(async ({ data }) => {
    await verifyAdminSession(data.authToken);

    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select("*")
      .eq("id", data.orderId)
      .maybeSingle();

    if (error || !order) {
      throw new Error("Order not found");
    }

    const [itemsRes, addressRes, paymentRes, shipmentRes, refundsRes] = await Promise.all([
      supabaseAdmin.from("order_items").select("*").eq("order_id", order.id),
      supabaseAdmin.from("shipping_addresses").select("*").eq("order_id", order.id).maybeSingle(),
      supabaseAdmin.from("payments").select("*").eq("order_id", order.id).maybeSingle(),
      supabaseAdmin.from("shipments").select("*").eq("order_id", order.id).maybeSingle(),
      supabaseAdmin.from("refunds").select("*").eq("order_id", order.id),
    ]);

    return {
      order,
      items: itemsRes.data || [],
      address: addressRes.data || null,
      payment: paymentRes.data || null,
      shipment: shipmentRes.data || null,
      refunds: refundsRes.data || [],
    };
  });

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

    const updatePayload: OrderUpdate = {
      status: data.status,
      updated_at: new Date().toISOString(),
    };

    if (data.shipmentStatus) {
      updatePayload.shipment_status = data.shipmentStatus;
      if (data.shipmentStatus === "delivered") {
        updatePayload.delivered_at = new Date().toISOString();
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

    await recordAdminAuditLog(admin, "order_status_update", "order", data.orderId, {
      newStatus: data.status,
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
      .select("id, status, items, order_number")
      .eq("id", data.orderId)
      .single();

    if (error || !order) throw new Error("Order not found");

    if (order.status === "cancelled") {
      throw new Error("Order is already cancelled.");
    }

    const { error: updateError } = await supabaseAdmin
      .from("orders")
      .update({
        status: "cancelled",
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id);

    if (updateError) throw new Error("Failed to cancel order");

    const items = (order.items || []) as Array<{
      slug: string;
      size: string;
      qty: number;
      color?: string;
    }>;
    for (const item of items) {
      try {
        const { data: prod } = await supabaseAdmin
          .from("products")
          .select("id, stock")
          .eq("slug", item.slug)
          .maybeSingle();

        if (prod) {
          const currentStock = (prod.stock || {}) as Record<string, number>;
          const currentQty = currentStock[item.size] ?? 0;
          const newQty = currentQty + item.qty;
          const updatedStock = { ...currentStock, [item.size]: newQty };

          await supabaseAdmin
            .from("products")
            .update({ stock: updatedStock as unknown as Json })
            .eq("id", prod.id);

          await supabaseAdmin.from("inventory_movements").insert({
            product_id: prod.id,
            product_slug: item.slug,
            size: item.size,
            color: item.color || null,
            change_qty: item.qty,
            new_stock: newQty,
            reason: "order_cancelled",
            reference_id: order.order_number,
            admin_user_id: admin.userId,
          });
        }
      } catch (err) {
        console.error("[Restock Error]", err);
      }
    }

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

    const { data: order, error: orderErr } = await supabaseAdmin
      .from("orders")
      .select("*, shipping_addresses(*)")
      .eq("id", data.orderId)
      .single();

    if (orderErr || !order) throw new Error("Order not found");

    const address = Array.isArray(order.shipping_addresses)
      ? order.shipping_addresses[0]
      : order.shipping_addresses;

    if (!address) {
      throw new Error("No shipping address associated with this order");
    }

    const { data: items } = await supabaseAdmin
      .from("order_items")
      .select("*")
      .eq("order_id", order.id);

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

    const amountPaise = Math.round(data.amountInRupees * 100);
    const maxPaise = Math.round(order.total * 100);

    if (amountPaise <= 0 || amountPaise > maxPaise) {
      throw new Error(`Refund amount must be between ₹1 and ₹${order.total}.`);
    }

    const refundRes = await refundRazorpayPayment({
      paymentId: order.razorpay_payment_id,
      amountInPaise: amountPaise,
      notes: {
        reason: data.reason || "Customer refund initiated by CAVENHURST administration",
      },
    });

    if (!refundRes.success) {
      throw new Error(refundRes.error || "Razorpay rejected the refund request.");
    }

    await supabaseAdmin.from("refunds").insert({
      order_id: order.id,
      razorpay_payment_id: order.razorpay_payment_id,
      razorpay_refund_id: refundRes.refundId || null,
      amount: data.amountInRupees,
      amount_paise: amountPaise,
      reason: data.reason || "Administrative refund",
      status: refundRes.status || "processed",
      admin_user_id: admin.userId,
      raw_response: (refundRes.raw || {}) as unknown as Json,
    });

    // Calculate total refunds for this order to distinguish partial vs full refund
    const { data: previousRefunds } = await supabaseAdmin
      .from("refunds")
      .select("amount")
      .eq("order_id", order.id);

    const totalRefunded =
      (previousRefunds || []).reduce((sum, r) => sum + (r.amount || 0), 0) + data.amountInRupees;
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

    const { data: dbProducts, error } = await supabaseAdmin
      .from("products")
      .select("*")
      .order("rank", { ascending: true });

    if (error) {
      console.error("[Admin Products] Error fetching:", error);
      throw new Error("Failed to load products");
    }

    return dbProducts || [];
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

export const getAdminInventoryServerFn = createServerFn({ method: "POST" })
  .validator((params?: AdminAuthParams | undefined) => params || {})
  .handler(async ({ data }) => {
    await verifyAdminSession(data.authToken);

    const [productsRes, movementsRes] = await Promise.all([
      supabaseAdmin.from("products").select("id, slug, name, stock, colors").order("name"),
      supabaseAdmin
        .from("inventory_movements")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    return {
      inventory: productsRes.data || [],
      recentMovements: movementsRes.data || [],
    };
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
    const changeQty = data.newStock - oldStock;
    const updatedStock = { ...stockMap, [data.size]: Math.max(0, data.newStock) };

    await supabaseAdmin
      .from("products")
      .update({ stock: updatedStock as unknown as Json, updated_at: new Date().toISOString() })
      .eq("id", prod.id);

    await supabaseAdmin.from("inventory_movements").insert({
      product_id: prod.id,
      product_slug: prod.slug,
      size: data.size,
      color: data.color || null,
      change_qty: changeQty,
      new_stock: data.newStock,
      reason: data.reason || "admin_adjustment",
      admin_user_id: admin.userId,
    });

    await recordAdminAuditLog(admin, "stock_adjustment", "inventory", prod.id, {
      size: data.size,
      oldStock,
      newStock: data.newStock,
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

    const { data: payments, error } = await supabaseAdmin
      .from("payments")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error("[Admin Payments] Error:", error);
      throw new Error("Failed to load payment records");
    }

    return payments || [];
  });

// -----------------------------------------------------------------------------
// 8. SHIPMENTS MANAGEMENT
// -----------------------------------------------------------------------------

export const getAdminShipmentsServerFn = createServerFn({ method: "POST" })
  .validator((params?: AdminAuthParams | undefined) => params || {})
  .handler(async ({ data }) => {
    await verifyAdminSession(data.authToken);

    const { data: shipments, error } = await supabaseAdmin
      .from("shipments")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error("[Admin Shipments] Error:", error);
      throw new Error("Failed to load shipment records");
    }

    return shipments || [];
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
            SELECT id, email, phone, full_name, auth_provider, account_status, created_at, updated_at
            FROM profiles
          `,
          sql<DbOrderSummaryRow[]>`
            SELECT id, user_id, customer_id, customer_email, customer_name, customer_phone, total, status, created_at
            FROM orders
          `,
        ]);
        const profileMap = new Map((profiles || []).map((p) => [p.id, p]));
        const profileEmailMap = new Map((profiles || []).map((p) => [p.email?.toLowerCase(), p]));

        return (customers || []).map((c) => {
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

          return {
            id: c.id,
            authUid: matchedProfile?.id || c.auth_provider_uid,
            name: c.full_name || matchedProfile?.full_name || "Customer",
            email: c.email || matchedProfile?.email || "",
            phone: c.phone || matchedProfile?.phone || "",
            loginProvider: matchedProfile?.auth_provider || "email",
            orderCount: customerOrders.length,
            totalSpent,
            status: c.account_status || matchedProfile?.account_status || "active",
            createdAt: c.registration_date || c.created_at || matchedProfile?.created_at,
            lastLogin: matchedProfile?.updated_at || c.updated_at || null,
          };
        });
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
        .select("id, email, phone, full_name, auth_provider, account_status, created_at, updated_at"),
      supabaseAdmin
        .from("orders")
        .select("id, user_id, customer_id, customer_email, customer_name, customer_phone, total, status, created_at"),
    ]);

    const orders = ordersRes.data || [];
    const profiles = profilesRes.data || [];
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

      return {
        id: c.id,
        authUid: matchedProfile?.id || c.auth_provider_uid,
        name: c.full_name || matchedProfile?.full_name || "Customer",
        email: c.email || matchedProfile?.email || "",
        phone: c.phone || matchedProfile?.phone || "",
        loginProvider: matchedProfile?.auth_provider || "email",
        orderCount: customerOrders.length,
        totalSpent,
        status: c.account_status || matchedProfile?.account_status || "active",
        createdAt: c.registration_date || c.created_at || matchedProfile?.created_at,
        lastLogin: matchedProfile?.updated_at || c.updated_at || null,
      };
    });

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

    const orAddrClauses: string[] = [`customer_id.eq.${customer.id}`];
    if (customer.auth_provider_uid) orAddrClauses.push(`customer_auth_uid.eq.${customer.auth_provider_uid}`);

    const orOrderClauses: string[] = [`customer_id.eq.${customer.id}`];
    if (customer.auth_provider_uid) orOrderClauses.push(`user_id.eq.${customer.auth_provider_uid}`);
    if (customer.email) orOrderClauses.push(`customer_email.eq.${customer.email.toLowerCase()}`);

    const [addressesRes, ordersRes] = await Promise.all([
      supabaseAdmin
        .from("customer_addresses")
        .select("*")
        .or(orAddrClauses.join(","))
        .order("is_default", { ascending: false }),
      supabaseAdmin
        .from("orders")
        .select("id, order_number, total, status, payment_status, shipment_status, awb_number, created_at, items")
        .or(orOrderClauses.join(","))
        .order("created_at", { ascending: false }),
    ]);

    const orders = ordersRes.data || [];
    const orderIds = orders.map((o) => o.id);

    let payments: any[] = [];
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

    const { data: coupons, error } = await supabaseAdmin
      .from("coupons")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[Admin Coupons] Error:", error);
      throw new Error("Failed to load coupons");
    }

    return coupons || [];
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

    const { data: logs, error } = await supabaseAdmin
      .from("admin_audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(data.limit || 100);

    if (error) {
      console.error("[Admin Audit Logs] Error:", error);
      throw new Error("Failed to load audit logs");
    }

    return logs || [];
  });

// -----------------------------------------------------------------------------
// 12. STORE SETTINGS
// -----------------------------------------------------------------------------

export const getAdminSettingsServerFn = createServerFn({ method: "POST" })
  .validator((params?: AdminAuthParams | undefined) => params || {})
  .handler(async ({ data }) => {
    await verifyAdminSession(data.authToken);

    const { data: settings } = await supabaseAdmin
      .from("shipping_settings")
      .select("*")
      .eq("id", "default")
      .maybeSingle();

    return settings || null;
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
    const { data: cats, error } = await supabaseAdmin
      .from("product_categories")
      .select("*")
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return cats || [];
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
    let query = supabaseAdmin
      .from("product_variants")
      .select("*, products(name, slug)")
      .order("created_at", { ascending: false });

    if (data.productId) {
      query = query.eq("product_id", data.productId);
    }

    const { data: variants, error } = await query.limit(300);
    if (error) throw new Error(error.message);
    return variants || [];
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
    await recordAdminAuditLog(admin, "return_status_update", "return", data.returnId, { status: data.status });
    return { success: true, returnRecord: updated };
  });

// -----------------------------------------------------------------------------
// 16. REVIEWS MODERATION
// -----------------------------------------------------------------------------

export const getAdminReviewsServerFn = createServerFn({ method: "POST" })
  .validator((params?: AdminAuthParams | undefined) => params || {})
  .handler(async ({ data }) => {
    await verifyAdminSession(data.authToken);
    const { data: reviews, error } = await supabaseAdmin
      .from("product_reviews")
      .select("*, products(name, slug)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return reviews || [];
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
    await recordAdminAuditLog(admin, "review_status_update", "review", data.reviewId, { status: data.status });
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
    const { data: users, error } = await supabaseAdmin
      .from("admin_users")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return users || [];
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
    await recordAdminAuditLog(admin, "admin_user_toggle", "admin_user", data.id, { is_active: data.isActive });
    return { success: true, adminUser: updated };
  });

// -----------------------------------------------------------------------------
// 18. ADMIN LOGIN
// -----------------------------------------------------------------------------

export const adminLoginServerFn = createServerFn({ method: "POST" })
  .validator((input: { email: string; password?: string; authToken?: string }) => input)
  .handler(async ({ data }) => {
    const email = data.email.toLowerCase().trim();
    if (!email) throw new Error("Email address required.");

    const isWhitelisted = isWhitelistedAdminEmail(email);
    const { data: adminUser } = await supabaseAdmin
      .from("admin_users")
      .select("id, email, full_name, role, is_active")
      .eq("email", email)
      .maybeSingle();

    if (!isWhitelisted && (!adminUser || !adminUser.is_active)) {
      throw new Error("Access Denied: You do not have administrator permissions for CAVENHURST.");
    }

    if (data.authToken) {
      await verifyAdminSession(data.authToken);
    }

    if (adminUser) {
      await supabaseAdmin
        .from("admin_users")
        .update({ last_login: new Date().toISOString() })
        .eq("id", adminUser.id);
    }

    const sessionToken = await signSessionToken({
      sub: adminUser?.id || "admin_root",
      email,
      name: adminUser?.full_name || "Administrator",
      picture: null,
      isAdmin: true,
    });

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

