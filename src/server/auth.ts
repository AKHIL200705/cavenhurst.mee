import { createServerFn } from "@tanstack/react-start";
import { getDb } from "@/server/db";

export interface GoogleSessionPayload {
  sub: string;
  email: string;
  name: string | null;
  picture: string | null;
  isAdmin: boolean;
  exp: number;
  iat: number;
}

export interface GoogleUserMetadata {
  full_name: string | null;
  name: string | null;
  avatar_url: string | null;
  picture: string | null;
  email: string;
}

export interface GoogleAuthUser {
  id: string;
  email: string;
  phone: string | null;
  user_metadata: GoogleUserMetadata;
  app_metadata: {
    provider: "google";
  };
  isAdmin: boolean;
}

const DEFAULT_ADMIN_EMAILS = ["akhilsaiabbireddy2007@gmail.com", "cavenhurst@gmail.com"];

export function getGoogleClientId(): string {
  const raw = process.env["GOOGLE_CLIENT_ID"] || process.env["VITE_GOOGLE_CLIENT_ID"] || "";
  return raw.replace(/^["']|["']$/g, "").trim();
}

export function getGoogleClientSecret(): string {
  const raw = process.env["GOOGLE_CLIENT_SECRET"] || "";
  return raw.replace(/^["']|["']$/g, "").trim();
}

export function isWhitelistedAdminEmail(email?: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.toLowerCase().trim();
  if (DEFAULT_ADMIN_EMAILS.includes(normalized)) return true;

  const rawEnv = process.env["ADMIN_EMAILS"] || "";
  const envAdmins = rawEnv
    .split(",")
    .map((e) => e.toLowerCase().trim())
    .filter(Boolean);

  return envAdmins.includes(normalized);
}

function getSessionSecret(): string {
  const secret = process.env["SESSION_SECRET"] || getGoogleClientSecret();
  if (!secret) {
    throw new Error(
      "[Auth Security Error] SESSION_SECRET is missing. A dedicated production session secret (or GOOGLE_CLIENT_SECRET) is required.",
    );
  }
  return secret;
}

async function createHmacSha256(data: string, secret: string): Promise<string> {
  const { createHmac } = await import("node:crypto");
  return createHmac("sha256", secret).update(data).digest("base64url");
}

/**
 * Creates a cryptographically signed HMAC-SHA256 session token.
 */
export async function signSessionToken(
  payload: Omit<GoogleSessionPayload, "exp" | "iat">,
  expiresInSec: number = 30 * 24 * 3600,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: GoogleSessionPayload = {
    sub: payload.sub,
    email: payload.email,
    name: payload.name,
    picture: payload.picture,
    isAdmin: payload.isAdmin,
    iat: now,
    exp: now + expiresInSec,
  };

  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(fullPayload)).toString("base64url");
  const data = `${header}.${body}`;
  const sig = await createHmacSha256(data, getSessionSecret());

  return `${data}.${sig}`;
}

/**
 * Verifies and decodes a signed HMAC-SHA256 session token.
 */
export async function verifySessionToken(token: string): Promise<GoogleSessionPayload | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const header = parts[0];
    const body = parts[1];
    const sig = parts[2];
    if (!header || !body || !sig) return null;

    const data = `${header}.${body}`;
    const expected = await createHmacSha256(data, getSessionSecret());

    if (sig !== expected) return null;

    const parsed = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as GoogleSessionPayload;
    if (!parsed || typeof parsed.exp !== "number") return null;

    if (parsed.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

/**
 * Verifies a Google ID token directly with Google's tokeninfo endpoint.
 */
export async function verifyGoogleIdToken(idToken: string): Promise<{
  sub: string;
  email: string;
  name: string | null;
  picture: string | null;
}> {
  const cleanToken = idToken.trim();
  const res = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(cleanToken)}`,
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Google token verification failed: ${res.status} ${errText}`);
  }

  const info = (await res.json()) as {
    iss?: string | undefined;
    sub?: string | undefined;
    aud?: string | undefined;
    email?: string | undefined;
    email_verified?: string | boolean | undefined;
    name?: string | undefined;
    picture?: string | undefined;
    exp?: string | undefined;
  };

  if (!info.sub || !info.email) {
    throw new Error("Invalid Google token payload: missing sub or email");
  }

  const configuredClientId = getGoogleClientId();
  if (configuredClientId && info.aud !== configuredClientId) {
    throw new Error("Google token client ID (aud) mismatch");
  }

  const isVerified = info.email_verified === "true" || info.email_verified === true;
  if (!isVerified) {
    throw new Error("Google account email is not verified");
  }

  if (info.exp && Number(info.exp) * 1000 < Date.now()) {
    throw new Error("Google token has expired");
  }

  return {
    sub: info.sub,
    email: info.email,
    name: info.name ?? null,
    picture: info.picture ?? null,
  };
}

/**
 * Verifies a Google Access Token directly with Google's userinfo endpoint.
 */
export async function verifyGoogleAccessToken(accessToken: string): Promise<{
  sub: string;
  email: string;
  name: string | null;
  picture: string | null;
}> {
  const cleanToken = accessToken.trim();
  const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: {
      Authorization: `Bearer ${cleanToken}`,
    },
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Google userinfo request failed: ${res.status} ${errText}`);
  }

  const info = (await res.json()) as {
    sub?: string | undefined;
    email?: string | undefined;
    email_verified?: boolean | string | undefined;
    name?: string | undefined;
    picture?: string | undefined;
  };

  if (!info.sub || !info.email) {
    throw new Error("Invalid Google userinfo response: missing sub or email");
  }

  const isVerified = info.email_verified === true || info.email_verified === "true";
  if (!isVerified) {
    throw new Error("Google account email is not verified");
  }

  return {
    sub: info.sub,
    email: info.email,
    name: info.name ?? null,
    picture: info.picture ?? null,
  };
}

/**
 * Verifies whether a token is a valid signed session token or raw Google ID token.
 */
export async function verifyGoogleSessionOrToken(
  token?: string | null | undefined,
): Promise<GoogleSessionPayload | null> {
  if (!token) return null;

  // 1. Try internal signed session token
  const session = await verifySessionToken(token);
  if (session) return session;

  // 2. Try raw Google ID token
  try {
    const googleUser = await verifyGoogleIdToken(token);
    const isAdmin = isWhitelistedAdminEmail(googleUser.email);
    const now = Math.floor(Date.now() / 1000);
    return {
      sub: googleUser.sub,
      email: googleUser.email,
      name: googleUser.name,
      picture: googleUser.picture,
      isAdmin,
      exp: now + 3600,
      iat: now,
    };
  } catch {
    return null;
  }
}

export function formatAuthUser(payload: {
  sub: string;
  email: string;
  name: string | null;
  picture: string | null;
  isAdmin: boolean;
}): GoogleAuthUser {
  const displayName = payload.name || payload.email.split("@")[0] || "Customer";
  return {
    id: payload.sub,
    email: payload.email,
    phone: null,
    user_metadata: {
      full_name: displayName,
      name: displayName,
      avatar_url: payload.picture,
      picture: payload.picture,
      email: payload.email,
    },
    app_metadata: {
      provider: "google",
    },
    isAdmin: payload.isAdmin,
  };
}

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

        // Ensure public.customers is fully populated
        await sql`
          INSERT INTO public.customers (
            id, auth_provider_uid, full_name, email, profile_image, account_status, last_login, created_at, updated_at
          ) VALUES (
            ${authUserId}, ${googleUser.sub}, ${googleUser.name || "Customer"}, ${emailLower}, ${googleUser.picture}, 'active', now(), now(), now()
          )
          ON CONFLICT (auth_provider_uid) DO UPDATE SET
            email = COALESCE(EXCLUDED.email, public.customers.email),
            full_name = CASE WHEN EXCLUDED.full_name IS NOT NULL AND EXCLUDED.full_name <> 'Customer' THEN EXCLUDED.full_name ELSE public.customers.full_name END,
            profile_image = COALESCE(EXCLUDED.profile_image, public.customers.profile_image),
            last_login = now(),
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
