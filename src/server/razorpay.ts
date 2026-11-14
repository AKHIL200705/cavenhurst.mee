import { createHmac, timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";

export interface CreateRazorpayOrderInput {
  amountInPaise: number;
  currency?: string | undefined;
  receipt: string;
  notes?: Record<string, string> | undefined;
}

export interface VerifyPaymentInput {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
  orderId: string;
  userId?: string | null | undefined;
}

export function isRazorpayConfigured(): boolean {
  return Boolean(process.env["RAZORPAY_KEY_ID"] && process.env["RAZORPAY_KEY_SECRET"]);
}

export function getRazorpayKeyId(): string | null {
  return process.env["RAZORPAY_KEY_ID"] || process.env["VITE_RAZORPAY_KEY_ID"] || null;
}

/**
 * Creates an order directly on Razorpay's API.
 * Amounts are in paise (1 INR = 100 paise).
 */
export async function createRazorpayOrder(input: CreateRazorpayOrderInput) {
  const keyId = process.env["RAZORPAY_KEY_ID"];
  const keySecret = process.env["RAZORPAY_KEY_SECRET"];

  if (!keyId || !keySecret) {
    return {
      success: false,
      configured: false,
      error:
        "Razorpay credentials are not configured on the server. Please set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.",
    };
  }

  try {
    const authHeader = `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;
    const response = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      body: JSON.stringify({
        amount: input.amountInPaise,
        currency: input.currency || "INR",
        receipt: input.receipt,
        notes: input.notes || {},
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("[Razorpay] Order creation failed:", response.status, errText);
      return {
        success: false,
        configured: true,
        error: `Razorpay rejected order creation (${response.status}): ${errText}`,
      };
    }

    const data = (await response.json()) as {
      id: string;
      amount: number;
      currency: string;
      receipt: string;
      status: string;
    };

    return {
      success: true,
      configured: true,
      order: data,
    };
  } catch (error) {
    console.error("[Razorpay] Network error creating order:", error);
    return {
      success: false,
      configured: true,
      error: error instanceof Error ? error.message : "Failed to communicate with Razorpay API.",
    };
  }
}

/**
 * Cryptographically verifies Razorpay payment signature server-side.
 * Formula: HMAC SHA256 (order_id + "|" + razorpay_payment_id, secret) == razorpay_signature
 * Uses timingSafeEqual to prevent timing attacks.
 */
export function verifyRazorpaySignature(params: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}): boolean {
  const keySecret = process.env["RAZORPAY_KEY_SECRET"];
  if (!keySecret) return false;

  const payload = `${params.razorpayOrderId}|${params.razorpayPaymentId}`;
  const generatedSignature = createHmac("sha256", keySecret).update(payload).digest("hex");

  try {
    const signatureBuffer = Buffer.from(params.razorpaySignature, "utf8");
    const generatedBuffer = Buffer.from(generatedSignature, "utf8");

    if (signatureBuffer.length !== generatedBuffer.length) {
      return false;
    }

    return timingSafeEqual(signatureBuffer, generatedBuffer);
  } catch {
    return false;
  }
}

/**
 * Verifies Razorpay Webhook signature using RAZORPAY_WEBHOOK_SECRET.
 */
export function verifyRazorpayWebhookSignature(rawBody: string, signature: string): boolean {
  const webhookSecret = process.env["RAZORPAY_WEBHOOK_SECRET"];
  if (!webhookSecret || !signature) return false;

  try {
    const expectedSignature = createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
    const signatureBuffer = Buffer.from(signature, "utf8");
    const expectedBuffer = Buffer.from(expectedSignature, "utf8");

    if (signatureBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return timingSafeEqual(signatureBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

/**
 * Verifies payment, checks order ID match, verifies amount/currency,
 * ensures captured status, prevents duplicate processing, and marks order as paid in Supabase.
 */
export async function confirmVerifiedPayment(input: VerifyPaymentInput) {
  // 1. Fetch current order from Supabase
  const { data: existingOrder, error: orderFetchErr } = await supabaseAdmin
    .from("orders")
    .select("id, order_number, status, payment_status, total, razorpay_order_id, user_id")
    .eq("id", input.orderId)
    .single();

  if (orderFetchErr || !existingOrder) {
    return { success: false, error: "Associated order could not be found." };
  }

  // 2. Security Check: verify stored Razorpay order ID matches payment response
  if (
    existingOrder.razorpay_order_id &&
    existingOrder.razorpay_order_id !== input.razorpayOrderId
  ) {
    console.error(
      `[Razorpay Security] Order ID mismatch: stored=${existingOrder.razorpay_order_id}, received=${input.razorpayOrderId}`,
    );
    return {
      success: false,
      error: "Security validation error: Stored order reference does not match payment response.",
    };
  }

  // 3. Cryptographic HMAC signature verification
  const validSignature = verifyRazorpaySignature({
    razorpayOrderId: input.razorpayOrderId,
    razorpayPaymentId: input.razorpayPaymentId,
    razorpaySignature: input.razorpaySignature,
  });

  if (!validSignature) {
    // Record failed verification attempt in payments ledger
    await supabaseAdmin.from("payments").insert({
      order_id: input.orderId,
      user_id: input.userId || existingOrder.user_id || null,
      gateway: "razorpay",
      payment_method: "online",
      razorpay_order_id: input.razorpayOrderId,
      razorpay_payment_id: input.razorpayPaymentId,
      razorpay_signature: input.razorpaySignature,
      amount: 0,
      amount_paise: 0,
      currency: "INR",
      status: "failed",
      error_code: "INVALID_SIGNATURE",
      error_description: "Cryptographic HMAC SHA256 signature verification failed.",
      payload: input as unknown as Json,
    });

    return {
      success: false,
      error:
        "Payment verification failed: Invalid cryptographic signature. This attempt has been logged.",
    };
  }

  // 4. Idempotency Check: if already paid, return confirmed without re-processing
  if (existingOrder.payment_status === "paid") {
    return {
      success: true,
      alreadyProcessed: true,
      orderNumber: existingOrder.order_number || input.orderId,
    };
  }

  // 5. Verification against Razorpay API (amount, currency, captured status)
  const keyId = process.env["RAZORPAY_KEY_ID"];
  const keySecret = process.env["RAZORPAY_KEY_SECRET"];

  if (keyId && keySecret) {
    try {
      const authHeader = `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;
      const rzpRes = await fetch(
        `https://api.razorpay.com/v1/payments/${encodeURIComponent(input.razorpayPaymentId)}`,
        {
          headers: {
            Authorization: authHeader,
          },
        },
      );

      if (rzpRes.ok) {
        const paymentData = (await rzpRes.json()) as {
          id: string;
          order_id: string;
          status: string;
          amount: number;
          currency: string;
          captured?: boolean;
        };

        // Verify order reference on payment entity
        if (paymentData.order_id && paymentData.order_id !== input.razorpayOrderId) {
          return {
            success: false,
            error: "Payment verification failed: Payment entity order_id does not match order.",
          };
        }

        // Verify currency
        if (paymentData.currency && paymentData.currency !== "INR") {
          return {
            success: false,
            error: `Payment verification failed: Currency mismatch (${paymentData.currency}). Expected INR.`,
          };
        }

        // Verify amount in paise matches order total
        const expectedPaise = Math.round(existingOrder.total * 100);
        if (paymentData.amount !== expectedPaise) {
          console.error(
            `[Razorpay Amount Mismatch] expected=${expectedPaise} paise, received=${paymentData.amount} paise`,
          );
          return {
            success: false,
            error: `Payment verification failed: Amount mismatch. Expected ₹${existingOrder.total}, received ₹${paymentData.amount / 100}.`,
          };
        }

        // Verify status is captured (or authorized if auto-capture configured)
        if (paymentData.status !== "captured" && paymentData.status !== "authorized") {
          return {
            success: false,
            error: `Payment verification failed: Payment status is '${paymentData.status}', not captured.`,
          };
        }
      }
    } catch (err) {
      console.warn(
        "[Razorpay Verification] API check skipped due to network error, proceeding with valid HMAC signature:",
        err,
      );
    }
  }

  // 6. Record verified payment in payments ledger
  await supabaseAdmin.from("payments").insert({
    order_id: input.orderId,
    user_id: input.userId || existingOrder.user_id || null,
    gateway: "razorpay",
    payment_method: "online",
    razorpay_order_id: input.razorpayOrderId,
    razorpay_payment_id: input.razorpayPaymentId,
    razorpay_signature: input.razorpaySignature,
    amount: existingOrder.total,
    amount_paise: existingOrder.total * 100,
    currency: "INR",
    status: "captured",
    payload: input as unknown as Json,
  });

  // 7. Update order state to paid & confirmed (never touch shipment_status!)
  await supabaseAdmin
    .from("orders")
    .update({
      status: "paid",
      payment_status: "paid",
      razorpay_order_id: input.razorpayOrderId,
      razorpay_payment_id: input.razorpayPaymentId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.orderId);

  return {
    success: true,
    alreadyProcessed: false,
    orderNumber: existingOrder.order_number || input.orderId,
  };
}

/**
 * Handles Razorpay webhook event with reliable idempotency.
 * Updates payment status without overwriting shipment status.
 */
export async function processRazorpayWebhook(
  eventPayload: {
    id?: string;
    event_id?: string;
    event: string;
    payload: {
      payment?: {
        entity?: {
          id?: string;
          order_id?: string;
          amount?: number;
          currency?: string;
          status?: string;
        };
      };
      order?: { entity?: { id?: string; receipt?: string; status?: string; amount?: number } };
    };
  },
  headerEventId?: string | null,
) {
  const eventType = eventPayload.event;
  const paymentEntity = eventPayload.payload.payment?.entity;
  const orderEntity = eventPayload.payload.order?.entity;

  const razorpayOrderId = paymentEntity?.order_id || orderEntity?.id;
  const razorpayPaymentId = paymentEntity?.id;

  if (!razorpayOrderId) {
    return { processed: false, reason: "Missing Razorpay order ID in webhook payload" };
  }

  // Reliable deterministic event ID for true idempotency
  const eventId =
    headerEventId ||
    eventPayload.id ||
    eventPayload.event_id ||
    `rzp_${eventType}_${razorpayPaymentId || razorpayOrderId}`;

  // Idempotency check: record event in payment_webhook_events
  const { error: eventErr } = await supabaseAdmin.from("payment_webhook_events").insert({
    event_id: eventId,
    event_type: eventType,
    gateway: "razorpay",
    payload: eventPayload as unknown as Json,
    processed: false,
  });

  if (eventErr && eventErr.code === "23505") {
    // Duplicate webhook event already recorded
    return { processed: true, duplicate: true };
  }

  if (eventType === "payment.captured" || eventType === "order.paid") {
    // Find matching order in Supabase
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id, payment_status, total")
      .eq("razorpay_order_id", razorpayOrderId)
      .maybeSingle();

    if (order && order.payment_status !== "paid") {
      // Amount verification if amount is present in webhook payload
      if (paymentEntity?.amount) {
        const expectedPaise = Math.round(order.total * 100);
        if (paymentEntity.amount !== expectedPaise) {
          console.error(
            `[Webhook Amount Mismatch] Order total ${order.total} does not match payment ${paymentEntity.amount / 100}`,
          );
          return { processed: false, error: "Payment amount mismatch in webhook payload" };
        }
      }

      await supabaseAdmin
        .from("orders")
        .update({
          status: "paid",
          payment_status: "paid",
          razorpay_payment_id: razorpayPaymentId || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", order.id);
    }
  } else if (eventType === "payment.failed") {
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id, payment_status")
      .eq("razorpay_order_id", razorpayOrderId)
      .maybeSingle();

    if (order && order.payment_status === "pending") {
      await supabaseAdmin
        .from("orders")
        .update({
          payment_status: "failed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", order.id);
    }
  }

  // Mark event as processed
  await supabaseAdmin
    .from("payment_webhook_events")
    .update({ processed: true })
    .eq("event_id", eventId);

  return { processed: true };
}
