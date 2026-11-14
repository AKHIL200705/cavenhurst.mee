import { createHmac, timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";

export interface CreateOrderParams {
  amountInPaise: number;
  currency?: string;
  receipt: string;
  notes?: Record<string, string>;
}

export interface VerifyPaymentParams {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}

export function isRazorpayConfigured(): boolean {
  return Boolean(process.env["RAZORPAY_KEY_ID"] && process.env["RAZORPAY_KEY_SECRET"]);
}

/**
 * Creates an order on Razorpay servers.
 * Amounts are in the smallest currency unit (e.g. Paise for INR).
 */
export async function createRazorpayOrder(params: CreateOrderParams) {
  const keyId = process.env["RAZORPAY_KEY_ID"];
  const keySecret = process.env["RAZORPAY_KEY_SECRET"];

  if (!keyId || !keySecret) {
    return {
      success: false,
      configured: false,
      error: "Razorpay credentials are not configured on the server.",
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
        amount: params.amountInPaise,
        currency: params.currency || "INR",
        receipt: params.receipt,
        notes: params.notes || {},
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return {
        success: false,
        configured: true,
        error: `Razorpay API error: ${response.status} ${errText}`,
      };
    }

    const data = (await response.json()) as { id: string; amount: number; currency: string };
    return {
      success: true,
      configured: true,
      order: data,
    };
  } catch (error) {
    return {
      success: false,
      configured: true,
      error: error instanceof Error ? error.message : "Failed to communicate with Razorpay.",
    };
  }
}

/**
 * Cryptographically verifies Razorpay payment signature server-side.
 * Formula: HMAC SHA256 (order_id + "|" + razorpay_payment_id, secret) == razorpay_signature
 */
export function verifyRazorpaySignature(params: VerifyPaymentParams): boolean {
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
 * Marks order as paid in Supabase database after successful signature verification.
 */
export async function markOrderPaid(orderId: string, paymentDetails: Record<string, unknown>) {
  return await supabaseAdmin
    .from("orders")
    .update({
      status: "paid",
      shipping: paymentDetails as unknown as Json,
    })
    .eq("id", orderId);
}
