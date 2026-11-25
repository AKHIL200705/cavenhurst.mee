import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ShieldCheck, ArrowRight, Loader2, Lock, Mail } from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { WingMark } from "@/components/site/Logo";
import { meta } from "@/components/site/InfoPage";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { verifyGoogleAuthServerFn } from "@/server/auth";
import { adminLoginServerFn } from "@/server/admin";

export const Route = createFileRoute("/admin/login")({
  head: () => meta("Admin Portal Login", "Restricted access for CAVENHURST executive management."),
  component: AdminLogin,
});

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className || "h-5 w-5"} viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      />
    </svg>
  );
}

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
        localStorage.setItem("cavenhurst_admin_token", result.sessionToken);
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
        g.accounts.id.renderButton(googleBtnRef.current, {
          theme: "filled_black",
          size: "large",
          width: 320,
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

      localStorage.setItem("cavenhurst_admin_token", data.session.access_token);
      toast.success(`Welcome to CAVENHURST Admin Portal, ${verification.user.name}!`);
      void navigate({ to: "/admin", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Admin login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-[85vh] items-center justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-2xl space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-electric/10 text-electric border border-electric/30">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <p className="text-[11px] font-heading font-bold tracking-widest text-silver uppercase">
            Executive Portal
          </p>
          <h1 className="font-heading text-3xl font-bold uppercase tracking-tight text-foreground">
            CAVENHURST Admin
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
                placeholder="admin@cavenhurst.com"
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
            ← Return to CAVENHURST Storefront
          </Link>
        </div>
      </div>
    </div>
  );
}
