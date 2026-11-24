import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, LoaderCircle, Eye, EyeOff, Lock, Mail, User, Phone, CheckCircle2 } from "lucide-react";
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
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      />
    </svg>
  );
}

function Login() {
  const [tab, setTab] = useState<"login" | "signup">("login");
  const [authMode, setAuthMode] = useState<"password" | "otp">("password");

  // Form Fields
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // OTP State
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpType, setOtpType] = useState<"phone" | "email">("phone");

  // Loading States
  const [busy, setBusy] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [signupSuccessNote, setSignupSuccessNote] = useState<string | null>(null);

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

    const googleObj = (window as unknown as { google?: { accounts?: unknown } }).google;
    if (googleObj?.accounts) {
      setupGoogleGsi();
    } else {
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

  // ---------------------------------------------------------------------------
  // SIGN UP (Email + Password + Profile Details)
  // ---------------------------------------------------------------------------
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignupSuccessNote(null);

    const cleanName = fullName.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPhone = phone.replace(/\D/g, "").slice(-10);

    if (!cleanName) {
      toast.error("Please enter your full name");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      toast.error("Please enter a valid email address");
      return;
    }
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    setBusy(true);
    try {
      // Clear any legacy Google local storage session
      if (typeof window !== "undefined") {
        localStorage.removeItem("cavenhurst_google_session");
      }

      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password: password,
        options: {
          data: {
            full_name: cleanName,
            phone: cleanPhone || undefined,
          },
        },
      });

      if (error) {
        if (error.message.toLowerCase().includes("already registered")) {
          toast.error("An account with this email already exists. Please log in.");
          setTab("login");
        } else {
          toast.error(error.message);
        }
        return;
      }

      if (data.user) {
        // Direct profile upsert via client RLS if authenticated session is returned
        if (data.session) {
          try {
            await supabase.from("profiles").upsert({
              id: data.user.id,
              full_name: cleanName,
              email: cleanEmail,
              phone: cleanPhone || null,
              auth_provider: "email",
              account_status: "active",
              updated_at: new Date().toISOString(),
            });
          } catch {
            // DB trigger handle_auth_user_sync ensures profile creation regardless
          }

          toast.success(`Welcome to CAVENHURST, ${cleanName}!`);
          await navigate({ to: "/account" });
        } else {
          // Email confirmation is required by Supabase Auth project configuration
          setSignupSuccessNote(
            `Account created for ${cleanEmail}! Please check your email inbox to confirm your address, then sign in.`,
          );
          toast.success("Account created! Check your email to confirm your account.");
          setTab("login");
          setPassword("");
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Registration failed. Please try again.";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  // ---------------------------------------------------------------------------
  // SIGN IN (Email + Password)
  // ---------------------------------------------------------------------------
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignupSuccessNote(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      toast.error("Please enter a valid email address");
      return;
    }
    if (!password) {
      toast.error("Please enter your password");
      return;
    }

    setBusy(true);
    try {
      // Clear any legacy Google local storage session
      if (typeof window !== "undefined") {
        localStorage.removeItem("cavenhurst_google_session");
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: password,
      });

      if (error) {
        if (
          error.message.toLowerCase().includes("invalid login credentials") ||
          error.message.toLowerCase().includes("invalid_credentials")
        ) {
          toast.error("Invalid email or password. Please verify your details.");
        } else if (error.message.toLowerCase().includes("email not confirmed")) {
          toast.error("Please check your email and click the confirmation link before signing in.");
        } else {
          toast.error(error.message);
        }
        return;
      }

      if (data.session && data.user) {
        toast.success("Welcome back!");

        const userEmail = data.user.email?.toLowerCase();
        const isAdminEmail =
          userEmail && ["akhilsaiabbireddy2007@gmail.com", "cavenhurst@gmail.com"].includes(userEmail);

        if (isAdminEmail) {
          await navigate({ to: "/admin" });
        } else {
          await navigate({ to: "/account" });
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Sign in failed. Please try again.";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  // ---------------------------------------------------------------------------
  // OTP AUTHENTICATION (Mobile / Email fallback)
  // ---------------------------------------------------------------------------
  const sendOtpCode = async () => {
    if (otpType === "phone") {
      const cleanPhone = phone.replace(/\D/g, "").slice(-10);
      if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
        toast.error("Enter a valid 10-digit mobile number");
        return;
      }
      setBusy(true);
      const { error } = await supabase.auth.signInWithOtp({ phone: `+91${cleanPhone}` });
      setBusy(false);
      if (error) {
        toast.error(
          error.message.includes("provider")
            ? "SMS service is currently unavailable. Please use email or Google login."
            : error.message,
        );
        return;
      }
      setOtpSent(true);
      toast.success("Code sent to +91 " + cleanPhone);
    } else {
      const cleanEmail = email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        toast.error("Enter a valid email address");
        return;
      }
      setBusy(true);
      const { error } = await supabase.auth.signInWithOtp({
        email: cleanEmail,
        options: { shouldCreateUser: true },
      });
      setBusy(false);
      if (error) {
        toast.error(error.message);
        return;
      }
      setOtpSent(true);
      toast.success("Code sent to " + cleanEmail);
    }
  };

  const verifyOtpCode = async () => {
    if (!/^\d{6}$/.test(otpCode.trim())) {
      toast.error("Enter the 6-digit code");
      return;
    }
    setBusy(true);

    let verifyPromise;
    if (otpType === "phone") {
      const cleanPhone = phone.replace(/\D/g, "").slice(-10);
      verifyPromise = supabase.auth.verifyOtp({
        phone: `+91${cleanPhone}`,
        token: otpCode.trim(),
        type: "sms",
      });
    } else {
      verifyPromise = supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: otpCode.trim(),
        type: "email",
      });
    }

    const { error } = await verifyPromise;
    setBusy(false);

    if (error) {
      toast.error(error.message || "Invalid or expired code.");
    } else {
      toast.success("Welcome back!");
      void navigate({ to: "/account" });
    }
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
        }
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

    if (googleObj.accounts.id) {
      googleObj.accounts.id.prompt();
    }
  };

  return (
    <div className="relative -mb-px overflow-hidden">
      <img src={fabric} alt="" className="absolute inset-0 h-full w-full object-cover" />
      <div className="relative mx-auto flex min-h-[90vh] max-w-md flex-col">
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
          <WingMark className="h-16 w-auto text-foreground drop-shadow-2xl" />
          <p className="mt-6 font-logo text-2xl font-bold tracking-brand">CAVENHURST</p>
          <p className="mt-4 text-xs font-semibold tracking-[0.5em] text-silver">
            PREMIUM ESSENTIALS
          </p>
          <p className="mt-3 font-serif text-xl italic text-muted-foreground">
            Refined apparel for everyday movement.
          </p>
        </div>

        <div className="glass-panel rounded-t-3xl border border-b-0 border-border px-6 pb-10 pt-4">
          <div className="mx-auto mb-6 h-1 w-12 rounded-full bg-silver/40" />

          {/* Tab Switcher: Login vs Sign Up */}
          <div className="mx-auto grid max-w-xs grid-cols-2 rounded-full border border-border p-1">
            {(["login", "signup"] as const).map((t) => (
              <button
                key={t}
                onClick={() => {
                  setTab(t);
                  setAuthMode("password");
                  setOtpSent(false);
                  setSignupSuccessNote(null);
                }}
                className={cn(
                  "rounded-full py-2.5 text-sm font-medium transition",
                  tab === t && "bg-primary font-bold text-primary-foreground shadow-sm",
                )}
              >
                {t === "login" ? "Login" : "Sign Up"}
              </button>
            ))}
          </div>

          <p className="mt-4 text-center text-xs text-muted-foreground">
            {tab === "login"
              ? "Access your saved bag, wishlist and order history."
              : "Create an authoritative CAVENHURST account."}
          </p>

          {/* Success Notification Banner */}
          {signupSuccessNote && (
            <div className="mt-4 flex items-start gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs text-emerald-300">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
              <span>{signupSuccessNote}</span>
            </div>
          )}

          {/* Mode Switcher: Password vs OTP */}
          <div className="mt-4 flex justify-center gap-2">
            <button
              type="button"
              onClick={() => {
                setAuthMode("password");
                setOtpSent(false);
              }}
              className={cn(
                "px-3.5 py-1 text-xs rounded-full border transition",
                authMode === "password"
                  ? "bg-primary/10 border-primary font-bold text-foreground"
                  : "border-border text-muted-foreground hover:bg-accent",
              )}
            >
              Email &amp; Password
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMode("otp");
                setOtpSent(false);
              }}
              className={cn(
                "px-3.5 py-1 text-xs rounded-full border transition",
                authMode === "otp"
                  ? "bg-primary/10 border-primary font-bold text-foreground"
                  : "border-border text-muted-foreground hover:bg-accent",
              )}
            >
              One-Time Code (OTP)
            </button>
          </div>

          {/* ------------------------------------------------------------- */}
          {/* PASSWORD FLOW (PRIMARY)                                       */}
          {/* ------------------------------------------------------------- */}
          {authMode === "password" ? (
            tab === "signup" ? (
              <form onSubmit={handleSignUp} className="mt-5 space-y-3.5">
                {/* Full Name */}
                <div className="flex items-center rounded-xl border border-input bg-background/50 px-3.5 py-3">
                  <User className="mr-3 h-4 w-4 text-muted-foreground" />
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Full Name (e.g. Akhil Sai)"
                    className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  />
                </div>

                {/* Email Address */}
                <div className="flex items-center rounded-xl border border-input bg-background/50 px-3.5 py-3">
                  <Mail className="mr-3 h-4 w-4 text-muted-foreground" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email Address"
                    className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  />
                </div>

                {/* Mobile Phone (Optional) */}
                <div className="flex items-center rounded-xl border border-input bg-background/50 px-3.5 py-3">
                  <Phone className="mr-3 h-4 w-4 text-muted-foreground" />
                  <span className="mr-2 border-r border-input pr-2 text-xs text-muted-foreground">
                    🇮🇳 +91
                  </span>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                    placeholder="Mobile Number (optional)"
                    className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  />
                </div>

                {/* Password */}
                <div className="flex items-center rounded-xl border border-input bg-background/50 px-3.5 py-3">
                  <Lock className="mr-3 h-4 w-4 text-muted-foreground" />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password (min 6 characters)"
                    className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={busy}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-bold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
                >
                  {busy ? (
                    <>
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                      <span>Creating Account…</span>
                    </>
                  ) : (
                    <>
                      <span>Create Account</span>
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </form>
            ) : (
              <form onSubmit={handleSignIn} className="mt-5 space-y-3.5">
                {/* Email Address */}
                <div className="flex items-center rounded-xl border border-input bg-background/50 px-3.5 py-3">
                  <Mail className="mr-3 h-4 w-4 text-muted-foreground" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email Address"
                    className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  />
                </div>

                {/* Password */}
                <div className="flex items-center rounded-xl border border-input bg-background/50 px-3.5 py-3">
                  <Lock className="mr-3 h-4 w-4 text-muted-foreground" />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                    className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={busy}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-bold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
                >
                  {busy ? (
                    <>
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                      <span>Signing In…</span>
                    </>
                  ) : (
                    <>
                      <span>Sign In</span>
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </form>
            )
          ) : (
            /* ------------------------------------------------------------- */
            /* OTP FLOW (SECONDARY ALTERNATIVE)                              */
            /* ------------------------------------------------------------- */
            <div className="mt-5 space-y-3.5">
              {!otpSent ? (
                <>
                  <div className="flex justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => setOtpType("phone")}
                      className={cn(
                        "px-3 py-1 text-xs rounded-full border transition",
                        otpType === "phone"
                          ? "bg-accent border-foreground/30 font-bold"
                          : "border-border text-muted-foreground",
                      )}
                    >
                      Phone SMS
                    </button>
                    <button
                      type="button"
                      onClick={() => setOtpType("email")}
                      className={cn(
                        "px-3 py-1 text-xs rounded-full border transition",
                        otpType === "email"
                          ? "bg-accent border-foreground/30 font-bold"
                          : "border-border text-muted-foreground",
                      )}
                    >
                      Email Code
                    </button>
                  </div>

                  {otpType === "phone" ? (
                    <div className="flex items-center rounded-xl border border-input bg-background/50 px-3.5 py-3">
                      <span className="mr-2 border-r border-input pr-2 text-xs text-muted-foreground">
                        🇮🇳 +91
                      </span>
                      <input
                        value={phone}
                        onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                        inputMode="numeric"
                        placeholder="Enter 10-digit mobile number"
                        className="flex-1 bg-transparent text-sm outline-none"
                      />
                    </div>
                  ) : (
                    <div className="flex items-center rounded-xl border border-input bg-background/50 px-3.5 py-3">
                      <Mail className="mr-3 h-4 w-4 text-muted-foreground" />
                      <input
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        type="email"
                        placeholder="Enter email address"
                        className="flex-1 bg-transparent text-sm outline-none"
                      />
                    </div>
                  )}

                  <button
                    disabled={busy}
                    onClick={sendOtpCode}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-bold text-primary-foreground disabled:opacity-60"
                  >
                    {busy ? "Sending Code…" : "Send Verification Code"}
                  </button>
                </>
              ) : (
                <>
                  <input
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="6-digit code"
                    className="w-full rounded-xl border border-input bg-transparent px-4 py-3.5 text-center text-lg tracking-[0.5em] outline-none"
                  />
                  <button
                    disabled={busy}
                    onClick={verifyOtpCode}
                    className="w-full rounded-xl bg-primary py-3.5 text-sm font-bold text-primary-foreground disabled:opacity-60"
                  >
                    {busy ? "Verifying…" : "Verify & Continue"}
                  </button>
                  <button
                    onClick={() => {
                      setOtpSent(false);
                      setOtpCode("");
                    }}
                    className="w-full text-center text-xs text-muted-foreground underline"
                  >
                    Change {otpType === "email" ? "email" : "number"} / resend
                  </button>
                </>
              )}
            </div>
          )}

          {/* Social Divider */}
          <div className="my-5 flex items-center gap-4 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            OR CONTINUE WITH
            <span className="h-px flex-1 bg-border" />
          </div>

          {/* Direct Google Authentication Button */}
          <button
            type="button"
            disabled={googleLoading}
            onClick={signInWithGoogleDirect}
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-border bg-background/60 py-3 text-sm font-bold transition hover:bg-background/90 disabled:opacity-50"
          >
            {googleLoading ? (
              <>
                <LoaderCircle className="h-4 w-4 animate-spin" />
                <span>Connecting with Google…</span>
              </>
            ) : (
              <>
                <GoogleIcon className="h-4 w-4" />
                <span>Continue with Google</span>
              </>
            )}
          </button>

          {/* Official Google GIS Button Render Container */}
          <div
            ref={googleBtnContainerRef}
            className="mt-3 flex min-h-[44px] w-full justify-center overflow-hidden"
          />

          <p className="mt-6 text-center text-[11px] text-muted-foreground">
            By continuing, you agree to our{" "}
            <Link to="/terms" className="underline hover:text-foreground">
              Terms &amp; Conditions
            </Link>{" "}
            and{" "}
            <Link to="/privacy" className="underline hover:text-foreground">
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
