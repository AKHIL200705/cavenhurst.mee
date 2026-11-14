import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getProduct, type Size } from "@/lib/products";
import { computeTotals } from "@/lib/pricing";
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
  customer: CheckoutCustomerInput;
  cart: CheckoutCartItemInput[];
  coupon: string | null;
  paymentMethod: "online" | "cod";
  userId?: string | null | undefined;
}

function generateOrderNumber(): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `CVH-${dateStr}-${rand}`;
}

/**
 * Recalculates order subtotal, discount, shipping and total strictly on the server.
 * Never trust client amounts!
 */
export function calculateOrderTotals(cart: CheckoutCartItemInput[], couponCode: string | null) {
  let subtotal = 0;
  const itemsWithDetails: Array<{
    slug: string;
    name: string;
    size: string;
    color: string;
    price: number;
    qty: number;
    image: string | null;
  }> = [];

  for (const item of cart) {
    const product = getProduct(item.slug);
    if (!product) continue;

    const price = product.price;
    subtotal += price * item.qty;
    itemsWithDetails.push({
      slug: product.slug,
      name: product.name,
      size: item.size,
      color: item.color,
      price,
      qty: item.qty,
      image: product.images[0] || null,
    });
  }

  const { discount, shipping, total } = computeTotals(subtotal, couponCode);

  return {
    subtotal,
    discount,
    shippingFee: shipping,
    total,
    itemsWithDetails,
  };
}

/**
 * Server Function: Serviceability Check
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
 */
export const placeOrderServerFn = createServerFn({ method: "POST" })
  .validator((input: PlaceOrderInput) => input)
  .handler(async ({ data }) => {
    const { customer, cart, coupon, paymentMethod, userId } = data;

    // 1. Validate inputs
    if (!customer.name.trim() || customer.name.length < 2) {
      throw new Error("Please enter your full name.");
    }
    if (!/^[6-9]\d{9}$/.test(customer.phone.replace(/\D/g, ""))) {
      throw new Error("Please enter a valid 10-digit mobile number.");
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

    // 2. Server-side price calculation
    const { subtotal, discount, shippingFee, total, itemsWithDetails } = calculateOrderTotals(
      cart,
      coupon,
    );
    if (itemsWithDetails.length === 0) {
      throw new Error("No valid products found in your order.");
    }

    const orderNumber = generateOrderNumber();

    // 3. Insert order into Supabase
    const { data: order, error: orderErr } = await supabaseAdmin
      .from("orders")
      .insert({
        user_id: userId || "00000000-0000-0000-0000-000000000000",
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

    // 4. Insert line items into order_items
    const orderItemsToInsert = itemsWithDetails.map((item) => ({
      order_id: orderId,
      product_slug: item.slug,
      name: item.name,
      size: item.size,
      color: item.color,
      price: item.price,
      qty: item.qty,
      image: item.image,
    }));
    await supabaseAdmin.from("order_items").insert(orderItemsToInsert);

    // 5. Insert shipping address
    await supabaseAdmin.from("shipping_addresses").insert({
      order_id: orderId,
      user_id: userId || null,
      full_name: customer.name.trim(),
      phone: customer.phone.replace(/\D/g, ""),
      email: customer.email.trim(),
      address_line1: customer.address.trim(),
      city: customer.city.trim(),
      state: customer.state.trim(),
      pincode: customer.pin.trim(),
      country: "India",
    });

    // 6. Handle Payment Method
    if (paymentMethod === "online") {
      const razorpayKeyId = getRazorpayKeyId();

      // Check if Razorpay is configured
      if (!isRazorpayConfigured() || !razorpayKeyId) {
        return {
          success: true,
          orderId,
          orderNumber,
          paymentMethod: "online" as const,
          razorpayConfigured: false,
          total,
          message:
            "Order created successfully. Online payment is currently in test mode or awaiting merchant API keys.",
        };
      }

      // Create Razorpay Order
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
        throw new Error(rzpRes.error || "Failed to initialize Razorpay checkout.");
      }

      // Save Razorpay order ID to order and payments table
      await supabaseAdmin
        .from("orders")
        .update({
          razorpay_order_id: rzpRes.order.id,
          payment_status: "processing",
        })
        .eq("id", orderId);

      await supabaseAdmin.from("payments").insert({
        order_id: orderId,
        user_id: userId || null,
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
        razorpayConfigured: true,
        razorpayOrderId: rzpRes.order.id,
        amountInPaise: rzpRes.order.amount,
        currency: rzpRes.order.currency,
        keyId: razorpayKeyId,
        total,
      };
    } else {
      // Cash on Delivery (COD)
      // Immediately create shipment in ShipMaxx360
      const shipmentRes = await createShipMaxxShipment({
        orderId,
        orderNumber,
        userId: userId || null,
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
      };
    }
  });

/**
 * Server Function: Verify Razorpay Payment and Dispatch ShipMaxx360 Shipment
 */
export const verifyPaymentServerFn = createServerFn({ method: "POST" })
  .validator(
    (input: {
      orderId: string;
      razorpayOrderId: string;
      razorpayPaymentId: string;
      razorpaySignature: string;
      userId?: string | null | undefined;
    }) => input,
  )
  .handler(async ({ data }) => {
    // 1. Verify Razorpay cryptographic signature and mark order paid
    const verification = await confirmVerifiedPayment({
      orderId: data.orderId,
      razorpayOrderId: data.razorpayOrderId,
      razorpayPaymentId: data.razorpayPaymentId,
      razorpaySignature: data.razorpaySignature,
      userId: data.userId ?? null,
    });

    if (!verification.success) {
      throw new Error(verification.error || "Payment verification failed.");
    }

    // 2. Fetch full order and customer address to create ShipMaxx360 shipment
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select(
        "id, order_number, customer_name, customer_email, customer_phone, items, total, shipping",
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

      // Automatically create prepaid shipment via ShipMaxx360
      await createShipMaxxShipment({
        orderId: order.id,
        orderNumber: order.order_number || `CVH-${order.id.slice(0, 8)}`,
        userId: data.userId ?? null,
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
 */
export const getAdminOrdersServerFn = createServerFn({ method: "GET" })
  .validator((params?: { filter?: string; search?: string }) => params || {})
  .handler(async ({ data }) => {
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

    const { data: orders, error } = await query.limit(50);
    if (error) {
      console.error("[Admin Orders] Error fetching orders:", error);
      throw new Error("Failed to load orders");
    }

    return orders || [];
  });
