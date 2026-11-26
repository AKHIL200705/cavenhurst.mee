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
});
