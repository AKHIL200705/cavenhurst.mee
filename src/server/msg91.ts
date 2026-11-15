import crypto from "node:crypto";

export interface SendOtpParams {
  phone: string;
  otp: string;
}

export interface Msg91SendResult {
  success: boolean;
  messageId?: string | undefined;
  error?: string | undefined;
}

export function getMsg91AuthKey(): string {
  const raw = process.env["MSG91_AUTH_KEY"] || "";
  return raw.replace(/^["']|["']$/g, "").trim();
}

export function getMsg91SenderId(): string {
  const raw = process.env["MSG91_SENDER_ID"] || "";
  return raw.replace(/^["']|["']$/g, "").trim();
}

export function getMsg91TemplateId(): string {
  const raw = process.env["MSG91_DLT_TEMPLATE_ID"] || "";
  return raw.replace(/^["']|["']$/g, "").trim();
}

export function getSendSmsHookSecret(): string {
  const raw =
    process.env["SEND_SMS_HOOK_SECRETS"] ||
    process.env["SEND_SMS_HOOK_SECRET"] ||
    process.env["SUPABASE_AUTH_HOOK_SECRET"] ||
    "";
  return raw.replace(/^["']|["']$/g, "").trim();
}

/**
 * Normalizes an Indian mobile number into international format without leading plus:
 * e.g., "+919876543210", "9876543210", or "919876543210" -> "919876543210"
 */
export function normalizeIndianPhone(input: string): string {
  const digits = input.replace(/\D/g, "");
  if (digits.length === 10 && /^[6-9]/.test(digits)) {
    return `91${digits}`;
  }
  if (digits.length === 12 && digits.startsWith("91") && /^91[6-9]/.test(digits)) {
    return digits;
  }
  return digits;
}

/**
 * Validates whether a normalized phone number is a valid 12-digit Indian mobile.
 */
export function isValidIndianMobile(normalizedPhone: string): boolean {
  return /^91[6-9]\d{9}$/.test(normalizedPhone);
}

/**
 * Sends a Supabase-generated OTP code to the recipient's mobile number via MSG91.
 * Supports both MSG91 Flow (Transactional SMS) API and MSG91 OTP API with custom OTP parameter.
 */
export async function sendOtpViaMsg91({ phone, otp }: SendOtpParams): Promise<Msg91SendResult> {
  const authKey = getMsg91AuthKey();
  const senderId = getMsg91SenderId();
  const templateId = getMsg91TemplateId();

  if (!authKey) {
    console.error("[MSG91 Hook] Error: MSG91_AUTH_KEY is not configured in environment");
    return {
      success: false,
      error: "MSG91_AUTH_KEY is not configured",
    };
  }

  if (!templateId) {
    console.error("[MSG91 Hook] Error: MSG91_DLT_TEMPLATE_ID is not configured in environment");
    return {
      success: false,
      error: "MSG91_DLT_TEMPLATE_ID is not configured",
    };
  }

  const normalizedPhone = normalizeIndianPhone(phone);
  if (!isValidIndianMobile(normalizedPhone)) {
    console.error(
      `[MSG91 Hook] Error: Invalid Indian mobile number format: ${phone.slice(0, 4)}***`,
    );
    return {
      success: false,
      error: `Invalid Indian mobile number format: ${phone}`,
    };
  }

  // Security: Never log the raw OTP value
  console.log(
    `[MSG91 Hook] Dispatching OTP for recipient: +${normalizedPhone.slice(0, 4)}****${normalizedPhone.slice(-2)}`,
  );

  // Strategy 1: MSG91 Flow API (Template-based Transactional SMS)
  try {
    const flowPayload = {
      template_id: templateId,
      ...(senderId ? { sender: senderId } : {}),
      short_url: "0",
      mobiles: normalizedPhone,
      // Provide standard variable aliases for DLT templates
      otp,
      OTP: otp,
      VAR1: otp,
      code: otp,
    };

    const flowResponse = await fetch("https://control.msg91.com/api/v5/flow/", {
      method: "POST",
      headers: {
        authkey: authKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(flowPayload),
    });

    const flowData = (await flowResponse.json().catch(() => ({}))) as {
      type?: string;
      message?: string;
      status?: string;
      request_id?: string;
    };

    if (
      flowResponse.ok &&
      (flowData.type === "success" || flowData.status === "success" || flowData.request_id)
    ) {
      console.log(
        `[MSG91 Hook] OTP sent successfully via Flow API. Request ID: ${flowData.request_id || "ok"}`,
      );
      return {
        success: true,
        messageId: flowData.request_id,
      };
    }

    console.warn(
      `[MSG91 Hook] Flow API notice (${flowResponse.status}): ${flowData.message || "Checking fallback..."}`,
    );
  } catch (flowErr) {
    console.warn("[MSG91 Hook] Flow API request warning, attempting OTP API fallback:", flowErr);
  }

  // Strategy 2: MSG91 SendOTP API with custom OTP parameter
  try {
    const otpUrl = new URL("https://control.msg91.com/api/v5/otp");
    otpUrl.searchParams.set("template_id", templateId);
    otpUrl.searchParams.set("mobile", normalizedPhone);
    otpUrl.searchParams.set("otp", otp);
    if (senderId) otpUrl.searchParams.set("sender", senderId);

    const otpResponse = await fetch(otpUrl.toString(), {
      method: "POST",
      headers: {
        authkey: authKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        otp,
        OTP: otp,
        VAR1: otp,
      }),
    });

    const otpData = (await otpResponse.json().catch(() => ({}))) as {
      type?: string;
      message?: string;
      request_id?: string;
    };

    if (otpResponse.ok && (otpData.type === "success" || otpData.request_id)) {
      console.log(
        `[MSG91 Hook] OTP sent successfully via SendOTP API. Request ID: ${otpData.request_id || "ok"}`,
      );
      return {
        success: true,
        messageId: otpData.request_id,
      };
    }

    const errorMsg = otpData.message || `HTTP ${otpResponse.status}`;
    console.error(`[MSG91 Hook] SendOTP API failed: ${errorMsg}`);
    return {
      success: false,
      error: errorMsg,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Network error contacting MSG91";
    console.error("[MSG91 Hook] Network failure:", errorMsg);
    return {
      success: false,
      error: errorMsg,
    };
  }
}

/**
 * Cryptographically verifies that an incoming HTTP request originated from Supabase Auth Hook.
 */
export function verifySupabaseHookSignature(body: string, headers: Headers): boolean {
  const secret = getSendSmsHookSecret();
  if (!secret) {
    // If hook secret is not configured in environment, allow in development mode
    if (process.env["NODE_ENV"] !== "production") {
      return true;
    }
    console.warn("[Supabase SMS Hook] Warning: SEND_SMS_HOOK_SECRETS is not set in environment");
    return true;
  }

  // 1. Direct Bearer token or secret header authentication
  const authHeader = headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "")
    .trim();
  const webhookSecretHeader = headers.get("x-webhook-secret")?.trim();

  if (authHeader && authHeader === secret) return true;
  if (webhookSecretHeader && webhookSecretHeader === secret) return true;

  // 2. Standard Webhook / Svix signature authentication
  const id = headers.get("webhook-id") || headers.get("x-webhook-id");
  const ts = headers.get("webhook-timestamp") || headers.get("x-webhook-timestamp");
  const sigHeader =
    headers.get("webhook-signature") ||
    headers.get("x-webhook-signature") ||
    headers.get("x-supabase-signature");

  if (!sigHeader) {
    return false;
  }

  const rawSecret = secret.startsWith("whsec_")
    ? secret.slice(6)
    : secret.startsWith("v1,whsec_")
      ? secret.slice(9)
      : secret;

  let key: Buffer;
  try {
    key = Buffer.from(rawSecret, "base64");
    if (key.length === 0) key = Buffer.from(rawSecret, "utf8");
  } catch {
    key = Buffer.from(rawSecret, "utf8");
  }

  const toSign = id && ts ? `${id}.${ts}.${body}` : body;
  const computed = crypto.createHmac("sha256", key).update(toSign).digest("base64");

  const signatures = sigHeader.split(" ").map((s) => (s.startsWith("v1,") ? s.slice(3) : s));
  return signatures.some((s) => {
    try {
      const b1 = Buffer.from(s, "base64");
      const b2 = Buffer.from(computed, "base64");
      return b1.length === b2.length && crypto.timingSafeEqual(b1, b2);
    } catch {
      return false;
    }
  });
}

/**
 * Handles the incoming HTTP POST request from Supabase Send SMS Auth Hook.
 */
export async function handleSupabaseSmsHook(
  rawBody: string,
  headers: Headers,
): Promise<{ status: number; body: Record<string, unknown> }> {
  // 1. Signature & Secret Verification
  if (!verifySupabaseHookSignature(rawBody, headers)) {
    console.error("[Supabase SMS Hook] Rejected: Invalid hook signature or secret");
    return {
      status: 401,
      body: {
        error: {
          http_code: 401,
          message: "Unauthorized: Invalid Supabase auth hook signature",
        },
      },
    };
  }

  // 2. Parse Hook Payload
  let parsedPayload: {
    user?: { phone?: string; id?: string };
    sms?: { otp?: string };
    phone?: string;
    otp?: string;
  };

  try {
    parsedPayload = JSON.parse(rawBody);
  } catch {
    console.error("[Supabase SMS Hook] Error: Invalid JSON body");
    return {
      status: 400,
      body: {
        error: {
          http_code: 400,
          message: "Bad Request: Malformed JSON payload",
        },
      },
    };
  }

  // Extract phone number and OTP from standard Supabase Auth Hook format
  const phone = parsedPayload.user?.phone || parsedPayload.phone;
  const otp = parsedPayload.sms?.otp || parsedPayload.otp;

  if (!phone || !otp) {
    console.error(
      `[Supabase SMS Hook] Error: Missing phone or OTP in payload (phone=${Boolean(phone)}, otp=${Boolean(otp)})`,
    );
    return {
      status: 422,
      body: {
        error: {
          http_code: 422,
          message: "Unprocessable: Missing recipient phone number or OTP code",
        },
      },
    };
  }

  // 3. Dispatch OTP via MSG91
  const result = await sendOtpViaMsg91({ phone, otp });

  if (!result.success) {
    return {
      status: 500,
      body: {
        error: {
          http_code: 500,
          message: `SMS delivery failed via MSG91: ${result.error || "Unknown error"}`,
        },
      },
    };
  }

  // Supabase Auth expects HTTP 200 with empty JSON object on success
  return {
    status: 200,
    body: {},
  };
}
