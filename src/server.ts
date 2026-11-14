import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { processRazorpayWebhook, verifyRazorpayWebhookSignature } from "./server/razorpay";
import { processShipMaxxWebhook } from "./server/shipmaxx";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

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
 * Handles incoming webhooks for Razorpay and ShipMaxx360.
 */
async function handleWebhookRoute(request: Request, url: URL): Promise<Response | null> {
  // 1. Razorpay Payment Webhook
  if (url.pathname === "/api/webhooks/razorpay" && request.method === "POST") {
    try {
      const rawBody = await request.text();
      const signature = request.headers.get("x-razorpay-signature");

      // Verify webhook signature if webhook secret is configured
      if (process.env["RAZORPAY_WEBHOOK_SECRET"]) {
        if (!signature || !verifyRazorpayWebhookSignature(rawBody, signature)) {
          console.error("[Razorpay Webhook] Invalid signature rejected.");
          return new Response(JSON.stringify({ error: "Invalid webhook signature" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
      }

      const eventPayload = JSON.parse(rawBody);
      await processRazorpayWebhook(eventPayload);

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
      const payload = await request.json();
      await processShipMaxxWebhook(payload);

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

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const url = new URL(request.url);

      // Check for webhook endpoints first
      const webhookResponse = await handleWebhookRoute(request, url);
      if (webhookResponse) {
        return webhookResponse;
      }

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
