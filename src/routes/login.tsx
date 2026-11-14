import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { WingMark } from "@/components/site/Logo";
import { meta } from "@/components/site/InfoPage";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { verifyGoogleAuthServerFn } from "@/server/auth";
import fabric from "@/assets/fabric-navy.jpg";

export const Route = createFileRoute("/login")({
  head: () => meta("Login / Sign Up", "Sign in to CAVENHURST to shop, track orders and more."),
  component: Login,
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
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      />
    </svg>
  );
}

function Login() {
  const [tab, setTab] = useState<"login" | "signup">("login");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const { setGoogleSession } = useAuth();
  const navigate = useNavigate();
  const googleBtnContainerRef = useRef<HTMLDivElement>(null);

  const googleClientId = ((import.meta.env["VITE_GOOGLE_CLIENT_ID"] || "") as string)
    .replace(/^["']|["']$/g, "")
    .trim();

  // Handle verified Google response
  const handleGoogleSuccess = useCallback(
    async (credentials: { idToken?: string; accessToken?: string }) => {
      setGoogleLoading(true);
      try {
        const res = await verifyGoogleAuthServerFn({
          data: credentials,
        });

        if (res?.success && res.user && res.sessionToken) {
          setGoogleSession(
            res.user as unknown as Parameters<typeof setGoogleSession>[0],
            res.sessionToken,
          );
          toast.success("Welcome! Signed in with Google.");

          if (res.isAdmin) {
            await navigate({ to: "/admin" });
          } else {
            await navigate({ to: "/account" });
          }
        } else {
          toast.error("Google authentication failed. Please try again.");
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Google authentication error";
        toast.error(message);
      } finally {
        setGoogleLoading(false);
      }
    },
    [setGoogleSession, navigate],
  );

  // Initialize Google Identity Services (GIS)
  useEffect(() => {
    if (!googleClientId) return;

    let unmounted = false;

    const setupGoogleGsi = () => {
      const googleObj = (
        window as unknown as {
          google?: {
            accounts?: {
              id?: {
                initialize: (config: unknown) => void;
                renderButton: (el: HTMLElement, opts: unknown) => void;
                prompt: () => void;
              };
            };
          };
        }
      ).google;
      if (!googleObj?.accounts?.id || unmounted) return;

      try {
        googleObj.accounts.id.initialize({
          client_id: googleClientId,
          callback: (response: { credential?: string }) => {
            if (response?.credential) {
              void handleGoogleSuccess({ idToken: response.credential });
            }
          },
          auto_select: false,
          cancel_on_tap_outside: true,
        });

        if (googleBtnContainerRef.current) {
          googleBtnContainerRef.current.innerHTML = "";
          googleObj.accounts.id.renderButton(googleBtnContainerRef.current, {
            theme: "outline",
            size: "large",
            width: 360,
            text: tab === "login" ? "signin_with" : "signup_with",
            shape: "rectangular",
          });
        }
      } catch (err) {
        console.warn("[Google GIS] Setup notice:", err);
      }
    };

    // If GIS script is already loaded
    const googleObj = (window as unknown as { google?: { accounts?: unknown } }).google;
    if (googleObj?.accounts) {
      setupGoogleGsi();
    } else {
      // Dynamic fallback script loader
      const existingScript = document.querySelector(
        'script[src*="accounts.google.com/gsi/client"]',
      );
      if (!existingScript) {
        const script = document.createElement("script");
        script.src = "https://accounts.google.com/gsi/client";
        script.async = true;
        script.defer = true;
        script.onload = setupGoogleGsi;
        document.head.appendChild(script);
      } else {
        existingScript.addEventListener("load", setupGoogleGsi);
      }
    }

    return () => {
      unmounted = true;
    };
  }, [googleClientId, tab, handleGoogleSuccess]);

  const sendCode = async () => {
    if (!/^[6-9]\d{9}$/.test(phone)) {
      toast.error("Enter a valid 10-digit mobile number");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({ phone: `+91${phone}` });
    setBusy(false);
    if (error) {
      toast.error(
        error.message.includes("provider")
          ? "Mobile login isn't switched on yet. Please use Google for now."
          : error.message,
      );
      return;
    }
    setSent(true);
    toast.success("Code sent to +91 " + phone);
  };

  const verify = async () => {
    if (!/^\d{6}$/.test(code)) {
      toast.error("Enter the 6-digit code");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({
      phone: `+91${phone}`,
      token: code,
      type: "sms",
    });
    setBusy(false);
    if (error) toast.error("That code didn't work. Check it and try again.");
  };

  const signInWithGoogleDirect = () => {
    if (!googleClientId) {
      toast.error("Google Client ID is not configured in .env");
      return;
    }

    const googleObj = (
      window as unknown as {
        google?: {
          accounts?: {
            oauth2?: {
              initTokenClient: (config: unknown) => { requestAccessToken: () => void };
            };
            id?: {
              prompt: () => void;
            };
          };
        };
      }
    ).google;

    if (!googleObj?.accounts) {
      toast.error("Connecting to Google Identity Services… Please try again in a moment.");
      return;
    }

    // Standard OAuth2 Popup flow
    if (googleObj.accounts.oauth2) {
      try {
        const tokenClient = googleObj.accounts.oauth2.initTokenClient({
          client_id: googleClientId,
          scope: "email profile openid",
          callback: (tokenResponse: { access_token?: string; error?: string }) => {
            if (tokenResponse.error) {
              if (tokenResponse.error !== "popup_closed_by_user") {
                toast.error(`Google authentication error: ${tokenResponse.error}`);
              }
              return;
            }
            if (tokenResponse.access_token) {
              void handleGoogleSuccess({ accessToken: tokenResponse.access_token });
            }
          },
        });
        tokenClient.requestAccessToken();
        return;
      } catch (err) {
        console.warn("[Google Auth] OAuth2 popup fallback to ID prompt:", err);
      }
    }

    // Google Identity Services One-Tap fallback
    if (googleObj.accounts.id) {
      googleObj.accounts.id.prompt();
    }
  };

  return (
    <div className="relative -mb-px overflow-hidden">
      <img src={fabric} alt="" className="absolute inset-0 h-full w-full object-cover" />
      <div className="relative mx-auto flex min-h-[90vh] max-w-md flex-col">
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-14 text-center">
          <WingMark className="h-16 w-auto text-foreground drop-shadow-2xl" />
          <p className="mt-6 font-logo text-2xl font-bold tracking-brand">CAVENHURST</p>
          <p className="mt-10 text-sm font-semibold tracking-[0.5em] text-silver">
            PREMIUM ESSENTIALS
          </p>
          <p className="mt-4 font-serif text-2xl italic">
            Premium apparel for
            <br />
            everyday movement.
          </p>
        </div>
        <div className="glass-panel rounded-t-3xl border border-b-0 border-border px-6 pb-10 pt-4">
          <div className="mx-auto mb-6 h-1 w-12 rounded-full bg-silver/40" />
          <div className="mx-auto grid max-w-xs grid-cols-2 rounded-full border border-border p-1">
            {(["login", "signup"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "rounded-full py-2.5 text-sm font-medium transition",
                  tab === t && "bg-primary font-bold text-primary-foreground",
                )}
              >
                {t === "login" ? "Login" : "Sign Up"}
              </button>
            ))}
          </div>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            {tab === "login"
              ? "Continue to shop, track orders and more."
              : "Create your account in seconds."}
          </p>
          {!sent ? (
            <>
              <div className="mt-6 flex items-center rounded-xl border border-input">
                <span className="flex items-center gap-2 border-r border-input px-4 py-4 text-sm">
                  🇮🇳 +91
                </span>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  inputMode="numeric"
                  placeholder="Enter mobile number"
                  className="flex-1 bg-transparent px-4 outline-none"
                />
              </div>
              <button
                disabled={busy}
                onClick={sendCode}
                className="mt-4 flex w-full items-center justify-center gap-3 rounded-xl bg-primary py-4 font-bold text-primary-foreground disabled:opacity-60"
              >
                {busy ? "Sending…" : "Continue with Mobile"} <ArrowRight className="h-4 w-4" />
              </button>
            </>
          ) : (
            <>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="6-digit code"
                className="mt-6 w-full rounded-xl border border-input bg-transparent px-4 py-4 text-center text-lg tracking-[0.5em] outline-none"
              />
              <button
                disabled={busy}
                onClick={verify}
                className="mt-4 w-full rounded-xl bg-primary py-4 font-bold text-primary-foreground disabled:opacity-60"
              >
                {busy ? "Checking…" : "Verify & Continue"}
              </button>
              <button
                onClick={() => {
                  setSent(false);
                  setCode("");
                }}
                className="mt-3 w-full text-sm text-muted-foreground underline"
              >
                Change number / resend
              </button>
            </>
          )}

          <div className="my-5 flex items-center gap-4 text-sm text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            OR
            <span className="h-px flex-1 bg-border" />
          </div>

          {/* Direct Google Authentication Button */}
          <button
            type="button"
            disabled={googleLoading}
            onClick={signInWithGoogleDirect}
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-foreground/30 bg-background/50 py-3.5 font-bold transition hover:bg-background/80 disabled:opacity-50"
          >
            {googleLoading ? (
              <>
                <LoaderCircle className="h-5 w-5 animate-spin" />
                <span>Verifying with Google…</span>
              </>
            ) : (
              <>
                <GoogleIcon className="h-5 w-5" />
                <span>Continue with Google</span>
              </>
            )}
          </button>

          {/* Official Google GIS Button render container */}
          <div
            ref={googleBtnContainerRef}
            className="mt-3 flex min-h-[44px] w-full justify-center overflow-hidden"
          />

          <p className="mt-6 text-center text-xs text-muted-foreground">
            By continuing, you agree to our{" "}
            <Link to="/terms" className="underline">
              Terms &amp; Conditions
            </Link>{" "}
            and{" "}
            <Link to="/privacy" className="underline">
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
