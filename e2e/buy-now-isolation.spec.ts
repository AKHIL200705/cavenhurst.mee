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
import { calculateOrderPricingPaise, formatINR } from "../src/lib/pricing";

test.describe("Buy Now Isolation & Cart Calculation Integrity", () => {
  const uniqueSuffix = Date.now();
  const userId = crypto.randomUUID();
  const customerEmail = `e2e.buynow.${uniqueSuffix}@example.com`;
  const customerPhone = `9${String(uniqueSuffix).slice(-9)}`;
  const customerName = "E2E Direct Buyer";

  const cartSlug = "relaxed-essential-tee";
  const buyNowSlug = "signature-oversized-tee";

  let cartUnitPrice = 0;
  let buyNowUnitPrice = 0;
  let initialCartProdStock: Record<string, number> | null = null;
  let initialBuyNowProdStock: Record<string, number> | null = null;
  let initialCouponTimesUsed: number | null = null;
  const createdOrderIds: string[] = [];
  const createdOrderNumbers: string[] = [];
  const webhookEventIds: string[] = [];

  const variantSnapshots: Array<{
    variantId: string;
    variantStock: number | null;
    inventoryStock: number | null;
    inventoryReserved: number;
  }> = [];

  async function snapshotProductVariants(slug: string, size: string) {
    const sql = getE2eSql();
    const [prod] = await sql<{ id: string; price: number; stock: unknown }[]>`
      SELECT id, price, stock FROM public.products WHERE slug = ${slug} LIMIT 1
    `;
    if (!prod) throw new Error(`Missing product ${slug} in Supabase`);
    const rawStock =
      typeof prod.stock === "string"
        ? (JSON.parse(prod.stock) as Record<string, number>)
        : (prod.stock as Record<string, number> | null);

    const variants = await sql<{ id: string; stock_quantity: number | null }[]>`
      SELECT id, stock_quantity FROM public.product_variants
      WHERE product_id = ${prod.id} AND size = ${size}
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
    return { price: Number(prod.price), stock: rawStock ?? null };
  }

  test.beforeAll(async () => {
    const sql = getE2eSql();
    const cartMeta = await snapshotProductVariants(cartSlug, "M");
    const buyNowMeta = await snapshotProductVariants(buyNowSlug, "L");
    cartUnitPrice = cartMeta.price;
    initialCartProdStock = cartMeta.stock;
    buyNowUnitPrice = buyNowMeta.price;
    initialBuyNowProdStock = buyNowMeta.stock;

    const [caven10] = await sql<{ times_used: number | null }[]>`
      SELECT times_used FROM public.coupons WHERE code = 'CAVEN10' LIMIT 1
    `;
    initialCouponTimesUsed = caven10?.times_used ?? null;

    await sql`
      INSERT INTO auth.users (
        id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at
      ) VALUES (
        ${userId}::uuid,
        '00000000-0000-0000-0000-000000000000',
        'authenticated',
        'authenticated',
        ${customerEmail},
        crypt('E2eBuyNowPass#1', gen_salt('bf')),
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
    for (const orderNumber of createdOrderNumbers) {
      await sql`DELETE FROM public.inventory_movements WHERE reference_id = ${orderNumber}`.catch(
        () => {},
      );
    }
    for (const orderId of createdOrderIds) {
      await cleanupE2eOrder(orderId, webhookEventIds);
    }
    if (initialCartProdStock) {
      await sql`
        UPDATE public.products SET stock = ${sql.json(initialCartProdStock)} WHERE slug = ${cartSlug}
      `.catch(() => {});
    }
    if (initialBuyNowProdStock) {
      await sql`
        UPDATE public.products SET stock = ${sql.json(initialBuyNowProdStock)} WHERE slug = ${buyNowSlug}
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
    if (typeof initialCouponTimesUsed === "number") {
      await sql`
        UPDATE public.coupons SET times_used = ${initialCouponTimesUsed} WHERE code = 'CAVEN10'
      `.catch(() => {});
    }
    await cleanupE2eUser(customerEmail);
    await sql`DELETE FROM public.customer_welcome WHERE user_id = ${userId}`.catch(() => {});
    await sql`DELETE FROM public.customers WHERE id = ${userId}::uuid`.catch(() => {});
    await sql`DELETE FROM public.profiles WHERE id = ${userId}::uuid`.catch(() => {});
    await closeE2eSql();
  });

  test("isolates Direct Buy from pre-populated Cart, persists across refresh, prevents duplicates, and verifies Cart totals", async ({
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

    await page.addInitScript(
      ({ authUser, authToken }) => {
        localStorage.setItem(
          "cavenhurst_google_session",
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

    // Stub RazorpayCheckout SDK so we can assert open/on/dismiss cleanly without launching an iframe
    await page.route("https://checkout.razorpay.com/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: [
          "window.__e2eRazorpayOpenCount = 0;",
          "window.Razorpay = function(opts) {",
          "  window.__e2eLastRazorpayOpts = opts;",
          "  this.on = function() {};",
          "  this.open = function() {",
          "    window.__e2eRazorpayOpenCount += 1;",
          "    if (opts && opts.modal && typeof opts.modal.ondismiss === 'function') {",
          "      setTimeout(function() { opts.modal.ondismiss(); }, 50);",
          "    }",
          "  };",
          "};",
        ].join("\n"),
      }),
    );

    // TEST A.1: Pre-populate Cart with 2 units of Relaxed Essential Tee (Size M)
    await page.goto(`/product/${cartSlug}`);
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "M", exact: true }).click();
    await page.getByRole("button", { name: "Increase", exact: true }).click();

    const syncAdd = page.waitForResponse(
      (res) => res.url().includes("_serverFn") && res.request().method() === "POST" && res.ok(),
      { timeout: 15_000 },
    );
    await page.getByRole("button", { name: "Add to Cart", exact: true }).click();
    await expect(page.getByText(/Added to bag/i)).toBeVisible({ timeout: 10_000 });
    await syncAdd;
    await expect(page.getByRole("link", { name: /Shopping bag/i }).first()).toContainText("2");

    // TEST A.2: Open Signature Oversized Tee, select Size L, and click BUY NOW
    await page.goto(`/product/${buyNowSlug}`);
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "L", exact: true }).click();
    await page.getByRole("button", { name: "Buy Now", exact: true }).click();

    await page.waitForURL(/\/checkout\?mode=direct/, { timeout: 20_000 });
    await expect(page.getByText("Buy Now", { exact: true })).toBeVisible();

    // Verify Direct Buy shows ONLY Signature Oversized Tee and NOT Relaxed Essential Tee
    const orderSummaryAside = page.locator("aside");
    await expect(orderSummaryAside).toContainText("Signature Oversized Tee");
    await expect(orderSummaryAside).not.toContainText("Relaxed Essential Tee");

    // Cart badge MUST still show 2 (Buy Now never touches cart)
    await expect(page.getByRole("link", { name: /Shopping bag/i }).first()).toContainText("2");

    const directExpected = calculateOrderPricingPaise({
      items: [{ price: buyNowUnitPrice, qty: 1 }],
    });
    const payOnlineBtn = page.getByRole("button", { name: /Pay .*Online via Razorpay/i });
    await expect(payOnlineBtn).toContainText(formatINR(directExpected.total));

    // TEST A.3: Refresh checkout -> mode=direct MUST persist and remain isolated
    await page.reload();
    await page.waitForLoadState("networkidle");
    expect(page.url()).toContain("mode=direct");
    await expect(page.locator("aside")).toContainText("Signature Oversized Tee");
    await expect(page.locator("aside")).not.toContainText("Relaxed Essential Tee");

    // TEST A.4: Fill address & submit Direct Buy -> verify DB order total, Razorpay paise & idempotency
    await page.getByPlaceholder("Full name *").fill(customerName);
    await page.getByPlaceholder("Mobile number (10 digits) *").fill(customerPhone);
    await page.getByPlaceholder("Email address for order receipt *").fill(customerEmail);
    await page.getByPlaceholder("House / Flat / Building / Street *").fill("108 Atelier Street");
    await page.getByPlaceholder("City / District *").fill("Vijayawada");
    await page.locator("select").selectOption("Andhra Pradesh");
    await page.getByPlaceholder("PIN Code (6 digits) *").fill("521212");

    await payOnlineBtn.click();
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as { __e2eRazorpayOpenCount?: number }).__e2eRazorpayOpenCount || 0,
        ),
      )
      .toBeGreaterThanOrEqual(1);

    // Retry submit with identical state after modal dismissed -> idempotency MUST prevent duplicate order row
    await payOnlineBtn.click();
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as { __e2eRazorpayOpenCount?: number }).__e2eRazorpayOpenCount || 0,
        ),
      )
      .toBeGreaterThanOrEqual(2);

    const rzpOpts = await page.evaluate(
      () =>
        (window as { __e2eLastRazorpayOpts?: { amount?: number; order_id?: string } })
          .__e2eLastRazorpayOpts,
    );
    expect(rzpOpts?.amount).toBe(directExpected.totalPaise);

    const sql = getE2eSql();
    const directOrders = await sql<
      {
        id: string;
        order_number: string;
        subtotal: number;
        shipping_fee: number;
        total: number;
        razorpay_order_id: string | null;
        shipping: { checkoutMode?: string };
        items: Array<{ slug: string; qty: number }>;
      }[]
    >`
      SELECT id, order_number, subtotal, shipping_fee, total, razorpay_order_id, shipping, items
      FROM public.orders
      WHERE customer_email = ${customerEmail}
      ORDER BY created_at DESC
    `;
    expect(directOrders.length).toBe(1);
    const directOrder = directOrders[0]!;
    createdOrderIds.push(directOrder.id);
    createdOrderNumbers.push(directOrder.order_number);

    expect(directOrder.subtotal).toBe(directExpected.subtotal);
    expect(directOrder.shipping_fee).toBe(directExpected.shipping);
    expect(directOrder.total).toBe(directExpected.total);
    expect(directOrder.shipping?.checkoutMode).toBe("DIRECT_BUY");
    expect(directOrder.items.length).toBe(1);
    expect(directOrder.items[0]?.slug).toBe(buyNowSlug);

    const [directPayment] = await sql<{ amount: number; amount_paise: number }[]>`
      SELECT amount, amount_paise FROM public.payments WHERE order_id = ${directOrder.id}::uuid LIMIT 1
    `;
    expect(directPayment?.amount).toBe(directExpected.total);
    expect(directPayment?.amount_paise).toBe(directExpected.totalPaise);

    // Complete Direct Buy order cleanly via signed webhook
    const directEventId = `evt_e2e_direct_${uniqueSuffix}`;
    webhookEventIds.push(directEventId);
    const directHookBody = JSON.stringify({
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: `pay_e2e_direct_${uniqueSuffix}`,
            order_id: directOrder.razorpay_order_id,
            amount: directExpected.totalPaise,
            currency: "INR",
            status: "captured",
          },
        },
      },
    });
    const directHookRes = await request.post("/api/webhooks/razorpay", {
      data: directHookBody,
      headers: {
        "Content-Type": "application/json",
        "x-razorpay-signature": signRazorpayWebhookBody(directHookBody),
        "x-razorpay-event-id": directEventId,
      },
    });
    expect(directHookRes.status()).toBe(200);

    // TEST B: Cart still intact with Relaxed Essential Tee x2 -> adjust qty to 4, apply CAVEN10, checkout CART_CHECKOUT
    await page.goto("/cart");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("Relaxed Essential Tee")).toBeVisible();

    const plusBtn = page.getByRole("button", { name: "Increase", exact: true }).first();
    await plusBtn.click();
    await plusBtn.click();
    await expect(page.getByRole("link", { name: /Shopping bag/i }).first()).toContainText("4");

    await page.getByPlaceholder(/Coupon code/i).fill("CAVEN10");
    await page.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(page.getByText(/CAVEN10 applied/i)).toBeVisible({ timeout: 10_000 });

    const cartExpected = calculateOrderPricingPaise({
      items: [{ price: cartUnitPrice, qty: 4 }],
      couponCode: "CAVEN10",
      couponRule: {
        code: "CAVEN10",
        discountType: "percentage",
        discountValue: 10,
        minOrderValue: 1500,
      },
    });

    await page.getByRole("link", { name: /Proceed to Checkout/i }).click();
    await page.waitForURL(/\/checkout\?mode=cart/, { timeout: 15_000 });
    await expect(page.getByText("Bag", { exact: true })).toBeVisible();
    await expect(page.locator("aside")).toContainText("Relaxed Essential Tee");
    await expect(page.locator("aside")).not.toContainText("Signature Oversized Tee");
    await expect(page.getByRole("button", { name: /Pay .*Online via Razorpay/i })).toContainText(
      formatINR(cartExpected.total),
    );

    await page.getByPlaceholder("Full name *").fill(customerName);
    await page.getByPlaceholder("Mobile number (10 digits) *").fill(customerPhone);
    await page.getByPlaceholder("Email address for order receipt *").fill(customerEmail);
    await page.getByPlaceholder("House / Flat / Building / Street *").fill("108 Atelier Street");
    await page.getByPlaceholder("City / District *").fill("Vijayawada");
    await page.locator("select").selectOption("Andhra Pradesh");
    await page.getByPlaceholder("PIN Code (6 digits) *").fill("521212");

    await page.getByRole("button", { name: /Pay .*Online via Razorpay/i }).click();
    await expect
      .poll(async () => {
        const rows = await sql<{ id: string; razorpay_order_id: string | null }[]>`
          SELECT id, razorpay_order_id
          FROM public.orders
          WHERE customer_email = ${customerEmail}
            AND razorpay_order_id IS NOT NULL
        `;
        return rows.length;
      })
      .toBe(2);

    const [cartOrder] = await sql<
      {
        id: string;
        order_number: string;
        subtotal: number;
        discount: number;
        shipping_fee: number;
        total: number;
        shipping: { checkoutMode?: string };
        items: Array<{ slug: string; qty: number }>;
      }[]
    >`
      SELECT id, order_number, subtotal, discount, shipping_fee, total, shipping, items
      FROM public.orders
      WHERE customer_email = ${customerEmail} AND id <> ${directOrder.id}::uuid
      ORDER BY created_at DESC
      LIMIT 1
    `;
    expect(cartOrder).toBeTruthy();
    createdOrderIds.push(cartOrder!.id);
    createdOrderNumbers.push(cartOrder!.order_number);

    expect(cartOrder!.subtotal).toBe(cartExpected.subtotal);
    expect(cartOrder!.discount).toBe(cartExpected.discount);
    expect(cartOrder!.shipping_fee).toBe(cartExpected.shipping);
    expect(cartOrder!.total).toBe(cartExpected.total);
    expect(cartOrder!.shipping?.checkoutMode).toBe("CART_CHECKOUT");
    expect(cartOrder!.items.length).toBe(1);
    expect(cartOrder!.items[0]?.slug).toBe(cartSlug);
    expect(cartOrder!.items[0]?.qty).toBe(4);

    let cartPayment: { amount: number; amount_paise: number } | undefined;
    for (let i = 0; i < 20; i++) {
      const [row] = await sql<{ amount: number; amount_paise: number }[]>`
        SELECT amount, amount_paise FROM public.payments WHERE order_id = ${cartOrder!.id}::uuid LIMIT 1
      `;
      if (row) {
        cartPayment = row;
        break;
      }
      await page.waitForTimeout(200);
    }
    expect(cartPayment?.amount).toBe(cartExpected.total);
    expect(cartPayment?.amount_paise).toBe(cartExpected.totalPaise);

    expect(pageErrors).toEqual([]);
  });
});
