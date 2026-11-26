import crypto from "node:crypto";
import { test, expect } from "@playwright/test";
import {
  cleanupE2eOrder,
  cleanupE2eUser,
  closeE2eSql,
  getE2eSql,
  signE2eSessionToken,
  signRazorpayWebhookBody,
} from "./helpers/e2e-db";

test.describe("Product Selection -> Cart -> Checkout -> Razorpay Webhook", () => {
  const uniqueSuffix = Date.now();
  const userId = crypto.randomUUID();
  const customerEmail = `e2e.checkout.${uniqueSuffix}@example.com`;
  const customerPhone = `9${String(uniqueSuffix).slice(-9)}`;
  const customerName = "E2E Checkout Buyer";
  const targetSlug = "signature-oversized-tee";

  let createdOrderId: string | null = null;
  let createdOrderNumber: string | null = null;
  const webhookEventIds: string[] = [];
  let initialProductStock: Record<string, number> | null = null;
  const variantSnapshots: Array<{
    variantId: string;
    variantStock: number | null;
    inventoryStock: number | null;
    inventoryReserved: number;
  }> = [];

  test.beforeAll(async () => {
    const sql = getE2eSql();

    // Snapshot original stock across products, all size-M variants & inventory so cleanup restores cleanly
    const [prod] = await sql<{ id: string; stock: unknown }[]>`
      SELECT id, stock FROM public.products WHERE slug = ${targetSlug} LIMIT 1
    `;
    const rawStock =
      typeof prod?.stock === "string"
        ? (JSON.parse(prod.stock) as Record<string, number>)
        : (prod?.stock as Record<string, number> | null);
    initialProductStock = rawStock ?? null;
    if (prod?.id) {
      const variants = await sql<{ id: string; stock_quantity: number | null }[]>`
        SELECT id, stock_quantity FROM public.product_variants
        WHERE product_id = ${prod.id} AND size = 'M'
      `;
      for (const variant of variants) {
        const [inv] = await sql<{ stock_quantity: number; reserved_quantity: number | null }[]>`
          SELECT stock_quantity, reserved_quantity FROM public.inventory
          WHERE variant_id = ${variant.id}
          LIMIT 1
        `;
        variantSnapshots.push({
          variantId: variant.id,
          variantStock: variant.stock_quantity,
          inventoryStock: inv ? inv.stock_quantity : null,
          inventoryReserved: inv?.reserved_quantity ?? 0,
        });
      }
    }

    // Seed verified customer + completed profile + welcome row for authenticated checkout
    await sql`
      INSERT INTO auth.users (
        id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at
      ) VALUES (
        ${userId}::uuid,
        '00000000-0000-0000-0000-000000000000',
        'authenticated',
        'authenticated',
        ${customerEmail},
        crypt('E2eCheckoutPass#1', gen_salt('bf')),
        now(),
        ${sql.json({ provider: "google", providers: ["google"] })},
        ${sql.json({ email: customerEmail, full_name: customerName, phone: customerPhone, profile_completed: true })},
        false,
        now(),
        now()
      )
    `;
    await sql`
      INSERT INTO public.profiles (id, email, full_name, phone, mobile_number, auth_provider, account_status, profile_completed)
      VALUES (${userId}::uuid, ${customerEmail}, ${customerName}, ${customerPhone}, ${customerPhone}, 'google', 'active', true)
      ON CONFLICT (id) DO UPDATE SET
        full_name = EXCLUDED.full_name,
        phone = EXCLUDED.phone,
        mobile_number = EXCLUDED.mobile_number,
        profile_completed = true
    `;
    await sql`
      INSERT INTO public.customers (id, auth_provider_uid, full_name, email, phone, account_status)
      VALUES (${userId}::uuid, ${userId}, ${customerName}, ${customerEmail}, ${customerPhone}, 'active')
      ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, phone = EXCLUDED.phone
    `;
    await sql`
      INSERT INTO public.customer_welcome (user_id)
      VALUES (${userId})
      ON CONFLICT (user_id) DO NOTHING
    `;
  });

  test.afterAll(async () => {
    const sql = getE2eSql();
    if (createdOrderNumber) {
      await sql`DELETE FROM public.inventory_movements WHERE reference_id = ${createdOrderNumber}`.catch(
        () => {},
      );
    }
    if (createdOrderId) {
      await cleanupE2eOrder(createdOrderId, webhookEventIds);
    }
    if (initialProductStock) {
      await sql`
        UPDATE public.products
        SET stock = ${sql.json(initialProductStock)}
        WHERE slug = ${targetSlug}
      `.catch(() => {});
    }
    for (const snap of variantSnapshots) {
      if (typeof snap.variantStock === "number") {
        await sql`
          UPDATE public.product_variants
          SET stock_quantity = ${snap.variantStock}, is_available = (${snap.variantStock} > 0)
          WHERE id = ${snap.variantId}::uuid
        `.catch(() => {});
      }
      if (typeof snap.inventoryStock === "number") {
        await sql`
          UPDATE public.inventory
          SET stock_quantity = ${snap.inventoryStock}, reserved_quantity = ${snap.inventoryReserved}
          WHERE variant_id = ${snap.variantId}::uuid
        `.catch(() => {});
      }
    }
    await cleanupE2eUser(customerEmail);
    await sql`DELETE FROM public.customer_welcome WHERE user_id = ${userId}`.catch(() => {});
    await sql`DELETE FROM public.customers WHERE id = ${userId}::uuid`.catch(() => {});
    await sql`DELETE FROM public.profiles WHERE id = ${userId}::uuid`.catch(() => {});
    await closeE2eSql();
  });

  test("selects product size/color, adds to cart, creates checkout order, and verifies Razorpay webhook", async ({
    page,
    request,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    const token = signE2eSessionToken({
      sub: userId,
      email: customerEmail,
      name: customerName,
      isAdmin: false,
    });

    // Hydrate authenticated customer session before navigating
    await page.addInitScript(
      ({ authUser, authToken }) => {
        localStorage.setItem(
          "cavenhusrt_google_session",
          JSON.stringify({ user: authUser, sessionToken: authToken }),
        );
      },
      {
        authUser: {
          id: userId,
          email: customerEmail,
          phone: customerPhone,
          user_metadata: {
            full_name: customerName,
            name: customerName,
            phone: customerPhone,
            mobile_number: customerPhone,
            profile_completed: true,
          },
          app_metadata: { provider: "google" },
          isAdmin: false,
        },
        authToken: token,
      },
    );

    // 1. Navigate to product detail page from storefront /shop
    await page.goto("/shop");
    await page.waitForLoadState("networkidle");
    await page.locator(`a[href="/product/${targetSlug}"]`).first().click();
    await page.waitForURL(new RegExp(`/product/${targetSlug}`), { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: /Signature Oversized Tee/i })).toBeVisible();
    await page.waitForLoadState("networkidle");

    // Select size M, click Add to Cart, and wait for updateCartItemServerFn response before reloading
    await page.getByRole("button", { name: "M", exact: true }).click();
    const addSyncPromise = page.waitForResponse(
      (res) => res.url().includes("_serverFn") && res.request().method() === "POST" && res.ok(),
      { timeout: 15_000 },
    );
    await page.getByRole("button", { name: "Add to Cart", exact: true }).click();
    await expect(page.getByText(/added to bag/i)).toBeVisible({ timeout: 10_000 });
    await addSyncPromise;

    // 2. Navigate via SPA link to /cart, reload to verify quantity stays 1 (no double-merge), then proceed to /checkout
    await page
      .getByRole("link", { name: /Shopping bag/i })
      .first()
      .click();
    await page.waitForURL(/\/cart/, { timeout: 15_000 });
    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: /Shopping Bag/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("Signature Oversized Tee")).toBeVisible();
    await expect(page.getByRole("link", { name: /Shopping bag/i }).first()).toContainText("1");
    await page.getByRole("link", { name: /Proceed to Checkout/i }).click();

    await page.waitForURL(/\/checkout/, { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: /^Checkout$/i })).toBeVisible();

    // 3. Complete shipping address & verify pincode
    await page.getByPlaceholder("Full name *").fill(customerName);
    await page.getByPlaceholder("Mobile number (10 digits) *").fill(customerPhone);
    await page.getByPlaceholder("Email address for order receipt *").fill(customerEmail);
    await page.getByPlaceholder("House / Flat / Building / Street *").fill("42 Heritage Avenue");
    await page.getByPlaceholder("City / District *").fill("Vijayawada");
    await page.locator("select").selectOption("Andhra Pradesh");
    await page.getByPlaceholder("PIN Code (6 digits) *").fill("521212");

    await expect(page.getByText(/Serviceable via|Valid 6-digit Indian PIN code/i)).toBeVisible({
      timeout: 15_000,
    });

    // Intercept Razorpay modal script cleanly so E2E verifies order creation without launching external iframe
    await page.route("https://checkout.razorpay.com/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: "window.Razorpay = function() { this.open = function() { window.__e2eRazorpayOpened = true; }; };",
      }),
    );

    await page.getByRole("button", { name: /Pay .*Online via Razorpay/i }).click();

    // Wait for server-created order row in PostgreSQL
    const sql = getE2eSql();
    let orderRow:
      | {
          id: string;
          order_number: string;
          razorpay_order_id: string | null;
          total: number;
          payment_status: string;
          status: string;
          user_id: string | null;
        }
      | undefined;

    for (let i = 0; i < 40; i++) {
      const rows = await sql<
        {
          id: string;
          order_number: string;
          razorpay_order_id: string | null;
          total: number;
          payment_status: string;
          status: string;
          user_id: string | null;
        }[]
      >`
        SELECT id, order_number, razorpay_order_id, total, payment_status, status, user_id
        FROM public.orders
        WHERE customer_email = ${customerEmail}
        ORDER BY created_at DESC
        LIMIT 1
      `;
      if (rows[0]?.razorpay_order_id) {
        orderRow = rows[0];
        break;
      }
      await page.waitForTimeout(250);
    }

    expect(orderRow).toBeTruthy();
    createdOrderId = orderRow!.id;
    createdOrderNumber = orderRow!.order_number;
    expect(orderRow!.user_id).toBe(userId);
    expect(orderRow!.payment_status).toBe("pending");
    expect(orderRow!.razorpay_order_id).toMatch(/^order_/);

    // 4. Verify Razorpay webhook security (reject missing/invalid signature, accept valid HMAC)
    const fakePaymentId = `pay_e2e_${uniqueSuffix}`;
    const eventId = `evt_e2e_${uniqueSuffix}`;
    webhookEventIds.push(eventId);

    const webhookPayload = JSON.stringify({
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: fakePaymentId,
            order_id: orderRow!.razorpay_order_id,
            amount: Math.round(Number(orderRow!.total) * 100),
            currency: "INR",
            status: "captured",
          },
        },
      },
    });

    const missingSigRes = await request.post("/api/webhooks/razorpay", {
      data: webhookPayload,
      headers: { "Content-Type": "application/json" },
    });
    expect(missingSigRes.status()).toBe(401);

    const badSigRes = await request.post("/api/webhooks/razorpay", {
      data: webhookPayload,
      headers: {
        "Content-Type": "application/json",
        "x-razorpay-signature": "invalid_hmac_signature_hex",
        "x-razorpay-event-id": eventId,
      },
    });
    expect(badSigRes.status()).toBe(401);

    const validSig = signRazorpayWebhookBody(webhookPayload);
    const validRes = await request.post("/api/webhooks/razorpay", {
      data: webhookPayload,
      headers: {
        "Content-Type": "application/json",
        "x-razorpay-signature": validSig,
        "x-razorpay-event-id": eventId,
      },
    });
    expect(validRes.status()).toBe(200);

    // Assert order & payment marked paid/captured in Supabase
    const [paidOrder] = await sql<{ payment_status: string; status: string }[]>`
      SELECT payment_status, status FROM public.orders WHERE id = ${createdOrderId}::uuid
    `;
    expect(paidOrder?.payment_status).toBe("paid");
    expect(paidOrder?.status).toBe("confirmed");

    const [paymentRow] = await sql<{ status: string; razorpay_payment_id: string | null }[]>`
      SELECT status, razorpay_payment_id FROM public.payments WHERE order_id = ${createdOrderId}::uuid
    `;
    expect(paymentRow?.status).toBe("captured");
    expect(paymentRow?.razorpay_payment_id).toBe(fakePaymentId);

    // Duplicate webhook replay must remain idempotent
    const replayRes = await request.post("/api/webhooks/razorpay", {
      data: webhookPayload,
      headers: {
        "Content-Type": "application/json",
        "x-razorpay-signature": validSig,
        "x-razorpay-event-id": eventId,
      },
    });
    expect(replayRes.status()).toBe(200);

    const paymentRowsAfterReplay = await sql<{ id: string }[]>`
      SELECT id FROM public.payments WHERE order_id = ${createdOrderId}::uuid
    `;
    expect(paymentRowsAfterReplay.length).toBe(1);

    expect(pageErrors).toEqual([]);
  });
});
