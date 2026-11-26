import { test, expect } from "@playwright/test";

test.describe("Mobile Responsiveness, Live PIN Serviceability & Bag Variant Updates", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("renders without horizontal overflow on mobile and supports live PIN check & cart variant switching", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    async function assertNoHorizontalOverflow() {
      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth + 1);
    }

    // 1. Homepage mobile layout check
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: /Urban\s*Motion/i })).toBeVisible({
      timeout: 20_000,
    });
    await assertNoHorizontalOverflow();

    // 2. Shop catalog mobile layout check
    await page.goto("/shop");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: /Shop All/i })).toBeVisible();
    await assertNoHorizontalOverflow();

    // 3. Product detail mobile check + server PIN serviceability
    await page.locator('a[href^="/product/"]').first().click();
    await page.waitForURL(/\/product\//, { timeout: 20_000 });
    await page.waitForLoadState("networkidle");
    await assertNoHorizontalOverflow();

    await page.getByPlaceholder("Enter PIN code").fill("521212");
    await page.getByRole("button", { name: "Check", exact: true }).click();
    await expect(
      page.getByText(/Delivery to 521212|pending merchant credentials|currently unavailable/i),
    ).toBeVisible({
      timeout: 15_000,
    });

    // 4. Add size M -> switch variant cleanly in mobile /cart
    await page.getByRole("button", { name: "M", exact: true }).click();
    await page.getByRole("button", { name: "Add to Cart", exact: true }).click();
    await expect(page.getByText(/Added to bag/i)).toBeVisible({ timeout: 10_000 });

    await page.goto("/cart");
    await page.waitForLoadState("networkidle");
    await assertNoHorizontalOverflow();

    const sizeSelect = page.locator('select[aria-label^="Size for "]').first();
    await expect(sizeSelect).toBeVisible();
    await sizeSelect.selectOption("L");
    await expect(sizeSelect).toHaveValue("L");

    // 5. Guest Proceed to Checkout -> redirects cleanly to mobile /login?returnTo=... without overflow
    await page.getByRole("link", { name: /Proceed to Checkout/i }).click();
    await page.waitForURL(/\/login\?returnTo=/, { timeout: 15_000 });
    await assertNoHorizontalOverflow();

    // 6. Open Search page on mobile -> verify filter chips & zero horizontal overflow
    await page.goto("/search");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: /^Search$/i })).toBeVisible();
    await assertNoHorizontalOverflow();

    expect(pageErrors).toEqual([]);
  });

  test("renders cleanly without horizontal overflow across small mobile (320px) and tablet (768px)", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    const viewports = [
      { width: 320, height: 568 },
      { width: 768, height: 1024 },
    ];
    const routes = [
      "/",
      "/shop",
      "/product/signature-oversized-tee",
      "/cart",
      "/login",
      "/complete-profile",
      "/admin/login",
    ];

    for (const vp of viewports) {
      await page.setViewportSize(vp);
      for (const route of routes) {
        await page.goto(route);
        await page.waitForLoadState("networkidle");
        const overflow = await page.evaluate(() => {
          const sw = document.documentElement.scrollWidth;
          const iw = window.innerWidth;
          const culprits =
            sw > iw + 1
              ? [...document.querySelectorAll("*")]
                  .filter((el) => {
                    if (el === document.documentElement || el === document.body) return false;
                    let par = el.parentElement;
                    while (par) {
                      const ps = getComputedStyle(par);
                      if (
                        ps.overflowX === "auto" ||
                        ps.overflowX === "scroll" ||
                        ps.overflowX === "hidden"
                      ) {
                        return false;
                      }
                      par = par.parentElement;
                    }
                    const r = el.getBoundingClientRect();
                    return r.right > iw + 0.5 || r.left < -0.5 || el.scrollWidth > iw + 0.5;
                  })
                  .slice(0, 12)
                  .map((el) => ({
                    tag: el.tagName,
                    cls: String(el.className || "").slice(0, 60),
                    l: Math.round(el.getBoundingClientRect().left),
                    r: Math.round(el.getBoundingClientRect().right),
                    sw: el.scrollWidth,
                    txt: (el.textContent || "").trim().slice(0, 25),
                  }))
              : [];
          return { scrollWidth: sw, innerWidth: iw, route: location.pathname, culprits };
        });
        expect(overflow.scrollWidth, JSON.stringify(overflow)).toBeLessThanOrEqual(
          overflow.innerWidth + 1,
        );
        const headerOverlap = await page.evaluate(() => {
          const header = document.querySelector("header");
          if (!header) return false;
          const logo = header.querySelector('a[aria-label*="home"] span');
          const searchLink = header.querySelector('a[aria-label="Search"]');
          const menuBtn = header.querySelector('button[aria-label="Open menu"]');
          if (!logo || !searchLink || !menuBtn) return false;
          const lr = logo.getBoundingClientRect();
          const sr = searchLink.getBoundingClientRect();
          const mr = menuBtn.getBoundingClientRect();
          return mr.right > lr.left + 1 || lr.right > sr.left + 1;
        });
        expect(headerOverlap).toBe(false);
      }

      await page.goto("/product/signature-oversized-tee");
      await page.waitForLoadState("networkidle");
      await page.getByRole("button", { name: /Size guide/i }).click();
      await expect(page.getByRole("heading", { name: /Size guide/i })).toBeVisible();
      const modalOverflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      expect(modalOverflow.scrollWidth).toBeLessThanOrEqual(modalOverflow.innerWidth + 1);
    }

    expect(pageErrors).toEqual([]);
  });
});
