import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { PRODUCTS, type Product, type Size } from "@/lib/products";
import { refundRazorpayPayment } from "./razorpay";
import { createShipMaxxShipment } from "./shipmaxx";
import type { Json, Database } from "@/integrations/supabase/types";

type OrderUpdate = Database["public"]["Tables"]["orders"]["Update"];

export interface AdminAuthResult {
  userId: string;
  email: string | null;
}

export interface AdminAuthParams {
  authToken?: string | undefined;
}

/**
 * Strict server-side verification of admin identity.
 */
async function verifyAdminSession(
  providedToken?: string | undefined,
): Promise<AdminAuthResult> {
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

  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) {
    throw new Error("Unauthorized: Invalid administrator session.");
  }

  const { data: roleRow, error: roleError } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();

  if (roleError || !roleRow) {
    throw new Error("Forbidden: Access restricted to CAVENHURST administrators.");
  }

  return {
    userId: user.id,
    email: user.email || null,
  };
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

export const getAdminOverviewServerFn = createServerFn({ method: "POST" })
  .validator((params?: AdminAuthParams | undefined) => params || {})
  .handler(async ({ data }) => {
    await verifyAdminSession(data.authToken);

    const { data: orders, error: ordersError } = await supabaseAdmin
      .from("orders")
      .select("id, total, status, payment_method, payment_status, shipment_status, created_at");

    if (ordersError) {
      console.error("[Admin Overview] Orders query error:", ordersError);
      throw new Error("Failed to load overview data");
    }

    const allOrders = orders || [];
    const totalOrders = allOrders.length;

    const paidOrders = allOrders.filter((o) => o.payment_status === "paid");
    const codOrders = allOrders.filter((o) => o.payment_method === "cod");

    const totalPaidRevenue = paidOrders.reduce((sum, o) => sum + (o.total || 0), 0);
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
    const productList = dbProducts && dbProducts.length > 0 ? dbProducts : PRODUCTS;

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
        if (o.payment_status === "paid" || o.payment_method === "cod") {
          entry.revenue += o.total || 0;
        }
      }
    }

    const dailySales = Array.from(dailySalesMap.values());

    return {
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
      .select("id, total, payment_status, razorpay_payment_id")
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

    await supabaseAdmin
      .from("orders")
      .update({
        status: "refunded",
        payment_status: "refunded",
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id);

    await supabaseAdmin
      .from("payments")
      .update({
        status: "refunded",
        updated_at: new Date().toISOString(),
      })
      .eq("order_id", order.id);

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

    if (!dbProducts || dbProducts.length === 0) {
      return PRODUCTS;
    }

    return dbProducts;
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

export const getAdminCustomersServerFn = createServerFn({ method: "POST" })
  .validator((params?: AdminAuthParams | undefined) => params || {})
  .handler(async ({ data }) => {
    await verifyAdminSession(data.authToken);

    const [profilesRes, ordersRes] = await Promise.all([
      supabaseAdmin.from("customer_profiles").select("*").limit(200),
      supabaseAdmin
        .from("orders")
        .select("user_id, customer_email, customer_name, customer_phone, total, status"),
    ]);

    const orders = ordersRes.data || [];
    const customerMap = new Map<
      string,
      {
        id: string;
        name: string;
        email: string;
        phone: string;
        orderCount: number;
        totalSpent: number;
        createdAt?: string | undefined;
      }
    >();

    for (const p of profilesRes.data || []) {
      customerMap.set(p.id, {
        id: p.id,
        name: p.full_name || "Customer",
        email: "",
        phone: p.phone || "",
        orderCount: 0,
        totalSpent: 0,
        createdAt: p.created_at,
      });
    }

    for (const o of orders) {
      const key = o.user_id || o.customer_email || "anonymous";
      const existing = customerMap.get(key) || {
        id: key,
        name: o.customer_name || "Guest Customer",
        email: o.customer_email || "",
        phone: o.customer_phone || "",
        orderCount: 0,
        totalSpent: 0,
      };

      existing.orderCount += 1;
      existing.totalSpent += o.total || 0;
      if (!existing.email && o.customer_email) existing.email = o.customer_email;
      if (!existing.phone && o.customer_phone) existing.phone = o.customer_phone;
      customerMap.set(key, existing);
    }

    return Array.from(customerMap.values());
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
