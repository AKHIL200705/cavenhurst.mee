import type React from "react";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { persistWelcome } from "./welcome";
import {
  checkProfileCompletionServerFn,
  completeWelcomeServerFn,
  getWelcomeStatusServerFn,
} from "@/server/customers";
import { checkGoogleSessionServerFn, logoutSessionServerFn } from "@/server/auth";

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

const GOOGLE_SESSION_STORAGE_KEY = "cavenhusrt_google_session";

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

  // Initialize session on mount (always verify persisted session tokens server-side)
  useEffect(() => {
    let active = true;
    let googleCheckInFlight = false;

    const verifyStoredGoogleSession = async (): Promise<boolean> => {
      try {
        // 1. Prefer server HttpOnly session cookie (no sensitive token exposure to JS)
        const cookieCheck = await checkGoogleSessionServerFn({ data: {} });
        if (!active) return true;
        if (cookieCheck.valid && cookieCheck.user) {
          setUser(cookieCheck.user as unknown as AuthUser);
          setSessionToken(null);
          setReady(true);
          return true;
        }

        // 2. Fallback to stored customer session token if present
        const stored =
          typeof window !== "undefined" ? localStorage.getItem(GOOGLE_SESSION_STORAGE_KEY) : null;
        if (!stored) return false;
        const parsed = JSON.parse(stored);
        if (!parsed?.sessionToken || typeof parsed.sessionToken !== "string") {
          localStorage.removeItem(GOOGLE_SESSION_STORAGE_KEY);
          return false;
        }
        const checked = await checkGoogleSessionServerFn({
          data: { sessionToken: parsed.sessionToken },
        });
        if (!active) return true;
        if (checked.valid && checked.user) {
          setUser(checked.user as unknown as AuthUser);
          setSessionToken(parsed.sessionToken);
          setReady(true);
          return true;
        }
        localStorage.removeItem(GOOGLE_SESSION_STORAGE_KEY);
      } catch {
        // Ignore storage / network errors and allow fallback
      }
      return false;
    };

    // Failsafe timer: auth initialization must never leave the screen stuck as blank
    const authInitTimer = setTimeout(() => {
      if (active) setReady(true);
    }, 2000);

    googleCheckInFlight = true;
    void verifyStoredGoogleSession()
      .then((restored) => {
        googleCheckInFlight = false;
        if (!active || restored) return;
        supabase.auth
          .getSession()
          .then(({ data: { session } }) => {
            if (!active) return;
            if (session?.user) {
              setUser((session.user as unknown as AuthUser) ?? null);
              setSessionToken(session.access_token ?? null);
            }
            setReady(true);
          })
          .catch(() => {
            if (active) setReady(true);
          });
      })
      .catch(() => {
        googleCheckInFlight = false;
        if (active) setReady(true);
      });

    // Active listener for Supabase authentication state
    const { data } = supabase.auth.onAuthStateChange((_e, s) => {
      if (!active) return;

      if (_e === "SIGNED_OUT") {
        try {
          if (typeof window !== "undefined") {
            localStorage.removeItem(GOOGLE_SESSION_STORAGE_KEY);
          }
        } catch {
          /* ignore */
        }
        setUser(null);
        setSessionToken(null);
        setReady(true);
        return;
      }

      if (s?.user) {
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

      if (!googleCheckInFlight) {
        void verifyStoredGoogleSession().then((restored) => {
          if (!active || restored) return;
          setUser(null);
          setSessionToken(null);
          setReady(true);
        });
      }
    });

    return () => {
      active = false;
      clearTimeout(authInitTimer);
      data.subscription.unsubscribe();
    };
  }, []);

  // Welcome state check — strictly read from immutable server/DB row (never browser storage)
  useEffect(() => {
    if (!user) {
      setWelcome(null);
      return;
    }
    let active = true;
    const userId = user.id;

    // Failsafe timer so welcome check never leaves screen hung
    const welcomeTimer = setTimeout(() => {
      if (active) {
        setWelcome({
          userId,
          seen: true,
          error: false,
        });
      }
    }, 2500);

    // Welcome check: retry once on failure. If the server is unreachable after
    // retry, assume welcome was seen so users are never blocked from shopping
    // by a transient DB / network error (welcome is UX-only, not a security gate).
    const fetchWelcome = () =>
      getWelcomeStatusServerFn({ data: { authToken: sessionToken ?? undefined } });

    fetchWelcome()
      .catch(() => {
        // Single automatic retry after 1.5 s
        return new Promise<void>((resolve) => setTimeout(resolve, 1500)).then(fetchWelcome);
      })
      .then((res) => {
        if (active) {
          clearTimeout(welcomeTimer);
          setWelcome({
            userId,
            seen: Boolean(res?.seen),
            error: false,
          });
        }
      })
      .catch(() => {
        // Both attempts failed — degrade gracefully: treat welcome as seen so
        // users can continue shopping. The error screen is never shown for a
        // transient backend issue.
        console.warn("[AuthProvider] Welcome status unavailable — degrading gracefully.");
        if (active) {
          clearTimeout(welcomeTimer);
          setWelcome({
            userId,
            seen: true, // assume seen → user reaches the store, not a dead-end
            error: false, // suppress the error screen
          });
        }
      });

    return () => {
      active = false;
      clearTimeout(welcomeTimer);
    };
  }, [user, sessionToken, attempt]);

  // Check profile completion status from database
  useEffect(() => {
    if (!user) {
      setProfileCompleted(false);
      setProfileChecking(false);
      return;
    }

    let active = true;
    setProfileChecking(true);

    // Failsafe timer so profile check never leaves screen hung
    const profileTimer = setTimeout(() => {
      if (active) {
        setProfileChecking(false);
      }
    }, 2500);

    checkProfileCompletionServerFn({ data: { authToken: sessionToken ?? undefined } })
      .then((res) => {
        if (active) {
          clearTimeout(profileTimer);
          setProfileCompleted(Boolean(res.isAdmin || res.profileCompleted));
          setProfileChecking(false);
        }
      })
      .catch((err) => {
        console.warn("[AuthProvider] Profile check notice:", err);
        if (active) {
          clearTimeout(profileTimer);
          setProfileCompleted(false);
          setProfileChecking(false);
        }
      });

    return () => {
      active = false;
      clearTimeout(profileTimer);
    };
  }, [user, sessionToken, attempt]);

  const refreshProfile = async (): Promise<boolean> => {
    if (!user) return false;
    setProfileChecking(true);
    try {
      const res = await checkProfileCompletionServerFn({
        data: { authToken: sessionToken ?? undefined },
      });
      const done = Boolean(res.isAdmin || res.profileCompleted);
      setProfileCompleted(done);
      return done;
    } catch {
      return false;
    } finally {
      setProfileChecking(false);
    }
  };

  const setGoogleSession = (newUser: AuthUser, newSessionToken: string) => {
    const isAdminAccount = Boolean(newUser?.app_metadata?.["is_admin"]);
    try {
      if (isAdminAccount) {
        localStorage.removeItem(GOOGLE_SESSION_STORAGE_KEY);
      } else {
        localStorage.setItem(
          GOOGLE_SESSION_STORAGE_KEY,
          JSON.stringify({ user: newUser, sessionToken: newSessionToken }),
        );
      }
    } catch {
      /* ignore */
    }
    setUser(newUser);
    setSessionToken(newSessionToken);
    setReady(true);
    setWelcome(null);
    checkProfileCompletionServerFn({ data: { authToken: newSessionToken } })
      .then((res) => setProfileCompleted(Boolean(res.isAdmin || res.profileCompleted)))
      .catch(() => {});
  };

  const completeWelcome = async () => {
    if (!user) throw new Error("Please sign in again.");
    const userId = user.id;

    await persistWelcome(
      async () => {
        await completeWelcomeServerFn({ data: { authToken: sessionToken ?? undefined } });
      },
      () => setWelcome({ userId, seen: true, error: false }),
    );
  };

  const signOut = async () => {
    try {
      localStorage.removeItem(GOOGLE_SESSION_STORAGE_KEY);
      localStorage.removeItem("cavenhusrt_admin_token");
    } catch {
      /* ignore */
    }

    await logoutSessionServerFn({}).catch(() => {});

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
