import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ShieldCheck, ArrowRight, Loader2, Lock, Mail } from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { meta } from "@/components/site/InfoPage";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { verifyGoogleAuthServerFn } from "@/server/auth";
import { adminLoginServerFn } from "@/server/admin";

export const Route = createFileRoute("/admin/login")({
  head: () =>
    meta("Admin Portal Login", "Restricted access for CAVENHUSRT executive management.", {
      path: "/admin/login",
      noIndex: true,
    }),
  component: AdminLogin,
});

function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const { setGoogleSession } = useAuth();
  const navigate = useNavigate();
  const googleBtnRef = useRef<HTMLDivElement>(null);

  const googleClientId = ((import.meta.env["VITE_GOOGLE_CLIENT_ID"] || "") as string)
    .replace(/^["']|["']$/g, "")
    .trim();

  const handleGoogleSuccess = useCallback(
    async (credentials: { idToken?: string; accessToken?: string }) => {
      setGoogleLoading(true);
      try {
        const result = await verifyGoogleAuthServerFn({
          data: credentials,
        });

        if (!result.isAdmin) {
          toast.error("Access Denied: Your account is not authorized as an administrator.");
          setGoogleLoading(false);
          return;
        }

        setGoogleSession(
          result.user as unknown as Parameters<typeof setGoogleSession>[0],
          result.sessionToken,
        );
        toast.success(`Welcome back, ${result.user.user_metadata?.full_name || "Admin"}!`);
        void navigate({ to: "/admin", replace: true });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Google authentication failed");
      } finally {
        setGoogleLoading(false);
      }
    },
    [navigate, setGoogleSession],
  );

  // Initialize Google Identity Services
  useEffect(() => {
    if (!googleClientId) return;

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => {
      interface GoogleGsiWindow extends Window {
        google?: {
          accounts?: {
            id?: {
              initialize: (opts: {
                client_id: string;
                callback: (res: { credential?: string }) => void;
              }) => void;
              renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void;
            };
          };
        };
      }
      const g = (window as GoogleGsiWindow).google;
      if (g?.accounts?.id && googleBtnRef.current) {
        g.accounts.id.initialize({
          client_id: googleClientId,
          callback: (res: { credential?: string }) => {
            if (res.credential) {
              void handleGoogleSuccess({ idToken: res.credential });
            }
          },
        });
        const availableWidth =
          googleBtnRef.current.parentElement?.clientWidth || window.innerWidth - 80;
        g.accounts.id.renderButton(googleBtnRef.current, {
          theme: "filled_black",
          size: "large",
          width: Math.min(320, Math.max(200, availableWidth)),
          text: "continue_with",
          shape: "rectangular",
        });
      }
    };
    document.body.appendChild(script);

    return () => {
      script.remove();
    };
  }, [googleClientId, handleGoogleSuccess]);

  // Email & Password Admin Sign-In
  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      toast.error("Email and password are required");
      return;
    }

    setBusy(true);
    try {
      // 1. Supabase Auth sign-in
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password: password.trim(),
      });

      if (error) {
        throw new Error(error.message);
      }

      if (!data.session?.access_token) {
        throw new Error("Authentication failed: No session token received");
      }

      // 2. Server verification of admin role
      const verification = await adminLoginServerFn({
        data: {
          email: email.trim().toLowerCase(),
          authToken: data.session.access_token,
        },
      });

      if (!verification.success) {
        await supabase.auth.signOut();
        throw new Error("Unauthorized: Your account does not have admin permissions.");
      }

      toast.success(`Welcome to CAVENHUSRT Admin Portal, ${verification.user.name}!`);
      void navigate({ to: "/admin", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Admin login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-[85vh] items-center justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 sm:p-8 shadow-2xl space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-electric/10 text-electric border border-electric/30">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <p className="text-[11px] font-heading font-bold tracking-widest text-silver uppercase">
            Executive Portal
          </p>
          <h1 className="font-heading text-3xl font-bold uppercase tracking-tight text-foreground">
            CAVENHUSRT Admin
          </h1>
          <p className="text-xs text-muted-foreground">
            Restricted access for authorized operations management.
          </p>
        </div>

        {/* Google Admin Login */}
        <div className="space-y-3 pt-2">
          <div className="flex justify-center" ref={googleBtnRef} />
          {googleLoading && (
            <div className="flex items-center justify-center gap-2 text-xs text-silver">
              <Loader2 className="h-4 w-4 animate-spin text-electric" /> Verifying administrator
              credentials...
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-[10px] uppercase font-mono text-muted-foreground">
            OR EMAIL ACCESS
          </span>
          <div className="h-px flex-1 bg-border" />
        </div>

        {/* Email & Password Admin Login */}
        <form onSubmit={handleEmailLogin} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Admin Email</label>
            <div className="relative mt-1">
              <input
                required
                type="email"
                className="w-full rounded-md border border-input bg-background px-3 py-2.5 pl-9 text-xs outline-none focus:border-electric"
                placeholder="admin@cavenhusrt.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Mail className="absolute left-3 top-3 h-3.5 w-3.5 text-muted-foreground" />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground">Password</label>
            <div className="relative mt-1">
              <input
                required
                type="password"
                className="w-full rounded-md border border-input bg-background px-3 py-2.5 pl-9 text-xs outline-none focus:border-electric"
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <Lock className="absolute left-3 top-3 h-3.5 w-3.5 text-muted-foreground" />
            </div>
          </div>

          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-primary py-2.5 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition"
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Authenticating...
              </>
            ) : (
              <>
                Sign In to Admin Portal <ArrowRight className="h-3.5 w-3.5" />
              </>
            )}
          </button>
        </form>

        <div className="border-t border-border pt-4 text-center">
          <Link to="/" className="text-xs text-muted-foreground hover:text-foreground">
            ← Return to CAVENHUSRT Storefront
          </Link>
        </div>
      </div>
    </div>
  );
}
