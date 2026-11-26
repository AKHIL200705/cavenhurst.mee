import crypto from "node:crypto";
import { getDb } from "@/server/db";
import { getRedis } from "@/server/redis";

interface EmailVerificationOtpRow {
  id: string;
  otp_hash: string;
  metadata?: Record<string, unknown> | null;
  attempts: number;
  resend_count: number;
  last_sent_at: string;
  expires_at: string;
  created_at: string;
}

interface RedisOtpRecord {
  otpHash: string;
  attempts?: number;
  expiresAt?: number;
  metadata?: Record<string, unknown>;
}

interface RedisRegLinkRecord {
  registrationKey?: string;
}

function parseJsonRecord<T>(raw: unknown): T {
  return typeof raw === "string" ? (JSON.parse(raw) as T) : (raw as T);
}

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
    localPart.length <= 2 ? localPart[0] + "***" : localPart[0] + "***" + localPart.slice(-1);
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
 * Generates a cryptographically secure registration identifier.
 * Format: reg_<48 hex characters>
 */
export function generateRegistrationKey(): string {
  return `reg_${crypto.randomBytes(24).toString("hex")}`;
}

/**
 * Returns a 32-byte key derived from the session secret for AES-256-GCM authenticated encryption.
 */
function getEncryptionKey(): Buffer {
  const secret =
    process.env["SESSION_SECRET"] || "cavenhurst_registration_secret_encryption_salt_key_32b";
  return crypto.createHash("sha256").update(secret).digest();
}

/**
 * Encrypts a customer's password during pending OTP registration using AES-256-GCM.
 * Never stores plaintext passwords in Redis, database, or browser storage.
 */
export function encryptPendingPassword(password: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(password, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * Decrypts a customer's password only upon verified OTP completion.
 */
export function decryptPendingPassword(payload: string): string {
  const parts = (payload || "").split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted password payload format");
  }
  const [ivHex, tagHex, dataHex] = parts as [string, string, string];
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const data = Buffer.from(dataHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString("utf8");
}

export interface PendingRegistrationRecord {
  registrationKey: string;
  email: string;
  fullName: string;
  phone: string;
  encryptedPassword: string;
  otpHash: string;
  attempts: number;
  createdAt: number;
  expiresAt: number;
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
  if (process.env["E2E_DRY_RUN_EMAILJS"] === "true") {
    return {
      success: true,
      httpStatus: 200,
    };
  }

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

  const expiryMinutes = params.expiryMinutes || 5;
  const expiryText = `${expiryMinutes} minutes`;
  const displayName = params.toName || "Customer";
  const purposeLabel =
    purpose === "forgot_password"
      ? "password reset"
      : purpose === "test"
        ? "diagnostic test"
        : "account verification";

  // Comprehensive template params covering common EmailJS template variables without self-spoofing reply_to
  const templateParams = {
    to_email: params.toEmail,
    email: params.toEmail,
    recipient: params.toEmail,
    recipient_email: params.toEmail,
    user_email: params.toEmail,
    client_email: params.toEmail,
    customer_email: params.toEmail,
    to: params.toEmail,
    reply_to: "cavenhurst@gmail.com",
    to_name: displayName,
    name: displayName,
    user_name: displayName,
    company_name: "CAVENHURST",
    brand: "CAVENHURST",
    otp: params.otp,
    otp_code: params.otp,
    code: params.otp,
    passcode: params.otp,
    verification_code: params.otp,
    expiry: expiryText,
    expiry_minutes: expiryMinutes,
    message: `Your CAVENHURST ${purposeLabel} OTP is ${params.otp}. It expires in ${expiryText}.`,
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
        Origin: "https://cavenhurst.com",
        "User-Agent": "CAVENHURST-Server/1.0",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(12_000),
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
      } else if (res.status === 403 || res.status === 429) {
        category = "RATE_LIMIT";
        userFriendlyError =
          "Email sending limit or quota reached in EmailJS. Please verify your EmailJS dashboard quota.";
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

    const okBody = (await res.text().catch(() => "")).trim();

    // Success response from EmailJS API (HTTP 200)
    await logEmailDiagnostic({
      recipient: params.toEmail,
      purpose,
      otpGenerated: true,
      backendStatus: "SUCCESS",
      emailjsStatus: "SUCCESS",
      emailjsHttpStatus: res.status,
      errorCategory: "NONE",
      diagnosticMessage: okBody
        ? `Email accepted by EmailJS API (${res.status}: ${okBody}).`
        : "Email accepted by EmailJS API for delivery.",
    });

    return {
      success: true,
      httpStatus: res.status,
    };
  } catch (err) {
    const errorMsg =
      err instanceof Error ? err.message : "Network error connecting to email service.";
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
 * Atomically claims the 60s OTP cooldown slot and enforces the 15-minute resend quota in Redis.
 * Prevents concurrent double-clicks from dispatching duplicate conflicting OTP codes.
 */
async function acquireRedisOtpRateSlot(
  redis: NonNullable<ReturnType<typeof getRedis>>,
  cooldownKey: string,
  resendCountKey: string,
): Promise<
  | { allowed: true; nextResendCount: number }
  | { allowed: false; error: string; cooldownSeconds?: number }
> {
  const currentResends = Number((await redis.get(resendCountKey)) || 0);
  if (currentResends >= 3) {
    const quotaTtl = await redis.ttl(resendCountKey);
    const waitMins = Math.ceil(Math.max(1, quotaTtl) / 60);
    return {
      allowed: false,
      error: `Too many verification code requests. Please wait ${waitMins} minute(s) before requesting again.`,
    };
  }

  const lockAcquired = await redis.set(cooldownKey, "1", { ex: 60, nx: true });
  if (!lockAcquired) {
    const ttl = await redis.ttl(cooldownKey);
    const waitSeconds = ttl > 0 ? ttl : 60;
    return {
      allowed: false,
      error: `Please wait ${waitSeconds} seconds before requesting a new code.`,
      cooldownSeconds: waitSeconds,
    };
  }

  const nextResendCount = Number(await redis.incr(resendCountKey));
  if (nextResendCount === 1) {
    await redis.expire(resendCountKey, 900);
  }
  return { allowed: true, nextResendCount };
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

      const rateSlot = await acquireRedisOtpRateSlot(redis, cooldownKey, resendCountKey);
      if (!rateSlot.allowed) {
        return {
          success: false,
          error: rateSlot.error,
          ...(rateSlot.cooldownSeconds !== undefined
            ? { cooldownSeconds: rateSlot.cooldownSeconds }
            : {}),
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

      // Dual-sync to PostgreSQL audit table
      const sql = getDb();
      if (sql) {
        sql`
          INSERT INTO public.email_verification_otps (
            email, otp_hash, purpose, metadata, attempts, resend_count, last_sent_at, expires_at, created_at
          ) VALUES (
            ${cleanEmail}, ${otpHashed}, ${params.purpose}, ${sql.json(params.metadata || {})}, 0, ${rateSlot.nextResendCount}, now(), now() + interval '5 minutes', now()
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
    const [existing] = await sql<EmailVerificationOtpRow[]>`
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
      const newCreatedAt =
        firstCreatedAt > fifteenMinutesAgo ? existing.created_at : new Date(now).toISOString();

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
        const record = parseJsonRecord<RedisOtpRecord>(rawData);

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
            error:
              "Too many incorrect attempts. For security, please request a new verification code.",
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
    const [record] = await sql<EmailVerificationOtpRow[]>`
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

// -----------------------------------------------------------------------------
// DEDICATED REGISTRATION SESSION ENGINE (UPSTASH REDIS + KEY BINDING)
// -----------------------------------------------------------------------------

/**
 * Creates or updates a pending registration session in Upstash Redis.
 * Generates an unguessable registrationKey and encrypts the password with AES-256-GCM.
 */
export async function createOrUpdateRegistrationSession(params: {
  email: string;
  fullName: string;
  phone: string;
  password: string;
  otp: string;
}): Promise<{
  success: boolean;
  registrationKey?: string;
  error?: string;
  cooldownSeconds?: number;
}> {
  const cleanEmail = params.email.toLowerCase().trim();
  const cleanPhone = params.phone.replace(/\D/g, "").slice(-10);
  const cleanName = params.fullName.trim();
  const now = Date.now();
  const redis = getRedis();

  const cooldownKey = `cavenhurst:cooldown:registration:${cleanEmail}`;
  const resendCountKey = `cavenhurst:resend_count:registration:${cleanEmail}`;
  const emailLinkKey = `cavenhurst:otp:registration:${cleanEmail}`;

  if (redis) {
    try {
      const rateSlot = await acquireRedisOtpRateSlot(redis, cooldownKey, resendCountKey);
      if (!rateSlot.allowed) {
        return {
          success: false,
          error: rateSlot.error,
          ...(rateSlot.cooldownSeconds !== undefined
            ? { cooldownSeconds: rateSlot.cooldownSeconds }
            : {}),
        };
      }

      // Check for an existing registration session for this email and clean up old key
      const existingLink = await redis.get(emailLinkKey);
      if (existingLink) {
        try {
          const parsed = parseJsonRecord<RedisRegLinkRecord>(existingLink);
          if (parsed?.registrationKey && typeof parsed.registrationKey === "string") {
            await redis.del(`cavenhurst:reg:${parsed.registrationKey}`);
          }
        } catch {
          /* ignore */
        }
      }

      const registrationKey = generateRegistrationKey();
      const encryptedPassword = encryptPendingPassword(params.password);
      const otpHashed = hashOtp(params.otp, cleanEmail);

      const record: PendingRegistrationRecord = {
        registrationKey,
        email: cleanEmail,
        fullName: cleanName,
        phone: cleanPhone,
        encryptedPassword,
        otpHash: otpHashed,
        attempts: 0,
        createdAt: now,
        expiresAt: now + 5 * 60 * 1000,
      };

      // Store full registration record in Upstash Redis (5-minute TTL / 300s)
      await redis.set(`cavenhurst:reg:${registrationKey}`, JSON.stringify(record), { ex: 300 });

      // Link email to registrationKey & OTP hash for fast lookup and resend safety
      await redis.set(
        emailLinkKey,
        JSON.stringify({
          registrationKey,
          otpHash: otpHashed,
          attempts: 0,
          expiresAt: record.expiresAt,
        }),
        { ex: 300 },
      );

      // Dual-sync to Postgres audit table
      const sql = getDb();
      if (sql) {
        sql`
          INSERT INTO public.email_verification_otps (
            email, otp_hash, purpose, metadata, attempts, resend_count, last_sent_at, expires_at, created_at
          ) VALUES (
            ${cleanEmail}, ${otpHashed}, 'registration', ${sql.json({
              registrationKey,
              fullName: cleanName,
              phone: cleanPhone,
              encryptedPassword,
            })}, 0, ${rateSlot.nextResendCount}, now(), now() + interval '5 minutes', now()
          )
        `.catch(() => {});
      }

      return {
        success: true,
        registrationKey,
      };
    } catch (redisErr) {
      console.warn(
        "[Upstash Redis Reg Session Store Notice - Falling back to Postgres]:",
        redisErr,
      );
    }
  }

  // Postgres Fallback
  const sql = getDb();
  if (!sql) {
    return { success: false, error: "Database and cache services are currently unreachable." };
  }

  try {
    const registrationKey = generateRegistrationKey();
    const encryptedPassword = encryptPendingPassword(params.password);
    const otpHashed = hashOtp(params.otp, cleanEmail);

    const [existing] = await sql<EmailVerificationOtpRow[]>`
      SELECT id, resend_count, last_sent_at, created_at
      FROM public.email_verification_otps
      WHERE lower(email) = ${cleanEmail} AND purpose = 'registration'
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
      if (existing.resend_count >= 3) {
        return {
          success: false,
          error:
            "Too many verification code requests. Please wait 15 minutes before requesting again.",
        };
      }

      await sql`
        UPDATE public.email_verification_otps SET
          otp_hash = ${otpHashed},
          metadata = ${sql.json({ registrationKey, fullName: cleanName, phone: cleanPhone, encryptedPassword })},
          attempts = 0,
          resend_count = ${existing.resend_count + 1},
          last_sent_at = now(),
          expires_at = now() + interval '5 minutes'
        WHERE id = ${existing.id}
      `;
    } else {
      await sql`
        INSERT INTO public.email_verification_otps (
          email, otp_hash, purpose, metadata, attempts, resend_count, last_sent_at, expires_at, created_at
        ) VALUES (
          ${cleanEmail}, ${otpHashed}, 'registration', ${sql.json({
            registrationKey,
            fullName: cleanName,
            phone: cleanPhone,
            encryptedPassword,
          })}, 0, 1, now(), now() + interval '5 minutes', now()
        )
      `;
    }

    return { success: true, registrationKey };
  } catch (err) {
    console.error("[Postgres Reg Session Store Error]:", err);
    return { success: false, error: "Failed to store registration record." };
  }
}

/**
 * Resends a registration OTP while preserving the active registrationKey.
 */
export async function resendRegistrationSessionOtp(params: {
  registrationKey?: string;
  email?: string;
  otp: string;
}): Promise<{
  success: boolean;
  registrationKey?: string;
  email?: string;
  fullName?: string;
  error?: string;
  cooldownSeconds?: number;
}> {
  const redis = getRedis();
  const cleanKey = (params.registrationKey || "").trim();
  const cleanEmail = (params.email || "").toLowerCase().trim();
  const now = Date.now();

  let record: PendingRegistrationRecord | null = null;

  if (redis) {
    try {
      // 1. Try to find by registrationKey
      if (cleanKey) {
        const raw = await redis.get(`cavenhurst:reg:${cleanKey}`);
        if (raw) {
          record = parseJsonRecord<PendingRegistrationRecord>(raw);
        }
      }

      // 2. Fallback to find by email link
      if (!record && cleanEmail) {
        const rawLink = await redis.get(`cavenhurst:otp:registration:${cleanEmail}`);
        if (rawLink) {
          const parsedLink = parseJsonRecord<RedisRegLinkRecord>(rawLink);
          if (parsedLink?.registrationKey) {
            const raw = await redis.get(`cavenhurst:reg:${parsedLink.registrationKey}`);
            if (raw) {
              record = parseJsonRecord<PendingRegistrationRecord>(raw);
            }
          }
        }
      }

      if (record) {
        const cooldownKey = `cavenhurst:cooldown:registration:${record.email}`;
        const resendCountKey = `cavenhurst:resend_count:registration:${record.email}`;

        const rateSlot = await acquireRedisOtpRateSlot(redis, cooldownKey, resendCountKey);
        if (!rateSlot.allowed) {
          return {
            success: false,
            error: rateSlot.error,
            ...(rateSlot.cooldownSeconds !== undefined
              ? { cooldownSeconds: rateSlot.cooldownSeconds }
              : {}),
          };
        }

        const newOtpHash = hashOtp(params.otp, record.email);
        record.otpHash = newOtpHash;
        record.attempts = 0;
        record.expiresAt = now + 5 * 60 * 1000;

        // Save back with refreshed 5-minute TTL
        await redis.set(`cavenhurst:reg:${record.registrationKey}`, JSON.stringify(record), {
          ex: 300,
        });
        await redis.set(
          `cavenhurst:otp:registration:${record.email}`,
          JSON.stringify({
            registrationKey: record.registrationKey,
            otpHash: newOtpHash,
            attempts: 0,
            expiresAt: record.expiresAt,
          }),
          { ex: 300 },
        );

        const sql = getDb();
        if (sql) {
          sql`
            INSERT INTO public.email_verification_otps (
              email, otp_hash, purpose, metadata, attempts, resend_count, last_sent_at, expires_at, created_at
            ) VALUES (
              ${record.email}, ${newOtpHash}, 'registration', ${sql.json({
                registrationKey: record.registrationKey,
                fullName: record.fullName,
                phone: record.phone,
                encryptedPassword: record.encryptedPassword,
              })}, 0, ${rateSlot.nextResendCount}, now(), now() + interval '5 minutes', now()
            )
          `.catch(() => {});
        }

        return {
          success: true,
          registrationKey: record.registrationKey,
          email: record.email,
          fullName: record.fullName,
        };
      }
    } catch (redisErr) {
      console.warn("[Upstash Redis Resend Notice]:", redisErr);
    }
  }

  // Postgres Fallback
  const sql = getDb();
  if (sql && (cleanEmail || cleanKey)) {
    try {
      const [existing] = await sql<EmailVerificationOtpRow[]>`
        SELECT id, metadata, resend_count, last_sent_at, expires_at
        FROM public.email_verification_otps
        WHERE (
          (${cleanEmail !== ""} AND lower(email) = ${cleanEmail})
          OR (${cleanKey !== ""} AND metadata->>'registrationKey' = ${cleanKey})
        ) AND purpose = 'registration'
        LIMIT 1
      `;

      if (existing) {
        const lastSent = new Date(existing.last_sent_at).getTime();
        const timeSince = Math.floor((now - lastSent) / 1000);
        if (timeSince < 60) {
          return {
            success: false,
            error: `Please wait ${60 - timeSince} seconds before requesting a new code.`,
            cooldownSeconds: 60 - timeSince,
          };
        }
        if (existing.resend_count >= 3) {
          return {
            success: false,
            error:
              "Too many verification code requests. Please wait 15 minutes before requesting again.",
          };
        }

        const metadata = (existing.metadata || {}) as Record<string, string>;
        const emailToUse = cleanEmail || metadata["email"] || "";
        const newOtpHash = hashOtp(params.otp, emailToUse);
        const regKey = metadata["registrationKey"] || cleanKey || generateRegistrationKey();
        metadata["registrationKey"] = regKey;

        await sql`
          UPDATE public.email_verification_otps SET
            otp_hash = ${newOtpHash},
            metadata = ${sql.json(metadata)},
            attempts = 0,
            resend_count = ${existing.resend_count + 1},
            last_sent_at = now(),
            expires_at = now() + interval '5 minutes'
          WHERE id = ${existing.id}
        `;

        return {
          success: true,
          registrationKey: regKey,
          email: emailToUse,
          fullName: metadata["fullName"] || "Customer",
        };
      }
    } catch (dbErr) {
      console.error("[Postgres Resend Fallback Error]:", dbErr);
    }
  }

  return {
    success: false,
    error: "Registration session has expired. Please start registration again.",
  };
}

/**
 * Validates the registrationKey and OTP against Upstash Redis.
 * Decrypts the password and invalidates the registration session atomically upon success.
 */
export async function verifyRegistrationSession(params: {
  registrationKey?: string;
  email?: string;
  otp: string;
}): Promise<{
  success: boolean;
  error?: string;
  attemptsRemaining?: number;
  record?: {
    email: string;
    fullName: string;
    phone: string;
    password: string;
  };
}> {
  const cleanKey = (params.registrationKey || "").trim();
  const cleanEmail = (params.email || "").toLowerCase().trim();
  const cleanOtp = (params.otp || "").trim();
  const redis = getRedis();

  let record: PendingRegistrationRecord | null = null;

  // 1. Upstash Redis Verification
  if (redis) {
    try {
      // Lookup by registrationKey
      if (cleanKey) {
        const raw = await redis.get(`cavenhurst:reg:${cleanKey}`);
        if (raw) {
          record = parseJsonRecord<PendingRegistrationRecord>(raw);
        }
      }

      // Fallback lookup by email link
      if (!record && cleanEmail) {
        const rawLink = await redis.get(`cavenhurst:otp:registration:${cleanEmail}`);
        if (rawLink) {
          const parsedLink = parseJsonRecord<RedisRegLinkRecord>(rawLink);
          if (parsedLink?.registrationKey) {
            const raw = await redis.get(`cavenhurst:reg:${parsedLink.registrationKey}`);
            if (raw) {
              record = parseJsonRecord<PendingRegistrationRecord>(raw);
            }
          }
        }
      }

      if (record) {
        // Expiration check
        if (Date.now() > record.expiresAt) {
          await redis.del(
            `cavenhurst:reg:${record.registrationKey}`,
            `cavenhurst:otp:registration:${record.email}`,
          );
          return {
            success: false,
            error: "Verification code has expired. Please request a new code.",
          };
        }

        // Max attempts check (5)
        const attempts = Number(record.attempts || 0);
        if (attempts >= 5) {
          await redis.del(
            `cavenhurst:reg:${record.registrationKey}`,
            `cavenhurst:otp:registration:${record.email}`,
          );
          return {
            success: false,
            error: "Too many incorrect attempts. For security, please start registration again.",
          };
        }

        // Verify cryptographic hash match
        const expectedHash = hashOtp(cleanOtp, record.email);
        if (record.otpHash !== expectedHash) {
          const newAttempts = attempts + 1;
          const remaining = Math.max(0, 5 - newAttempts);
          record.attempts = newAttempts;

          const ttl = await redis.ttl(`cavenhurst:reg:${record.registrationKey}`);
          if (ttl > 0) {
            await redis.set(`cavenhurst:reg:${record.registrationKey}`, JSON.stringify(record), {
              ex: ttl,
            });
          }

          return {
            success: false,
            error: `Incorrect verification code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`,
            attemptsRemaining: remaining,
          };
        }

        // Match! Decrypt password
        let plainPassword = "";
        try {
          plainPassword = decryptPendingPassword(record.encryptedPassword);
        } catch (decryptErr) {
          console.error("[Decrypt Password Error]:", decryptErr);
          return {
            success: false,
            error: "Failed to decrypt credentials. Please start registration again.",
          };
        }

        // Atomic invalidation: remove from Redis
        await redis.del(
          `cavenhurst:reg:${record.registrationKey}`,
          `cavenhurst:otp:registration:${record.email}`,
          `cavenhurst:cooldown:registration:${record.email}`,
        );

        // Purge Postgres fallback
        deleteRegistrationSession(record.registrationKey, record.email).catch(() => {});

        return {
          success: true,
          record: {
            email: record.email,
            fullName: record.fullName,
            phone: record.phone,
            password: plainPassword,
          },
        };
      }
    } catch (redisErr) {
      console.warn("[Upstash Redis Verify Error - Falling back to Postgres]:", redisErr);
    }
  }

  // 2. Postgres Fallback
  const sql = getDb();
  if (sql && (cleanEmail || cleanKey)) {
    try {
      const [pgRecord] = await sql<EmailVerificationOtpRow[]>`
        SELECT id, otp_hash, metadata, attempts, expires_at
        FROM public.email_verification_otps
        WHERE (
          (${cleanEmail !== ""} AND lower(email) = ${cleanEmail})
          OR (${cleanKey !== ""} AND metadata->>'registrationKey' = ${cleanKey})
        ) AND purpose = 'registration'
        LIMIT 1
      `;

      if (pgRecord) {
        if (new Date(pgRecord.expires_at).getTime() < Date.now()) {
          await sql`DELETE FROM public.email_verification_otps WHERE id = ${pgRecord.id}`;
          return {
            success: false,
            error: "Verification code has expired. Please request a new code.",
          };
        }

        if (pgRecord.attempts >= 5) {
          await sql`DELETE FROM public.email_verification_otps WHERE id = ${pgRecord.id}`;
          return {
            success: false,
            error: "Too many incorrect attempts. For security, please start registration again.",
          };
        }

        const meta = (pgRecord.metadata || {}) as Record<string, string | undefined>;
        const emailToVerify = cleanEmail || meta["email"] || "";
        const expectedHash = hashOtp(cleanOtp, emailToVerify);

        if (pgRecord.otp_hash !== expectedHash) {
          const newAttempts = pgRecord.attempts + 1;
          const remaining = Math.max(0, 5 - newAttempts);
          await sql`UPDATE public.email_verification_otps SET attempts = ${newAttempts} WHERE id = ${pgRecord.id}`;
          return {
            success: false,
            error: `Incorrect verification code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`,
            attemptsRemaining: remaining,
          };
        }

        let plainPassword = "";
        try {
          if (meta["encryptedPassword"]) {
            plainPassword = decryptPendingPassword(meta["encryptedPassword"]);
          } else {
            plainPassword = meta["password"] || "";
          }
        } catch {
          plainPassword = meta["password"] || "";
        }

        await sql`DELETE FROM public.email_verification_otps WHERE id = ${pgRecord.id}`;

        return {
          success: true,
          record: {
            email: emailToVerify,
            fullName: meta["fullName"] || "Customer",
            phone: meta["phone"] || "",
            password: plainPassword,
          },
        };
      }
    } catch (pgErr) {
      console.error("[Postgres Verify Fallback Error]:", pgErr);
    }
  }

  // Neither Redis nor Postgres found the registration record
  return {
    success: false,
    error: "Invalid registration key. Please request a new verification code.",
  };
}

/**
 * Removes a registration session if email delivery failed or on explicit rollback.
 */
export async function deleteRegistrationSession(
  registrationKey?: string,
  email?: string,
): Promise<void> {
  const cleanKey = (registrationKey || "").trim();
  const cleanEmail = (email || "").toLowerCase().trim();
  const redis = getRedis();

  if (redis) {
    try {
      const keysToDelete: string[] = [];
      if (cleanKey) keysToDelete.push(`cavenhurst:reg:${cleanKey}`);
      if (cleanEmail) {
        keysToDelete.push(`cavenhurst:otp:registration:${cleanEmail}`);
        keysToDelete.push(`cavenhurst:cooldown:registration:${cleanEmail}`);
      }
      if (keysToDelete.length > 0) {
        await redis.del(...keysToDelete);
      }
    } catch (err) {
      console.warn("[Redis Delete Reg Session Notice]:", err);
    }
  }

  const sql = getDb();
  if (sql && (cleanKey || cleanEmail)) {
    try {
      await sql`
        DELETE FROM public.email_verification_otps
        WHERE purpose = 'registration'
          AND (
            (${cleanEmail !== ""} AND lower(email) = ${cleanEmail})
            OR (${cleanKey !== ""} AND metadata->>'registrationKey' = ${cleanKey})
          )
      `;
    } catch (err) {
      console.warn("[Postgres Delete Reg Session Notice]:", err);
    }
  }
}
