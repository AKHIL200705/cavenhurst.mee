import { test, expect } from "@playwright/test";
import {
  cleanupE2eUser,
  closeE2eSql,
  getE2eSql,
  solveSixDigitOtpFromHash,
  waitForOtpHash,
} from "./helpers/e2e-db";

test.describe("Customer Registration, OTP Verification, Welcome & Profile Completion", () => {
  const uniqueSuffix = Date.now();
  const testEmail = `akhilsaiabbireddy2007+e2e${uniqueSuffix}@gmail.com`;
  const testPhone = `9${String(uniqueSuffix).slice(-9)}`;
  const testName = "E2E Heritage Buyer";
  const testPass = "Cavenhusrt@2026";
  let capturedRegKey: string | undefined;

  test.afterAll(async () => {
    await cleanupE2eUser(testEmail, capturedRegKey);
    await closeE2eSql();
  });

  test("registers new user via Email OTP, completes welcome screen, and enforces mandatory profile completion", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    // 1. Open /login and switch to SIGNUP
    await page.goto("/login");
    await page.getByRole("button", { name: "SIGNUP", exact: true }).click();

    await page.getByPlaceholder("Full Legal Name").fill(testName);
    await page.getByPlaceholder("10-Digit Mobile Number").fill(testPhone);
    await page.getByPlaceholder("Email Address").fill(testEmail);
    await page.getByPlaceholder("Password (min 6 characters)").fill(testPass);
    await page.getByPlaceholder("Confirm Password").fill(testPass);

    await page.getByRole("button", { name: /Create Account & Verify Email/i }).click();

    // 2. Verify dedicated Email OTP screen renders with 6 numeric digit boxes
    const completeBtn = page.getByRole("button", { name: /Complete Registration/i });
    await expect(completeBtn).toBeVisible({ timeout: 25_000 });

    capturedRegKey = await page.evaluate(
      () => sessionStorage.getItem("cavenhusrt_reg_key") || undefined,
    );
    expect(capturedRegKey).toMatch(/^reg_[a-f0-9]+$/);

    // Reject intentionally wrong OTP first
    const otpInputs = page.locator('input[inputmode="numeric"]');
    await expect(otpInputs).toHaveCount(6);
    for (let i = 0; i < 6; i++) {
      await otpInputs.nth(i).fill("0");
    }
    await completeBtn.click();
    await expect(page.getByText(/Incorrect verification code/i)).toBeVisible({ timeout: 10_000 });

    // Resolve real OTP matching the stored HMAC hash in PostgreSQL
    const otpHash = await waitForOtpHash(testEmail, "registration");
    const validOtp = solveSixDigitOtpFromHash(testEmail, otpHash);

    for (let i = 0; i < 6; i++) {
      await otpInputs.nth(i).fill(validOtp[i]!);
    }
    await completeBtn.click();

    // 3. First-time authenticated session must route directly to /welcome
    await page.waitForURL(/\/welcome/, { timeout: 25_000 });
    await expect(page.getByRole("heading", { name: /WELCOME/i })).toBeVisible();
    await expect(page.getByText("TO CAVENHUSRT", { exact: true })).toBeVisible();

    const exploreBtn = page.getByRole("button", { name: /EXPLORE CAVENHUSRT/i });
    await exploreBtn.click();

    await page.waitForURL((u) => u.pathname === "/", { timeout: 20_000 });

    // Verify customer_welcome & profile rows exist in PostgreSQL
    const sql = getE2eSql();
    const [profileRow] = await sql<{ id: string; profile_completed: boolean }[]>`
      SELECT id, profile_completed FROM public.profiles WHERE lower(email) = ${testEmail} LIMIT 1
    `;
    expect(profileRow).toBeTruthy();
    expect(profileRow!.profile_completed).toBe(true);

    const [welcomeRow] = await sql<{ user_id: string }[]>`
      SELECT user_id FROM public.customer_welcome WHERE user_id = ${profileRow!.id} LIMIT 1
    `;
    expect(welcomeRow).toBeTruthy();

    // 4. Simulate incomplete profile (e.g. fresh social sign-in) -> verify gate & completion flow
    const altPhone = `8${String(uniqueSuffix).slice(-9)}`;
    await sql`
      UPDATE public.profiles
      SET profile_completed = false, phone = NULL, mobile_number = NULL
      WHERE id = ${profileRow!.id}::uuid
    `;

    await page.goto("/account");
    await page.waitForURL(/\/complete-profile/, { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: /COMPLETE YOUR PROFILE/i })).toBeVisible();

    await page.getByPlaceholder("e.g. Akhil Sai").fill(`${testName} Verified`);
    await page.getByPlaceholder("9876543210").fill(altPhone);
    await page.getByRole("button", { name: /CONTINUE/i }).click();

    await page.waitForURL(/\/account/, { timeout: 20_000 });

    const [updatedProfile] = await sql<
      {
        profile_completed: boolean;
        mobile_number: string | null;
        full_name: string | null;
      }[]
    >`
      SELECT profile_completed, mobile_number, full_name
      FROM public.profiles
      WHERE id = ${profileRow!.id}::uuid
    `;
    expect(updatedProfile?.profile_completed).toBe(true);
    expect(updatedProfile?.mobile_number).toBe(altPhone);
    expect(updatedProfile?.full_name).toBe(`${testName} Verified`);

    expect(pageErrors).toEqual([]);
  });
});
