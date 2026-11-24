import crypto from "node:crypto";
import { getDb } from "@/server/db";
import { getRedis } from "@/server/redis";

// Environment-backed EmailJS configurations
function getEmailJsConfig() {
  const serviceId = (process.env["EMAILJS_SERVICE_ID"] || "").replace(/^["']|["']$/g, "").trim();
  const templateId = (process.env["EMAILJS_TEMPLATE_ID"] || "").replace(/^["']|["']$/g, "").trim();
  const publicKey = (process.env["EMAILJS_PUBLIC_KEY"] || "").replace(/^["']|["']$/g, "").trim();
  const privateKey = (process.env["EMAILJS_PRIVATE_KEY"] || "").replace(/^["']|["']$/g, "").trim();

  return { serviceId, templateId, publicKey, privateKey };
}

/**
 * Mask an email address for safe diagnostics without exposing PII (e.g., a***l@gmail.com).
 */
export function maskEmail(email: string): string {
  if (!email || !email.includes("@")) return "***";
  const [localPart, domain] = email.split("@");
  if (!localPart || !domain) return "***";
  const maskedLocal =
    localPart.length <= 2
      ? localPart[0] + "***"
      : localPart[0] + "***" + localPart.slice(-1);
  return `${maskedLocal}@${domain}`;
}

/**
 * Logs a safe diagnostic record to public.email_delivery_diagnostics.
 * NEVER stores OTPs, passwords, or secrets.
 */
export async function logEmailDiagnostic(params: {
  recipient: string;
  purpose: string;
  otpGenerated: boolean;
  backendStatus: "SUCCESS" | "FAILED";
  emailjsStatus: "SUCCESS" | "FAILED";
  emailjsHttpStatus?: number;
  errorCategory?: string;
  diagnosticMessage: string;
}) {
  const sql = getDb();
  if (!sql) return;

  try {
    await sql`
      INSERT INTO public.email_delivery_diagnostics (
        recipient_masked,
        purpose,
        otp_generated,
        backend_status,
        emailjs_status,
        emailjs_http_status,
        error_category,
        diagnostic_message,
        created_at
      ) VALUES (
        ${maskEmail(params.recipient)},
        ${params.purpose},
        ${params.otpGenerated},
        ${params.backendStatus},
        ${params.emailjsStatus},
        ${params.emailjsHttpStatus || null},
        ${params.errorCategory || null},
        ${params.diagnosticMessage},
        now()
      )
    `;
  } catch (err) {
    console.warn("[Diagnostics Logging Notice]:", err);
  }
}

/**
 * Generates a cryptographically secure 6-digit numerical OTP.
 */
export function generateSixDigitOtp(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

/**
 * Creates a salted SHA-256 hash of the OTP for secure storage in Upstash Redis.
 */
export function hashOtp(otp: string, email: string): string {
  const salt = (process.env["SESSION_SECRET"] || "cavenhurst_default_secret_salt").slice(0, 32);
  return crypto
    .createHmac("sha256", salt)
    .update(`${email.toLowerCase().trim()}:${otp.trim()}`)
    .digest("hex");
}

/**
 * Sends an OTP email through EmailJS REST API.
 * Maps every conceivable recipient parameter variant to guarantee resolution.
 */
export async function sendEmailJsOtp(params: {
  toEmail: string;
  toName?: string;
  otp: string;
  purpose?: string;
  expiryMinutes?: number;
}): Promise<{
  success: boolean;
  error?: string;
  httpStatus?: number;
  errorCategory?: string;
}> {
  const { serviceId, templateId, publicKey, privateKey } = getEmailJsConfig();
  const purpose = params.purpose || "registration";

  if (!serviceId || !templateId || !publicKey) {
    const errorMsg =
      "Email delivery service is not configured. Missing EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, or EMAILJS_PUBLIC_KEY in environment.";
    console.error("[EmailJS Config Error]:", errorMsg);

    await logEmailDiagnostic({
      recipient: params.toEmail,
      purpose,
      otpGenerated: true,
      backendStatus: "FAILED",
      emailjsStatus: "FAILED",
      errorCategory: "MISSING_ENV_VARS",
      diagnosticMessage: errorMsg,
    });

    return {
      success: false,
      error: errorMsg,
      errorCategory: "MISSING_ENV_VARS",
    };
  }

  const expiryText = `${params.expiryMinutes || 5} minutes`;
  const displayName = params.toName || "Customer";

  // Comprehensive template params covering all possible EmailJS template variables
  const templateParams = {
    to_email: params.toEmail,
    email: params.toEmail,
    recipient: params.toEmail,
    recipient_email: params.toEmail,
    user_email: params.toEmail,
    client_email: params.toEmail,
    customer_email: params.toEmail,
    to: params.toEmail,
    reply_to: params.toEmail,
    to_name: displayName,
    name: displayName,
    user_name: displayName,
    otp: params.otp,
    code: params.otp,
    passcode: params.otp,
    verification_code: params.otp,
    expiry: expiryText,
    expiry_minutes: params.expiryMinutes || 5,
  };

  const payload = {
    service_id: serviceId,
    template_id: templateId,
    user_id: publicKey,
    ...(privateKey ? { accessToken: privateKey } : {}),
    template_params: templateParams,
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

      let category = "API_ERROR";
      let userFriendlyError = `Failed to deliver verification email (${res.status}): ${errText || res.statusText}`;

      if (errText.includes("Invalid grant")) {
        category = "GMAIL_AUTH_EXPIRED";
        userFriendlyError =
          "Email service authorization expired. Please reconnect your Gmail account in the EmailJS dashboard.";
      } else if (errText.includes("API access from non-browser environments")) {
        category = "NON_BROWSER_BLOCKED";
        userFriendlyError =
          "Server email access is disabled. Please enable 'Allow EmailJS API for non-browser applications' in EmailJS Account Security.";
      } else if (errText.includes("recipients address is empty")) {
        category = "RECIPIENT_EMPTY";
        userFriendlyError =
          "EmailJS template recipient mapping error: Ensure your template's 'To Email' field uses {{email}} or {{to_email}}.";
      } else if (res.status === 400 || res.status === 404) {
        category = "INVALID_CONFIG";
        userFriendlyError = `Invalid EmailJS configuration: ${errText || "Service ID or Template ID not found."}`;
      } else if (res.status === 429) {
        category = "RATE_LIMIT";
        userFriendlyError = "Email sending quota reached for today. Please try again later.";
      }

      await logEmailDiagnostic({
        recipient: params.toEmail,
        purpose,
        otpGenerated: true,
        backendStatus: "FAILED",
        emailjsStatus: "FAILED",
        emailjsHttpStatus: res.status,
        errorCategory: category,
        diagnosticMessage: errText || res.statusText,
      });

      return {
        success: false,
        error: userFriendlyError,
        httpStatus: res.status,
        errorCategory: category,
      };
    }

    // Success response from EmailJS API (HTTP 200)
    await logEmailDiagnostic({
      recipient: params.toEmail,
      purpose,
      otpGenerated: true,
      backendStatus: "SUCCESS",
      emailjsStatus: "SUCCESS",
      emailjsHttpStatus: 200,
      errorCategory: "NONE",
      diagnosticMessage: "Email accepted by EmailJS API for delivery.",
    });

    return {
      success: true,
      httpStatus: 200,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Network error connecting to email service.";
    console.error("[EmailJS Fetch Error]:", err);

    await logEmailDiagnostic({
      recipient: params.toEmail,
      purpose,
      otpGenerated: true,
      backendStatus: "FAILED",
      emailjsStatus: "FAILED",
      errorCategory: "NETWORK_EXCEPTION",
      diagnosticMessage: errorMsg,
    });

    return {
      success: false,
      error: errorMsg,
      errorCategory: "NETWORK_EXCEPTION",
    };
  }
}

/**
 * Stores or updates an OTP request in Upstash Redis (with PostgreSQL fallback).
 * Enforces rate limiting: 60s cooldown, max 3 resends per 15 minutes, 5-minute expiration.
 */
export async function createOrUpdateOtpRecord(params: {
  email: string;
  otp: string;
  purpose: "registration" | "forgot_password";
  metadata?: Record<string, unknown>;
}): Promise<{ success: boolean; error?: string; cooldownSeconds?: number }> {
  const cleanEmail = params.email.toLowerCase().trim();
  const otpHashed = hashOtp(params.otp, cleanEmail);
  const now = Date.now();
  const redis = getRedis();

  // 1. Upstash Redis Storage Engine
  if (redis) {
    try {
      const cooldownKey = `cavenhurst:cooldown:${params.purpose}:${cleanEmail}`;
      const resendCountKey = `cavenhurst:resend_count:${params.purpose}:${cleanEmail}`;
      const otpKey = `cavenhurst:otp:${params.purpose}:${cleanEmail}`;

      // Check 60-second cooldown
      const inCooldown = await redis.ttl(cooldownKey);
      if (inCooldown > 0) {
        return {
          success: false,
          error: `Please wait ${inCooldown} seconds before requesting a new code.`,
          cooldownSeconds: inCooldown,
        };
      }

      // Check 15-minute resend quota (max 3 resends)
      const currentResends = Number((await redis.get(resendCountKey)) || 0);
      if (currentResends >= 3) {
        const quotaTtl = await redis.ttl(resendCountKey);
        const waitMins = Math.ceil(Math.max(1, quotaTtl) / 60);
        return {
          success: false,
          error: `Too many verification code requests. Please wait ${waitMins} minute(s) before requesting again.`,
        };
      }

      // Store OTP record in Redis with 5-minute TTL (300 seconds)
      const record = {
        otpHash: otpHashed,
        attempts: 0,
        metadata: params.metadata || {},
        createdAt: now,
        expiresAt: now + 5 * 60 * 1000,
      };

      await redis.set(otpKey, JSON.stringify(record), { ex: 300 });

      // Set 60-second cooldown key
      await redis.set(cooldownKey, "1", { ex: 60 });

      // Increment resend counter with 15-minute expiration (900 seconds)
      await redis.incr(resendCountKey);
      if (currentResends === 0) {
        await redis.expire(resendCountKey, 900);
      }

      // Dual-sync to PostgreSQL audit table
      const sql = getDb();
      if (sql) {
        sql`
          INSERT INTO public.email_verification_otps (
            email, otp_hash, purpose, metadata, attempts, resend_count, last_sent_at, expires_at, created_at
          ) VALUES (
            ${cleanEmail}, ${otpHashed}, ${params.purpose}, ${sql.json(params.metadata || {})}, 0, ${currentResends + 1}, now(), now() + interval '5 minutes', now()
          )
        `.catch(() => {});
      }

      return { success: true };
    } catch (redisErr) {
      console.warn("[Upstash Redis Store Notice - Falling back to Postgres]:", redisErr);
    }
  }

  // 2. Direct PostgreSQL Storage Engine Fallback
  const sql = getDb();
  if (!sql) {
    return { success: false, error: "Database and cache services are currently unreachable." };
  }

  try {
    const [existing] = await sql<any[]>`
      SELECT id, otp_hash, attempts, resend_count, last_sent_at, expires_at, created_at
      FROM public.email_verification_otps
      WHERE lower(email) = ${cleanEmail} AND purpose = ${params.purpose}
      LIMIT 1
    `;

    if (existing) {
      const lastSent = new Date(existing.last_sent_at).getTime();
      const timeSinceLastSentSec = Math.floor((now - lastSent) / 1000);

      if (timeSinceLastSentSec < 60) {
        return {
          success: false,
          error: `Please wait ${60 - timeSinceLastSentSec} seconds before requesting a new code.`,
          cooldownSeconds: 60 - timeSinceLastSentSec,
        };
      }

      const firstCreatedAt = new Date(existing.created_at).getTime();
      const fifteenMinutesAgo = now - 15 * 60 * 1000;

      if (firstCreatedAt > fifteenMinutesAgo && existing.resend_count >= 3) {
        return {
          success: false,
          error: "Too many verification code requests. Please wait 15 minutes and try again.",
        };
      }

      const newResendCount = firstCreatedAt > fifteenMinutesAgo ? existing.resend_count + 1 : 1;
      const newCreatedAt = firstCreatedAt > fifteenMinutesAgo ? existing.created_at : new Date(now).toISOString();

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
 * Removes an unverified OTP record if email dispatch failed.
 * Prevents locking the customer into a cooldown when delivery was unsuccessful.
 */
export async function deleteOtpRecord(email: string, purpose: string): Promise<void> {
  const cleanEmail = email.toLowerCase().trim();
  const redis = getRedis();

  if (redis) {
    try {
      const otpKey = `cavenhurst:otp:${purpose}:${cleanEmail}`;
      const cooldownKey = `cavenhurst:cooldown:${purpose}:${cleanEmail}`;
      await redis.del(otpKey, cooldownKey);
    } catch (err) {
      console.warn("[Redis Rollback Notice]:", err);
    }
  }

  const sql = getDb();
  if (!sql) return;
  try {
    await sql`
      DELETE FROM public.email_verification_otps
      WHERE lower(email) = ${cleanEmail} AND purpose = ${purpose}
    `;
  } catch (err) {
    console.warn("[Postgres OTP Rollback Notice]:", err);
  }
}

/**
 * Verifies an OTP submitted by the customer using Upstash Redis (with Postgres fallback).
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
  const cleanEmail = params.email.toLowerCase().trim();
  const cleanOtp = params.otp.trim();
  const expectedHash = hashOtp(cleanOtp, cleanEmail);
  const redis = getRedis();

  // 1. Upstash Redis Verification
  if (redis) {
    try {
      const otpKey = `cavenhurst:otp:${params.purpose}:${cleanEmail}`;
      const rawData = await redis.get(otpKey);

      if (rawData) {
        const record = typeof rawData === "string" ? JSON.parse(rawData) : (rawData as any);

        // Check expiration
        if (record.expiresAt && Date.now() > record.expiresAt) {
          await redis.del(otpKey);
          return {
            success: false,
            error: "Verification code has expired. Please request a new code.",
          };
        }

        // Check max attempts (5)
        const currentAttempts = Number(record.attempts || 0);
        if (currentAttempts >= 5) {
          await redis.del(otpKey);
          return {
            success: false,
            error: "Too many incorrect attempts. For security, please request a new verification code.",
          };
        }

        // Verify cryptographic hash match
        if (record.otpHash !== expectedHash) {
          const newAttempts = currentAttempts + 1;
          const remaining = Math.max(0, 5 - newAttempts);
          record.attempts = newAttempts;

          const ttl = await redis.ttl(otpKey);
          if (ttl > 0) {
            await redis.set(otpKey, JSON.stringify(record), { ex: ttl });
          }

          return {
            success: false,
            error: `Incorrect verification code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`,
            attemptsRemaining: remaining,
          };
        }

        // Match! Atomic one-time use invalidation
        await redis.del(otpKey);
        deleteOtpRecord(cleanEmail, params.purpose).catch(() => {});

        return {
          success: true,
          metadata: record.metadata || {},
        };
      }
    } catch (redisErr) {
      console.warn("[Upstash Redis Verify Notice - Falling back to Postgres]:", redisErr);
    }
  }

  // 2. Direct PostgreSQL Fallback Verification
  const sql = getDb();
  if (!sql) {
    return { success: false, error: "Database connection unavailable." };
  }

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

    if (new Date(record.expires_at).getTime() < Date.now()) {
      await sql`DELETE FROM public.email_verification_otps WHERE id = ${record.id}`;
      return {
        success: false,
        error: "Verification code has expired. Please request a new code.",
      };
    }

    if (record.attempts >= 5) {
      await sql`DELETE FROM public.email_verification_otps WHERE id = ${record.id}`;
      return {
        success: false,
        error: "Too many incorrect attempts. For security, please request a new verification code.",
      };
    }

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
