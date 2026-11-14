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

    const data = (await response.json()) as { id: string; amount: number; currency: string };
    return {
      success: true,
      configured: true,
      order: data,
    };
  } catch (error) {
    console.error("[Razorpay] Network/API error:", error);
    return {
      success: false,
      configured: true,
      error:
        error instanceof Error ? error.message : "Failed to communicate with Razorpay servers.",
    };
  }
}

/**
 * Cryptographically verifies Razorpay payment signature server-side.
 * Formula: HMAC SHA256 (order_id + "|" + razorpay_payment_id, secret) == razorpay_signature
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
  if (!webhookSecret) return false;

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
 * Verifies payment, prevents duplicate processing, and marks order as paid in Supabase.
 */
export async function confirmVerifiedPayment(input: VerifyPaymentInput) {
  // 1. Verify cryptographic HMAC signature
  const valid = verifyRazorpaySignature({
    razorpayOrderId: input.razorpayOrderId,
    razorpayPaymentId: input.razorpayPaymentId,
    razorpaySignature: input.razorpaySignature,
  });

  if (!valid) {
    // Record failed verification attempt
    await supabaseAdmin.from("payments").insert({
      order_id: input.orderId,
      user_id: input.userId || null,
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

  // 2. Fetch current order to check idempotency (never charge or process twice!)
  const { data: existingOrder, error: orderFetchErr } = await supabaseAdmin
    .from("orders")
    .select("id, order_number, status, payment_status, total")
    .eq("id", input.orderId)
    .single();

  if (orderFetchErr || !existingOrder) {
    return { success: false, error: "Associated order could not be found." };
  }

  // Idempotency: If already paid, return success without duplicate processing
  if (existingOrder.payment_status === "paid") {
    return {
      success: true,
      alreadyProcessed: true,
      orderNumber: existingOrder.order_number || input.orderId,
    };
  }

  // 3. Record successful payment in payments table
  await supabaseAdmin.from("payments").insert({
    order_id: input.orderId,
    user_id: input.userId || null,
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

  // 4. Update order state to paid & confirmed
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
 * Handles Razorpay webhook event with idempotency.
 */
export async function processRazorpayWebhook(eventPayload: {
  event: string;
  payload: {
    payment?: { entity?: { id?: string; order_id?: string; amount?: number; status?: string } };
    order?: { entity?: { id?: string; receipt?: string; status?: string } };
  };
}) {
  const eventType = eventPayload.event;
  const paymentEntity = eventPayload.payload.payment?.entity;
  const orderEntity = eventPayload.payload.order?.entity;

  const razorpayOrderId = paymentEntity?.order_id || orderEntity?.id;
  const razorpayPaymentId = paymentEntity?.id;

  if (!razorpayOrderId) {
    return { processed: false, reason: "Missing Razorpay order ID in webhook payload" };
  }

  // Idempotency check: record event in payment_webhook_events
  const eventId = `${eventType}_${razorpayPaymentId || razorpayOrderId}_${Date.now()}`;
  const { error: eventErr } = await supabaseAdmin.from("payment_webhook_events").insert({
    event_id: eventId,
    event_type: eventType,
    gateway: "razorpay",
    payload: eventPayload as unknown as Json,
    processed: false,
  });

  if (eventErr && eventErr.code === "23505") {
    // Duplicate webhook event already processed
    return { processed: true, duplicate: true };
  }

  if (eventType === "payment.captured" || eventType === "order.paid") {
    // Find matching order in Supabase
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id, payment_status")
      .eq("razorpay_order_id", razorpayOrderId)
      .maybeSingle();

    if (order && order.payment_status !== "paid") {
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
