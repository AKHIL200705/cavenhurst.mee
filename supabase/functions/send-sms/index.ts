// Supabase Edge Function: send-sms (MSG91 SMS Gateway for Supabase Auth Hook)
// Follows standard Webhook verification and delivers OTP via MSG91 Flow/OTP API.
import { Webhook } from "https://esm.sh/standard-webhooks@1.0.0";

interface HookPayload {
  user?: { phone?: string; id?: string };
  sms?: { otp?: string };
  phone?: string;
  otp?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const payload = await req.text();
  const headers = Object.fromEntries(req.headers.entries());

  // 1. Verify Hook Secret (if configured)
  const hookSecret =
    Deno.env.get("SEND_SMS_HOOK_SECRETS") ?? Deno.env.get("SEND_SMS_HOOK_SECRET") ?? "";
  if (hookSecret) {
    const rawSecret = hookSecret.startsWith("whsec_")
      ? hookSecret.slice(6)
      : hookSecret.startsWith("v1,whsec_")
        ? hookSecret.slice(9)
        : hookSecret;

    try {
      const wh = new Webhook(rawSecret);
      wh.verify(payload, headers);
    } catch (err) {
      console.error("[Send SMS Edge Function] Invalid signature:", err);
      return new Response(
        JSON.stringify({
          error: {
            http_code: 401,
            message: "Unauthorized: Invalid hook signature",
          },
        }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  // 2. Parse Payload
  let parsed: HookPayload;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return new Response(
      JSON.stringify({
        error: {
          http_code: 400,
          message: "Bad request: Malformed JSON",
        },
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const phone = parsed.user?.phone || parsed.phone;
  const otp = parsed.sms?.otp || parsed.otp;

  if (!phone || !otp) {
    return new Response(
      JSON.stringify({
        error: {
          http_code: 422,
          message: "Missing recipient phone or OTP code",
        },
      }),
      { status: 422, headers: { "Content-Type": "application/json" } },
    );
  }

  const authKey = Deno.env.get("MSG91_AUTH_KEY") ?? "";
  const senderId = Deno.env.get("MSG91_SENDER_ID") ?? "";
  const templateId = Deno.env.get("MSG91_DLT_TEMPLATE_ID") ?? "";

  if (!authKey || !templateId) {
    console.error("[Send SMS Edge Function] Missing MSG91_AUTH_KEY or MSG91_DLT_TEMPLATE_ID");
    return new Response(
      JSON.stringify({
        error: {
          http_code: 500,
          message: "MSG91 credentials not configured",
        },
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const digits = phone.replace(/\D/g, "");
  const normalizedPhone = digits.length === 10 ? `91${digits}` : digits;

  // 3. Deliver via MSG91 Flow API
  try {
    const flowRes = await fetch("https://control.msg91.com/api/v5/flow/", {
      method: "POST",
      headers: {
        authkey: authKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        template_id: templateId,
        ...(senderId ? { sender: senderId } : {}),
        short_url: "0",
        mobiles: normalizedPhone,
        otp,
        OTP: otp,
        VAR1: otp,
        code: otp,
      }),
    });

    const flowData = await flowRes.json().catch(() => ({}));
    if (flowRes.ok && (flowData.type === "success" || flowData.request_id)) {
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Fallback: SendOTP API
    const otpUrl = new URL("https://control.msg91.com/api/v5/otp");
    otpUrl.searchParams.set("template_id", templateId);
    otpUrl.searchParams.set("mobile", normalizedPhone);
    otpUrl.searchParams.set("otp", otp);
    if (senderId) otpUrl.searchParams.set("sender", senderId);

    const otpRes = await fetch(otpUrl.toString(), {
      method: "POST",
      headers: {
        authkey: authKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({ otp, OTP: otp }),
    });

    const otpData = await otpRes.json().catch(() => ({}));
    if (otpRes.ok && (otpData.type === "success" || otpData.request_id)) {
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        error: {
          http_code: 500,
          message: otpData.message || flowData.message || "Failed to deliver OTP via MSG91",
        },
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: {
          http_code: 500,
          message: err instanceof Error ? err.message : "Network failure",
        },
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
