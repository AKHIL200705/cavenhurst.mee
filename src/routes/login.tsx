import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, LoaderCircle, RefreshCw } from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { WingMark } from "@/components/site/Logo";
import { meta } from "@/components/site/InfoPage";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { verifyGoogleAuthServerFn } from "@/server/auth";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
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
  const [countdown, setCountdown] = useState(0);
  const [googleLoading, setGoogleLoading] = useState(false);

  const { setGoogleSession } = useAuth();
  const navigate = useNavigate();
  const googleBtnContainerRef = useRef<HTMLDivElement>(null);

  const googleClientId = ((import.meta.env["VITE_GOOGLE_CLIENT_ID"] || "") as string)
    .replace(/^["']|["']$/g, "")
    .trim();

  // Cooldown countdown timer for OTP resends
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

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
      toast.error("Please enter a valid 10-digit Indian mobile number");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        phone: `+91${phone}`,
        options: {
          shouldCreateUser: true,
        },
      });

      if (error) {
        const msg = (error.message || "").toLowerCase();
        if (msg.includes("signups not allowed")) {
          toast.error("Account registration via mobile OTP is currently restricted.");
        } else if (
          msg.includes("rate limit") ||
          msg.includes("too many") ||
          (error as { status?: number }).status === 429
        ) {
          toast.error("Too many OTP requests. Please wait a few moments before trying again.");
        } else if (msg.includes("provider") || msg.includes("unsupported")) {
          toast.error("Mobile OTP delivery is unavailable. Please continue with Google.");
        } else {
          toast.error(error.message || "Failed to deliver OTP. Please check your mobile number.");
        }
        return;
      }

      setSent(true);
      setCountdown(30);
      toast.success(`Verification code dispatched to +91 ${phone}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to deliver verification code");
    } finally {
      setBusy(false);
    }
  };

  const verify = async (codeToVerify?: string) => {
    const finalCode = (codeToVerify || code).trim();
    if (!/^\d{6}$/.test(finalCode)) {
      toast.error("Please enter the complete 6-digit verification code");
      return;
    }
    setBusy(true);
    try {
      // Clear previous custom Google session so Supabase session takes priority
      try {
        localStorage.removeItem("cavenhurst_google_session");
      } catch {
        /* ignore */
      }

      const { data, error } = await supabase.auth.verifyOtp({
        phone: `+91${phone}`,
        token: finalCode,
        type: "sms",
      });

      if (error) {
        const msg = (error.message || "").toLowerCase();
        if (msg.includes("expired")) {
          toast.error("The verification code has expired. Please request a new code.");
        } else if (msg.includes("invalid") || msg.includes("token")) {
          toast.error("Incorrect verification code. Please check and try again.");
        } else {
          toast.error(error.message || "Verification failed. Please try again.");
        }
        return;
      }

      toast.success("Welcome! Verification successful.");
      const email = data.user?.email || "";
      const isAdmin =
        email.toLowerCase() === "akhilsaiabbireddy2007@gmail.com" ||
        email.toLowerCase() === "cavenhurst@gmail.com";

      if (isAdmin) {
        await navigate({ to: "/admin" });
      } else {
        await navigate({ to: "/account" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authentication error occurred");
    } finally {
      setBusy(false);
    }
  };

  const handleCodeChange = (val: string) => {
    const cleaned = val.replace(/\D/g, "").slice(0, 6);
    setCode(cleaned);
    if (cleaned.length === 6) {
      void verify(cleaned);
    }
  };

  const handleTabChange = (t: "login" | "signup") => {
    setTab(t);
    setSent(false);
    setCode("");
    setCountdown(0);
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
                onClick={() => handleTabChange(t)}
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
              <div className="mt-6 flex items-center rounded-xl border border-input bg-background/50">
                <span className="flex items-center gap-2 border-r border-input px-4 py-4 text-sm font-semibold">
                  🇮🇳 +91
                </span>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  inputMode="numeric"
                  placeholder="Enter 10-digit mobile number"
                  className="flex-1 bg-transparent px-4 py-4 outline-none font-mono"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !busy) {
                      void sendCode();
                    }
                  }}
                />
              </div>
              <button
                disabled={busy || phone.length !== 10}
                onClick={sendCode}
                className="mt-4 flex w-full items-center justify-center gap-3 rounded-xl bg-primary py-4 font-bold text-primary-foreground disabled:opacity-50 transition"
              >
                {busy ? (
                  <>
                    <LoaderCircle className="h-5 w-5 animate-spin" />
                    <span>Sending code…</span>
                  </>
                ) : (
                  <>
                    <span>Continue with Mobile</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </>
          ) : (
            <>
              <div className="mt-6 flex flex-col items-center justify-center">
                <p className="mb-4 text-xs text-muted-foreground text-center">
                  Enter the 6-digit verification code sent to{" "}
                  <strong className="text-foreground font-mono">+91 {phone}</strong>
                </p>
                <InputOTP
                  maxLength={6}
                  value={code}
                  onChange={handleCodeChange}
                  disabled={busy}
                  containerClassName="justify-center"
                  autoFocus
                >
                  <InputOTPGroup className="gap-2 sm:gap-2.5">
                    <InputOTPSlot
                      index={0}
                      className="h-12 w-11 sm:w-12 rounded-xl border border-input bg-background/60 text-lg font-bold shadow-sm transition first:rounded-xl focus-visible:ring-1 focus-visible:ring-primary"
                    />
                    <InputOTPSlot
                      index={1}
                      className="h-12 w-11 sm:w-12 rounded-xl border border-input bg-background/60 text-lg font-bold shadow-sm transition focus-visible:ring-1 focus-visible:ring-primary"
                    />
                    <InputOTPSlot
                      index={2}
                      className="h-12 w-11 sm:w-12 rounded-xl border border-input bg-background/60 text-lg font-bold shadow-sm transition focus-visible:ring-1 focus-visible:ring-primary"
                    />
                    <InputOTPSlot
                      index={3}
                      className="h-12 w-11 sm:w-12 rounded-xl border border-input bg-background/60 text-lg font-bold shadow-sm transition focus-visible:ring-1 focus-visible:ring-primary"
                    />
                    <InputOTPSlot
                      index={4}
                      className="h-12 w-11 sm:w-12 rounded-xl border border-input bg-background/60 text-lg font-bold shadow-sm transition focus-visible:ring-1 focus-visible:ring-primary"
                    />
                    <InputOTPSlot
                      index={5}
                      className="h-12 w-11 sm:w-12 rounded-xl border border-input bg-background/60 text-lg font-bold shadow-sm transition last:rounded-xl focus-visible:ring-1 focus-visible:ring-primary"
                    />
                  </InputOTPGroup>
                </InputOTP>
              </div>

              <button
                disabled={busy || code.length < 6}
                onClick={() => verify()}
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-4 font-bold text-primary-foreground disabled:opacity-50 transition"
              >
                {busy ? (
                  <>
                    <LoaderCircle className="h-5 w-5 animate-spin" />
                    <span>Verifying code…</span>
                  </>
                ) : (
                  <>
                    <span>Verify &amp; Continue</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>

              <div className="mt-4 flex items-center justify-between px-1 text-xs text-muted-foreground">
                <button
                  type="button"
                  onClick={() => {
                    setSent(false);
                    setCode("");
                    setCountdown(0);
                  }}
                  className="underline hover:text-foreground transition"
                >
                  Change mobile number
                </button>
                {countdown > 0 ? (
                  <span>
                    Resend code in{" "}
                    <strong className="font-mono text-foreground">{countdown}s</strong>
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={sendCode}
                    className="flex items-center gap-1 font-semibold text-primary underline hover:text-primary/80 disabled:opacity-50 transition"
                  >
                    <RefreshCw className="h-3 w-3" /> Resend code
                  </button>
                )}
              </div>
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
