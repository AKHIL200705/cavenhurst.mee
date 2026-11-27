import "./lib/error-capture";

import defaultServerEntry, { createServerEntry } from "@tanstack/react-start/server-entry";
import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { processRazorpayWebhook, verifyRazorpayWebhookSignature } from "./server/razorpay";
import { processShipMaxxWebhook, verifyShipMaxxWebhookSignature } from "./server/shipmaxx";
import {
  processSendOtpApi,
  processVerifyOtpApi,
  processResendOtpApi,
} from "./server/auth-api.server";
import { generateRobotsTxt, generateSitemapXml } from "./server/seo";

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

/**
 * Handles incoming webhooks for Razorpay and ShipMaxx360 with strict cryptographic authentication.
 */
async function handleWebhookRoute(request: Request, url: URL): Promise<Response | null> {
  // 1. Razorpay Payment Webhook
  if (url.pathname === "/api/webhooks/razorpay" && request.method === "POST") {
    try {
      const rawBody = await request.text();
      const signature = request.headers.get("x-razorpay-signature");
      const eventIdHeader = request.headers.get("x-razorpay-event-id");

      // Webhook authenticity verification: reject unsigned or invalid requests
      if (!signature) {
        console.error("[Razorpay Webhook] Rejected: Missing x-razorpay-signature header");
        return new Response(JSON.stringify({ error: "Missing x-razorpay-signature header" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (!verifyRazorpayWebhookSignature(rawBody, signature)) {
        console.error("[Razorpay Webhook] Rejected: Invalid cryptographic HMAC signature");
        return new Response(JSON.stringify({ error: "Invalid webhook signature" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }

      const eventPayload = JSON.parse(rawBody);
      await processRazorpayWebhook(eventPayload, eventIdHeader);

      return new Response(JSON.stringify({ status: "success" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error("[Razorpay Webhook] Error processing event:", err);
      return new Response(JSON.stringify({ error: "Internal webhook handler error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // 2. ShipMaxx360 Shipping Webhook
  if (url.pathname === "/api/webhooks/shipmaxx360" && request.method === "POST") {
    try {
      const rawBody = await request.text();
      const signatureHeader =
        request.headers.get("x-shipmaxx-signature") ||
        request.headers.get("x-signature") ||
        request.headers.get("x-webhook-secret") ||
        request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
      const eventIdHeader =
        request.headers.get("x-shipmaxx-event-id") || request.headers.get("x-event-id");

      // Webhook authenticity verification: reject unsigned or invalid requests
      if (!signatureHeader) {
        console.error("[ShipMaxx360 Webhook] Rejected: Missing authentication header");
        return new Response(
          JSON.stringify({ error: "Missing webhook authentication signature or token header" }),
          {
            status: 401,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      if (!verifyShipMaxxWebhookSignature(rawBody, signatureHeader)) {
        console.error("[ShipMaxx360 Webhook] Rejected: Invalid signature or secret token");
        return new Response(
          JSON.stringify({ error: "Unauthorized: Invalid webhook signature or token" }),
          {
            status: 401,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      const payload = JSON.parse(rawBody);
      await processShipMaxxWebhook(payload, eventIdHeader);

      return new Response(JSON.stringify({ status: "success" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error("[ShipMaxx360 Webhook] Error processing event:", err);
      return new Response(JSON.stringify({ error: "Internal shipping webhook error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  return null;
}

/**
 * Handles REST API authentication endpoints (/api/auth/send-otp, verify-otp, resend-otp, register)
 */
async function handleAuthApiRoute(request: Request, url: URL): Promise<Response | null> {
  const pathname = url.pathname.replace(/\/+$/, "");

  if (request.method !== "POST") return null;

  if (pathname === "/api/auth/send-otp" || pathname === "/api/auth/register") {
    try {
      const body = await request.json().catch(() => ({}));
      const result = await processSendOtpApi(body);
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to send verification code";
      return new Response(JSON.stringify({ success: false, error: msg }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  if (pathname === "/api/auth/verify-otp") {
    try {
      const body = await request.json().catch(() => ({}));
      const result = await processVerifyOtpApi(body);
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Invalid registration key. Please request a new verification code.";
      return new Response(JSON.stringify({ success: false, error: msg }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  if (pathname === "/api/auth/resend-otp") {
    try {
      const body = await request.json().catch(() => ({}));
      const result = await processResendOtpApi(body);
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to resend verification code";
      return new Response(JSON.stringify({ success: false, error: msg }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  return null;
}

async function handleSeoRoute(request: Request, url: URL): Promise<Response | null> {
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  const pathname = url.pathname.replace(/\/+$/, "") || "/";
  const proto =
    request.headers.get("x-forwarded-proto") || url.protocol.replace(":", "") || "https";
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || url.host;
  const origin = host ? `${proto}://${host}` : url.origin;

  if (pathname === "/sitemap.xml") {
    const xml = await generateSitemapXml(origin);
    return new Response(request.method === "HEAD" ? null : xml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    });
  }

  if (pathname === "/robots.txt") {
    const txt = generateRobotsTxt(origin);
    return new Response(request.method === "HEAD" ? null : txt, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    });
  }

  return null;
}

export default createServerEntry({
  async fetch(request, opts) {
    try {
      const url = new URL(request.url);

      // Dynamic sitemap.xml & robots.txt for search engines
      const seoResponse = await handleSeoRoute(request, url);
      if (seoResponse) {
        return seoResponse;
      }

      // Webhook route interceptor (handles raw body extraction before framework parser)
      const webhookResponse = await handleWebhookRoute(request, url);
      if (webhookResponse) {
        return webhookResponse;
      }

      // REST Auth API route interceptor (/api/auth/send-otp, verify-otp, resend-otp, register)
      const authApiResponse = await handleAuthApiRoute(request, url);
      if (authApiResponse) {
        return authApiResponse;
      }

      const response = await defaultServerEntry.fetch(request, opts);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
});
