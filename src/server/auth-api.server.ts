import { getDb } from "@/server/db";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  generateSixDigitOtp,
  createOrUpdateRegistrationSession,
  resendRegistrationSessionOtp,
  verifyRegistrationSession,
  deleteRegistrationSession,
  sendEmailJsOtp,
} from "./otp";
import { resolveIsActiveAdmin, signSessionToken, formatAuthUser } from "./auth-helpers";

export interface SendRegistrationOtpData {
  fullName: string;
  phone: string;
  email: string;
  password: string;
  confirmPassword?: string | undefined;
}

export interface VerifyRegistrationOtpData {
  email?: string | undefined;
  registrationKey?: string | undefined;
  registration_key?: string | undefined;
  registrationId?: string | undefined;
  regKey?: string | undefined;
  otp: string;
}

export interface ResendRegistrationOtpData {
  email?: string | undefined;
  registrationKey?: string | undefined;
  registration_key?: string | undefined;
  registrationId?: string | undefined;
  regKey?: string | undefined;
}

export async function executeSendRegistrationOtp(data: SendRegistrationOtpData) {
  const cleanName = (data.fullName || "").trim();
  const cleanEmail = (data.email || "").toLowerCase().trim();
  const cleanPhone = (data.phone || "").replace(/\D/g, "").slice(-10);
  const password = data.password || "";
  const confirmPassword = data.confirmPassword || "";

  if (!cleanName || cleanName.length < 2) {
    throw new Error("Please enter your full legal name (at least 2 characters).");
  }

  if (cleanPhone.length !== 10 || !/^[6-9]\d{9}$/.test(cleanPhone)) {
    throw new Error(
      "Please enter a valid 10-digit Indian mobile number (starting with 6, 7, 8, or 9).",
    );
  }

  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    throw new Error("Please enter a valid email address.");
  }

  if (password.length < 6) {
    throw new Error("Password must be at least 6 characters long.");
  }

  if (confirmPassword && password !== confirmPassword) {
    throw new Error("Passwords do not match. Please verify your password.");
  }

  // Duplicate account verification
  const sql = getDb();
  if (sql) {
    const [existingEmail] = await sql<{ id: string }[]>`
      SELECT id FROM auth.users WHERE lower(email) = ${cleanEmail} LIMIT 1
    `;
    if (existingEmail) {
      throw new Error("An account with this email address already exists. Please log in.");
    }

    const [existingPhone] = await sql<{ id: string }[]>`
      SELECT id FROM public.profiles 
      WHERE right(regexp_replace(COALESCE(phone, mobile_number, ''), '\D', 'g'), 10) = ${cleanPhone}
      LIMIT 1
    `;
    if (existingPhone) {
      throw new Error("An account with this mobile number already exists. Please log in.");
    }
  }

  // Generate secure 6-digit OTP
  const otp = generateSixDigitOtp();

  // Store encrypted registration session in Upstash Redis (with Postgres fallback)
  const storeRes = await createOrUpdateRegistrationSession({
    email: cleanEmail,
    fullName: cleanName,
    phone: cleanPhone,
    password,
    otp,
  });

  if (!storeRes.success || !storeRes.registrationKey) {
    throw new Error(storeRes.error || "Failed to process verification code.");
  }

  // Send OTP via EmailJS
  const emailRes = await sendEmailJsOtp({
    toEmail: cleanEmail,
    toName: cleanName,
    otp,
    purpose: "registration",
    expiryMinutes: 5,
  });

  if (!emailRes.success) {
    // Rollback registration session record so customer is not locked in cooldown
    await deleteRegistrationSession(storeRes.registrationKey, cleanEmail);
    throw new Error(emailRes.error || "We couldn't send your verification code. Please try again.");
  }

  return {
    success: true,
    registrationKey: storeRes.registrationKey,
    email: cleanEmail,
    cooldownSeconds: 60,
    expiryMinutes: 5,
    message: "Verification code sent to your email address.",
  };
}

export async function executeVerifyRegistrationOtp(data: VerifyRegistrationOtpData) {
  const cleanKey = (
    data.registrationKey ||
    data.registration_key ||
    data.registrationId ||
    data.regKey ||
    ""
  ).trim();
  const cleanEmail = (data.email || "").toLowerCase().trim();
  const cleanOtp = (data.otp || "").trim();

  if (!cleanOtp) {
    throw new Error("Verification code is required.");
  }

  const verifyRes = await verifyRegistrationSession({
    registrationKey: cleanKey,
    email: cleanEmail,
    otp: cleanOtp,
  });

  if (!verifyRes.success || !verifyRes.record) {
    throw new Error(
      verifyRes.error || "Invalid registration key. Please request a new verification code.",
    );
  }

  const { email: verifiedEmail, fullName, phone, password } = verifyRes.record;

  let userId = "";

  // 1. Try Supabase Admin GoTrue API
  try {
    const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: verifiedEmail,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        name: fullName,
        phone,
        mobile_number: phone,
        profile_completed: true,
        email_verified: true,
      },
    });

    if (!createErr && newUser?.user) {
      userId = newUser.user.id;
    } else {
      console.warn("[Supabase Create User Notice]:", createErr?.message);
    }
  } catch (err) {
    console.warn("[Supabase Create User Exception]:", err);
  }

  // 2. Direct PostgreSQL Authoritative Creation Fallback (using pgcrypto crypt)
  const sql = getDb();
  if (!userId && sql) {
    try {
      const appMetaObj = { provider: "email", providers: ["email"] };
      const userMetaObj = {
        email: verifiedEmail,
        full_name: fullName,
        name: fullName,
        phone,
        mobile_number: phone,
        profile_completed: true,
        email_verified: true,
      };

      const [inserted] = await sql`
        INSERT INTO auth.users (
          id,
          instance_id,
          aud,
          role,
          email,
          encrypted_password,
          email_confirmed_at,
          raw_app_meta_data,
          raw_user_meta_data,
          is_super_admin,
          created_at,
          updated_at,
          last_sign_in_at
        ) VALUES (
          gen_random_uuid(),
          '00000000-0000-0000-0000-000000000000',
          'authenticated',
          'authenticated',
          ${verifiedEmail},
          crypt(${password}, gen_salt('bf')),
          now(),
          ${sql.json(appMetaObj)},
          ${sql.json(userMetaObj)},
          false,
          now(),
          now(),
          now()
        )
        RETURNING id
      `;
      if (inserted?.["id"]) {
        userId = inserted["id"] as string;
        try {
          await sql`
            INSERT INTO auth.identities (
              id,
              user_id,
              identity_data,
              provider,
              provider_id,
              last_sign_in_at,
              created_at,
              updated_at
            ) VALUES (
              gen_random_uuid(),
              ${userId}::uuid,
              ${sql.json({ sub: userId, email: verifiedEmail, email_verified: true })},
              'email',
              ${userId},
              now(),
              now(),
              now()
            )
            ON CONFLICT (provider_id, provider) DO NOTHING
          `;
        } catch (idErr) {
          console.warn("[Postgres Identity Sync Notice]:", idErr);
        }
      }
    } catch (dbInsertErr) {
      console.error("[Postgres User Creation Error]:", dbInsertErr);
    }
  }

  if (!userId) {
    throw new Error("Registration failed: Unable to provision account in database.");
  }

  // Ensure public.profiles and public.customers are explicitly synchronized
  if (sql) {
    try {
      await sql`
        INSERT INTO public.profiles (
          id, email, full_name, phone, mobile_number, auth_provider, account_status, profile_completed, created_at, updated_at
        ) VALUES (
          ${userId}, ${verifiedEmail}, ${fullName}, ${phone}, ${phone}, 'email', 'active', true, now(), now()
        )
        ON CONFLICT (id) DO UPDATE SET
          phone = EXCLUDED.phone,
          mobile_number = EXCLUDED.mobile_number,
          full_name = EXCLUDED.full_name,
          profile_completed = true,
          account_status = 'active',
          updated_at = now()
      `;
      const [existingCust] = await sql<{ id: string }[]>`
        SELECT id FROM public.customers
        WHERE id = ${userId}::uuid
           OR auth_provider_uid = ${userId}
           OR lower(email) = ${verifiedEmail}
        LIMIT 1
      `;
      if (existingCust) {
        await sql`
          UPDATE public.customers SET
            phone = ${phone},
            full_name = ${fullName},
            email = ${verifiedEmail},
            account_status = 'active',
            last_login = now(),
            updated_at = now()
          WHERE id = ${existingCust.id}::uuid
        `;
      } else {
        await sql`
          INSERT INTO public.customers (
            id, auth_provider_uid, full_name, email, phone, account_status, last_login, created_at, updated_at
          ) VALUES (
            ${userId}, ${userId}, ${fullName}, ${verifiedEmail}, ${phone}, 'active', now(), now(), now()
          )
          ON CONFLICT DO NOTHING
        `;
      }
    } catch (syncErr) {
      console.warn("[Profile Sync Warning]:", syncErr);
    }
  }

  const isAdmin = await resolveIsActiveAdmin(userId, verifiedEmail);
  const sessionToken = await signSessionToken({
    sub: userId,
    email: verifiedEmail,
    name: fullName,
    picture: null,
    isAdmin,
  });

  const user = formatAuthUser({
    sub: userId,
    email: verifiedEmail,
    name: fullName,
    picture: null,
    isAdmin,
  });

  return {
    success: true,
    sessionToken,
    user,
    isAdmin,
    redirectTo: "/",
  };
}

export async function executeResendRegistrationOtp(data: ResendRegistrationOtpData) {
  const cleanKey = (
    data.registrationKey ||
    data.registration_key ||
    data.registrationId ||
    data.regKey ||
    ""
  ).trim();
  const cleanEmail = (data.email || "").toLowerCase().trim();

  if (!cleanKey && !cleanEmail) {
    throw new Error("Registration identifier or email address is required.");
  }

  const otp = generateSixDigitOtp();
  const resendRes = await resendRegistrationSessionOtp({
    registrationKey: cleanKey,
    email: cleanEmail,
    otp,
  });

  if (!resendRes.success || !resendRes.email) {
    throw new Error(
      resendRes.error || "Registration session has expired. Please start registration again.",
    );
  }

  const emailRes = await sendEmailJsOtp({
    toEmail: resendRes.email,
    toName: resendRes.fullName || "Customer",
    otp,
    purpose: "registration",
    expiryMinutes: 5,
  });

  if (!emailRes.success) {
    throw new Error(emailRes.error || "We couldn't send your verification code. Please try again.");
  }

  return {
    success: true,
    registrationKey: resendRes.registrationKey,
    email: resendRes.email,
    cooldownSeconds: 60,
    expiryMinutes: 5,
    message: "Verification code sent to your email address.",
  };
}

// -----------------------------------------------------------------------------
// REST API DISPATCHERS (POST /api/auth/send-otp, verify-otp, resend-otp, register)
// -----------------------------------------------------------------------------

function strField(obj: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string") return v;
  }
  return "";
}

export async function processSendOtpApi(body: Record<string, unknown>) {
  return await executeSendRegistrationOtp({
    fullName: strField(body, "fullName", "full_name", "name"),
    phone: strField(body, "phone", "mobile", "mobileNumber", "mobile_number"),
    email: strField(body, "email", "to_email"),
    password: strField(body, "password"),
    confirmPassword:
      typeof body["confirmPassword"] === "string"
        ? body["confirmPassword"]
        : typeof body["confirm_password"] === "string"
          ? body["confirm_password"]
          : undefined,
  });
}

export async function processVerifyOtpApi(body: Record<string, unknown>) {
  return await executeVerifyRegistrationOtp({
    registrationKey:
      strField(
        body,
        "registrationKey",
        "registration_key",
        "registrationId",
        "registration_id",
        "regKey",
        "reg_key",
      ) || undefined,
    email: strField(body, "email", "to_email") || undefined,
    otp: strField(body, "otp", "code", "passcode"),
  });
}

export async function processResendOtpApi(body: Record<string, unknown>) {
  return await executeResendRegistrationOtp({
    registrationKey:
      strField(
        body,
        "registrationKey",
        "registration_key",
        "registrationId",
        "registration_id",
        "regKey",
        "reg_key",
      ) || undefined,
    email: strField(body, "email", "to_email") || undefined,
  });
}
