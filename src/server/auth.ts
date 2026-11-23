import { createServerFn } from "@tanstack/react-start";
import { getDb } from "@/server/db";

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

    // Direct superuser database synchronization into auth.users, profiles, and customers
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
              raw_user_meta_data = raw_user_meta_data || ${JSON.stringify({
                sub: googleUser.sub,
                full_name: googleUser.name || "Customer",
                avatar_url: googleUser.picture,
              })}::jsonb
            WHERE id = ${authUserId}
          `;
        } else {
          const rawAppMeta = JSON.stringify({ provider: "google", providers: ["google"] });
          const rawUserMeta = JSON.stringify({
            sub: googleUser.sub,
            email: emailLower,
            full_name: googleUser.name || "Customer",
            name: googleUser.name || "Customer",
            avatar_url: googleUser.picture,
            picture: googleUser.picture,
            email_verified: true,
          });

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
              ${rawAppMeta}::jsonb,
              ${rawUserMeta}::jsonb,
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
              ${JSON.stringify({ sub: googleUser.sub, email: emailLower })}::jsonb,
              'google',
              ${googleUser.sub},
              now(),
              now(),
              now()
            )
            ON CONFLICT (provider_id, provider) DO UPDATE SET
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
      } catch (dbSyncErr) {
        console.error("[Customer DB Auth Sync Error]:", dbSyncErr);
        throw new Error(
          "Failed to synchronize customer into database: " +
            (dbSyncErr instanceof Error ? dbSyncErr.message : String(dbSyncErr)),
        );
      }
    } else {
      throw new Error("Database connection is currently unavailable. Please verify DATABASE_URL.");
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
