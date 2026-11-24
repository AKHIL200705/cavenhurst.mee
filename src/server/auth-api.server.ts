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
import {
  isWhitelistedAdminEmail,
  signSessionToken,
  formatAuthUser,
} from "./auth-helpers";

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
    throw new Error("Please enter a valid 10-digit Indian mobile number (starting with 6, 7, 8, or 9).");
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
    const [existingEmail] = await sql<any[]>`
      SELECT id FROM auth.users WHERE lower(email) = ${cleanEmail} LIMIT 1
    `;
    if (existingEmail) {
      throw new Error("An account with this email address already exists. Please log in.");
    }

    const [existingPhone] = await sql<any[]>`
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
    throw new Error(verifyRes.error || "Invalid registration key. Please request a new verification code.");
  }

  const { email: verifiedEmail, fullName, phone, password } = verifyRes.record;

  // Create user securely via Supabase Admin API with confirmed email
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

  if (createErr || !newUser?.user) {
    console.error("[Create User Error]:", createErr);
    throw new Error(`Registration failed: ${createErr?.message || "Could not create user account"}`);
  }

  const userId = newUser.user.id;

  // Ensure public.profiles and public.customers are explicitly synchronized
  const sql = getDb();
  if (sql) {
    try {
      await sql`
        UPDATE public.profiles SET
          phone = ${phone},
          mobile_number = ${phone},
          full_name = ${fullName},
          profile_completed = true,
          account_status = 'active',
          updated_at = now()
        WHERE id = ${userId}
      `;
      await sql`
        UPDATE public.customers SET
          phone = ${phone},
          full_name = ${fullName},
          account_status = 'active',
          updated_at = now()
        WHERE id = ${userId}::uuid OR email = ${verifiedEmail}
      `;
    } catch (syncErr) {
      console.warn("[Profile Sync Warning]:", syncErr);
    }
  }

  const isAdmin = isWhitelistedAdminEmail(verifiedEmail);
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
    throw new Error(resendRes.error || "Registration session has expired. Please start registration again.");
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

export async function processSendOtpApi(body: Record<string, any>) {
  const b = body as any;
  return await executeSendRegistrationOtp({
    fullName: b.fullName || b.full_name || b.name || "",
    phone: b.phone || b.mobile || b.mobileNumber || b.mobile_number || "",
    email: b.email || b.to_email || "",
    password: b.password || "",
    confirmPassword: b.confirmPassword || b.confirm_password,
  });
}

export async function processVerifyOtpApi(body: Record<string, any>) {
  const b = body as any;
  return await executeVerifyRegistrationOtp({
    registrationKey:
      b.registrationKey ||
      b.registration_key ||
      b.registrationId ||
      b.registration_id ||
      b.regKey ||
      b.reg_key,
    email: b.email || b.to_email,
    otp: b.otp || b.code || b.passcode || "",
  });
}

export async function processResendOtpApi(body: Record<string, any>) {
  const b = body as any;
  return await executeResendRegistrationOtp({
    registrationKey:
      b.registrationKey ||
      b.registration_key ||
      b.registrationId ||
      b.registration_id ||
      b.regKey ||
      b.reg_key,
    email: b.email || b.to_email,
  });
}
