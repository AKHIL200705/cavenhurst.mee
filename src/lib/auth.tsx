import type React from "react";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { persistWelcome } from "./welcome";

type Auth = {
  user: User | null;
  ready: boolean;
  welcomeReady: boolean;
  welcomeSeen: boolean;
  welcomeError: boolean;
  retryWelcome: () => void;
  completeWelcome: () => Promise<void>;
  signOut: () => Promise<void>;
};
const g = globalThis as { __cavenAuthCtx?: React.Context<Auth> };
const Ctx = (g.__cavenAuthCtx ??= createContext<Auth>({
  user: null,
  ready: false,
  welcomeReady: false,
  welcomeSeen: false,
  welcomeError: false,
  retryWelcome: () => {},
  completeWelcome: async () => {},
  signOut: async () => {},
}));

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [welcome, setWelcome] = useState<{ userId: string; seen: boolean; error: boolean } | null>(
    null,
  );
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    const { data } = supabase.auth.onAuthStateChange((_e, s) => {
      setUser(s?.user ?? null);
      setReady(true);
    });
    supabase.auth.getUser().then(({ data }) => {
      if (active) {
        setUser(data.user ?? null);
        setReady(true);
      }
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    if (!user) {
      setWelcome(null);
      return;
    }
    let active = true;
    const userId = user.id;
    setWelcome(null);
    Promise.resolve(
      supabase
        .from("customer_welcome")
        .select("welcome_seen_at")
        .eq("user_id", userId)
        .maybeSingle(),
    )
      .then(({ data, error }) => {
        if (active)
          setWelcome({ userId, seen: Boolean(data?.welcome_seen_at), error: Boolean(error) });
      })
      .catch(() => {
        if (active) setWelcome({ userId, seen: false, error: true });
      });
    return () => {
      active = false;
    };
  }, [user, attempt]);

  const completeWelcome = async () => {
    if (!user) throw new Error("Please sign in again.");
    const userId = user.id;
    await persistWelcome(
      async () => {
        const { error } = await supabase.from("customer_welcome").insert({ user_id: userId });
        if (error && error.code !== "23505")
          throw new Error("Your welcome could not be saved. Please try again.");
      },
      () => setWelcome({ userId, seen: true, error: false }),
    );
  };
  return (
    <Ctx.Provider
      value={{
        user,
        ready,
        welcomeReady: !user || welcome?.userId === user.id,
        welcomeSeen: welcome?.userId === user?.id && welcome?.seen === true,
        welcomeError: welcome?.userId === user?.id && welcome?.error === true,
        retryWelcome: () => setAttempt((n) => n + 1),
        completeWelcome,
        signOut: async () => {
          const { error } = await supabase.auth.signOut();
          if (error) throw error;
          setWelcome(null);
          setUser(null);
        },
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
