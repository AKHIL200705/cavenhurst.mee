import crypto from "node:crypto";
import { getDb } from "@/server/db";

// Environment-backed EmailJS configurations
function getEmailJsConfig() {
  const serviceId = (process.env["EMAILJS_SERVICE_ID"] || "").replace(/^["']|["']$/g, "").trim();
  const templateId = (process.env["EMAILJS_TEMPLATE_ID"] || "").replace(/^["']|["']$/g, "").trim();
  const publicKey = (process.env["EMAILJS_PUBLIC_KEY"] || "").replace(/^["']|["']$/g, "").trim();
  const privateKey = (process.env["EMAILJS_PRIVATE_KEY"] || "").replace(/^["']|["']$/g, "").trim();

  return { serviceId, templateId, publicKey, privateKey };
}

/**
 * Generates a cryptographically secure 6-digit numerical OTP.
 */
export function generateSixDigitOtp(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

/**
 * Creates a salted SHA-256 hash of the OTP for secure database storage.
 */
export function hashOtp(otp: string, email: string): string {
  const salt = (process.env["SESSION_SECRET"] || "cavenhurst_default_secret_salt")
    .slice(0, 32);
  return crypto
    .createHmac("sha256", salt)
    .update(`${email.toLowerCase().trim()}:${otp.trim()}`)
    .digest("hex");
}

/**
 * Sends an OTP email through EmailJS REST API.
 */
export async function sendEmailJsOtp(params: {
  toEmail: string;
  otp: string;
  expiryMinutes?: number;
}): Promise<{ success: boolean; error?: string }> {
  const { serviceId, templateId, publicKey, privateKey } = getEmailJsConfig();

  if (!serviceId || !templateId || !publicKey) {
    console.error("[EmailJS] Missing credentials in server environment variables.");
    return {
      success: false,
      error: "Email delivery service is not configured. Please check server environment settings.",
    };
  }

  const expiryText = `${params.expiryMinutes || 5} minutes`;
  const payload = {
    service_id: serviceId,
    template_id: templateId,
    user_id: publicKey,
    ...(privateKey ? { accessToken: privateKey } : {}),
    template_params: {
      to_email: params.toEmail,
      email: params.toEmail,
      otp: params.otp,
      code: params.otp,
      passcode: params.otp,
      expiry: expiryText,
      expiry_minutes: params.expiryMinutes || 5,
    },
  };

  try {
    const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Origin": "https://cavenhurst.com",
        "User-Agent": "CAVENHURST-Server/1.0",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("[EmailJS Error]:", res.status, errText);

      if (errText.includes("Invalid grant")) {
        return {
          success: false,
          error: "Email service connection needs re-authorization in EmailJS dashboard (Gmail grant expired).",
        };
      }
      if (errText.includes("API access from non-browser environments")) {
        return {
          success: false,
          error: "Server email access is disabled. Please enable 'Allow EmailJS API for non-browser applications' in EmailJS Account Security.",
        };
      }
      return {
        success: false,
        error: `Failed to deliver verification email (${res.status}): ${errText || res.statusText}`,
      };
    }

    return { success: true };
  } catch (err) {
    console.error("[EmailJS Fetch Error]:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to connect to email delivery service.",
    };
  }
}

/**
 * Stores or updates an OTP request in public.email_verification_otps table.
 * Enforces rate limiting: 60s cooldown, max 3 resends per 15 minutes, max 5 attempts.
 */
export async function createOrUpdateOtpRecord(params: {
  email: string;
  otp: string;
  purpose: "registration" | "forgot_password";
  metadata?: Record<string, unknown>;
}): Promise<{ success: boolean; error?: string; cooldownSeconds?: number }> {
  const sql = getDb();
  if (!sql) {
    return { success: false, error: "Database connection unavailable." };
  }

  const cleanEmail = params.email.toLowerCase().trim();
  const otpHashed = hashOtp(params.otp, cleanEmail);
  const now = new Date();

  try {
    // Check existing OTP for this email and purpose
    const [existing] = await sql<any[]>`
      SELECT id, otp_hash, attempts, resend_count, last_sent_at, expires_at, created_at
      FROM public.email_verification_otps
      WHERE lower(email) = ${cleanEmail} AND purpose = ${params.purpose}
      LIMIT 1
    `;

    if (existing) {
      const lastSent = new Date(existing.last_sent_at).getTime();
      const timeSinceLastSentSec = Math.floor((now.getTime() - lastSent) / 1000);

      // 60-second cooldown between resends
      if (timeSinceLastSentSec < 60) {
        return {
          success: false,
          error: `Please wait ${60 - timeSinceLastSentSec} seconds before requesting a new code.`,
          cooldownSeconds: 60 - timeSinceLastSentSec,
        };
      }

      // Max 3 resend attempts within 15 minutes
      const firstCreatedAt = new Date(existing.created_at).getTime();
      const fifteenMinutesAgo = now.getTime() - 15 * 60 * 1000;

      if (firstCreatedAt > fifteenMinutesAgo && existing.resend_count >= 3) {
        return {
          success: false,
          error: "Too many verification code requests. Please wait 15 minutes and try again.",
        };
      }

      // Reset or increment resend counter depending on 15m window
      const newResendCount = firstCreatedAt > fifteenMinutesAgo ? existing.resend_count + 1 : 1;
      const newCreatedAt = firstCreatedAt > fifteenMinutesAgo ? existing.created_at : now.toISOString();

      await sql`
        UPDATE public.email_verification_otps SET
          otp_hash = ${otpHashed},
          metadata = ${sql.json(params.metadata || {})},
          attempts = 0,
          resend_count = ${newResendCount},
          last_sent_at = now(),
          expires_at = now() + interval '5 minutes',
          created_at = ${newCreatedAt}
        WHERE id = ${existing.id}
      `;
    } else {
      await sql`
        INSERT INTO public.email_verification_otps (
          email, otp_hash, purpose, metadata, attempts, resend_count, last_sent_at, expires_at, created_at
        ) VALUES (
          ${cleanEmail}, ${otpHashed}, ${params.purpose}, ${sql.json(params.metadata || {})}, 0, 0, now(), now() + interval '5 minutes', now()
        )
      `;
    }

    return { success: true };
  } catch (err) {
    console.error("[OTP Store Error]:", err);
    return { success: false, error: "Database error recording verification code." };
  }
}

/**
 * Verifies an OTP submitted by the customer.
 */
export async function verifyOtpRecord(params: {
  email: string;
  otp: string;
  purpose: "registration" | "forgot_password";
}): Promise<{
  success: boolean;
  error?: string;
  metadata?: Record<string, unknown>;
  attemptsRemaining?: number;
}> {
  const sql = getDb();
  if (!sql) {
    return { success: false, error: "Database connection unavailable." };
  }

  const cleanEmail = params.email.toLowerCase().trim();
  const cleanOtp = params.otp.trim();

  try {
    const [record] = await sql<any[]>`
      SELECT id, otp_hash, metadata, attempts, expires_at
      FROM public.email_verification_otps
      WHERE lower(email) = ${cleanEmail} AND purpose = ${params.purpose}
      LIMIT 1
    `;

    if (!record) {
      return {
        success: false,
        error: "No verification code was requested for this email. Please request a new code.",
      };
    }

    // Check expiration (5 minutes)
    if (new Date(record.expires_at).getTime() < Date.now()) {
      await sql`DELETE FROM public.email_verification_otps WHERE id = ${record.id}`;
      return {
        success: false,
        error: "Verification code has expired. Please request a new code.",
      };
    }

    // Check max attempts (5)
    if (record.attempts >= 5) {
      await sql`DELETE FROM public.email_verification_otps WHERE id = ${record.id}`;
      return {
        success: false,
        error: "Too many incorrect attempts. For security, please request a new verification code.",
      };
    }

    // Verify hash match
    const expectedHash = hashOtp(cleanOtp, cleanEmail);
    if (record.otp_hash !== expectedHash) {
      const newAttempts = record.attempts + 1;
      const remaining = Math.max(0, 5 - newAttempts);

      await sql`
        UPDATE public.email_verification_otps SET
          attempts = ${newAttempts}
        WHERE id = ${record.id}
      `;

      return {
        success: false,
        error: `Incorrect verification code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`,
        attemptsRemaining: remaining,
      };
    }

    // Successful match - delete OTP record (one-time use)
    await sql`DELETE FROM public.email_verification_otps WHERE id = ${record.id}`;

    return {
      success: true,
      metadata: record.metadata || {},
    };
  } catch (err) {
    console.error("[OTP Verify Error]:", err);
    return { success: false, error: "Database error during code verification." };
  }
}
