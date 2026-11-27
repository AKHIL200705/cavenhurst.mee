// @vitest-environment node
import { createHmac } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, afterEach, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.resetModules();
});

describe("Step 1-2 Security Hardening Tests", () => {
  it("fails closed when SESSION_SECRET and service role key are unset in auth-helpers", async () => {
    delete process.env["SESSION_SECRET"];
    delete process.env["SUPABASE_SERVICE_ROLE_KEY"];
    delete process.env["SUPABASE_SECRET_KEY"];

    const { signSessionToken } = await import("@/server/auth-helpers");
    await expect(
      signSessionToken({
        sub: "u1",
        email: "user@example.com",
        name: "Test",
        picture: null,
        isAdmin: false,
      }),
    ).rejects.toThrow(/SESSION_SECRET/i);
  });

  it("rejects unsigned alg=none and forged JWT tokens in verifySessionToken", async () => {
    process.env["SESSION_SECRET"] = "test-session-secret-32-chars-minimum-1234";
    const { signSessionToken, verifySessionToken } = await import("@/server/auth-helpers");

    const validToken = await signSessionToken({
      sub: "admin-1",
      email: "admin@cavenhusrt.com",
      name: "Admin",
      picture: null,
      isAdmin: true,
    });
    const verified = await verifySessionToken(validToken);
    expect(verified?.email).toBe("admin@cavenhusrt.com");
    expect(verified?.isAdmin).toBe(true);

    // Unsigned alg:none attack token
    const h = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const p = Buffer.from(
      JSON.stringify({
        sub: "admin-1",
        email: "akhilsaiabbireddy2007@gmail.com",
        isAdmin: true,
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString("base64url");
    expect(await verifySessionToken(`${h}.${p}.fakesig`)).toBeNull();
    expect(await verifySessionToken(`${validToken}tamper`)).toBeNull();
  });

  it("fails closed in supabaseAdmin client when SUPABASE_SERVICE_ROLE_KEY is missing", async () => {
    process.env["SUPABASE_URL"] = "https://example.supabase.co";
    delete process.env["SUPABASE_SERVICE_ROLE_KEY"];
    delete process.env["SUPABASE_SECRET_KEY"];
    delete process.env["SUPABASE_SERVICE_KEY"];
    delete process.env["SUPABASE_SECRET"];

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    expect(() => supabaseAdmin.from("orders")).toThrow(/SUPABASE_SERVICE_ROLE_KEY/i);
  });

  it("refuses hardcoded DB password fallback in db.ts when DATABASE_URL is absent", async () => {
    const dbSrc = fs.readFileSync(path.resolve("src/server/db.ts"), "utf8");
    expect(dbSrc).not.toMatch(/cavenhurst%40123|cavenhurst@123|368069d30cacfa9c/);

    const authHelpersSrc = fs.readFileSync(path.resolve("src/server/auth-helpers.ts"), "utf8");
    expect(authHelpersSrc).not.toMatch(/368069d30cacfa9c/);

    const otpSrc = fs.readFileSync(path.resolve("src/server/otp.ts"), "utf8");
    expect(otpSrc).not.toMatch(/cavenhurst_registration_secret_encryption_salt_key_32b/);
    expect(otpSrc).not.toMatch(/cavenhurst_default_secret_salt/);
  });

  it("encrypts and decrypts pending OTP passwords with domain-separated keys & rejects missing secrets", async () => {
    process.env["SESSION_SECRET"] = "test-otp-secret-key-for-aes-gcm-123456";
    const { encryptPendingPassword, decryptPendingPassword, hashOtp } =
      await import("@/server/otp");

    const encrypted = encryptPendingPassword("StrongPass#2026");
    expect(encrypted.split(":")).toHaveLength(3);
    expect(encrypted).not.toContain("StrongPass");
    expect(decryptPendingPassword(encrypted)).toBe("StrongPass#2026");

    const h1 = hashOtp("123456", "User@Example.com");
    const h2 = hashOtp("123456", "user@example.com");
    expect(h1).toBe(h2);

    delete process.env["SESSION_SECRET"];
    delete process.env["SUPABASE_SERVICE_ROLE_KEY"];
    delete process.env["SUPABASE_SECRET_KEY"];
    expect(() => hashOtp("123456", "user@example.com")).toThrow(/SESSION_SECRET/i);
  });

  it("verifies Razorpay payment & webhook HMAC signatures and fails closed on missing secrets", async () => {
    process.env["RAZORPAY_KEY_SECRET"] = "rzp_test_secret_123";
    process.env["RAZORPAY_WEBHOOK_SECRET"] = "rzp_webhook_secret_456";
    const { verifyRazorpaySignature, verifyRazorpayWebhookSignature } =
      await import("@/server/razorpay");

    const sig = createHmac("sha256", "rzp_test_secret_123")
      .update("order_ABC|pay_XYZ")
      .digest("hex");
    expect(
      verifyRazorpaySignature({
        razorpayOrderId: "order_ABC",
        razorpayPaymentId: "pay_XYZ",
        razorpaySignature: sig,
      }),
    ).toBe(true);
    expect(
      verifyRazorpaySignature({
        razorpayOrderId: "order_ABC",
        razorpayPaymentId: "pay_XYZ",
        razorpaySignature: sig.replace(/^./, sig[0] === "a" ? "b" : "a"),
      }),
    ).toBe(false);

    const rawBody = JSON.stringify({ event: "payment.captured" });
    const whSig = createHmac("sha256", "rzp_webhook_secret_456").update(rawBody).digest("hex");
    expect(verifyRazorpayWebhookSignature(rawBody, whSig)).toBe(true);
    expect(verifyRazorpayWebhookSignature(rawBody, "wrong-sig")).toBe(false);

    delete process.env["RAZORPAY_WEBHOOK_SECRET"];
    expect(verifyRazorpayWebhookSignature(rawBody, whSig)).toBe(false);
  });

  it("verifies ShipMaxx360 webhook token/HMAC signatures timing-safely", async () => {
    process.env["SHIPMAXX360_WEBHOOK_SECRET"] = "smx_secret_789";
    const { verifyShipMaxxWebhookSignature } = await import("@/server/shipmaxx");

    const raw = JSON.stringify({ awb: "SMX123", status: "DELIVERED" });
    const hmacSig = createHmac("sha256", "smx_secret_789").update(raw).digest("hex");

    expect(verifyShipMaxxWebhookSignature(raw, "smx_secret_789")).toBe(true);
    expect(verifyShipMaxxWebhookSignature(raw, hmacSig)).toBe(true);
    expect(verifyShipMaxxWebhookSignature(raw, "invalid_secret")).toBe(false);
  });

  it("prevents client JS bundles from embedding hardcoded admin emails or unsigned JWT fallbacks", () => {
    const adminServerSrc = fs.readFileSync(path.resolve("src/server/admin.ts"), "utf8");
    expect(adminServerSrc).not.toMatch(/Parse unencrypted JWT claims/);
    expect(adminServerSrc).not.toMatch(/admin_root/);

    const gateSrc = fs.readFileSync(path.resolve("src/components/admin/AdminAuthGate.tsx"), "utf8");
    expect(gateSrc).not.toMatch(/akhilsaiabbireddy2007@gmail\.com/);
    expect(gateSrc).not.toMatch(/assign_admin_role_by_email/);

    const adminRouteSrc = fs.readFileSync(path.resolve("src/routes/admin.tsx"), "utf8");
    expect(adminRouteSrc).not.toMatch(/akhilsaiabbireddy2007@gmail\.com/);
  });
});

describe("Step 3-5 Data Integrity, RLS Draft & Checkout Hardening Tests", () => {
  it("parses product live_stock maps safely and ignores char-spread/malformed entries", async () => {
    const { parseStockMap } = await import("@/server/inventory");

    expect(parseStockMap({ S: 5, "0": 99, L: "4", XL: "bad", XXL: 2 })).toEqual({
      S: 5,
      L: 4,
      XXL: 2,
    });
    expect(parseStockMap('{"M": 8, "L": 1}')).toEqual({ M: 8, L: 1 });
    expect(parseStockMap("{invalid-json")).toEqual({});
    expect(parseStockMap(null)).toEqual({});
  });

  it("avoids PostgREST .or() filter interpolation in trackShipMaxxShipment and reads shipment_tracking_events", async () => {
    const orCalls: unknown[] = [];
    const eqCalls: Array<[string, string, unknown]> = [];

    const makeBuilder = (table: string) => {
      const builder = {
        select: () => builder,
        eq: (col: string, val: unknown) => {
          eqCalls.push([table, col, val]);
          return builder;
        },
        or: (expr: string) => {
          orCalls.push({ table, expr });
          return builder;
        },
        order: () => builder,
        limit: () => builder,
        maybeSingle: async () => {
          if (table === "shipments") {
            return {
              data: {
                id: "ship-1",
                order_id: "ord-1",
                awb_number: "SMX123",
                shipmaxx_shipment_id: "EXT123",
                courier_partner: "Delhivery",
                status: "in_transit",
              },
              error: null,
            };
          }
          if (table === "orders") {
            return { data: null, error: null };
          }
          return { data: null, error: null };
        },
        then: (resolve: (val: { data: unknown[]; error: null }) => void) => {
          if (table === "shipment_tracking_events") {
            resolve({
              data: [
                {
                  status: "in_transit",
                  location: "Hyderabad Hub",
                  details: "Dispatched",
                  event_time: "2026-11-26T05:00:00Z",
                },
              ],
              error: null,
            });
            return;
          }
          resolve({ data: [], error: null });
        },
      };
      return builder;
    };

    vi.doMock("@/server/db", () => ({ getDb: () => null }));
    vi.doMock("@/integrations/supabase/client.server", () => ({
      supabaseAdmin: {
        from: (table: string) => makeBuilder(table),
      },
    }));

    const { trackShipMaxxShipment } = await import("@/server/shipmaxx");
    const maliciousAwb = "SMX123,id.neq.00000000-0000-0000-0000-000000000000";
    const result = await trackShipMaxxShipment(maliciousAwb);

    expect(orCalls).toEqual([]);
    expect(
      eqCalls.some(
        ([t, col, v]) =>
          t === "shipments" &&
          col === "awb_number" &&
          typeof v === "string" &&
          v.length > 0 &&
          !v.includes(",") &&
          !v.includes("."),
      ),
    ).toBe(true);
    expect(eqCalls.some(([t]) => t === "shipment_tracking_events")).toBe(true);
    expect(result.found).toBe(true);
    expect(result.shipment?.status).toBe("in_transit");
    expect(result.history).toHaveLength(1);
    expect(result.history[0]?.status_location).toBe("Hyderabad Hub");

    vi.doUnmock("@/server/db");
    vi.doUnmock("@/integrations/supabase/client.server");
  });

  it("computes integer-paise pricing accurately with capped percentage/fixed coupons", async () => {
    const { calculateOrderPricingPaise } = await import("@/lib/pricing");

    const capped = calculateOrderPricingPaise({
      items: [{ price: 2499, qty: 2 }],
      couponCode: "VIP30",
      couponRule: {
        code: "VIP30",
        discountType: "percentage",
        discountValue: 30,
        minOrderValue: 2000,
        maxDiscount: 500,
      },
    });
    expect(capped.subtotal).toBe(4998);
    expect(capped.discount).toBe(500);
    expect(capped.shipping).toBe(0);
    expect(capped.total).toBe(4498);
  });

  it("enforces Step 2 & Step 5 server invariants across auth, inventory, orders, refunds, and shipping", () => {
    const ordersSrc = fs.readFileSync(path.resolve("src/server/orders.ts"), "utf8");
    expect(ordersSrc).toMatch(/import\s*\{\s*getDb\s*\}\s*from\s*"@\/server\/db"/);
    expect(ordersSrc).not.toMatch(/existingByEmail/);
    expect(ordersSrc).toMatch(/isRazorpayConfigured\(\)/);

    const inventorySrc = fs.readFileSync(path.resolve("src/server/inventory.ts"), "utf8");
    expect(inventorySrc).toMatch(/resolveVariantIdSql/);
    expect(inventorySrc).toMatch(/resolveVariantIdRest/);
    expect(inventorySrc).toMatch(/syncProductAggregateStock/);
    expect(inventorySrc).not.toMatch(/No variant found.*continue/);

    const adminSrc = fs.readFileSync(path.resolve("src/server/admin.ts"), "utf8");
    expect(adminSrc).toMatch(/priorRefunded/);
    expect(adminSrc).toMatch(/\.from\("payment_refunds"\)/);
    expect(adminSrc).not.toMatch(/\.from\("refunds"\)\.(insert|update|upsert|delete)/);
    expect(adminSrc).toMatch(/syncProductAggregateStock/);

    const shipmaxxSrc = fs.readFileSync(path.resolve("src/server/shipmaxx.ts"), "utf8");
    expect(shipmaxxSrc).toMatch(/shipment_tracking_events/);
    expect(shipmaxxSrc).not.toMatch(/^\s*\.or\(/m);
    expect(shipmaxxSrc).not.toMatch(/\.from\("shipping_tracking"\)\.insert/);

    const catalogSrc = fs.readFileSync(path.resolve("src/server/catalog.ts"), "utf8");
    expect(catalogSrc).toMatch(/getAuthenticatedCustomerId/);
    expect(catalogSrc).toMatch(/status:\s*"pending"/);

    const authClientSrc = fs.readFileSync(path.resolve("src/lib/auth.tsx"), "utf8");
    expect(authClientSrc).not.toMatch(/GOOGLE_WELCOME_KEY_PREFIX/);
    expect(authClientSrc).toMatch(/checkGoogleSessionServerFn/);
  });

  it("promotes the hardened RLS migration into supabase/migrations and covers all 62 tables with zero multi-permissive overlaps", () => {
    const migrationPath = path.resolve(
      "supabase/migrations/20261126000001_security_rls_and_function_hardening.sql",
    );
    expect(fs.existsSync(migrationPath)).toBe(true);
    expect(
      fs.existsSync(
        path.resolve(
          "supabase/migrations_draft/20261126000001_security_rls_and_function_hardening_REVIEW_ONLY.sql",
        ),
      ),
    ).toBe(false);

    const sql = fs.readFileSync(migrationPath, "utf8");
    const sqlWithoutComments = sql.replace(/--.*$/gm, "");
    expect(sql).toMatch(/^BEGIN;/m);
    expect(sql).toMatch(/^COMMIT;/m);
    expect(sql).not.toMatch(/DROP TABLE|TRUNCATE TABLE|DELETE FROM/i);
    expect(sqlWithoutComments).not.toMatch(/\bauth\.role\s*\(/i);
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.assign_admin_role_by_email\(text\) FROM PUBLIC, anon, authenticated;/,
    );
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.reserve_inventory_variant\(uuid, integer, uuid, integer\) FROM PUBLIC, anon, authenticated;/,
    );
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.is_admin\(\) FROM PUBLIC, anon;/);

    const expectedTables = [
      "admin_audit_logs",
      "admin_roles",
      "admin_users",
      "admin_whitelist",
      "audit_logs",
      "banners",
      "cart_items",
      "carts",
      "contact_messages",
      "coupon_redemptions",
      "coupons",
      "customer_addresses",
      "customer_auth_providers",
      "customer_carts",
      "customer_profiles",
      "customer_welcome",
      "customers",
      "email_delivery_diagnostics",
      "email_verification_otps",
      "inventory",
      "inventory_items",
      "inventory_movements",
      "inventory_reservations",
      "inventory_transactions",
      "newsletter_subscribers",
      "notifications",
      "order_addresses",
      "order_items",
      "order_notes",
      "order_status_history",
      "orders",
      "payment_refunds",
      "payment_webhook_events",
      "payment_webhooks",
      "payments",
      "product_categories",
      "product_images",
      "product_reviews",
      "product_tag_assignments",
      "product_tags",
      "product_variants",
      "products",
      "profiles",
      "promotional_sections",
      "refunds",
      "return_items",
      "returns",
      "shipment_tracking_events",
      "shipments",
      "shipping_addresses",
      "shipping_rates",
      "shipping_settings",
      "shipping_tracking",
      "shipping_webhook_events",
      "shipping_zones",
      "site_settings",
      "support_messages",
      "support_tickets",
      "system_settings",
      "user_roles",
      "wishlist_items",
      "wishlists",
    ];
    expect(expectedTables).toHaveLength(62);

    for (const tbl of expectedTables) {
      expect(sql).toContain(`ALTER TABLE public.${tbl} ENABLE ROW LEVEL SECURITY;`);
    }

    // Verify no multi-permissive (table, role, cmd) overlaps exist in CREATE POLICY statements
    const policyRegex =
      /CREATE POLICY "([^"]+)" ON (public\.[a-z_]+|storage\.objects)\s+FOR (SELECT|INSERT|UPDATE|DELETE|ALL)\s+TO ([a-z_, ]+)/g;
    const seen = new Set<string>();
    let match: RegExpExecArray | null;
    while ((match = policyRegex.exec(sql)) !== null) {
      const target = match[2] ?? "";
      const cmd = match[3] ?? "";
      const roles = (match[4] ?? "")
        .split(",")
        .map((r) => r.trim())
        .filter(Boolean);
      const cmds = cmd === "ALL" ? ["SELECT", "INSERT", "UPDATE", "DELETE"] : [cmd];
      for (const role of roles) {
        for (const c of cmds) {
          const key = `${target}|${role}|${c}`;
          expect(seen.has(key), `Duplicate permissive policy slot detected: ${key}`).toBe(false);
          seen.add(key);
        }
      }
    }
  });

  it("sets HttpOnly session cookies and does not write admin tokens into browser localStorage", () => {
    const authHelpers = fs.readFileSync(path.resolve("src/server/auth-helpers.ts"), "utf8");
    expect(authHelpers).toContain("httpOnly: true");
    expect(authHelpers).toContain('sameSite: "lax"');
    expect(authHelpers).toContain("cavenhusrt_admin_session");

    const loginFiles = [
      "src/routes/admin.login.tsx",
      "src/components/admin/AdminAuthGate.tsx",
      "src/routes/admin.tsx",
    ];
    for (const rel of loginFiles) {
      const src = fs.readFileSync(path.resolve(rel), "utf8");
      expect(src).not.toMatch(/localStorage\.setItem\(["']cavenhusrt_admin_token["']/);
    }

    const adminServer = fs.readFileSync(path.resolve("src/server/admin.ts"), "utf8");
    expect(adminServer).toContain("setSessionCookie(ADMIN_SESSION_COOKIE_NAME");
    expect(adminServer).toContain("adminLogoutServerFn");
  });
});
