import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getProduct, type Size } from "@/lib/products";
import { computeTotals } from "@/lib/pricing";
import {
  getAuthenticatedCustomerId,
  verifyGoogleSessionOrToken,
  isWhitelistedAdminEmail,
} from "./auth-helpers";
import {
  createRazorpayOrder,
  confirmVerifiedPayment,
  getRazorpayKeyId,
  isRazorpayConfigured,
} from "./razorpay";
import {
  createShipMaxxShipment,
  checkShipMaxxServiceability,
  trackShipMaxxShipment,
} from "./shipmaxx";
import {
  getVariantAvailableStock,
  reserveOrderInventory,
  commitOrderInventory,
  releaseOrderInventoryReservations,
} from "./inventory";
import type { Json } from "@/integrations/supabase/types";

export interface CheckoutCustomerInput {
  name: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  pin: string;
}

export interface CheckoutCartItemInput {
  slug: string;
  size: Size;
  color: string;
  qty: number;
}

export interface PlaceOrderInput {
  authToken?: string | undefined;
  customer: CheckoutCustomerInput;
  cart: CheckoutCartItemInput[];
  coupon: string | null;
  paymentMethod: "online" | "cod";
}

/**
 * Derives authenticated customer identity strictly from the verified server session.
 * Never trust or accept a client-supplied userId!
 */
async function getServerSessionUser(): Promise<{
  id: string;
  email?: string | undefined;
} | null> {
  try {
    const request = getRequest();
    if (!request?.headers) return null;
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) return null;

    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token || token.split(".").length !== 3) return null;

    // Check Google session first
    try {
      const googleSession = await verifyGoogleSessionOrToken(token);
      if (googleSession) {
        return {
          id: googleSession.sub,
          email: googleSession.email,
        };
      }
    } catch {
      // Continue to Supabase check
    }

    const {
      data: { user },
      error,
    } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) return null;

    return {
      id: user.id,
      email: user.email,
    };
  } catch {
    return null;
  }
}

/**
 * Checks if a user has administrator privileges in user_roles, admin_users, or whitelist.
 */
async function checkIsUserAdmin(userId: string, email?: string | null): Promise<boolean> {
  if (email && isWhitelistedAdminEmail(email)) return true;
  try {
    const { data: roleData } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .or(`user_id.eq.${userId}${email ? `,user_id.eq.${email}` : ""}`)
      .eq("role", "admin")
      .maybeSingle();
    if (roleData) return true;

    if (email) {
      const { data: adminUser } = await supabaseAdmin
        .from("admin_users")
        .select("id")
        .or(`email.eq.${email},auth_user_id.eq.${userId}`)
        .eq("is_active", true)
        .maybeSingle();
      if (adminUser) return true;

      const { data: whitelist } = await supabaseAdmin
        .from("admin_whitelist")
        .select("email")
        .eq("email", email)
        .maybeSingle();
      if (whitelist) return true;
    }

    return false;
  } catch {
    return false;
  }
}

function generateOrderNumber(): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `CVH-${dateStr}-${rand}`;
}

/**
 * Recalculates order subtotal, discount, shipping and total strictly from Supabase database.
 * Queries current active prices, inventory stock and validates coupons against real database records.
 * Never trusts client prices or fake static product data!
 */
async function calculateOrderTotals(cart: CheckoutCartItemInput[], couponCode: string | null) {
  let subtotal = 0;
  const itemsWithDetails: Array<{
    productId?: string | undefined;
    variantId?: string | undefined;
    slug: string;
    name: string;
    size: string;
    color: string;
    price: number;
    qty: number;
    image: string | null;
  }> = [];

  for (const item of cart) {
    // 1. Fetch current price and inventory directly from Supabase
    const { data: dbProd, error } = await supabaseAdmin
      .from("products")
      .select("id, slug, name, price, stock, is_published, images")
      .eq("slug", item.slug)
      .eq("is_published", true)
      .maybeSingle();

    if (error || !dbProd) {
      throw new Error(`Product "${item.slug}" is no longer available in the store catalog.`);
    }

    // Verify live stock availability server-side using public.inventory
    const stockInfo = await getVariantAvailableStock(dbProd.id, item.size, item.color);
    const available = stockInfo.variantId
      ? stockInfo.available
      : (((dbProd.stock || {}) as Record<string, number>)[item.size] ?? 0);

    if (available < item.qty) {
      throw new Error(
        `Insufficient inventory for "${dbProd.name}" (${item.size}${item.color ? `, ${item.color}` : ""}). Available: ${available}, requested: ${item.qty}`,
      );
    }

    // Fetch matching variant if exists
    let variantId = stockInfo.variantId;
    if (!variantId) {
      const { data: variant } = await supabaseAdmin
        .from("product_variants")
        .select("id")
        .eq("product_id", dbProd.id)
        .eq("size", item.size)
        .maybeSingle();
      if (variant) variantId = variant.id;
    }

    const price = Number(dbProd.price) || 0;
    subtotal += price * item.qty;

    itemsWithDetails.push({
      productId: dbProd.id,
      variantId: variantId || undefined,
      slug: dbProd.slug,
      name: dbProd.name,
      size: item.size,
      color: item.color,
      price,
      qty: item.qty,
      image: (dbProd.images && dbProd.images[0]) || null,
    });
  }

  // 2. Validate coupon strictly from Supabase coupons table
  let discount = 0;
  if (couponCode && couponCode.trim()) {
    const cleanCode = couponCode.trim().toUpperCase();
    const { data: couponRow } = await supabaseAdmin
      .from("coupons")
      .select("*")
      .ilike("code", cleanCode)
      .eq("is_active", true)
      .maybeSingle();

    if (couponRow) {
      const now = new Date();
      const notExpired = !couponRow.expires_at || new Date(couponRow.expires_at) > now;
      const underUsageLimit =
        !couponRow.usage_limit || (couponRow.times_used || 0) < couponRow.usage_limit;
      const meetsMinOrder = subtotal >= (couponRow.min_order_value || 0);

      if (notExpired && underUsageLimit && meetsMinOrder) {
        if (couponRow.discount_type === "percentage") {
          const calculatedDiscount = Math.round((subtotal * couponRow.discount_value) / 100);
          discount = couponRow.max_discount
            ? Math.min(calculatedDiscount, couponRow.max_discount)
            : calculatedDiscount;
        } else {
          discount = Math.min(couponRow.discount_value, subtotal);
        }
      }
    }
  }

  // 3. Free shipping above threshold ₹4,999
  const shippingFee = subtotal >= 4999 || subtotal === 0 ? 0 : 199;
  const total = Math.max(0, subtotal - discount + shippingFee);

  return {
    subtotal,
    discount,
    shippingFee,
    total,
    itemsWithDetails,
  };
}

/**
 * Server Function: Serviceability Check
 * Checks prepaid and COD serviceability separately using official rules.
 */
export const checkPincodeServiceabilityFn = createServerFn({ method: "POST" })
  .validator((data: { pincode: string; paymentMode?: "prepaid" | "cod" }) => data)
  .handler(async ({ data }) => {
    return await checkShipMaxxServiceability({
      deliveryPincode: data.pincode,
      paymentMode: data.paymentMode || "prepaid",
    });
  });

/**
 * Server Function: Place Order & Initialize Payment / Shipment
 * Derives authenticated customer from server session, secures guest checkout,
 * checks serviceability, and prevents duplicate orders.
 */
export const placeOrderServerFn = createServerFn({ method: "POST" })
  .validator((input: PlaceOrderInput) => input)
  .handler(async ({ data }) => {
    const { customer, cart, coupon, paymentMethod } = data;

    // 1. Strict input validation
    if (!customer.name.trim() || customer.name.trim().length < 2) {
      throw new Error("Please enter your full name.");
    }
    if (!/^[6-9]\d{9}$/.test(customer.phone.replace(/\D/g, ""))) {
      throw new Error("Please enter a valid 10-digit Indian mobile number.");
    }
    if (!/^\S+@\S+\.\S+$/.test(customer.email.trim())) {
      throw new Error("Please enter a valid email address.");
    }
    if (!customer.address.trim() || !customer.city.trim() || !customer.state.trim()) {
      throw new Error("Please complete your delivery address.");
    }
    if (!/^[1-9]\d{5}$/.test(customer.pin.trim())) {
      throw new Error("Please enter a valid 6-digit delivery PIN code.");
    }
    if (!cart || cart.length === 0) {
      throw new Error("Your shopping bag is empty.");
    }

    // 2. Derive verified user identity from server session or passed token (never trust client userId!)
    const tokenAuth = await getAuthenticatedCustomerId(data.authToken);
    const headerAuth = tokenAuth ? null : await getServerSessionUser();
    const verifiedUserId = tokenAuth?.id ?? headerAuth?.id ?? null;
    let customerUuid: string | null = tokenAuth?.customerUuid ?? null;

    if (!customerUuid && verifiedUserId) {
      const { data: c } = await supabaseAdmin
        .from("customers")
        .select("id")
        .eq("auth_provider_uid", verifiedUserId)
        .maybeSingle();
      if (c) customerUuid = c.id;
    }
    if (!customerUuid && customer.email.trim()) {
      const { data: c } = await supabaseAdmin
        .from("customers")
        .select("id")
        .eq("email", customer.email.trim().toLowerCase())
        .maybeSingle();
      if (c) customerUuid = c.id;
    }

    // 3. Server-side price calculation directly from Supabase database
    const { subtotal, discount, shippingFee, total, itemsWithDetails } = await calculateOrderTotals(
      cart,
      coupon,
    );
    if (itemsWithDetails.length === 0) {
      throw new Error("No valid products found in your order.");
    }

    // 4. Verify live courier serviceability when ShipMaxx360 is connected;
    // when credentials are pending, 6-digit Indian PIN format check above gates checkout cleanly.
    const serviceCheck = await checkShipMaxxServiceability({
      deliveryPincode: customer.pin.trim(),
      paymentMode: paymentMethod === "cod" ? "cod" : "prepaid",
    });

    if (serviceCheck.providerStatus === "connected" && !serviceCheck.serviceable) {
      throw new Error(
        serviceCheck.message ||
          "Delivery to this PIN code is currently unavailable. Please verify your address.",
      );
    }

    if (
      serviceCheck.providerStatus === "connected" &&
      paymentMethod === "cod" &&
      !serviceCheck.codAvailable
    ) {
      throw new Error(
        "Cash on Delivery (COD) is not available for this delivery PIN code. Please select Pay Online.",
      );
    }

    const orderNumber = generateOrderNumber();

    // 5. Insert order into Supabase
    const { data: order, error: orderErr } = await supabaseAdmin
      .from("orders")
      .insert({
        user_id: verifiedUserId,
        customer_id: customerUuid,
        order_number: orderNumber,
        customer_name: customer.name.trim(),
        customer_email: customer.email.trim(),
        customer_phone: customer.phone.replace(/\D/g, ""),
        items: itemsWithDetails as unknown as Json,
        subtotal,
        discount,
        shipping_fee: shippingFee,
        taxes: 0,
        total,
        status: paymentMethod === "cod" ? "confirmed" : "pending_payment",
        payment_method: paymentMethod,
        payment_status: "pending",
        shipment_status: "unfulfilled",
        shipping: {
          address: customer.address.trim(),
          city: customer.city.trim(),
          state: customer.state.trim(),
          pincode: customer.pin.trim(),
          country: "India",
        } as unknown as Json,
      })
      .select("id")
      .single();

    if (orderErr || !order) {
      console.error("[Orders] Failed to create order in database:", orderErr);
      throw new Error("Failed to create order record. Please try again.");
    }

    const orderId = order.id;

    // 6. Insert line items into order_items with product_id & variant_id
    const orderItemsToInsert = itemsWithDetails.map((item) => ({
      order_id: orderId,
      product_id: item.productId || null,
      variant_id: item.variantId || null,
      product_slug: item.slug,
      name: item.name,
      size: item.size,
      color: item.color,
      price: item.price,
      qty: item.qty,
      image: item.image,
    }));
    await supabaseAdmin.from("order_items").insert(orderItemsToInsert);

    // 7. Insert immutable order address snapshot into order_addresses
    await supabaseAdmin.from("order_addresses").insert({
      order_id: orderId,
      address_type: "shipping",
      full_name: customer.name.trim(),
      phone: customer.phone.replace(/\D/g, ""),
      email: customer.email.trim(),
      address_line1: customer.address.trim(),
      city: customer.city.trim(),
      state: customer.state.trim(),
      postal_code: customer.pin.trim(),
      country: "India",
    });

    // Also write to shipping_addresses for backwards compatibility
    await supabaseAdmin.from("shipping_addresses").insert({
      order_id: orderId,
      user_id: verifiedUserId,
      full_name: customer.name.trim(),
      phone: customer.phone.replace(/\D/g, ""),
      email: customer.email.trim(),
      address_line1: customer.address.trim(),
      city: customer.city.trim(),
      state: customer.state.trim(),
      pincode: customer.pin.trim(),
      country: "India",
    });

    // Save to customer account address book if authenticated
    if (customerUuid) {
      try {
        await supabaseAdmin.from("customer_addresses").insert({
          customer_id: customerUuid,
          customer_auth_uid: verifiedUserId,
          address_type: "shipping",
          is_default: false,
          full_name: customer.name.trim(),
          phone: customer.phone.replace(/\D/g, ""),
          address_line1: customer.address.trim(),
          city: customer.city.trim(),
          state: customer.state.trim(),
          postal_code: customer.pin.trim(),
          country: "India",
        });
      } catch (addrErr) {
        console.warn("[Customer Address Book] Note: could not save address duplicate:", addrErr);
      }
    }

    // 8. Order status history audit trail
    await supabaseAdmin.from("order_status_history").insert({
      order_id: orderId,
      status: paymentMethod === "cod" ? "confirmed" : "pending_payment",
      comment:
        paymentMethod === "cod"
          ? "Order placed and confirmed with Cash on Delivery (COD)"
          : "Order created; awaiting Razorpay payment confirmation",
      changed_by: verifiedUserId || "customer",
    });

    // 9. Atomic inventory reservation / deduction
    const inventoryItems = itemsWithDetails.map((item) => ({
      productId: item.productId || "",
      variantId: item.variantId,
      slug: item.slug,
      name: item.name,
      size: item.size,
      color: item.color,
      qty: item.qty,
    }));

    if (paymentMethod === "online") {
      const reserveRes = await reserveOrderInventory(orderId, inventoryItems);
      if (!reserveRes.success) {
        await supabaseAdmin.from("orders").delete().eq("id", orderId);
        throw new Error(reserveRes.error || "Failed to reserve inventory for this order.");
      }
    } else {
      // For Cash on Delivery, inventory is committed immediately upon order confirmation
      const commitRes = await commitOrderInventory(
        orderId,
        orderNumber,
        inventoryItems,
        verifiedUserId,
      );
      if (!commitRes.success) {
        console.warn("[Inventory Commit Warning]", commitRes.error);
      }
    }

    // 10. Increment coupon times_used and log redemption if applied
    if (coupon && discount > 0) {
      const { data: cp } = await supabaseAdmin
        .from("coupons")
        .select("id, times_used")
        .ilike("code", coupon.trim().toUpperCase())
        .maybeSingle();

      if (cp) {
        await supabaseAdmin
          .from("coupons")
          .update({
            times_used: (cp.times_used || 0) + 1,
            updated_at: new Date().toISOString(),
          })
          .eq("id", cp.id);

        try {
          await supabaseAdmin.from("coupon_redemptions").insert({
            coupon_id: cp.id,
            customer_id: customerUuid,
            order_id: orderId,
            discount_amount: discount,
          });
        } catch (crErr) {
          console.warn("[Coupon Redemptions] Log note:", crErr);
        }
      }
    }

    // 8. Handle Payment Method
    if (paymentMethod === "online") {
      const razorpayKeyId = getRazorpayKeyId();

      // Check if Razorpay is configured
      if (!isRazorpayConfigured() || !razorpayKeyId) {
        throw new Error(
          "Online payment is temporarily unavailable. Please select Cash on Delivery or contact store support.",
        );
      }

      // Create Razorpay Order on Razorpay servers
      const rzpRes = await createRazorpayOrder({
        amountInPaise: total * 100,
        receipt: orderNumber,
        notes: {
          order_id: orderId,
          order_number: orderNumber,
          customer_email: customer.email.trim(),
        },
      });

      if (!rzpRes.success || !rzpRes.order) {
        // Rollback pending order and release reserved stock if Razorpay initialization fails
        await releaseOrderInventoryReservations(orderId);
        await supabaseAdmin.from("orders").delete().eq("id", orderId);
        throw new Error(rzpRes.error || "Failed to initialize payment gateway checkout.");
      }

      // Record Razorpay order ID
      await supabaseAdmin
        .from("orders")
        .update({
          razorpay_order_id: rzpRes.order.id,
          payment_status: "pending",
        })
        .eq("id", orderId);

      await supabaseAdmin.from("payments").insert({
        order_id: orderId,
        user_id: verifiedUserId,
        gateway: "razorpay",
        payment_method: "online",
        razorpay_order_id: rzpRes.order.id,
        amount: total,
        amount_paise: total * 100,
        currency: "INR",
        status: "pending",
      });

      return {
        success: true,
        orderId,
        orderNumber,
        paymentMethod: "online" as const,
        razorpayOrderId: rzpRes.order.id,
        amountInPaise: rzpRes.order.amount,
        currency: rzpRes.order.currency,
        keyId: razorpayKeyId,
        total,
      };
    } else {
      // Cash on Delivery (COD)
      // Call ShipMaxx360 to register COD consignment
      const shipmentRes = await createShipMaxxShipment({
        orderId,
        orderNumber,
        userId: verifiedUserId,
        customerName: customer.name.trim(),
        customerPhone: customer.phone.replace(/\D/g, ""),
        customerEmail: customer.email.trim(),
        address: {
          line1: customer.address.trim(),
          city: customer.city.trim(),
          state: customer.state.trim(),
          pincode: customer.pin.trim(),
        },
        items: itemsWithDetails.map((i) => ({
          name: i.name,
          size: i.size,
          color: i.color,
          qty: i.qty,
          price: i.price,
        })),
        paymentMode: "cod",
        codAmount: total,
      });

      return {
        success: true,
        orderId,
        orderNumber,
        paymentMethod: "cod" as const,
        cod: true,
        total,
        awbNumber: shipmentRes.awbNumber,
        courierPartner: shipmentRes.courierPartner,
        shipmentSuccess: shipmentRes.success,
        shipmentMessage: shipmentRes.error,
      };
    }
  });

/**
 * Server Function: Verify Razorpay Payment and Dispatch ShipMaxx360 Shipment
 * Cryptographically verifies payment, ensures captured status, and prevents duplicate processing.
 */
export const verifyPaymentServerFn = createServerFn({ method: "POST" })
  .validator(
    (input: {
      authToken?: string | undefined;
      orderId: string;
      razorpayOrderId: string;
      razorpayPaymentId: string;
      razorpaySignature: string;
    }) => input,
  )
  .handler(async ({ data }) => {
    // 1. Derive verified user from session
    const authUser =
      (await getAuthenticatedCustomerId(data.authToken)) || (await getServerSessionUser());
    const verifiedUserId = authUser ? authUser.id : null;

    // 2. Verify Razorpay cryptographic signature, amount, currency, and mark order paid
    const verification = await confirmVerifiedPayment({
      orderId: data.orderId,
      razorpayOrderId: data.razorpayOrderId,
      razorpayPaymentId: data.razorpayPaymentId,
      razorpaySignature: data.razorpaySignature,
      userId: verifiedUserId,
    });

    if (!verification.success) {
      throw new Error(verification.error || "Payment verification failed.");
    }

    // 3. Fetch order details to create prepaid shipment via ShipMaxx360
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select(
        "id, order_number, customer_name, customer_email, customer_phone, items, total, shipping, user_id",
      )
      .eq("id", data.orderId)
      .single();

    if (order) {
      const address =
        (order.shipping as {
          address?: string;
          city?: string;
          state?: string;
          pincode?: string;
        }) || {};

      const items =
        (order.items as Array<{
          name: string;
          size: string;
          color: string;
          qty: number;
          price: number;
        }>) || [];

      // Automatically book prepaid consignment with ShipMaxx360
      await createShipMaxxShipment({
        orderId: order.id,
        orderNumber: order.order_number || `CVH-${order.id.slice(0, 8)}`,
        userId: order.user_id || verifiedUserId,
        customerName: order.customer_name || "Valued Customer",
        customerPhone: order.customer_phone || "",
        customerEmail: order.customer_email || "",
        address: {
          line1: address.address || "",
          city: address.city || "",
          state: address.state || "",
          pincode: address.pincode || "521212",
        },
        items,
        paymentMode: "prepaid",
      });

      // Record status transition in order_status_history
      await supabaseAdmin.from("order_status_history").insert({
        order_id: order.id,
        status: "confirmed",
        comment: "Payment captured and order confirmed via Razorpay",
        changed_by: "razorpay",
      });

      // Insert customer notification if authenticated
      if (order.user_id) {
        try {
          await supabaseAdmin.from("notifications").insert({
            customer_auth_uid: order.user_id,
            title: "Payment Confirmed",
            message: `Your payment for order #${order.order_number || order.id.slice(0, 8)} has been verified. We are preparing your shipment.`,
            type: "order",
            link: "/account",
          });
        } catch (notifErr) {
          console.warn("[Notification] Could not insert:", notifErr);
        }
      }
    }

    return {
      success: true,
      orderNumber: verification.orderNumber || data.orderId,
    };
  });

/**
 * Server Function: Track Order by Order Number or AWB
 */
export const trackOrderServerFn = createServerFn({ method: "POST" })
  .validator((data: { query: string }) => data)
  .handler(async ({ data }) => {
    return await trackShipMaxxShipment(data.query);
  });

/**
 * Server Function: Admin Orders List with Filters
 * Protected: Requires authenticated administrator session!
 */
export const getAdminOrdersServerFn = createServerFn({ method: "GET" })
  .validator((params?: { filter?: string; search?: string }) => params || {})
  .handler(async ({ data }) => {
    // Authenticate and authorize admin
    const authUser = await getServerSessionUser();
    if (!authUser) {
      throw new Error("Unauthorized: Admin authentication required.");
    }

    const isAdmin = await checkIsUserAdmin(authUser.id, authUser.email);
    if (!isAdmin) {
      throw new Error("Forbidden: Access restricted to CAVENHURST administrators.");
    }

    let query = supabaseAdmin
      .from("orders")
      .select(
        "id, order_number, customer_name, customer_email, customer_phone, total, status, payment_method, payment_status, shipment_status, razorpay_order_id, razorpay_payment_id, awb_number, courier_partner, created_at",
      )
      .order("created_at", { ascending: false });

    if (data.filter && data.filter !== "all") {
      if (data.filter === "cod") {
        query = query.eq("payment_method", "cod");
      } else if (data.filter === "paid") {
        query = query.eq("payment_status", "paid");
      } else if (data.filter === "pending_payment") {
        query = query.eq("payment_status", "pending");
      } else {
        query = query.or(`status.eq.${data.filter},shipment_status.eq.${data.filter}`);
      }
    }

    if (data.search && data.search.trim()) {
      const s = data.search.trim();
      query = query.or(
        `order_number.ilike.%${s}%,customer_name.ilike.%${s}%,customer_email.ilike.%${s}%,awb_number.ilike.%${s}%`,
      );
    }

    interface AdminOrderListRow {
      id: string;
      order_number: string | null;
      customer_name: string | null;
      customer_email: string | null;
      customer_phone: string | null;
      total: number;
      status: string;
      payment_method?: string | null;
      payment_status: string | null;
      shipment_status: string | null;
      razorpay_order_id: string | null;
      razorpay_payment_id: string | null;
      awb_number: string | null;
      courier_partner: string | null;
      created_at: string;
    }

    let ordersList: AdminOrderListRow[] = [];
    const { data: orders, error } = await query.limit(50);
    if (error) {
      console.warn(
        "[Admin Orders] Error fetching orders, attempting fallback query:",
        error.message,
      );
      const fallbackQuery = supabaseAdmin
        .from("orders")
        .select(
          "id, order_number, customer_name, customer_email, customer_phone, total, status, payment_status, shipment_status, razorpay_order_id, razorpay_payment_id, awb_number, courier_partner, created_at",
        )
        .order("created_at", { ascending: false });
      const { data: fallbackOrders, error: fallbackError } = await fallbackQuery.limit(50);
      if (fallbackError) {
        console.error("[Admin Orders] Fallback query failed:", fallbackError);
        throw new Error("Failed to load orders");
      }
      ordersList = (fallbackOrders || []).map((o) => {
        const rec = o as unknown as AdminOrderListRow;
        return {
          ...rec,
          payment_method: rec.payment_method || "online",
        };
      });
    } else {
      ordersList = (orders || []) as unknown as AdminOrderListRow[];
    }

    return ordersList;
  });
