import { createHmac, timingSafeEqual } from "node:crypto";
import {
  deleteCookie,
  getCookie,
  getRequest,
  getRequestProtocol,
  setCookie,
} from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getDb } from "@/server/db";

export const SESSION_COOKIE_NAME = "cavenhusrt_session";
export const ADMIN_SESSION_COOKIE_NAME = "cavenhusrt_admin_session";

function isHttpsRequest(): boolean {
  try {
    return getRequestProtocol({ xForwardedProto: true }) === "https";
  } catch {
    return false;
  }
}

/**
 * Writes an HttpOnly, SameSite=Lax signed session cookie when inside an active HTTP request context.
 */
export function setSessionCookie(name: string, token: string, maxAgeSeconds = 7 * 24 * 3600): void {
  if (!token) return;
  try {
    setCookie(name, token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: isHttpsRequest(),
      maxAge: maxAgeSeconds,
    });
  } catch {
    // Non-HTTP execution (unit tests / CLI scripts) cleanly ignores cookie headers
  }
}

/**
 * Clears HttpOnly session cookies across customer and admin scopes.
 */
export function clearSessionCookies(): void {
  const secure = isHttpsRequest();
  try {
    deleteCookie(ADMIN_SESSION_COOKIE_NAME, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure,
    });
    deleteCookie(SESSION_COOKIE_NAME, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure,
    });
  } catch {
    // Safe fallback when executed outside HTTP request lifecycle
  }
}

/**
 * Reads an authenticated session JWT from HttpOnly cookies (preferring admin scope when requested).
 */
export function readSessionCookieToken(preferAdmin = false): string | undefined {
  try {
    const primary = preferAdmin ? ADMIN_SESSION_COOKIE_NAME : SESSION_COOKIE_NAME;
    const secondary = preferAdmin ? SESSION_COOKIE_NAME : ADMIN_SESSION_COOKIE_NAME;
    return getCookie(primary) || getCookie(secondary) || undefined;
  } catch {
    return undefined;
  }
}

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
  const explicit = (process.env["SESSION_SECRET"] || "").replace(/^["']|["']$/g, "").trim();
  if (explicit) return explicit;

  const serviceRole = (
    process.env["SUPABASE_SERVICE_ROLE_KEY"] ||
    process.env["SUPABASE_SECRET_KEY"] ||
    ""
  )
    .replace(/^["']|["']$/g, "")
    .trim();
  if (serviceRole) {
    return createHmac("sha256", "cavenhusrt-session-signing-v1").update(serviceRole).digest("hex");
  }

  throw new Error(
    "[Auth Security Error] SESSION_SECRET (or SUPABASE_SERVICE_ROLE_KEY) is not configured in server environment.",
  );
}

async function createHmacSha256(data: string, secret: string): Promise<string> {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

function timingSafeCompareStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
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
 * Verifies and decodes a signed HMAC-SHA256 session token using timing-safe signature validation.
 */
export async function verifySessionToken(token: string): Promise<GoogleSessionPayload | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const header = parts[0];
    const body = parts[1];
    const sig = parts[2];
    if (!header || !body || !sig) return null;

    const parsedHeader = JSON.parse(Buffer.from(header, "base64url").toString("utf8")) as {
      alg?: string;
      typ?: string;
    };
    if (parsedHeader?.alg !== "HS256" || parsedHeader?.typ !== "JWT") {
      return null;
    }

    const data = `${header}.${body}`;
    const expected = await createHmacSha256(data, getSessionSecret());

    if (!timingSafeCompareStrings(sig, expected)) return null;

    const parsed = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as GoogleSessionPayload;
    if (
      !parsed ||
      typeof parsed.sub !== "string" ||
      !parsed.sub ||
      typeof parsed.email !== "string" ||
      !parsed.email ||
      typeof parsed.exp !== "number"
    ) {
      return null;
    }

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

/**
 * Derives authenticated customer identity strictly from verified server session or passed bearer token.
 */
export async function getAuthenticatedCustomerId(passedToken?: string | null): Promise<{
  id: string; // Auth provider UID or Supabase UUID
  customerUuid?: string | undefined;
  email?: string | undefined;
} | null> {
  try {
    let token = passedToken?.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      const request = getRequest();
      if (request?.headers) {
        const authHeader = request.headers.get("authorization");
        if (authHeader && authHeader.startsWith("Bearer ")) {
          token = authHeader.replace(/^Bearer\s+/i, "").trim();
        }
      }
    }
    if (!token) {
      token = readSessionCookieToken(false);
    }
    if (!token || token.split(".").length !== 3) return null;

    // 1. Google session check
    const googleSession = await verifyGoogleSessionOrToken(token);
    if (googleSession) {
      const sql = getDb();
      if (sql) {
        try {
          const [cust] = await sql`
            SELECT id, email FROM public.customers
            WHERE auth_provider_uid = ${googleSession.sub}
               OR auth_provider_uid = ${googleSession.sub.toString()}
               OR (email IS NOT NULL AND lower(email) = ${googleSession.email.toLowerCase().trim()})
            LIMIT 1
          `;
          return {
            id: googleSession.sub,
            customerUuid: cust ? (cust["id"] as string) : undefined,
            email: googleSession.email,
          };
        } catch (dbErr) {
          console.warn("[getAuthenticatedCustomerId] Direct DB query fallback note:", dbErr);
        }
      }

      // Fallback to supabaseAdmin
      let { data: cust } = await supabaseAdmin
        .from("customers")
        .select("id, email")
        .eq("auth_provider_uid", googleSession.sub)
        .maybeSingle();

      if (!cust && googleSession.email) {
        const { data: custByEmail } = await supabaseAdmin
          .from("customers")
          .select("id, email")
          .eq("email", googleSession.email.toLowerCase().trim())
          .maybeSingle();
        cust = custByEmail;
      }

      return {
        id: googleSession.sub,
        customerUuid: cust?.id,
        email: googleSession.email,
      };
    }

    // 2. Supabase auth check
    const {
      data: { user },
      error,
    } = await supabaseAdmin.auth.getUser(token);
    if (!error && user) {
      let { data: cust } = await supabaseAdmin
        .from("customers")
        .select("id, email")
        .eq("auth_provider_uid", user.id)
        .maybeSingle();

      if (!cust && user.email) {
        const { data: custByEmail } = await supabaseAdmin
          .from("customers")
          .select("id, email")
          .eq("email", user.email.toLowerCase().trim())
          .maybeSingle();
        cust = custByEmail;
      }

      return {
        id: user.id,
        customerUuid: cust?.id,
        email: user.email,
      };
    }

    return null;
  } catch {
    return null;
  }
}
