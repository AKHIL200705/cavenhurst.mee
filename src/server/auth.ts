import { createServerFn } from "@tanstack/react-start";
import type { Session } from "@supabase/supabase-js";
import { getDb } from "@/server/db";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  generateSixDigitOtp,
  sendEmailJsOtp,
  createOrUpdateOtpRecord,
  deleteOtpRecord,
  verifyOtpRecord,
} from "./otp";

import {
  type GoogleSessionPayload,
  type GoogleUserMetadata,
  type GoogleAuthUser,
  getGoogleClientId,
  getGoogleClientSecret,
  isWhitelistedAdminEmail,
  signSessionToken,
  verifySessionToken,
  verifyGoogleIdToken,
  verifyGoogleAccessToken,
  verifyGoogleSessionOrToken,
  formatAuthUser,
} from "./auth-helpers";

export type { GoogleSessionPayload, GoogleUserMetadata, GoogleAuthUser };

// -----------------------------------------------------------------------------
// SERVER FUNCTIONS
// -----------------------------------------------------------------------------

export interface GoogleAuthInput {
  idToken?: string | undefined;
  accessToken?: string | undefined;
}

export interface GoogleAuthResult {
  success: boolean;
  sessionToken: string;
  user: GoogleAuthUser;
  isAdmin: boolean;
}

export const verifyGoogleAuthServerFn = createServerFn({ method: "POST" })
  .validator((input: GoogleAuthInput) => input)
  .handler(async ({ data }): Promise<GoogleAuthResult> => {
    let googleUser: { sub: string; email: string; name: string | null; picture: string | null };

    if (data.idToken) {
      googleUser = await verifyGoogleIdToken(data.idToken);
    } else if (data.accessToken) {
      googleUser = await verifyGoogleAccessToken(data.accessToken);
    } else {
      throw new Error("Missing Google credentials (idToken or accessToken required)");
    }

    const isAdmin = isWhitelistedAdminEmail(googleUser.email);
    const emailLower = googleUser.email.toLowerCase().trim();
    let authUserId: string = googleUser.sub;

    // Direct database synchronization into auth.users, profiles, and customers
    let synced = false;
    const sql = getDb();
    if (sql) {
      try {
        const [existing] = await sql`
          SELECT id, email FROM auth.users WHERE lower(email) = ${emailLower} LIMIT 1
        `;

        if (existing) {
          authUserId = existing["id"] as string;
          await sql`
            UPDATE auth.users SET
              last_sign_in_at = now(),
              updated_at = now(),
              raw_user_meta_data = raw_user_meta_data || ${sql.json({
                sub: googleUser.sub,
                full_name: googleUser.name || "Customer",
                avatar_url: googleUser.picture,
              })}
            WHERE id = ${authUserId}
          `;
        } else {
          const appMetaObj = { provider: "google", providers: ["google"] };
          const userMetaObj = {
            sub: googleUser.sub,
            email: emailLower,
            full_name: googleUser.name || "Customer",
            name: googleUser.name || "Customer",
            avatar_url: googleUser.picture,
            picture: googleUser.picture,
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
              ${emailLower},
              '',
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
            authUserId = inserted["id"] as string;
          }
        }

        // Link identity in auth.identities
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
              ${authUserId},
              ${sql.json({ sub: googleUser.sub, email: emailLower })},
              'google',
              ${googleUser.sub},
              now(),
              now(),
              now()
            )
            ON CONFLICT (provider_id, provider) DO UPDATE SET
              identity_data = ${sql.json({ sub: googleUser.sub, email: emailLower })},
              last_sign_in_at = now(),
              updated_at = now()
          `;
        } catch (idErr) {
          console.warn("[Auth Identities Sync Note]:", idErr);
        }

        // Ensure public.profiles is fully populated
        await sql`
          INSERT INTO public.profiles (
            id, email, full_name, avatar_url, auth_provider, account_status, created_at, updated_at
          ) VALUES (
            ${authUserId}, ${emailLower}, ${googleUser.name || "Customer"}, ${googleUser.picture}, 'google', 'active', now(), now()
          )
          ON CONFLICT (id) DO UPDATE SET
            email = COALESCE(EXCLUDED.email, public.profiles.email),
            full_name = CASE WHEN EXCLUDED.full_name IS NOT NULL AND EXCLUDED.full_name <> 'Customer' THEN EXCLUDED.full_name ELSE public.profiles.full_name END,
            avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url),
            updated_at = now()
        `;

        // Ensure public.customers is safely populated without pkey or unique conflicts
        const [existingCust] = await sql`
          SELECT id FROM public.customers
          WHERE id = ${authUserId}::uuid
             OR auth_provider_uid = ${googleUser.sub}
             OR auth_provider_uid = ${authUserId}
             OR (email IS NOT NULL AND lower(email) = ${emailLower})
          LIMIT 1
        `;

        if (existingCust) {
          await sql`
            UPDATE public.customers SET
              auth_provider_uid = ${googleUser.sub},
              email = ${emailLower},
              full_name = CASE WHEN ${googleUser.name || "Customer"} <> 'Customer' THEN ${googleUser.name} ELSE full_name END,
              profile_image = COALESCE(${googleUser.picture}, profile_image),
              last_login = now(),
              updated_at = now()
            WHERE id = ${existingCust["id"]}
          `;
        } else {
          await sql`
            INSERT INTO public.customers (
              id, auth_provider_uid, full_name, email, profile_image, account_status, last_login, created_at, updated_at
            ) VALUES (
              ${authUserId}, ${googleUser.sub}, ${googleUser.name || "Customer"}, ${emailLower}, ${googleUser.picture}, 'active', now(), now(), now()
            )
            ON CONFLICT (id) DO UPDATE SET
              auth_provider_uid = EXCLUDED.auth_provider_uid,
              email = EXCLUDED.email,
              full_name = EXCLUDED.full_name,
              profile_image = EXCLUDED.profile_image,
              last_login = now(),
              updated_at = now()
          `;
        }

        // Link customer in customer_auth_providers
        await sql`
          INSERT INTO public.customer_auth_providers (
            customer_id, provider, provider_uid, email, updated_at
          ) VALUES (
            ${existingCust ? existingCust["id"] : authUserId}, 'google', ${googleUser.sub}, ${emailLower}, now()
          )
          ON CONFLICT (provider, provider_uid) DO UPDATE SET
            email = EXCLUDED.email,
            customer_id = EXCLUDED.customer_id,
            updated_at = now()
        `;

        // If user is admin, ensure admin_users has an active record
        if (isAdmin) {
          await sql`
            INSERT INTO public.admin_users (
              auth_user_id, email, full_name, role, permissions, is_active, last_login, created_at, updated_at
            ) VALUES (
              ${authUserId}, ${emailLower}, ${googleUser.name || "Admin"}, 'admin', ${JSON.stringify(["*"])}::jsonb, true, now(), now(), now()
            )
            ON CONFLICT (email) DO UPDATE SET
              auth_user_id = EXCLUDED.auth_user_id,
              full_name = COALESCE(EXCLUDED.full_name, public.admin_users.full_name),
              is_active = true,
              last_login = now(),
              updated_at = now()
          `;
        }
        synced = true;
      } catch (dbSyncErr) {
        console.warn("[Google Auth Direct DB Notice]:", dbSyncErr);
      }
    }

    if (!synced) {
      // Seamless Supabase Admin REST client fallback
      try {
        const { data: existingProfile } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("email", emailLower)
          .maybeSingle();

        if (existingProfile?.id) {
          authUserId = existingProfile.id;
        }

        await supabaseAdmin.from("profiles").upsert({
          id: authUserId,
          email: emailLower,
          full_name: googleUser.name || "Customer",
          avatar_url: googleUser.picture,
          auth_provider: "google",
          account_status: "active",
          updated_at: new Date().toISOString(),
        });

        await supabaseAdmin.from("customers").upsert({
          id: authUserId,
          auth_provider_uid: googleUser.sub,
          full_name: googleUser.name || "Customer",
          email: emailLower,
          profile_image: googleUser.picture,
          account_status: "active",
          last_login: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

        if (isAdmin) {
          await supabaseAdmin.from("admin_users").upsert({
            auth_user_id: authUserId,
            email: emailLower,
            full_name: googleUser.name || "Admin",
            role: "admin",
            permissions: ["*"],
            is_active: true,
            last_login: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }
      } catch (fallbackErr) {
        console.error("[Google Auth Supabase Fallback Error]:", fallbackErr);
      }
    }

    const sessionToken = await signSessionToken({
      sub: authUserId,
      email: googleUser.email,
      name: googleUser.name,
      picture: googleUser.picture,
      isAdmin,
    });

    const user = formatAuthUser({
      sub: authUserId,
      email: googleUser.email,
      name: googleUser.name,
      picture: googleUser.picture,
      isAdmin,
    });

    return {
      success: true,
      sessionToken,
      user,
      isAdmin,
    };
  });

export interface GoogleCheckSessionResult {
  valid: boolean;
  user: GoogleAuthUser | null;
  isAdmin: boolean;
}

export const checkGoogleSessionServerFn = createServerFn({ method: "POST" })
  .validator((input: { sessionToken?: string | undefined }) => input)
  .handler(async ({ data }): Promise<GoogleCheckSessionResult> => {
    if (!data.sessionToken) {
      return { valid: false, user: null, isAdmin: false };
    }

    const session = await verifyGoogleSessionOrToken(data.sessionToken);
    if (!session) {
      return { valid: false, user: null, isAdmin: false };
    }

    const user = formatAuthUser({
      sub: session.sub,
      email: session.email,
      name: session.name,
      picture: session.picture,
      isAdmin: session.isAdmin,
    });

    return {
      valid: true,
      user,
      isAdmin: session.isAdmin,
    };
  });

// -----------------------------------------------------------------------------
// CAVENHURST OTP REGISTRATION & PHONE/EMAIL LOGIN
// -----------------------------------------------------------------------------

export interface SendRegistrationOtpInput {
  fullName: string;
  phone: string;
  email: string;
  password: string;
  confirmPassword?: string | undefined;
}

export const sendRegistrationOtpServerFn = createServerFn({ method: "POST" })
  .validator((input: SendRegistrationOtpInput) => input)
  .handler(async ({ data }) => {
    const { executeSendRegistrationOtp } = await import("./auth-api.server");
    return executeSendRegistrationOtp(data);
  });

export interface VerifyRegistrationOtpInput {
  email?: string | undefined;
  registrationKey?: string | undefined;
  registration_key?: string | undefined;
  registrationId?: string | undefined;
  regKey?: string | undefined;
  otp: string;
}

export const verifyRegistrationOtpServerFn = createServerFn({ method: "POST" })
  .validator((input: VerifyRegistrationOtpInput) => input)
  .handler(async ({ data }) => {
    const { executeVerifyRegistrationOtp } = await import("./auth-api.server");
    return executeVerifyRegistrationOtp(data);
  });

export interface ResendRegistrationOtpInput {
  email?: string | undefined;
  registrationKey?: string | undefined;
  registration_key?: string | undefined;
  registrationId?: string | undefined;
  regKey?: string | undefined;
}

export const resendRegistrationOtpServerFn = createServerFn({ method: "POST" })
  .validator((input: ResendRegistrationOtpInput) => input)
  .handler(async ({ data }) => {
    const { executeResendRegistrationOtp } = await import("./auth-api.server");
    return executeResendRegistrationOtp(data);
  });

export interface LoginWithPhoneEmailInput {
  mobileNumber: string;
  email: string;
  password: string;
}

export const loginWithPhoneEmailServerFn = createServerFn({ method: "POST" })
  .validator((input: LoginWithPhoneEmailInput) => input)
  .handler(async ({ data }) => {
    const cleanEmail = (data.email || "").toLowerCase().trim();
    const cleanMobile = (data.mobileNumber || "").replace(/\D/g, "").slice(-10);
    const password = data.password || "";

    if (!cleanEmail || !password) {
      throw new Error("Please enter both email address and password.");
    }

    if (cleanMobile.length !== 10) {
      throw new Error("Please enter your registered 10-digit mobile number.");
    }

    interface AuthUserSqlRow {
      id: string;
      email?: string | null;
      raw_user_meta_data?: {
        full_name?: string | null;
        phone?: string | null;
        mobile_number?: string | null;
      } | null;
    }
    interface ProfileSqlRow {
      full_name?: string | null;
      phone?: string | null;
      mobile_number?: string | null;
    }
    interface CustomerSqlRow {
      full_name?: string | null;
      phone?: string | null;
    }

    const sql = getDb();
    let authUser: AuthUserSqlRow | null = null;
    let registeredMobile = "";
    let userName = "Customer";

    if (sql) {
      const [u] = await sql<AuthUserSqlRow[]>`
        SELECT id, email, raw_user_meta_data FROM auth.users WHERE lower(email) = ${cleanEmail} LIMIT 1
      `;
      authUser = u ?? null;

      if (authUser) {
        const [prof] = await sql<ProfileSqlRow[]>`
          SELECT full_name, phone, mobile_number FROM public.profiles WHERE id = ${authUser.id} LIMIT 1
        `;
        const [cust] = await sql<CustomerSqlRow[]>`
          SELECT full_name, phone FROM public.customers WHERE id = ${authUser.id}::uuid OR email = ${cleanEmail} LIMIT 1
        `;

        userName =
          prof?.full_name ||
          cust?.full_name ||
          authUser.raw_user_meta_data?.full_name ||
          "Customer";
        const rawPhone =
          prof?.mobile_number ||
          prof?.phone ||
          cust?.phone ||
          authUser.raw_user_meta_data?.phone ||
          authUser.raw_user_meta_data?.mobile_number ||
          "";
        registeredMobile = rawPhone.replace(/\D/g, "").slice(-10);

        // If user already had a registered mobile number, enforce exact match
        if (registeredMobile && registeredMobile !== cleanMobile) {
          throw new Error(
            "The mobile number and email address do not match our registered records.",
          );
        }

        // If user had no registered phone yet (e.g. legacy account), link it now
        if (!registeredMobile) {
          try {
            await sql`
              UPDATE public.profiles SET phone = ${cleanMobile}, mobile_number = ${cleanMobile} WHERE id = ${authUser.id}
            `;
            await sql`
              UPDATE public.customers SET phone = ${cleanMobile} WHERE id = ${authUser.id}::uuid OR email = ${cleanEmail}
            `;
          } catch {
            /* ignore */
          }
        }
      }
    }

    // Authenticate password with Supabase (with direct database cryptographic fallback)
    let authenticated = false;
    let authUserId = authUser?.id || "";
    let supabaseSession: Session | null = null;

    try {
      const { data: signInRes, error: signInErr } = await supabaseAdmin.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (!signInErr && signInRes?.user) {
        authenticated = true;
        authUserId = signInRes.user.id;
        supabaseSession = signInRes.session;
      }
    } catch (err) {
      console.warn("[Supabase Auth API Sign-In Warning]:", err);
    }

    // Direct Database Authentication Fallback (using pgcrypto crypt on auth.users)
    if (!authenticated && sql && authUser?.id) {
      try {
        const [verified] = await sql<{ id: string; password_matches: boolean }[]>`
          SELECT id, (encrypted_password = crypt(${password}, encrypted_password)) AS password_matches
          FROM auth.users
          WHERE id = ${authUser.id}
        `;
        if (verified && verified.password_matches === true) {
          authenticated = true;
          authUserId = verified.id;
        }
      } catch (dbAuthErr) {
        console.warn("[Postgres Direct Auth Check Warning]:", dbAuthErr);
      }
    }

    if (!authenticated || !authUserId) {
      throw new Error("Invalid email or password. Please verify your credentials.");
    }

    const userId = authUserId;
    const isAdmin = isWhitelistedAdminEmail(cleanEmail);

    const sessionToken = await signSessionToken({
      sub: userId,
      email: cleanEmail,
      name: userName,
      picture: null,
      isAdmin,
    });

    const user = formatAuthUser({
      sub: userId,
      email: cleanEmail,
      name: userName,
      picture: null,
      isAdmin,
    });

    return {
      success: true,
      sessionToken,
      user,
      isAdmin,
      supabaseSession,
    };
  });

export interface SendForgotPasswordOtpInput {
  email: string;
  mobileNumber?: string | undefined;
}

export const sendForgotPasswordOtpServerFn = createServerFn({ method: "POST" })
  .validator((input: SendForgotPasswordOtpInput) => input)
  .handler(async ({ data }) => {
    const cleanEmail = (data.email || "").toLowerCase().trim();
    const cleanMobile = (data.mobileNumber || "").replace(/\D/g, "").slice(-10);

    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      throw new Error("Please enter a valid email address.");
    }

    const sql = getDb();
    if (sql) {
      const [u] = await sql<{ id: string; email: string }[]>`
        SELECT id, email FROM auth.users WHERE lower(email) = ${cleanEmail} LIMIT 1
      `;
      if (!u) {
        throw new Error("No registered account found with this email address.");
      }

      if (cleanMobile) {
        const [prof] = await sql<{ phone?: string | null; mobile_number?: string | null }[]>`
          SELECT phone, mobile_number FROM public.profiles WHERE id = ${u.id} LIMIT 1
        `;
        const raw = (prof?.mobile_number || prof?.phone || "").replace(/\D/g, "").slice(-10);
        if (raw && raw !== cleanMobile) {
          throw new Error(
            "The mobile number and email address do not match our registered records.",
          );
        }
      }
    }

    const otp = generateSixDigitOtp();
    const storeRes = await createOrUpdateOtpRecord({
      email: cleanEmail,
      otp,
      purpose: "forgot_password",
    });

    if (!storeRes.success) {
      throw new Error(storeRes.error || "Failed to process password reset code.");
    }

    const emailRes = await sendEmailJsOtp({
      toEmail: cleanEmail,
      otp,
      purpose: "forgot_password",
      expiryMinutes: 5,
    });

    if (!emailRes.success) {
      await deleteOtpRecord(cleanEmail, "forgot_password");
      throw new Error(
        emailRes.error || "We couldn't send your verification code. Please try again.",
      );
    }

    return {
      success: true,
      email: cleanEmail,
      cooldownSeconds: 60,
      message: "Verification code sent to your email address.",
    };
  });

export interface ResetPasswordWithOtpInput {
  email: string;
  otp: string;
  newPassword: string;
  confirmPassword?: string | undefined;
}

export const resetPasswordWithOtpServerFn = createServerFn({ method: "POST" })
  .validator((input: ResetPasswordWithOtpInput) => input)
  .handler(async ({ data }) => {
    const cleanEmail = (data.email || "").toLowerCase().trim();
    const cleanOtp = (data.otp || "").trim();
    const newPassword = data.newPassword || "";
    const confirmPassword = data.confirmPassword || "";

    if (!cleanEmail || !cleanOtp) {
      throw new Error("Email and 6-digit code are required.");
    }

    if (newPassword.length < 6) {
      throw new Error("Password must be at least 6 characters long.");
    }

    if (confirmPassword && newPassword !== confirmPassword) {
      throw new Error("Passwords do not match.");
    }

    const verifyRes = await verifyOtpRecord({
      email: cleanEmail,
      otp: cleanOtp,
      purpose: "forgot_password",
    });

    if (!verifyRes.success) {
      throw new Error(verifyRes.error || "Invalid or expired verification code.");
    }

    const sql = getDb();
    let userId = "";

    if (sql) {
      const [u] = await sql<{ id: string }[]>`
        SELECT id FROM auth.users WHERE lower(email) = ${cleanEmail} LIMIT 1
      `;
      if (u) userId = u.id;
    }

    if (!userId) {
      try {
        const { data: users } = await supabaseAdmin.auth.admin.listUsers();
        const matched = users?.users?.find((u) => u.email?.toLowerCase() === cleanEmail);
        if (matched) userId = matched.id;
      } catch {
        /* ignore */
      }
    }

    if (!userId) {
      throw new Error("Account not found for password reset.");
    }

    let updated = false;

    // 1. Authoritative Direct PostgreSQL Password Update (pgcrypto bcrypt)
    if (sql) {
      try {
        await sql`
          UPDATE auth.users SET
            encrypted_password = crypt(${newPassword}, gen_salt('bf')),
            updated_at = now()
          WHERE id = ${userId}
        `;
        updated = true;
      } catch (dbErr) {
        console.error("[Postgres Password Update Error]:", dbErr);
      }
    }

    // 2. Best-effort sync to Supabase GoTrue Auth service (if configured and reachable)
    try {
      const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password: newPassword,
      });
      if (!updateErr) {
        updated = true;
      } else {
        console.warn("[Supabase Auth Admin Update Warning]:", updateErr.message);
      }
    } catch (apiErr: unknown) {
      console.warn(
        "[Supabase Auth Admin API Notice]:",
        apiErr instanceof Error ? apiErr.message : String(apiErr),
      );
    }

    if (!updated) {
      throw new Error("Failed to update password. Database connection unavailable.");
    }

    return {
      success: true,
      message: "Password reset successfully. You can now log in with your new password.",
    };
  });
