import crypto from "node:crypto";
import { test, expect } from "@playwright/test";
import {
  cleanupE2eOrder,
  cleanupE2eUser,
  closeE2eSql,
  getE2eSql,
  signE2eSessionToken,
} from "./helpers/e2e-db";

test.describe("Admin Login -> Order Status & Refund Updates", () => {
  const uniqueSuffix = Date.now();
  const orderId = crypto.randomUUID();
  const orderNumber = `CVH-E2E-${String(uniqueSuffix).slice(-6)}`;
  const fakePaymentId = `pay_e2eadm_${uniqueSuffix}`;
  const adminEmail = "akhilsaiabbireddy2007@gmail.com";
  const nonAdminUserId = crypto.randomUUID();
  const nonAdminEmail = `nonadmin.e2e.${uniqueSuffix}@example.com`;
  const nonAdminPhone = `9${String(uniqueSuffix).slice(-9)}`;

  test.beforeAll(async () => {
    const sql = getE2eSql();

    // Seed onboarded non-admin customer so /admin renders AdminAuthGate directly instead of /welcome redirect
    await sql`
      INSERT INTO auth.users (
        id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at
      ) VALUES (
        ${nonAdminUserId}::uuid,
        '00000000-0000-0000-0000-000000000000',
        'authenticated',
        'authenticated',
        ${nonAdminEmail},
        crypt('E2eNonAdminPass#1', gen_salt('bf')),
        now(),
        ${sql.json({ provider: "google", providers: ["google"] })},
        ${sql.json({ email: nonAdminEmail, full_name: "Regular Customer", phone: nonAdminPhone, profile_completed: true })},
        false,
        now(),
        now()
      )
    `;
    await sql`
      INSERT INTO public.profiles (id, email, full_name, phone, mobile_number, auth_provider, account_status, profile_completed)
      VALUES (${nonAdminUserId}::uuid, ${nonAdminEmail}, 'Regular Customer', ${nonAdminPhone}, ${nonAdminPhone}, 'google', 'active', true)
      ON CONFLICT (id) DO UPDATE SET profile_completed = true
    `;
    await sql`
      INSERT INTO public.customers (id, auth_provider_uid, full_name, email, phone, account_status)
      VALUES (${nonAdminUserId}::uuid, ${nonAdminUserId}, 'Regular Customer', ${nonAdminEmail}, ${nonAdminPhone}, 'active')
      ON CONFLICT (id) DO NOTHING
    `;
    await sql`
      INSERT INTO public.customer_welcome (user_id)
      VALUES (${nonAdminUserId})
      ON CONFLICT (user_id) DO NOTHING
    `;
    await sql`
      INSERT INTO public.orders (
        id, order_number, customer_name, customer_email, customer_phone,
        subtotal, discount, shipping_fee, taxes, total,
        status, payment_method, payment_status, shipment_status,
        razorpay_order_id, razorpay_payment_id, items
      ) VALUES (
        ${orderId}::uuid,
        ${orderNumber},
        'E2E Admin Test Customer',
        'e2e.admin.buyer@example.com',
        '9876543210',
        999, 0, 0, 0, 999,
        'processing',
        'online',
        'paid',
        'unfulfilled',
        ${`order_e2eadm_${uniqueSuffix}`},
        ${fakePaymentId},
        ${sql.json([{ name: "Signature Oversized Tee", size: "M", color: "Midnight Navy", qty: 1, price: 999 }])}
      )
    `;

    await sql`
      INSERT INTO public.payments (
        order_id, gateway, payment_method, razorpay_order_id, razorpay_payment_id,
        amount, amount_paise, currency, status
      ) VALUES (
        ${orderId}::uuid,
        'razorpay',
        'online',
        ${`order_e2eadm_${uniqueSuffix}`},
        ${fakePaymentId},
        999,
        99900,
        'INR',
        'captured'
      )
    `;

    await sql`
      INSERT INTO public.order_items (
        order_id, product_slug, name, size, color, price, qty
      ) VALUES (
        ${orderId}::uuid,
        'signature-oversized-tee',
        'Signature Oversized Tee',
        'M',
        'Midnight Navy',
        999,
        1
      )
    `;

    await sql`
      INSERT INTO public.shipping_addresses (
        order_id, full_name, phone, email, address_line1, city, state, pincode, country
      ) VALUES (
        ${orderId}::uuid,
        'E2E Admin Test Customer',
        '9876543210',
        'e2e.admin.buyer@example.com',
        '10 Heritage Residency',
        'Vijayawada',
        'Andhra Pradesh',
        '521212',
        'India'
      )
    `;
  });

  test.afterAll(async () => {
    await cleanupE2eOrder(orderId);
    await cleanupE2eUser(nonAdminEmail);
    await closeE2eSql();
  });

  test("blocks unauthenticated admin access and verifies authenticated status & refund controls", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    // 1. Unauthenticated access to /admin must show Restricted Access gate
    await page.goto("/admin");
    await expect(page.getByText("RESTRICTED ACCESS")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("heading", { name: /CAVENHURST Admin Portal/i })).toBeVisible();

    // 2. Non-admin customer token must not grant admin access
    const nonAdminToken = signE2eSessionToken({
      sub: nonAdminUserId,
      email: nonAdminEmail,
      name: "Regular Customer",
      isAdmin: false,
    });
    await page.evaluate(
      ({ id, email, phone, tok }) => {
        localStorage.setItem(
          "cavenhurst_google_session",
          JSON.stringify({
            user: {
              id,
              email,
              phone,
              user_metadata: {
                full_name: "Regular Customer",
                name: "Regular Customer",
                phone,
                mobile_number: phone,
                profile_completed: true,
              },
              isAdmin: false,
            },
            sessionToken: tok,
          }),
        );
      },
      { id: nonAdminUserId, email: nonAdminEmail, phone: nonAdminPhone, tok: nonAdminToken },
    );
    await page.reload();
    await expect(page.getByText("RESTRICTED ACCESS")).toBeVisible({ timeout: 15_000 });

    // 3. Sign in with verified admin session token
    const sql = getE2eSql();
    const [adminRow] = await sql<{ id: string; full_name: string | null }[]>`
      SELECT id, full_name FROM public.admin_users WHERE lower(email) = ${adminEmail} LIMIT 1
    `;
    const adminId = adminRow?.id || "admin_root";
    const adminName = adminRow?.full_name || "Administrator";
    const adminToken = signE2eSessionToken({
      sub: adminId,
      email: adminEmail,
      name: adminName,
      isAdmin: true,
    });

    await page.evaluate(
      ({ id, email, name, tok }) => {
        localStorage.setItem(
          "cavenhurst_google_session",
          JSON.stringify({
            user: {
              id,
              email,
              user_metadata: { full_name: name, name, email },
              app_metadata: { provider: "google" },
              isAdmin: true,
            },
            sessionToken: tok,
          }),
        );
        localStorage.setItem("cavenhurst_admin_token", tok);
      },
      { id: adminId, email: adminEmail, name: adminName, tok: adminToken },
    );

    await page.reload();
    await expect(page.getByText("OPERATIONS CONSOLE")).toBeVisible({ timeout: 20_000 });

    // 4. Open Orders tab and inspect seeded order
    await page.getByRole("button", { name: /^Orders$/i }).click();
    const searchInput = page.getByPlaceholder("Search Order #, Customer, Phone, AWB...");
    await expect(searchInput).toBeVisible({ timeout: 15_000 });
    await searchInput.fill(orderNumber);

    const row = page.locator("tr", { hasText: orderNumber });
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.getByRole("button", { name: /View/i }).click();

    await expect(page.getByText("Purchased Garments (1)")).toBeVisible({ timeout: 15_000 });

    // 5. Transition Order Status -> shipped and Logistics -> in_transit
    const modal = page.locator("div.fixed.inset-0");
    const statusSelect = modal.locator("select").nth(0);
    const logisticsSelect = modal.locator("select").nth(1);

    await statusSelect.selectOption("shipped");
    await logisticsSelect.selectOption("in_transit");
    await modal.getByRole("button", { name: "Apply Status", exact: true }).click();

    await expect(page.getByText(/updated successfully/i)).toBeVisible({ timeout: 15_000 });

    const [updatedOrder] = await sql<{ status: string; shipment_status: string | null }[]>`
      SELECT status, shipment_status FROM public.orders WHERE id = ${orderId}::uuid
    `;
    expect(updatedOrder?.status).toBe("shipped");
    expect(updatedOrder?.shipment_status).toBe("in_transit");

    const historyRows = await sql<{ status: string }[]>`
      SELECT status FROM public.order_status_history WHERE order_id = ${orderId}::uuid
    `;
    expect(historyRows.some((h) => h.status === "shipped")).toBe(true);

    const auditRows = await sql<{ action: string }[]>`
      SELECT action FROM public.admin_audit_logs WHERE target_id = ${orderId}
    `;
    expect(auditRows.some((a) => a.action === "order_status_update")).toBe(true);

    // 6. Re-open details dialog and verify Razorpay Refund form & fail-closed gateway guard
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.getByRole("button", { name: /View/i }).click();

    await page.getByRole("button", { name: /Razorpay Refund/i }).click();
    await expect(page.getByText("Execute Official Razorpay API Refund")).toBeVisible();

    const refundInput = page.locator('input[type="number"]');
    await expect(refundInput).toHaveAttribute("max", "999");
    await refundInput.fill("500");
    await page.getByPlaceholder("Customer cancellation or return").fill("E2E partial refund check");
    await page.getByRole("button", { name: /Confirm & Issue Refund/i }).click();

    // Gateway rejects synthetic payment ID -> verify toast surfaces error and DB stays fail-closed
    await expect(
      page
        .locator("[data-sonner-toast]", { hasText: /does not exist|rejected|refund|failed/i })
        .first(),
    ).toBeVisible({
      timeout: 15_000,
    });
    const [afterRefundOrder] = await sql<{ payment_status: string; status: string }[]>`
      SELECT payment_status, status FROM public.orders WHERE id = ${orderId}::uuid
    `;
    expect(afterRefundOrder?.payment_status).toBe("paid");
    expect(afterRefundOrder?.status).toBe("shipped");

    expect(pageErrors).toEqual([]);
  });
});
