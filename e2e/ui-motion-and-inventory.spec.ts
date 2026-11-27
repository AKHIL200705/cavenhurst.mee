import { test, expect } from "@playwright/test";
import { closeE2eSql, getE2eSql, signE2eSessionToken } from "./helpers/e2e-db";

test.describe("UI Motion, Quick View, Empty States & Red-Only Color Compliance", () => {
  test.use({ reducedMotion: "no-preference" });

  test("animates route transitions cleanly, supports Quick View & PDP Add to Cart, and renders empty states", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const transitionBox = page.locator(".page-transition").first();
    await expect(transitionBox).toBeVisible({ timeout: 20_000 });
    const animInfo = await transitionBox.evaluate((el) => {
      const cs = window.getComputedStyle(el);
      return { animationName: cs.animationName, opacity: cs.opacity };
    });
    expect(animInfo.animationName).not.toBe("none");

    // Open Quick View from storefront card
    const quickViewBtn = page.locator('button[aria-label^="Quick view "]').first();
    await expect(quickViewBtn).toBeVisible();
    await quickViewBtn.click();

    const addBagModalBtn = page.getByRole("button", { name: /Add to Bag/i }).first();
    await expect(addBagModalBtn).toBeVisible({ timeout: 10_000 });
    await addBagModalBtn.click();

    // Navigate to /wishlist empty state
    await page.goto("/wishlist");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: /Your wishlist is empty/i })).toBeVisible();

    // Navigate to /search empty state for unmatched query
    await page.goto("/search");
    await page.waitForLoadState("networkidle");
    await page.getByPlaceholder(/Search tees/i).fill("nonexistent_garment_xyz_999");
    await expect(page.getByRole("heading", { name: /No matches found/i })).toBeVisible();

    // Navigate to PDP, select size & verify Add to Cart confirmation without red non-OOS styling
    await page.goto("/product/signature-oversized-tee");
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "M", exact: true }).click();
    const addBtn = page.getByRole("button", { name: "Add to Cart", exact: true });
    await addBtn.click();
    await expect(addBtn).toContainText(/Added!/i, { timeout: 10_000 });
    await expect(page.getByText(/Added to bag/i)).toBeVisible({ timeout: 10_000 });

    const invalidRedElements = await page.evaluate(() => {
      const violations: string[] = [];
      for (const el of Array.from(document.querySelectorAll("button, a, span, p, div"))) {
        const cs = window.getComputedStyle(el);
        const matches = cs.color.match(/\d+/g);
        const bgMatches = cs.backgroundColor.match(/\d+/g);
        const text = (el.textContent || "").trim();
        const isOutOfStock =
          /out of stock/i.test(text) || /out of stock/i.test(el.getAttribute("aria-label") || "");
        if (isOutOfStock) continue;
        if (
          matches &&
          Number(matches[0]) > 185 &&
          Number(matches[1]) < 95 &&
          Number(matches[2]) < 95
        ) {
          violations.push(`text:${el.tagName}:${text.slice(0, 40)}:${cs.color}`);
        }
        if (
          bgMatches &&
          bgMatches[3] !== "0" &&
          Number(bgMatches[0]) > 185 &&
          Number(bgMatches[1]) < 95 &&
          Number(bgMatches[2]) < 95
        ) {
          violations.push(`bg:${el.tagName}:${text.slice(0, 40)}:${cs.backgroundColor}`);
        }
      }
      return violations.slice(0, 5);
    });
    expect(invalidRedElements).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});

test.describe("Reduced Motion Accessibility & Admin Variant Inventory", () => {
  test.use({ reducedMotion: "reduce" });

  test.afterAll(async () => {
    await closeE2eSql();
  });

  test("disables entrance motion under prefers-reduced-motion", async ({ page }) => {
    await page.goto("/shop");
    await page.waitForLoadState("networkidle");

    const transitionEl = page.locator(".page-transition").first();
    await expect(transitionEl).toBeVisible({ timeout: 20_000 });
    const animInfo = await transitionEl.evaluate((el) => {
      const cs = window.getComputedStyle(el);
      return { animationName: cs.animationName, opacity: cs.opacity };
    });
    expect(animInfo.animationName).toBe("none");
    expect(animInfo.opacity).toBe("1");
  });

  test("renders Admin Variant Stock Breakdown with Product, Color, Size, Available, Reserved, and red-only OOS", async ({
    page,
  }) => {
    const sql = getE2eSql();
    const adminEmail = "cavenhurst@gmail.com";
    const [adminRow] = await sql<{ auth_id: string | null; full_name: string | null }[]>`
      SELECT COALESCE(auth_user_id, id::text) AS auth_id, full_name FROM public.admin_users WHERE lower(email) = ${adminEmail} LIMIT 1
    `;
    const adminId = adminRow?.auth_id || "admin_root";
    const adminName = adminRow?.full_name || "Administrator";
    const adminToken = signE2eSessionToken({
      sub: adminId,
      email: adminEmail,
      name: adminName,
      isAdmin: true,
    });

    await page.goto("/");
    await page.evaluate(
      ({ id, email, name, tok }) => {
        localStorage.setItem(
          "cavenhusrt_google_session",
          JSON.stringify({
            sessionToken: tok,
            user: {
              id,
              email,
              phone: null,
              user_metadata: { full_name: name, name, email },
              app_metadata: { provider: "google", is_admin: true },
            },
          }),
        );
      },
      { id: adminId, email: adminEmail, name: adminName, tok: adminToken },
    );

    await page.goto("/admin");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("OPERATIONS CONSOLE").first()).toBeVisible({ timeout: 20_000 });

    // Switch to Inventory tab via sidebar navigation
    await page.getByRole("button", { name: "Inventory" }).first().click();
    await expect(
      page.getByRole("heading", { name: /Inventory Breakdown by Variant/i }),
    ).toBeVisible({ timeout: 15_000 });

    const variantTable = page.locator("table").first();
    await expect(
      variantTable.getByRole("columnheader", { name: "Product", exact: true }),
    ).toBeVisible();
    await expect(
      variantTable.getByRole("columnheader", { name: "Color", exact: true }),
    ).toBeVisible();
    await expect(
      variantTable.getByRole("columnheader", { name: "Size", exact: true }),
    ).toBeVisible();
    await expect(
      variantTable.getByRole("columnheader", { name: "Available Quantity", exact: true }),
    ).toBeVisible();
    await expect(
      variantTable.getByRole("columnheader", { name: "Reserved Quantity", exact: true }),
    ).toBeVisible();
    await expect(
      variantTable.getByRole("columnheader", { name: "Stock Status", exact: true }),
    ).toBeVisible();

    const adminRedViolations = await page.evaluate(() => {
      const violations: string[] = [];
      for (const el of Array.from(document.querySelectorAll("button, a, span, p"))) {
        const cs = window.getComputedStyle(el);
        const matches = cs.color.match(/\d+/g);
        const text = (el.textContent || "").trim();
        const isOutOfStock =
          /out of stock|^0$/i.test(text) || /out of stock/i.test(el.getAttribute("title") || "");
        if (isOutOfStock) continue;
        if (
          matches &&
          Number(matches[0]) > 185 &&
          Number(matches[1]) < 95 &&
          Number(matches[2]) < 95
        ) {
          violations.push(`${el.tagName}:${text.slice(0, 40)}:${cs.color}`);
        }
      }
      return violations.slice(0, 5);
    });
    expect(adminRedViolations).toEqual([]);
  });

  test("serves dynamic sitemap.xml, robots.txt, canonical links, JSON-LD schema, and noindex tags", async ({
    page,
    request,
  }) => {
    const sitemapRes = await request.get("/sitemap.xml");
    expect(sitemapRes.status()).toBe(200);
    expect(sitemapRes.headers()["content-type"]).toContain("xml");
    const sitemapXml = await sitemapRes.text();
    expect(sitemapXml).toContain("<urlset");
    expect(sitemapXml).toContain("/shop</loc>");
    expect(sitemapXml).toContain("/collections/t-shirts</loc>");
    expect(sitemapXml).toContain("/product/signature-oversized-tee</loc>");

    const robotsRes = await request.get("/robots.txt");
    expect(robotsRes.status()).toBe(200);
    const robotsTxt = await robotsRes.text();
    expect(robotsTxt).toContain("Disallow: /admin");
    expect(robotsTxt).toContain("Sitemap:");

    // Homepage canonical, OG image, and WebSite / OnlineStore JSON-LD
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const homeSeo = await page.evaluate(() => {
      const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute("href");
      const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute("content");
      const jsonLdTypes = Array.from(
        document.querySelectorAll('script[type="application/ld+json"]'),
      ).map((s) => {
        try {
          return JSON.parse(s.textContent || "{}")["@type"];
        } catch {
          return "INVALID";
        }
      });
      return { canonical, ogImage, jsonLdTypes };
    });
    expect(homeSeo.canonical).toMatch(/\/$/);
    expect(homeSeo.ogImage).toContain("og-cover.jpg");
    expect(homeSeo.jsonLdTypes).toContain("WebSite");
    expect(homeSeo.jsonLdTypes).not.toContain("INVALID");

    // Product detail Product + BreadcrumbList JSON-LD
    await page.goto("/product/signature-oversized-tee");
    await page.waitForLoadState("networkidle");
    const pdpSchemas = await page.evaluate(() =>
      Array.from(document.querySelectorAll('script[type="application/ld+json"]')).map((s) =>
        JSON.parse(s.textContent || "{}"),
      ),
    );
    const productSchema = pdpSchemas.find((s) => s["@type"] === "Product");
    expect(productSchema).toBeTruthy();
    expect(productSchema?.offers?.priceCurrency).toBe("INR");
    expect(pdpSchemas.some((s) => s["@type"] === "BreadcrumbList")).toBe(true);

    // Search URL query param + noindex, follow
    await page.goto("/search?q=Signature");
    await page.waitForLoadState("networkidle");
    await expect(page.getByPlaceholder(/Search tees/i)).toHaveValue("Signature");
    const searchRobots = await page.locator('meta[name="robots"]').getAttribute("content");
    expect(searchRobots).toBe("noindex, follow");

    // Private/transactional noindex, nofollow
    await page.goto("/cart");
    await page.waitForLoadState("networkidle");
    const cartRobots = await page.locator('meta[name="robots"]').getAttribute("content");
    expect(cartRobots).toBe("noindex, nofollow");
  });
});
