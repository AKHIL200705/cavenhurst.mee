import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getDb } from "@/server/db";
import { type Size } from "@/lib/products";
import { calculateOrderPricingPaise, type CouponPricingRule } from "@/lib/pricing";
import { logStructuredServerError } from "./logger";
import {
  getAuthenticatedCustomerId,
  verifyGoogleSessionOrToken,
  resolveIsActiveAdmin,
  readSessionCookieToken,
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
  landmark?: string | undefined;
  city: string;
  state: string;
  pin: string;
  selectedAddressId?: string | undefined;
  saveAddress?: boolean | undefined;
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
  checkoutMode?: "DIRECT_BUY" | "CART_CHECKOUT" | undefined;
  idempotencyKey?: string | undefined;
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
    const authHeader = request?.headers?.get("authorization");
    let token =
      authHeader && authHeader.startsWith("Bearer ")
        ? authHeader.replace(/^Bearer\s+/i, "").trim()
        : undefined;
    if (!token) {
      token = readSessionCookieToken(false);
    }
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
 * Checks if a user currently holds active administrator privileges (fail-closed on deactivated admins).
 */
async function checkIsUserAdmin(userId: string, email?: string | null): Promise<boolean> {
  return await resolveIsActiveAdmin(userId, email);
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

    // Fetch matching variant including color
    let variantId = stockInfo.variantId;
    if (!variantId) {
      const varQuery = supabaseAdmin
        .from("product_variants")
        .select("id")
        .eq("product_id", dbProd.id)
        .eq("size", item.size);
      if (item.color?.trim()) {
        varQuery.ilike("color", item.color.trim());
      }
      const { data: variants } = await varQuery.limit(1);
      if (variants && variants[0]?.id) variantId = variants[0].id;
    }

    const price = Number(dbProd.price) || 0;

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
  let couponRule: CouponPricingRule | null = null;
  const cleanCode = couponCode?.trim().toUpperCase() || null;

  if (cleanCode) {
    const { data: couponRow, error: couponErr } = await supabaseAdmin
      .from("coupons")
      .select("*")
      .ilike("code", cleanCode)
      .eq("is_active", true)
      .maybeSingle();

    if (couponErr) {
      await logStructuredServerError({
        source: "checkout",
        action: "load_coupon",
        targetId: cleanCode,
        error: couponErr,
      });
      throw new Error("Could not verify coupon code right now. Please try again.");
    }

    if (!couponRow) {
      throw new Error(`Coupon code "${cleanCode}" is invalid or inactive.`);
    }

    const now = new Date();
    const notExpired = !couponRow.expires_at || new Date(couponRow.expires_at) > now;
    const underUsageLimit =
      !couponRow.usage_limit || (couponRow.times_used || 0) < couponRow.usage_limit;

    if (!notExpired) {
      throw new Error(`Coupon code "${cleanCode}" has expired.`);
    }
    if (!underUsageLimit) {
      throw new Error(`Coupon code "${cleanCode}" has reached its redemption limit.`);
    }

    couponRule = {
      code: couponRow.code,
      discountType: couponRow.discount_type === "fixed" ? "fixed" : "percentage",
      discountValue: Number(couponRow.discount_value) || 0,
      minOrderValue: couponRow.min_order_value,
      maxDiscount: couponRow.max_discount,
    };
  }

  // 3. Single integer-paise calculation engine aligned 1:1 with UI and Razorpay
  const pricing = calculateOrderPricingPaise({
    items: itemsWithDetails.map((item) => ({ price: item.price, qty: item.qty })),
    couponCode: cleanCode,
    couponRule,
  });

  if (cleanCode && pricing.couponRejectionReason) {
    throw new Error(pricing.couponRejectionReason);
  }

  return {
    subtotal: pricing.subtotal,
    discount: pricing.discount,
    shippingFee: pricing.shipping,
    taxes: pricing.taxes,
    total: pricing.total,
    totalPaise: pricing.totalPaise,
    appliedCouponCode: pricing.appliedCouponCode,
    itemsWithDetails,
  };
}

/**
 * Server Function: Live Coupon Validation against Supabase coupons table
 */
export const validateCouponServerFn = createServerFn({ method: "POST" })
  .validator((input: { code: string; subtotalRupees: number }) => input)
  .handler(async ({ data }) => {
    const cleanCode = (data.code || "").trim().toUpperCase();
    if (!cleanCode) {
      return {
        valid: false as const,
        code: null,
        rule: null,
        message: "Please enter a coupon code.",
      };
    }

    const { data: couponRow, error } = await supabaseAdmin
      .from("coupons")
      .select("*")
      .ilike("code", cleanCode)
      .eq("is_active", true)
      .maybeSingle();

    if (error) {
      await logStructuredServerError({
        source: "checkout",
        action: "validate_coupon",
        targetId: cleanCode,
        error,
      });
      return {
        valid: false as const,
        code: cleanCode,
        rule: null,
        message: "Unable to verify coupon right now. Please try again.",
      };
    }

    if (!couponRow) {
      return {
        valid: false as const,
        code: cleanCode,
        rule: null,
        message: `Coupon code "${cleanCode}" is invalid or inactive.`,
      };
    }

    const now = new Date();
    if (couponRow.expires_at && new Date(couponRow.expires_at) <= now) {
      return {
        valid: false as const,
        code: couponRow.code,
        rule: null,
        message: `Coupon code "${couponRow.code}" has expired.`,
      };
    }
    if (couponRow.usage_limit && (couponRow.times_used || 0) >= couponRow.usage_limit) {
      return {
        valid: false as const,
        code: couponRow.code,
        rule: null,
        message: `Coupon code "${couponRow.code}" has reached its usage limit.`,
      };
    }

    const rule: CouponPricingRule = {
      code: couponRow.code,
      discountType: couponRow.discount_type === "fixed" ? "fixed" : "percentage",
      discountValue: Number(couponRow.discount_value) || 0,
      minOrderValue: couponRow.min_order_value,
      maxDiscount: couponRow.max_discount,
      label:
        couponRow.discount_type === "percentage"
          ? `${couponRow.discount_value}% off${couponRow.min_order_value ? ` orders ₹${couponRow.min_order_value}+` : ""}`
          : `₹${couponRow.discount_value} off`,
    };

    const preview = calculateOrderPricingPaise({
      subtotalRupees: data.subtotalRupees,
      couponCode: rule.code,
      couponRule: rule,
    });

    if (preview.couponRejectionReason) {
      return {
        valid: false as const,
        code: rule.code,
        rule,
        message: preview.couponRejectionReason,
      };
    }

    return {
      valid: true as const,
      code: rule.code,
      rule,
      message: `${rule.code} applied — ${rule.label}`,
    };
  });

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

    // 2. Derive verified user identity strictly from server session or passed token (NEVER link guest email to another account!)
    const tokenAuth = await getAuthenticatedCustomerId(data.authToken);
    const headerAuth = tokenAuth ? null : await getServerSessionUser();
    const verifiedUserId = tokenAuth?.id ?? headerAuth?.id ?? null;
    const verifiedUserEmail = (tokenAuth?.email ?? headerAuth?.email)?.toLowerCase().trim() || null;
    let customerUuid: string | null = tokenAuth?.customerUuid ?? null;

    if (!customerUuid && verifiedUserId) {
      const { data: c } = await supabaseAdmin
        .from("customers")
        .select("id")
        .eq("auth_provider_uid", verifiedUserId)
        .maybeSingle();
      if (c) customerUuid = c.id;
    }
    if (!customerUuid && verifiedUserId && verifiedUserEmail) {
      const { data: c } = await supabaseAdmin
        .from("customers")
        .select("id")
        .ilike("email", verifiedUserEmail)
        .maybeSingle();
      if (c) customerUuid = c.id;
    }

    // 3. Server-side price calculation directly from Supabase database (integer paise)
    const { subtotal, discount, shippingFee, taxes, total, totalPaise, itemsWithDetails } =
      await calculateOrderTotals(cart, coupon);
    if (itemsWithDetails.length === 0) {
      throw new Error("No valid products found in your order.");
    }

    if (paymentMethod === "online") {
      const precheckKeyId = getRazorpayKeyId();
      if (!isRazorpayConfigured() || !precheckKeyId) {
        throw new Error(
          "Online payment is temporarily unavailable. Please select Cash on Delivery or contact store support.",
        );
      }
    }

    const checkoutMode = data.checkoutMode === "DIRECT_BUY" ? "DIRECT_BUY" : "CART_CHECKOUT";
    const cleanIdemKey = data.idempotencyKey?.trim().slice(0, 128) || null;

    // 3b. Idempotency check to block duplicate order creation on double-click or retry
    if (cleanIdemKey) {
      const { data: existingOrder } = await supabaseAdmin
        .from("orders")
        .select(
          "id, order_number, status, payment_method, payment_status, total, razorpay_order_id, awb_number, courier_partner",
        )
        .filter("shipping->>idempotencyKey", "eq", cleanIdemKey)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingOrder) {
        if (existingOrder.payment_status === "paid") {
          throw new Error(
            "This order has already been paid and confirmed. Please check your Account order history.",
          );
        }
        if (
          existingOrder.payment_method === "online" &&
          existingOrder.status === "pending_payment" &&
          existingOrder.razorpay_order_id &&
          existingOrder.total === total
        ) {
          const rzpKey = getRazorpayKeyId();
          if (rzpKey) {
            return {
              success: true,
              orderId: existingOrder.id,
              orderNumber: existingOrder.order_number || `CVH-${existingOrder.id.slice(0, 8)}`,
              paymentMethod: "online" as const,
              razorpayOrderId: existingOrder.razorpay_order_id,
              amountInPaise: totalPaise,
              currency: "INR",
              keyId: rzpKey,
              total: existingOrder.total,
              reused: true,
            };
          }
        }
        if (existingOrder.payment_method === "cod" && existingOrder.status === "confirmed") {
          return {
            success: true,
            orderId: existingOrder.id,
            orderNumber: existingOrder.order_number || `CVH-${existingOrder.id.slice(0, 8)}`,
            paymentMethod: "cod" as const,
            cod: true,
            total: existingOrder.total,
            awbNumber: existingOrder.awb_number || undefined,
            courierPartner: existingOrder.courier_partner || undefined,
            shipmentSuccess: true,
            reused: true,
          };
        }
      }
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
        taxes,
        total,
        status: paymentMethod === "cod" ? "confirmed" : "pending_payment",
        payment_method: paymentMethod,
        payment_status: "pending",
        shipment_status: "unfulfilled",
        shipping: {
          address: customer.address.trim(),
          ...(customer.landmark?.trim() ? { landmark: customer.landmark.trim() } : {}),
          city: customer.city.trim(),
          state: customer.state.trim(),
          pincode: customer.pin.trim(),
          country: "India",
          checkoutMode,
          ...(cleanIdemKey ? { idempotencyKey: cleanIdemKey } : {}),
        } as unknown as Json,
      })
      .select("id")
      .single();

    if (orderErr || !order) {
      await logStructuredServerError({
        source: "checkout",
        action: "create_order",
        targetId: orderNumber,
        actorEmail: customer.email.trim(),
        error: orderErr || new Error("Order insert returned null"),
        context: { checkoutMode, paymentMethod, total },
      });
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
    const { error: itemsErr } = await supabaseAdmin.from("order_items").insert(orderItemsToInsert);
    if (itemsErr) {
      await supabaseAdmin.from("orders").delete().eq("id", orderId);
      throw new Error("Failed to record order items. Please try again.");
    }

    // 7. Insert immutable order address snapshot into order_addresses
    const { error: oaErr } = await supabaseAdmin.from("order_addresses").insert({
      order_id: orderId,
      address_type: "shipping",
      full_name: customer.name.trim(),
      phone: customer.phone.replace(/\D/g, ""),
      email: customer.email.trim(),
      address_line1: customer.address.trim(),
      address_line2: customer.landmark?.trim() || null,
      city: customer.city.trim(),
      state: customer.state.trim(),
      postal_code: customer.pin.trim(),
      country: "India",
    });
    if (oaErr) {
      await supabaseAdmin.from("orders").delete().eq("id", orderId);
      throw new Error("Failed to record delivery address. Please try again.");
    }

    // Also write to shipping_addresses for backwards compatibility
    const { error: saErr } = await supabaseAdmin.from("shipping_addresses").insert({
      order_id: orderId,
      user_id: verifiedUserId,
      full_name: customer.name.trim(),
      phone: customer.phone.replace(/\D/g, ""),
      email: customer.email.trim(),
      address_line1: customer.address.trim(),
      address_line2: customer.landmark?.trim() || null,
      city: customer.city.trim(),
      state: customer.state.trim(),
      pincode: customer.pin.trim(),
      country: "India",
    });
    if (saErr) {
      console.warn("[Shipping Address Snapshot] Write warning:", saErr.message);
    }

    // Save to customer account address book strictly when authenticated, requested, and non-duplicate
    if (
      verifiedUserId &&
      customerUuid &&
      !customer.selectedAddressId &&
      customer.saveAddress !== false
    ) {
      try {
        const cleanPhone = customer.phone.replace(/\D/g, "").slice(-10);
        const cleanLine1 = customer.address.trim();
        const cleanPin = customer.pin.trim();
        const { data: existingDup } = await supabaseAdmin
          .from("customer_addresses")
          .select("id")
          .eq("customer_id", customerUuid)
          .eq("postal_code", cleanPin)
          .ilike("address_line1", cleanLine1)
          .limit(1)
          .maybeSingle();

        if (!existingDup) {
          await supabaseAdmin.from("customer_addresses").insert({
            customer_id: customerUuid,
            customer_auth_uid: verifiedUserId,
            address_type: "shipping",
            is_default: false,
            full_name: customer.name.trim(),
            phone: cleanPhone,
            address_line1: cleanLine1,
            address_line2: customer.landmark?.trim() || null,
            city: customer.city.trim(),
            state: customer.state.trim(),
            postal_code: cleanPin,
            country: "India",
          });
        }
      } catch (addrErr) {
        console.warn("[Customer Address Book] Note: could not save address:", addrErr);
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
      // For Cash on Delivery, inventory is committed atomically — abort and rollback if stock exhausted
      const commitRes = await commitOrderInventory(
        orderId,
        orderNumber,
        inventoryItems,
        verifiedUserId,
      );
      if (!commitRes.success) {
        await supabaseAdmin.from("orders").delete().eq("id", orderId);
        throw new Error(
          commitRes.error || "Insufficient stock available to place this Cash on Delivery order.",
        );
      }
    }

    // 10. Atomic coupon redemption check & increment (with rollback on payment init failure)
    let redeemedCouponId: string | null = null;
    if (coupon && discount > 0) {
      const cleanCouponCode = coupon.trim().toUpperCase();
      const sql = getDb();
      if (sql) {
        const [claimed] = await sql<{ id: string }[]>`
          UPDATE public.coupons
          SET times_used = COALESCE(times_used, 0) + 1, updated_at = NOW()
          WHERE upper(code) = ${cleanCouponCode}
            AND is_active = true
            AND (expires_at IS NULL OR expires_at > NOW())
            AND (usage_limit IS NULL OR COALESCE(times_used, 0) < usage_limit)
          RETURNING id
        `;
        if (!claimed) {
          if (paymentMethod === "online") await releaseOrderInventoryReservations(orderId);
          await supabaseAdmin.from("orders").delete().eq("id", orderId);
          throw new Error(
            `Coupon code "${cleanCouponCode}" has expired or reached its usage limit.`,
          );
        }
        redeemedCouponId = claimed.id;
      } else {
        const { data: cp } = await supabaseAdmin
          .from("coupons")
          .select("id, times_used, usage_limit")
          .ilike("code", cleanCouponCode)
          .eq("is_active", true)
          .maybeSingle();

        if (!cp || (cp.usage_limit && (cp.times_used || 0) >= cp.usage_limit)) {
          if (paymentMethod === "online") await releaseOrderInventoryReservations(orderId);
          await supabaseAdmin.from("orders").delete().eq("id", orderId);
          throw new Error(`Coupon code "${cleanCouponCode}" is no longer available.`);
        }

        await supabaseAdmin
          .from("coupons")
          .update({
            times_used: (cp.times_used || 0) + 1,
            updated_at: new Date().toISOString(),
          })
          .eq("id", cp.id);
        redeemedCouponId = cp.id;
      }

      if (redeemedCouponId) {
        try {
          await supabaseAdmin.from("coupon_redemptions").insert({
            coupon_id: redeemedCouponId,
            customer_id: customerUuid,
            order_id: orderId,
            discount_amount: discount,
          });
        } catch (crErr) {
          console.warn("[Coupon Redemptions] Log note:", crErr);
        }
      }
    }

    // 11. Handle Payment Method
    if (paymentMethod === "online") {
      const razorpayKeyId = getRazorpayKeyId();

      if (!isRazorpayConfigured() || !razorpayKeyId) {
        await releaseOrderInventoryReservations(orderId);
        if (redeemedCouponId) {
          await supabaseAdmin.from("coupon_redemptions").delete().eq("order_id", orderId);
        }
        await supabaseAdmin.from("orders").delete().eq("id", orderId);
        throw new Error(
          "Online payment is temporarily unavailable. Please select Cash on Delivery or contact store support.",
        );
      }

      // Create Razorpay Order on Razorpay servers using exact integer paise
      const rzpRes = await createRazorpayOrder({
        amountInPaise: totalPaise,
        receipt: orderNumber,
        notes: {
          order_id: orderId,
          order_number: orderNumber,
          checkout_mode: checkoutMode,
          customer_email: customer.email.trim(),
        },
      });

      if (!rzpRes.success || !rzpRes.order) {
        await logStructuredServerError({
          source: "payment",
          action: "create_razorpay_order",
          targetId: orderNumber,
          actorEmail: customer.email.trim(),
          error: rzpRes.error || "Razorpay initialization failed",
          context: { orderId, totalPaise, checkoutMode },
        });
        // Rollback pending order, coupon redemption, and release reserved stock if Razorpay initialization fails
        await releaseOrderInventoryReservations(orderId);
        if (redeemedCouponId) {
          const sql = getDb();
          if (sql) {
            await sql`UPDATE public.coupons SET times_used = GREATEST(0, times_used - 1) WHERE id = ${redeemedCouponId}::uuid`;
          }
          await supabaseAdmin.from("coupon_redemptions").delete().eq("order_id", orderId);
        }
        await supabaseAdmin.from("orders").delete().eq("id", orderId);
        throw new Error(rzpRes.error || "Failed to initialize payment gateway checkout.");
      }

      // Record Razorpay order ID
      const { error: ordRzpErr } = await supabaseAdmin
        .from("orders")
        .update({
          razorpay_order_id: rzpRes.order.id,
          payment_status: "pending",
        })
        .eq("id", orderId);
      if (ordRzpErr) {
        await releaseOrderInventoryReservations(orderId);
        if (redeemedCouponId) {
          const sql = getDb();
          if (sql) {
            await sql`UPDATE public.coupons SET times_used = GREATEST(0, times_used - 1) WHERE id = ${redeemedCouponId}::uuid`;
          }
          await supabaseAdmin.from("coupon_redemptions").delete().eq("order_id", orderId);
        }
        await supabaseAdmin.from("orders").delete().eq("id", orderId);
        throw new Error("Failed to bind payment order reference. Please retry checkout.");
      }

      const { error: pmtInsErr } = await supabaseAdmin.from("payments").insert({
        order_id: orderId,
        user_id: verifiedUserId,
        gateway: "razorpay",
        payment_method: "online",
        razorpay_order_id: rzpRes.order.id,
        amount: total,
        amount_paise: totalPaise,
        currency: "INR",
        status: "pending",
      });
      if (pmtInsErr) {
        console.warn("[Payments Ledger] Initial pending payment write notice:", pmtInsErr.message);
      }

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
      const shipmentRes = await createShipMaxxShipment({
        orderId,
        orderNumber,
        userId: verifiedUserId,
        customerName: customer.name.trim(),
        customerPhone: customer.phone.replace(/\D/g, ""),
        customerEmail: customer.email.trim(),
        address: {
          line1: customer.address.trim(),
          ...(customer.landmark?.trim() ? { line2: customer.landmark.trim() } : {}),
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
 * Cryptographically verifies payment, verifies caller ownership on user-bound orders,
 * ensures captured status, and prevents duplicate processing.
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

    const { data: ownerCheckOrder } = await supabaseAdmin
      .from("orders")
      .select("user_id")
      .eq("id", data.orderId)
      .maybeSingle();

    if (
      ownerCheckOrder?.user_id &&
      (!verifiedUserId || ownerCheckOrder.user_id !== verifiedUserId)
    ) {
      throw new Error("Unauthorized: This order belongs to another account.");
    }

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
          ...((address as { landmark?: string }).landmark
            ? { line2: (address as { landmark?: string }).landmark }
            : {}),
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
 * Releases reserved inventory and coupon claim if an unpaid Razorpay checkout fails or is abandoned.
 * Strictly guards against touching paid, COD, or cross-account orders.
 */
export const abandonPendingOnlineOrderServerFn = createServerFn({ method: "POST" })
  .validator(
    (input: {
      authToken?: string | undefined;
      orderId: string;
      razorpayOrderId?: string | undefined;
      reason?: string | undefined;
    }) => input,
  )
  .handler(async ({ data }) => {
    if (!data.orderId) return { released: false };
    const authUser =
      (await getAuthenticatedCustomerId(data.authToken)) || (await getServerSessionUser());

    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id, user_id, status, payment_method, payment_status, razorpay_order_id")
      .eq("id", data.orderId)
      .maybeSingle();

    if (!order) return { released: false };
    if (order.user_id && (!authUser || authUser.id !== order.user_id)) {
      throw new Error("Unauthorized: This order belongs to another account.");
    }
    if (
      data.razorpayOrderId &&
      order.razorpay_order_id &&
      order.razorpay_order_id !== data.razorpayOrderId
    ) {
      throw new Error("Razorpay order reference mismatch.");
    }
    if (
      order.status !== "pending_payment" ||
      order.payment_method !== "online" ||
      order.payment_status !== "pending"
    ) {
      return { released: false };
    }

    await releaseOrderInventoryReservations(order.id);

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

    await supabaseAdmin
      .from("payments")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("order_id", order.id)
      .eq("status", "pending");

    await supabaseAdmin
      .from("orders")
      .update({
        status: "cancelled",
        payment_status: "failed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id)
      .eq("status", "pending_payment");

    await supabaseAdmin.from("order_status_history").insert({
      order_id: order.id,
      status: "cancelled",
      comment:
        data.reason?.trim() ||
        "Online payment failed or cancelled before completion. Stock reservation released.",
      changed_by: authUser?.id || "customer_checkout",
    });

    return { released: true };
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
      throw new Error("Forbidden: Access restricted to CAVENHUSRT administrators.");
    }

    let query = supabaseAdmin
      .from("orders")
      .select(
        "id, order_number, customer_name, customer_email, customer_phone, total, status, payment_method, payment_status, shipment_status, razorpay_order_id, razorpay_payment_id, awb_number, courier_partner, created_at",
      )
      .order("created_at", { ascending: false });

    if (data.filter && data.filter !== "all") {
      const safeFilter = data.filter.replace(/[^a-zA-Z0-9_-]/g, "");
      if (safeFilter === "cod") {
        query = query.eq("payment_method", "cod");
      } else if (safeFilter === "paid") {
        query = query.eq("payment_status", "paid");
      } else if (safeFilter === "pending_payment") {
        query = query.eq("payment_status", "pending");
      } else if (safeFilter) {
        query = query.or(`status.eq."${safeFilter}",shipment_status.eq."${safeFilter}"`);
      }
    }

    if (data.search && data.search.trim()) {
      const safeSearch = data.search
        .trim()
        .replace(/[,()*\\"]/g, "")
        .slice(0, 80);
      if (safeSearch) {
        const pat = `"%${safeSearch}%"`;
        query = query.or(
          `order_number.ilike.${pat},customer_name.ilike.${pat},customer_email.ilike.${pat},awb_number.ilike.${pat}`,
        );
      }
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
