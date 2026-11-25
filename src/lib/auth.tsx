import type React from "react";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { persistWelcome } from "./welcome";
import { checkProfileCompletionServerFn } from "@/server/customers";

export interface AuthUser {
  id: string;
  email?: string | null;
  phone?: string | null;
  user_metadata?: {
    full_name?: string | null;
    name?: string | null;
    avatar_url?: string | null;
    picture?: string | null;
    email?: string | null;
    mobile_number?: string | null;
    phone?: string | null;
    profile_completed?: boolean | null;
    [key: string]: unknown;
  } | null;
  app_metadata?: {
    provider?: string | null;
    [key: string]: unknown;
  } | null;
  isAdmin?: boolean | null;
  [key: string]: unknown;
}

type Auth = {
  user: AuthUser | null;
  sessionToken: string | null;
  ready: boolean;
  welcomeReady: boolean;
  welcomeSeen: boolean;
  welcomeError: boolean;
  profileCompleted: boolean;
  profileChecking: boolean;
  refreshProfile: () => Promise<boolean>;
  retryWelcome: () => void;
  completeWelcome: () => Promise<void>;
  setGoogleSession: (user: AuthUser, sessionToken: string) => void;
  signOut: () => Promise<void>;
};

const GOOGLE_SESSION_STORAGE_KEY = "cavenhurst_google_session";
const GOOGLE_WELCOME_KEY_PREFIX = "cavenhurst_welcome_";

const g = globalThis as { __cavenAuthCtx?: React.Context<Auth> };
const Ctx = (g.__cavenAuthCtx ??= createContext<Auth>({
  user: null,
  sessionToken: null,
  ready: false,
  welcomeReady: false,
  welcomeSeen: false,
  welcomeError: false,
  profileCompleted: false,
  profileChecking: true,
  refreshProfile: async () => false,
  retryWelcome: () => {},
  completeWelcome: async () => {},
  setGoogleSession: () => {},
  signOut: async () => {},
}));

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [welcome, setWelcome] = useState<{ userId: string; seen: boolean; error: boolean } | null>(
    null,
  );
  const [profileCompleted, setProfileCompleted] = useState<boolean>(false);
  const [profileChecking, setProfileChecking] = useState<boolean>(true);
  const [attempt, setAttempt] = useState(0);

  // Initialize session on mount
  useEffect(() => {
    let active = true;

    // 1. Check direct Google Authentication session first
    try {
      const stored =
        typeof window !== "undefined" ? localStorage.getItem(GOOGLE_SESSION_STORAGE_KEY) : null;
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.user && parsed?.sessionToken) {
          if (active) {
            setUser(parsed.user as AuthUser);
            setSessionToken(parsed.sessionToken as string);
            setReady(true);
            return;
          }
        }
      }
    } catch {
      // Continue to Supabase listener
    }

    // 2. Active listener for Supabase authentication state
    const { data } = supabase.auth.onAuthStateChange((_e, s) => {
      if (!active) return;

      if (_e === "SIGNED_OUT") {
        setUser(null);
        setSessionToken(null);
        setReady(true);
        return;
      }

      if (s?.user) {
        // Active Supabase auth session takes precedence
        try {
          if (typeof window !== "undefined") {
            localStorage.removeItem(GOOGLE_SESSION_STORAGE_KEY);
          }
        } catch {
          /* ignore */
        }
        setUser((s.user as unknown as AuthUser) ?? null);
        setSessionToken(s.access_token ?? null);
        setReady(true);
        return;
      }

      // If no active Supabase session, fall back to Google session if present
      try {
        const stored =
          typeof window !== "undefined" ? localStorage.getItem(GOOGLE_SESSION_STORAGE_KEY) : null;
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed?.user && parsed?.sessionToken) {
            setUser(parsed.user as AuthUser);
            setSessionToken(parsed.sessionToken as string);
            setReady(true);
            return;
          }
        }
      } catch {
        /* ignore */
      }

      setUser(null);
      setSessionToken(null);
      setReady(true);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return;
      if (session?.user) {
        try {
          if (typeof window !== "undefined") {
            localStorage.removeItem(GOOGLE_SESSION_STORAGE_KEY);
          }
        } catch {
          /* ignore */
        }
        setUser((session.user as unknown as AuthUser) ?? null);
        setSessionToken(session.access_token ?? null);
        setReady(true);
      }
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  // Welcome state check
  useEffect(() => {
    if (!user) {
      setWelcome(null);
      return;
    }
    let active = true;
    const userId = user.id;

    // Admins always bypass welcome checks directly
    if (user.isAdmin) {
      setWelcome({ userId, seen: true, error: false });
      return;
    }

    const localWelcomeSeen =
      typeof window !== "undefined" &&
      localStorage.getItem(`${GOOGLE_WELCOME_KEY_PREFIX}${userId}`) === "true";

    if (localWelcomeSeen) {
      setWelcome({ userId, seen: true, error: false });
      return;
    }

    // Try checking Supabase without blocking the user on failure
    Promise.resolve(
      supabase
        .from("customer_welcome")
        .select("welcome_seen_at")
        .eq("user_id", userId)
        .maybeSingle(),
    )
      .then(({ data }) => {
        if (active) {
          setWelcome({
            userId,
            seen: Boolean(data?.welcome_seen_at),
            error: false,
          });
        }
      })
      .catch(() => {
        if (active) {
          setWelcome({
            userId,
            seen: false,
            error: false,
          });
        }
      });

    return () => {
      active = false;
    };
  }, [user, attempt]);

  // Check profile completion status from database
  useEffect(() => {
    if (!user) {
      setProfileCompleted(false);
      setProfileChecking(false);
      return;
    }

    if (user.isAdmin) {
      setProfileCompleted(true);
      setProfileChecking(false);
      return;
    }

    let active = true;
    setProfileChecking(true);

    checkProfileCompletionServerFn({ data: { authToken: sessionToken ?? undefined } })
      .then((res) => {
        if (active) {
          setProfileCompleted(Boolean(res.profileCompleted));
          setProfileChecking(false);
        }
      })
      .catch((err) => {
        console.warn("[AuthProvider] Profile check notice:", err);
        if (active) {
          const hasMetaName = Boolean(
            user.user_metadata?.full_name || user.user_metadata?.name,
          );
          const rawPhone =
            user.user_metadata?.mobile_number ||
            user.user_metadata?.phone ||
            user.phone;
          const cleanPhone = rawPhone ? String(rawPhone).replace(/\D/g, "").slice(-10) : "";
          const hasMetaPhone = cleanPhone.length === 10;
          setProfileCompleted(hasMetaName && hasMetaPhone);
          setProfileChecking(false);
        }
      });

    return () => {
      active = false;
    };
  }, [user, sessionToken, attempt]);

  const refreshProfile = async (): Promise<boolean> => {
    if (!user) return false;
    setProfileChecking(true);
    try {
      const res = await checkProfileCompletionServerFn({
        data: { authToken: sessionToken ?? undefined },
      });
      setProfileCompleted(Boolean(res.profileCompleted));
      return Boolean(res.profileCompleted);
    } catch {
      return false;
    } finally {
      setProfileChecking(false);
    }
  };

  const setGoogleSession = (newUser: AuthUser, newSessionToken: string) => {
    try {
      localStorage.setItem(
        GOOGLE_SESSION_STORAGE_KEY,
        JSON.stringify({ user: newUser, sessionToken: newSessionToken }),
      );
    } catch {
      /* ignore */
    }
    setUser(newUser);
    setSessionToken(newSessionToken);
    setReady(true);
    setWelcome({
      userId: newUser.id,
      seen: Boolean(newUser.isAdmin),
      error: false,
    });
    checkProfileCompletionServerFn({ data: { authToken: newSessionToken } })
      .then((res) => setProfileCompleted(Boolean(res.profileCompleted)))
      .catch(() => {});
  };

  const completeWelcome = async () => {
    if (!user) throw new Error("Please sign in again.");
    const userId = user.id;

    await persistWelcome(
      async () => {
        try {
          localStorage.setItem(`${GOOGLE_WELCOME_KEY_PREFIX}${userId}`, "true");
        } catch {
          /* ignore */
        }

        try {
          const { error } = await supabase.from("customer_welcome").insert({ user_id: userId });
          if (error && error.code !== "23505") {
            // Ignore error if already recorded or RLS restricted
          }
        } catch {
          // Fallback succeeded locally
        }
      },
      () => setWelcome({ userId, seen: true, error: false }),
    );
  };

  const signOut = async () => {
    try {
      localStorage.removeItem(GOOGLE_SESSION_STORAGE_KEY);
    } catch {
      /* ignore */
    }

    // Disable Google GIS One-Tap auto-selection
    try {
      if (
        typeof window !== "undefined" &&
        (
          window as unknown as {
            google?: { accounts?: { id?: { disableAutoSelect?: () => void } } };
          }
        ).google?.accounts?.id?.disableAutoSelect
      ) {
        (
          window as unknown as {
            google?: { accounts?: { id?: { disableAutoSelect?: () => void } } };
          }
        ).google?.accounts?.id?.disableAutoSelect?.();
      }
    } catch {
      /* ignore */
    }

    try {
      await supabase.auth.signOut();
    } catch {
      /* ignore */
    }

    setWelcome(null);
    setUser(null);
    setSessionToken(null);
    setProfileCompleted(false);
    setProfileChecking(false);
  };

  return (
    <Ctx.Provider
      value={{
        user,
        sessionToken,
        ready,
        welcomeReady: !user || welcome?.userId === user.id,
        welcomeSeen: welcome?.userId === user?.id && welcome?.seen === true,
        welcomeError: welcome?.userId === user?.id && welcome?.error === true,
        profileCompleted,
        profileChecking,
        refreshProfile,
        retryWelcome: () => setAttempt((n) => n + 1),
        completeWelcome,
        setGoogleSession,
        signOut,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
