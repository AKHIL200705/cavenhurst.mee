import { createHmac, timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";

export interface ShipMaxxConfig {
  baseUrl?: string | undefined;
  apiKey?: string | undefined;
  apiSecret?: string | undefined;
  pickupPincode?: string | undefined;
}

export interface ServiceabilityCheckParams {
  deliveryPincode: string;
  pickupPincode?: string | undefined;
  weightGrams?: number | undefined;
  paymentMode?: "prepaid" | "cod" | undefined;
}

export interface ServiceabilityResult {
  serviceable: boolean;
  deliveryPincode: string;
  pickupPincode: string;
  courierPartner?: string | undefined;
  estimatedDays?: number | undefined;
  codAvailable: boolean;
  rate: number;
  providerStatus: "connected" | "pending_credentials";
  message?: string | undefined;
}

export interface CreateShipmentParams {
  orderId: string;
  orderNumber: string;
  userId?: string | null | undefined;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  address: {
    line1: string;
    line2?: string | undefined;
    city: string;
    state: string;
    pincode: string;
  };
  items: Array<{
    name: string;
    size: string;
    color: string;
    qty: number;
    price: number;
  }>;
  paymentMode: "prepaid" | "cod";
  codAmount?: number | undefined;
  weightGrams?: number | undefined;
  packageType?: string | undefined;
}

export interface ShipmentResponse {
  success: boolean;
  shipmentId?: string | undefined;
  awbNumber?: string | undefined;
  courierPartner?: string | undefined;
  labelUrl?: string | undefined;
  status: string;
  providerStatus: "connected" | "pending_credentials";
  error?: string | undefined;
}

export const SHIPMAXX_DEFAULTS = {
  PICKUP_PINCODE: "521212",
  DEFAULT_WEIGHT_GRAMS: 500,
  DEFAULT_PACKAGE_TYPE: "One packed T-shirt",
  BASE_URL: "https://api.shipmaxx360.com",
} as const;

/**
 * Checks whether ShipMaxx360 API credentials are configured in the environment.
 */
export function isShipMaxxConfigured(): boolean {
  return Boolean(process.env["SHIPMAXX360_API_KEY"] && process.env["SHIPMAXX360_BASE_URL"]);
}

export function getShipMaxxConfig(): ShipMaxxConfig {
  return {
    baseUrl:
      process.env["SHIPMAXX360_BASE_URL"] ||
      process.env["SHIPMAXX360_API_BASE_URL"] ||
      SHIPMAXX_DEFAULTS.BASE_URL,
    apiKey: process.env["SHIPMAXX360_API_KEY"] || undefined,
    apiSecret: process.env["SHIPMAXX360_API_SECRET"] || undefined,
    pickupPincode: process.env["SHIPMAXX360_PICKUP_PINCODE"] || SHIPMAXX_DEFAULTS.PICKUP_PINCODE,
  };
}

/**
 * Validates delivery pincode format and checks serviceability against ShipMaxx360.
 * Checks prepaid and COD serviceability separately.
 * Never invents fake courier names, delivery times or shipping rates.
 */
export async function checkShipMaxxServiceability(
  params: ServiceabilityCheckParams,
): Promise<ServiceabilityResult> {
  const pin = params.deliveryPincode.trim();
  const pickup =
    params.pickupPincode || getShipMaxxConfig().pickupPincode || SHIPMAXX_DEFAULTS.PICKUP_PINCODE;

  // 1. Validate Indian 6-digit PIN code format
  if (!/^[1-9]\d{5}$/.test(pin)) {
    return {
      serviceable: false,
      deliveryPincode: pin,
      pickupPincode: pickup,
      codAvailable: false,
      rate: 0,
      providerStatus: isShipMaxxConfigured() ? "connected" : "pending_credentials",
      message: "Please enter a valid 6-digit Indian delivery PIN code.",
    };
  }

  // 2. If API credentials are not configured, return clear error without fake fallbacks
  if (!isShipMaxxConfigured()) {
    return {
      serviceable: false,
      deliveryPincode: pin,
      pickupPincode: pickup,
      codAvailable: false,
      rate: 0,
      providerStatus: "pending_credentials",
      message:
        "ShipMaxx360 logistics API is not configured. Please set SHIPMAXX360_BASE_URL and SHIPMAXX360_API_KEY in environment variables.",
    };
  }

  const config = getShipMaxxConfig();
  const isCod = params.paymentMode === "cod";

  try {
    const response = await fetch(`${config.baseUrl}/v1/serviceability`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
        ...(config.apiSecret ? { "X-API-Secret": config.apiSecret } : {}),
      },
      body: JSON.stringify({
        pickup_pincode: pickup,
        delivery_pincode: pin,
        weight: (params.weightGrams || SHIPMAXX_DEFAULTS.DEFAULT_WEIGHT_GRAMS) / 1000,
        cod: isCod ? 1 : 0,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return {
        serviceable: false,
        deliveryPincode: pin,
        pickupPincode: pickup,
        codAvailable: false,
        rate: 0,
        providerStatus: "connected",
        message: `ShipMaxx360 serviceability query failed (${response.status}): ${errText || "Pincode not serviceable"}`,
      };
    }

    const data = (await response.json()) as {
      serviceable?: boolean;
      courier_name?: string;
      estimated_days?: number;
      cod_available?: boolean;
      rate?: number;
    };

    const serviceable = Boolean(data.serviceable);
    const codAvailable = Boolean(data.cod_available ?? data.serviceable);

    // If customer selected COD but COD is not serviceable for this delivery pincode
    if (isCod && !codAvailable) {
      return {
        serviceable: false,
        deliveryPincode: pin,
        pickupPincode: pickup,
        courierPartner: data.courier_name,
        estimatedDays: data.estimated_days,
        codAvailable: false,
        rate: data.rate ?? 0,
        providerStatus: "connected",
        message:
          "Cash on Delivery (COD) is not available for this delivery pincode. Please select Online Payment.",
      };
    }

    return {
      serviceable,
      deliveryPincode: pin,
      pickupPincode: pickup,
      courierPartner: data.courier_name,
      estimatedDays: data.estimated_days,
      codAvailable,
      rate: data.rate ?? 0,
      providerStatus: "connected",
      message: serviceable
        ? undefined
        : "This delivery pincode is currently not serviceable by ShipMaxx360.",
    };
  } catch (error) {
    return {
      serviceable: false,
      deliveryPincode: pin,
      pickupPincode: pickup,
      codAvailable: false,
      rate: 0,
      providerStatus: "connected",
      message:
        error instanceof Error
          ? `ShipMaxx360 network error: ${error.message}`
          : "Failed to connect to ShipMaxx360 serviceability service.",
    };
  }
}

/**
 * Creates a shipment in ShipMaxx360 and records the shipment in Supabase.
 * Never invents fake AWB numbers or reports success unless confirmed by provider.
 */
export async function createShipMaxxShipment(
  params: CreateShipmentParams,
): Promise<ShipmentResponse> {
  const config = getShipMaxxConfig();
  const pickupPincode = config.pickupPincode || SHIPMAXX_DEFAULTS.PICKUP_PINCODE;
  const weightGrams = params.weightGrams || SHIPMAXX_DEFAULTS.DEFAULT_WEIGHT_GRAMS;
  const packageType = params.packageType || SHIPMAXX_DEFAULTS.DEFAULT_PACKAGE_TYPE;

  // 1. Prevent duplicate bookings: check if shipment already exists with an AWB
  const { data: existingShipment } = await supabaseAdmin
    .from("shipments")
    .select("id, awb_number, courier_partner, status, shipping_label_url")
    .eq("order_id", params.orderId)
    .maybeSingle();

  if (existingShipment && existingShipment.awb_number) {
    return {
      success: true,
      shipmentId: existingShipment.id,
      awbNumber: existingShipment.awb_number,
      courierPartner: existingShipment.courier_partner || undefined,
      labelUrl: existingShipment.shipping_label_url || undefined,
      status: existingShipment.status,
      providerStatus: isShipMaxxConfigured() ? "connected" : "pending_credentials",
    };
  }

  // 2. Reject if API credentials are not configured. Never fake AWBs!
  if (!isShipMaxxConfigured() || !config.apiKey) {
    return {
      success: false,
      status: "pending_credentials",
      providerStatus: "pending_credentials",
      error:
        "ShipMaxx360 logistics API credentials are not configured. Cannot create live carrier consignment without merchant API credentials.",
    };
  }

  // 3. Call official ShipMaxx360 API to book shipment
  try {
    const response = await fetch(`${config.baseUrl}/v1/shipments/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
        ...(config.apiSecret ? { "X-API-Secret": config.apiSecret } : {}),
      },
      body: JSON.stringify({
        order_id: params.orderNumber,
        pickup_pincode: pickupPincode,
        consignee: {
          name: params.customerName,
          phone: params.customerPhone,
          email: params.customerEmail,
          address: `${params.address.line1} ${params.address.line2 || ""}`.trim(),
          city: params.address.city,
          state: params.address.state,
          pincode: params.address.pincode,
        },
        package: {
          weight: weightGrams / 1000,
          package_type: packageType,
          items: params.items.map((i) => ({
            name: i.name,
            sku: `${i.name}-${i.size}-${i.color}`,
            qty: i.qty,
            price: i.price,
          })),
        },
        payment_type: params.paymentMode === "cod" ? "COD" : "PREPAID",
        cod_amount: params.paymentMode === "cod" ? params.codAmount || 0 : 0,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[ShipMaxx360] Shipment creation API error:", response.status, errorText);
      return {
        success: false,
        status: "failed",
        providerStatus: "connected",
        error: `ShipMaxx360 API rejected shipment creation (${response.status}): ${errorText}`,
      };
    }

    const data = (await response.json()) as {
      shipment_id?: string;
      awb_number?: string;
      courier_partner?: string;
      label_url?: string;
      status?: string;
    };

    if (!data.awb_number && !data.shipment_id) {
      return {
        success: false,
        status: "unconfirmed",
        providerStatus: "connected",
        error: "ShipMaxx360 API did not return an AWB or shipment reference.",
      };
    }

    const shipmaxxShipmentId = data.shipment_id || null;
    const awbNumber = data.awb_number || null;
    const courierPartner = data.courier_partner || null;
    const labelUrl = data.label_url || null;

    // 4. Record real verified shipment in Supabase
    const { data: createdShipment, error: insertErr } = await supabaseAdmin
      .from("shipments")
      .insert({
        order_id: params.orderId,
        user_id: params.userId || null,
        provider: "shipmaxx360",
        shipmaxx_shipment_id: shipmaxxShipmentId,
        order_number: params.orderNumber,
        awb_number: awbNumber,
        courier_partner: courierPartner,
        payment_mode: params.paymentMode,
        cod_amount: params.paymentMode === "cod" ? params.codAmount || 0 : 0,
        pickup_pincode: pickupPincode,
        delivery_pincode: params.address.pincode,
        package_weight_grams: weightGrams,
        package_type: packageType,
        status: "created",
        shipping_label_url: labelUrl,
        raw_response: data as unknown as Json,
      })
      .select("id")
      .single();

    if (insertErr) {
      console.error("[ShipMaxx360] Database insert failed for shipment:", insertErr);
    }

    // 5. Update order with verified shipment reference
    await supabaseAdmin
      .from("orders")
      .update({
        shipment_status: "shipment_created",
        shipmaxx_shipment_id: shipmaxxShipmentId,
        awb_number: awbNumber,
        courier_partner: courierPartner,
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.orderId);

    // 6. Record initial tracking entry
    if (awbNumber) {
      await supabaseAdmin.from("shipping_tracking").insert({
        shipment_id: createdShipment?.id || null,
        order_id: params.orderId,
        awb_number: awbNumber,
        current_status: "Manifest Created",
        status_location: `Dispatch Hub (${pickupPincode})`,
        activity: "Shipment registered with carrier. Manifest generated, awaiting courier pickup.",
        raw_data: data as unknown as Json,
      });
    }

    return {
      success: true,
      shipmentId: createdShipment?.id || undefined,
      awbNumber: awbNumber || undefined,
      courierPartner: courierPartner || undefined,
      labelUrl: labelUrl || undefined,
      status: "created",
      providerStatus: "connected",
    };
  } catch (err) {
    console.error("[ShipMaxx360] Network error during shipment creation:", err);
    return {
      success: false,
      status: "error",
      providerStatus: "connected",
      error: err instanceof Error ? err.message : "Failed to connect to ShipMaxx360 API.",
    };
  }
}

/**
 * Tracks shipment by AWB number or Order ID.
 */
export async function trackShipMaxxShipment(identifier: string) {
  const trimmed = identifier.trim();
  const config = getShipMaxxConfig();

  // 1. Fetch shipment from database
  const { data: shipment } = await supabaseAdmin
    .from("shipments")
    .select(
      "id, order_id, order_number, awb_number, courier_partner, status, pickup_pincode, delivery_pincode, created_at, updated_at",
    )
    .or(`awb_number.eq.${trimmed},order_number.eq.${trimmed}`)
    .maybeSingle();

  // 2. Fetch tracking event history from database
  let trackingHistory: Array<{
    current_status: string;
    status_location: string | null;
    status_time: string | null;
    activity: string | null;
  }> = [];

  if (shipment?.awb_number) {
    const { data: events } = await supabaseAdmin
      .from("shipping_tracking")
      .select("current_status, status_location, status_time, activity")
      .eq("awb_number", shipment.awb_number)
      .order("status_time", { ascending: false });

    if (events) trackingHistory = events;
  }

  // 3. If live API key is configured, query ShipMaxx360 tracking endpoint for live updates
  if (config.apiKey && shipment?.awb_number) {
    try {
      const response = await fetch(
        `${config.baseUrl}/v1/tracking/${encodeURIComponent(shipment.awb_number)}`,
        {
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
          },
        },
      );

      if (response.ok) {
        const liveData = (await response.json()) as {
          status?: string;
          location?: string;
          scans?: Array<{ status: string; location: string; time: string; activity: string }>;
        };

        if (liveData.scans && liveData.scans.length > 0) {
          trackingHistory = liveData.scans.map((s) => ({
            current_status: s.status,
            status_location: s.location,
            status_time: s.time,
            activity: s.activity,
          }));
        }
      }
    } catch (e) {
      console.warn("[ShipMaxx360] Live tracking fetch failed:", e);
    }
  }

  return {
    found: Boolean(shipment),
    shipment,
    history: trackingHistory,
    providerStatus: isShipMaxxConfigured() ? "connected" : "pending_credentials",
  };
}

/**
 * Verifies authenticity of inbound ShipMaxx360 webhooks.
 * Uses timing-safe evaluation of secret token or HMAC signature.
 */
export function verifyShipMaxxWebhookSignature(
  rawBody: string,
  signatureOrSecret: string,
): boolean {
  const webhookSecret = process.env["SHIPMAXX360_WEBHOOK_SECRET"];
  if (!webhookSecret || !signatureOrSecret) return false;

  // Method A: Direct secret token match (timing safe)
  try {
    const secretBuf = Buffer.from(webhookSecret, "utf8");
    const incomingBuf = Buffer.from(signatureOrSecret, "utf8");
    if (secretBuf.length === incomingBuf.length && timingSafeEqual(secretBuf, incomingBuf)) {
      return true;
    }
  } catch {
    // Buffer parsing or length comparison failed
  }

  // Method B: HMAC SHA-256 signature verification
  try {
    const expectedSig = createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
    const sigBuf = Buffer.from(signatureOrSecret, "utf8");
    const expectedBuf = Buffer.from(expectedSig, "utf8");
    if (sigBuf.length === expectedBuf.length && timingSafeEqual(sigBuf, expectedBuf)) {
      return true;
    }
  } catch {
    // Buffer parsing or signature length mismatch
  }

  return false;
}

/**
 * Processes incoming ShipMaxx360 shipping webhook events idempotently.
 * Maintains strictly separate payment and shipment statuses.
 */
export async function processShipMaxxWebhook(
  payload: {
    event_id?: string;
    id?: string;
    event: string;
    awb: string;
    order_id?: string;
    status: string;
    location?: string;
    timestamp?: string;
    activity?: string;
  },
  headerEventId?: string | null,
) {
  if (!payload.awb || !payload.status) {
    return {
      processed: false,
      reason: "Missing required AWB or status in shipping webhook payload",
    };
  }

  // Deterministic event ID for reliable idempotency
  const eventId =
    headerEventId ||
    payload.event_id ||
    payload.id ||
    `sm_${payload.event || "update"}_${payload.awb}_${payload.status}`;

  // Idempotency: log to shipping_webhook_events
  const { error: insertErr } = await supabaseAdmin.from("shipping_webhook_events").insert({
    event_id: eventId,
    provider: "shipmaxx360",
    event_type: payload.event || "status_update",
    awb_number: payload.awb,
    payload: payload as unknown as Json,
    processed: false,
  });

  if (insertErr && insertErr.code === "23505") {
    // Duplicate webhook event already recorded
    return { processed: true, duplicate: true };
  }

  // Map ShipMaxx360 event status to canonical CAVENHURST shipment status
  const statusMap: Record<string, string> = {
    PICKED_UP: "shipped",
    IN_TRANSIT: "in_transit",
    OUT_FOR_DELIVERY: "out_for_delivery",
    DELIVERED: "delivered",
    UNDELIVERED: "in_transit",
    RTO_INITIATED: "rto_initiated",
    RTO_DELIVERED: "rto_delivered",
    RETURN_REQUESTED: "return_requested",
    RETURNED: "returned",
  };

  const canonicalStatus = statusMap[payload.status.toUpperCase()] || payload.status.toLowerCase();

  // Update shipments table
  await supabaseAdmin
    .from("shipments")
    .update({
      status: canonicalStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("awb_number", payload.awb);

  // Update orders table - ONLY shipment_status, preserving payment_status!
  await supabaseAdmin
    .from("orders")
    .update({
      shipment_status: canonicalStatus,
      updated_at: new Date().toISOString(),
      ...(canonicalStatus === "delivered" ? { delivered_at: new Date().toISOString() } : {}),
      ...(canonicalStatus === "return_requested"
        ? { return_requested_at: new Date().toISOString() }
        : {}),
    })
    .eq("awb_number", payload.awb);

  // Insert tracking checkpoint
  await supabaseAdmin.from("shipping_tracking").insert({
    awb_number: payload.awb,
    current_status: payload.status,
    status_location: payload.location || null,
    status_time: payload.timestamp
      ? new Date(payload.timestamp).toISOString()
      : new Date().toISOString(),
    activity: payload.activity || `Shipment status updated to ${payload.status}`,
    raw_data: payload as unknown as Json,
  });

  // Mark event as processed
  await supabaseAdmin
    .from("shipping_webhook_events")
    .update({ processed: true })
    .eq("event_id", eventId);

  return { processed: true };
}
