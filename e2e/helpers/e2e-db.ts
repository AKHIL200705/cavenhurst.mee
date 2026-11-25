import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

let cachedEnv: Record<string, string> | null = null;
let cachedSql: ReturnType<typeof postgres> | null = null;

export function getE2eEnv(): Record<string, string> {
  if (cachedEnv) return cachedEnv;
  const map: Record<string, string> = {};
  const envPath = path.resolve(process.cwd(), ".env");
  if (fs.existsSync(envPath)) {
    for (const rawLine of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const idx = line.indexOf("=");
      if (idx === -1) continue;
      const k = line.slice(0, idx).trim();
      const v = line
        .slice(idx + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
      if (k) map[k] = v;
    }
  }
  for (const [k, v] of Object.entries(process.env)) {
    if (typeof v === "string") map[k] = v;
  }
  cachedEnv = map;
  return map;
}

export function getE2eSql(): ReturnType<typeof postgres> {
  if (cachedSql) return cachedSql;
  const env = getE2eEnv();
  const dbUrl = env["DATABASE_URL"];
  if (!dbUrl) {
    throw new Error("DATABASE_URL must be configured in .env for E2E tests.");
  }
  cachedSql = postgres(dbUrl, {
    ssl: "require",
    max: 2,
    prepare: false,
    idle_timeout: 5,
    connect_timeout: 10,
  });
  return cachedSql;
}

export async function closeE2eSql(): Promise<void> {
  if (cachedSql) {
    const instance = cachedSql;
    cachedSql = null;
    await instance.end({ timeout: 2 }).catch(() => {});
  }
}

export function getE2eSessionSecret(): string {
  const env = getE2eEnv();
  return (
    env["SESSION_SECRET"] ||
    env["SUPABASE_SERVICE_ROLE_KEY"] ||
    env["SUPABASE_SECRET_KEY"] ||
    env["GOOGLE_CLIENT_SECRET"] ||
    "368069d30cacfa9c1d616cd3c887b86708d39fd35ed882dfaa4d3290a47937c0"
  );
}

export function signE2eSessionToken(params: {
  sub: string;
  email: string;
  name: string;
  isAdmin: boolean;
}): string {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: params.sub,
    email: params.email,
    name: params.name,
    picture: null,
    isAdmin: params.isAdmin,
    iat: now,
    exp: now + 3600,
  };
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const data = `${header}.${body}`;
  const sig = crypto.createHmac("sha256", getE2eSessionSecret()).update(data).digest("base64url");
  return `${data}.${sig}`;
}

export function solveSixDigitOtpFromHash(email: string, expectedHash: string): string {
  const env = getE2eEnv();
  const salt = (env["SESSION_SECRET"] || "cavenhurst_default_secret_salt").slice(0, 32);
  const cleanEmail = email.toLowerCase().trim();

  for (let code = 100000; code <= 999999; code++) {
    const candidate = String(code);
    const digest = crypto
      .createHmac("sha256", salt)
      .update(`${cleanEmail}:${candidate}`)
      .digest("hex");
    if (digest === expectedHash) {
      return candidate;
    }
  }
  throw new Error(`Could not resolve 6-digit OTP matching stored hash for ${cleanEmail}`);
}

export function signRazorpayWebhookBody(rawBody: string): string {
  const env = getE2eEnv();
  const secret = env["RAZORPAY_WEBHOOK_SECRET"] || "cavenhurst_e2e_razorpay_webhook_secret";
  return crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
}

export async function waitForOtpHash(
  email: string,
  purpose: "registration" | "forgot_password" = "registration",
  timeoutMs = 15_000,
): Promise<string> {
  const sql = getE2eSql();
  const clean = email.toLowerCase().trim();
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const rows = await sql<{ otp_hash: string }[]>`
      SELECT otp_hash
      FROM public.email_verification_otps
      WHERE lower(email) = ${clean} AND purpose = ${purpose}
      ORDER BY created_at DESC
      LIMIT 1
    `;
    if (rows[0]?.otp_hash) {
      return rows[0].otp_hash;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Timed out waiting for OTP hash in email_verification_otps for ${clean}`);
}

export async function clearUpstashE2eKeys(email: string, regKey?: string): Promise<void> {
  const env = getE2eEnv();
  const url = env["UPSTASH_REDIS_REST_URL"];
  const token = env["UPSTASH_REDIS_REST_TOKEN"];
  if (!url || !token) return;

  const clean = email.toLowerCase().trim();
  const keys = [
    `cavenhurst:otp:registration:${clean}`,
    `cavenhurst:cooldown:registration:${clean}`,
    `cavenhurst:resend_count:registration:${clean}`,
  ];
  if (regKey) keys.push(`cavenhurst:reg:${regKey}`);

  try {
    await fetch(`${url.replace(/\/+$/, "")}/del/${keys.map(encodeURIComponent).join("/")}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    /* ignore cleanup errors */
  }
}

export async function cleanupE2eUser(email: string, regKey?: string): Promise<void> {
  const sql = getE2eSql();
  const clean = email.toLowerCase().trim();

  await clearUpstashE2eKeys(clean, regKey);
  await sql`DELETE FROM public.email_verification_otps WHERE lower(email) = ${clean}`.catch(
    () => {},
  );
  const users = await sql<{ id: string }[]>`
    SELECT id FROM auth.users WHERE lower(email) = ${clean}
  `.catch(() => []);

  for (const u of users) {
    await sql`DELETE FROM public.customer_welcome WHERE user_id = ${u.id}`.catch(() => {});
    await sql`DELETE FROM public.cart_items WHERE cart_id IN (SELECT id FROM public.carts WHERE customer_auth_uid = ${u.id} OR customer_id IN (SELECT id FROM public.customers WHERE id = ${u.id}::uuid OR lower(email) = ${clean}))`.catch(
      () => {},
    );
    await sql`DELETE FROM public.carts WHERE customer_auth_uid = ${u.id} OR customer_id IN (SELECT id FROM public.customers WHERE id = ${u.id}::uuid OR lower(email) = ${clean})`.catch(
      () => {},
    );
    await sql`DELETE FROM public.wishlist_items WHERE wishlist_id IN (SELECT id FROM public.wishlists WHERE customer_auth_uid = ${u.id} OR customer_id IN (SELECT id FROM public.customers WHERE id = ${u.id}::uuid OR lower(email) = ${clean}))`.catch(
      () => {},
    );
    await sql`DELETE FROM public.wishlists WHERE customer_auth_uid = ${u.id} OR customer_id IN (SELECT id FROM public.customers WHERE id = ${u.id}::uuid OR lower(email) = ${clean})`.catch(
      () => {},
    );
    await sql`DELETE FROM public.customer_addresses WHERE customer_id = ${u.id}::uuid OR customer_auth_uid = ${u.id}`.catch(
      () => {},
    );
    await sql`DELETE FROM public.customers WHERE id = ${u.id}::uuid OR lower(email) = ${clean}`.catch(
      () => {},
    );
    await sql`DELETE FROM public.profiles WHERE id = ${u.id}::uuid OR lower(email) = ${clean}`.catch(
      () => {},
    );
    await sql`DELETE FROM auth.users WHERE id = ${u.id}::uuid`.catch(() => {});
  }
}

export async function cleanupE2eOrder(
  orderId: string,
  webhookEventIds: string[] = [],
): Promise<void> {
  const sql = getE2eSql();
  await sql`DELETE FROM public.admin_audit_logs WHERE target_id = ${orderId}`.catch(() => {});
  await sql`DELETE FROM public.shipping_tracking WHERE order_id = ${orderId}::uuid`.catch(() => {});
  await sql`DELETE FROM public.shipment_tracking_events WHERE order_id = ${orderId}::uuid`.catch(
    () => {},
  );
  await sql`DELETE FROM public.shipments WHERE order_id = ${orderId}::uuid`.catch(() => {});
  await sql`DELETE FROM public.payment_refunds WHERE order_id = ${orderId}::uuid`.catch(() => {});
  await sql`DELETE FROM public.refunds WHERE order_id = ${orderId}::uuid`.catch(() => {});
  await sql`DELETE FROM public.payments WHERE order_id = ${orderId}::uuid`.catch(() => {});
  await sql`DELETE FROM public.order_status_history WHERE order_id = ${orderId}::uuid`.catch(
    () => {},
  );
  await sql`DELETE FROM public.order_addresses WHERE order_id = ${orderId}::uuid`.catch(() => {});
  await sql`DELETE FROM public.shipping_addresses WHERE order_id = ${orderId}::uuid`.catch(
    () => {},
  );
  await sql`DELETE FROM public.inventory_reservations WHERE order_id = ${orderId}::uuid`.catch(
    () => {},
  );
  await sql`DELETE FROM public.coupon_redemptions WHERE order_id = ${orderId}::uuid`.catch(
    () => {},
  );
  await sql`DELETE FROM public.order_items WHERE order_id = ${orderId}::uuid`.catch(() => {});
  await sql`DELETE FROM public.orders WHERE id = ${orderId}::uuid`.catch(() => {});
  for (const evtId of webhookEventIds) {
    await sql`DELETE FROM public.payment_webhook_events WHERE event_id = ${evtId}`.catch(() => {});
  }
}
