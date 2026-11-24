import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import {
  ArrowRight,
  LoaderCircle,
  Eye,
  EyeOff,
  Lock,
  Mail,
  User,
  Phone,
  ShieldCheck,
  RotateCcw,
} from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { WingMark } from "@/components/site/Logo";
import { meta } from "@/components/site/InfoPage";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import {
  verifyGoogleAuthServerFn,
  sendRegistrationOtpServerFn,
  verifyRegistrationOtpServerFn,
  resendRegistrationOtpServerFn,
  loginWithPhoneEmailServerFn,
  sendForgotPasswordOtpServerFn,
  resetPasswordWithOtpServerFn,
} from "@/server/auth";
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
  const [viewState, setViewState] = useState<"form" | "otp_verify" | "forgot_password">("form");

  // Registration Form Fields
  const [fullName, setFullName] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirmPassword, setRegConfirmPassword] = useState("");
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showRegConfirmPassword, setShowRegConfirmPassword] = useState(false);
  const [registrationKey, setRegistrationKey] = useState("");

  // Restore pending registration session on mount or refresh
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const savedKey = sessionStorage.getItem("cavenhurst_reg_key");
      const savedEmail = sessionStorage.getItem("cavenhurst_reg_email");
      const savedName = sessionStorage.getItem("cavenhurst_reg_name");
      const savedPhone = sessionStorage.getItem("cavenhurst_reg_phone");

      if (savedKey && savedEmail) {
        setRegistrationKey(savedKey);
        setRegEmail(savedEmail);
        if (savedName) setFullName(savedName);
        if (savedPhone) setRegPhone(savedPhone);
        setTab("signup");
        setViewState("otp_verify");
      }
    } catch {
      /* ignore */
    }
  }, []);

  // Login Form Fields
  const [loginPhone, setLoginPhone] = useState("");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // OTP Verification State
  const [otpDigits, setOtpDigits] = useState(["", "", "", "", "", ""]);
  const [otpTimerSec, setOtpTimerSec] = useState(300); // 5 minutes
  const [resendCooldownSec, setResendCooldownSec] = useState(60);

  // Forgot Password State
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotPhone, setForgotPhone] = useState("");
  const [forgotOtp, setForgotOtp] = useState(["", "", "", "", "", ""]);
  const [forgotNewPassword, setForgotNewPassword] = useState("");
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState("");
  const [showForgotNewPassword, setShowForgotNewPassword] = useState(false);
  const [forgotStep, setForgotStep] = useState<"request" | "reset">("request");

  // General UI States
  const [busy, setBusy] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const { setGoogleSession, refreshProfile } = useAuth();
  const search = useSearch({ strict: false });
  const returnTo = typeof (search as Record<string, unknown>)?.["returnTo"] === "string"
    ? ((search as Record<string, unknown>)["returnTo"] as string)
    : undefined;
  const navigate = useNavigate();
  const googleBtnContainerRef = useRef<HTMLDivElement>(null);
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const googleClientId = ((import.meta.env["VITE_GOOGLE_CLIENT_ID"] || "") as string)
    .replace(/^["']|["']$/g, "")
    .trim();

  // ---------------------------------------------------------------------------
  // TIMERS (OTP Expiry & Resend Cooldown)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let interval: NodeJS.Timeout | undefined;
    if (viewState === "otp_verify" || (viewState === "forgot_password" && forgotStep === "reset")) {
      interval = setInterval(() => {
        setOtpTimerSec((prev) => (prev > 0 ? prev - 1 : 0));
        setResendCooldownSec((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [viewState, forgotStep]);

  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const handlePostLoginRedirect = useCallback(
    async (isAdmin: boolean) => {
      if (isAdmin) {
        await navigate({ to: "/admin" });
        return;
      }
      const isCompleted = await refreshProfile();
      if (!isCompleted) {
        await navigate({
          to: "/complete-profile",
          search: { returnTo },
        });
      } else {
        await navigate({ to: returnTo || "/" });
      }
    },
    [navigate, refreshProfile, returnTo],
  );

  // ---------------------------------------------------------------------------
  // GOOGLE IDENTITY SERVICES (GIS) FOR EXISTING USERS
  // ---------------------------------------------------------------------------
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
          await handlePostLoginRedirect(Boolean(res.isAdmin));
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
    [setGoogleSession, handlePostLoginRedirect],
  );

  useEffect(() => {
    if (!googleClientId || tab !== "login") return;

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
            text: "signin_with",
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

  const signInWithGoogleDirect = () => {
    if (!googleClientId) {
      toast.error("Google Client ID is not configured.");
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

  // ---------------------------------------------------------------------------
  // 1. NEW USER REGISTRATION: SEND OTP
  // ---------------------------------------------------------------------------
  const handleSendRegistrationOtp = async (e: React.FormEvent) => {
    e.preventDefault();

    const cleanName = fullName.trim();
    const cleanPhone = regPhone.replace(/\D/g, "").slice(-10);
    const cleanEmail = regEmail.trim().toLowerCase();

    if (!cleanName || cleanName.length < 2) {
      toast.error("Please enter your full legal name (at least 2 characters).");
      return;
    }

    if (cleanPhone.length !== 10 || !/^[6-9]\d{9}$/.test(cleanPhone)) {
      toast.error("Please enter a valid 10-digit Indian mobile number (+91).");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      toast.error("Please enter a valid email address.");
      return;
    }

    if (regPassword.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }

    if (regPassword !== regConfirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      const res = await sendRegistrationOtpServerFn({
        data: {
          fullName: cleanName,
          phone: cleanPhone,
          email: cleanEmail,
          password: regPassword,
          confirmPassword: regConfirmPassword,
        },
      });

      if (res.success && res.registrationKey) {
        setRegistrationKey(res.registrationKey);
        if (typeof window !== "undefined") {
          try {
            sessionStorage.setItem("cavenhurst_reg_key", res.registrationKey);
            sessionStorage.setItem("cavenhurst_reg_email", cleanEmail);
            sessionStorage.setItem("cavenhurst_reg_name", cleanName);
            sessionStorage.setItem("cavenhurst_reg_phone", cleanPhone);
          } catch {
            /* ignore */
          }
        }
        setViewState("otp_verify");
        setOtpTimerSec(300); // 5 mins
        setResendCooldownSec(60);
        setOtpDigits(["", "", "", "", "", ""]);
        toast.success("Verification code sent to your email address.");
        setTimeout(() => otpInputRefs.current[0]?.focus(), 100);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "We couldn't send your verification code. Please try again.";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  // ---------------------------------------------------------------------------
  // 2. NEW USER REGISTRATION: VERIFY OTP & COMPLETE REGISTRATION
  // ---------------------------------------------------------------------------
  const handleVerifyRegistrationOtp = async (e: React.FormEvent) => {
    e.preventDefault();

    const fullOtp = otpDigits.join("").trim();
    if (fullOtp.length !== 6 || !/^\d{6}$/.test(fullOtp)) {
      toast.error("Please enter the complete 6-digit verification code.");
      return;
    }

    const activeKey =
      registrationKey ||
      (typeof window !== "undefined" ? sessionStorage.getItem("cavenhurst_reg_key") || "" : "");
    const activeEmail =
      regEmail.trim().toLowerCase() ||
      (typeof window !== "undefined" ? sessionStorage.getItem("cavenhurst_reg_email") || "" : "");

    setBusy(true);
    try {
      const res = await verifyRegistrationOtpServerFn({
        data: {
          registrationKey: activeKey,
          email: activeEmail,
          otp: fullOtp,
        },
      });

      if (res?.success && res.user && res.sessionToken) {
        if (typeof window !== "undefined") {
          try {
            sessionStorage.removeItem("cavenhurst_reg_key");
            sessionStorage.removeItem("cavenhurst_reg_email");
            sessionStorage.removeItem("cavenhurst_reg_name");
            sessionStorage.removeItem("cavenhurst_reg_phone");
          } catch {
            /* ignore */
          }
        }
        setGoogleSession(
          res.user as unknown as Parameters<typeof setGoogleSession>[0],
          res.sessionToken,
        );
        toast.success(`Welcome to CAVENHURST, ${res.user.user_metadata?.full_name || "Customer"}!`);
        await handlePostLoginRedirect(Boolean(res.isAdmin));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Verification failed. Please check your code.";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  // Resend OTP for Registration
  const handleResendRegistrationOtp = async () => {
    if (resendCooldownSec > 0 || busy) return;

    const activeKey =
      registrationKey ||
      (typeof window !== "undefined" ? sessionStorage.getItem("cavenhurst_reg_key") || "" : "");
    const activeEmail =
      regEmail.trim().toLowerCase() ||
      (typeof window !== "undefined" ? sessionStorage.getItem("cavenhurst_reg_email") || "" : "");

    setBusy(true);
    try {
      const res = await resendRegistrationOtpServerFn({
        data: {
          registrationKey: activeKey,
          email: activeEmail,
        },
      });

      if (res.success) {
        if (res.registrationKey) {
          setRegistrationKey(res.registrationKey);
          if (typeof window !== "undefined") {
            try {
              sessionStorage.setItem("cavenhurst_reg_key", res.registrationKey);
            } catch {
              /* ignore */
            }
          }
        }
        setOtpTimerSec(300);
        setResendCooldownSec(60);
        setOtpDigits(["", "", "", "", "", ""]);
        toast.success("Verification code sent to your email address.");
        otpInputRefs.current[0]?.focus();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "We couldn't send your verification code. Please try again.";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  // ---------------------------------------------------------------------------
  // 3. EXISTING USER LOGIN
  // ---------------------------------------------------------------------------
  const handleExistingUserLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    const cleanEmail = loginEmail.trim().toLowerCase();
    const cleanPhone = loginPhone.replace(/\D/g, "").slice(-10);

    if (cleanPhone.length !== 10) {
      toast.error("Please enter your registered 10-digit mobile number (+91).");
      return;
    }

    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      toast.error("Please enter your registered email address.");
      return;
    }

    if (!loginPassword) {
      toast.error("Please enter your password.");
      return;
    }

    setBusy(true);
    try {
      const res = await loginWithPhoneEmailServerFn({
        data: {
          mobileNumber: cleanPhone,
          email: cleanEmail,
          password: loginPassword,
        },
      });

      if (res?.success && res.user && res.sessionToken) {
        setGoogleSession(
          res.user as unknown as Parameters<typeof setGoogleSession>[0],
          res.sessionToken,
        );
        toast.success(`Welcome back, ${res.user.user_metadata?.full_name || "Customer"}!`);
        await handlePostLoginRedirect(Boolean(res.isAdmin));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sign in failed. Please verify your details.";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  // ---------------------------------------------------------------------------
  // 4. FORGOT PASSWORD FLOW
  // ---------------------------------------------------------------------------
  const handleRequestPasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = forgotEmail.trim().toLowerCase();
    const cleanPhone = forgotPhone.replace(/\D/g, "").slice(-10);

    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      toast.error("Please enter a valid registered email address.");
      return;
    }

    setBusy(true);
    try {
      const res = await sendForgotPasswordOtpServerFn({
        data: {
          email: cleanEmail,
          mobileNumber: cleanPhone || undefined,
        },
      });

      if (res.success) {
        setForgotStep("reset");
        setOtpTimerSec(300);
        setResendCooldownSec(60);
        setForgotOtp(["", "", "", "", "", ""]);
        toast.success(`Password reset code sent to ${cleanEmail}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send reset code.");
    } finally {
      setBusy(false);
    }
  };

  const handleCompletePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    const fullOtp = forgotOtp.join("").trim();

    if (fullOtp.length !== 6) {
      toast.error("Please enter the 6-digit code.");
      return;
    }

    if (forgotNewPassword.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }

    if (forgotNewPassword !== forgotConfirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      const res = await resetPasswordWithOtpServerFn({
        data: {
          email: forgotEmail.trim().toLowerCase(),
          otp: fullOtp,
          newPassword: forgotNewPassword,
          confirmPassword: forgotConfirmPassword,
        },
      });

      if (res.success) {
        toast.success(res.message);
        setViewState("form");
        setTab("login");
        setLoginEmail(forgotEmail);
        setLoginPhone(forgotPhone);
        setLoginPassword("");
        setForgotStep("request");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reset password.");
    } finally {
      setBusy(false);
    }
  };

  // Handle digit box input changes
  const handleOtpChange = (
    index: number,
    value: string,
    isForgot: boolean = false,
  ) => {
    const cleanDigit = value.replace(/\D/g, "").slice(-1);
    const stateSetter = isForgot ? setForgotOtp : setOtpDigits;

    stateSetter((prev) => {
      const copy = [...prev];
      copy[index] = cleanDigit;
      return copy;
    });

    if (cleanDigit && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>,
    isForgot: boolean = false,
  ) => {
    if (e.key === "Backspace") {
      const currentArr = isForgot ? forgotOtp : otpDigits;
      if (!currentArr[index] && index > 0) {
        otpInputRefs.current[index - 1]?.focus();
      }
    }
  };

  const handleOtpPaste = (
    e: React.ClipboardEvent<HTMLInputElement>,
    isForgot: boolean = false,
  ) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;

    const digits = pasted.split("");
    const newArr = ["", "", "", "", "", ""];
    digits.forEach((d, i) => {
      if (i < 6) newArr[i] = d;
    });

    if (isForgot) {
      setForgotOtp(newArr);
    } else {
      setOtpDigits(newArr);
    }

    const focusIdx = Math.min(digits.length, 5);
    otpInputRefs.current[focusIdx]?.focus();
  };

  return (
    <div className="relative -mb-px overflow-hidden">
      <img src={fabric} alt="" className="absolute inset-0 h-full w-full object-cover" />
      <div className="relative mx-auto flex min-h-[90vh] max-w-md flex-col">
        {/* Brand Header */}
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center font-sans">
          <WingMark className="h-16 w-auto text-foreground drop-shadow-2xl" />
          <h1 className="mt-5 font-logo text-2xl font-bold tracking-brand">CAVENHURST</h1>
          <p className="mt-2 font-heading text-xs font-bold uppercase tracking-[0.25em] text-electric">
            WEAR THE LEGACY
          </p>
          <p className="mt-3 font-sans text-sm font-medium text-muted-foreground">
            Bespoke elegance and refined luxury apparel.
          </p>
        </div>

        {/* Auth Glass Panel */}
        <div className="glass-panel rounded-t-3xl border border-b-0 border-border px-6 pb-12 pt-5 font-sans">
          <div className="mx-auto mb-6 h-1 w-12 rounded-full bg-silver/40" />

          {/* Mode Switcher: Login vs Create Account (Hidden during active verification) */}
          {viewState === "form" && (
            <div className="mx-auto grid max-w-sm grid-cols-2 rounded-full border border-border p-1 bg-background/50">
              <button
                type="button"
                onClick={() => setTab("login")}
                className={cn(
                  "rounded-full py-2.5 text-xs font-bold uppercase tracking-wider transition",
                  tab === "login"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Existing User – Login
              </button>
              <button
                type="button"
                onClick={() => setTab("signup")}
                className={cn(
                  "rounded-full py-2.5 text-xs font-bold uppercase tracking-wider transition",
                  tab === "signup"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                New User – Create Account
              </button>
            </div>
          )}

          {/* ------------------------------------------------------------- */}
          {/* VIEW: FORGOT PASSWORD                                         */}
          {/* ------------------------------------------------------------- */}
          {viewState === "forgot_password" ? (
            <div className="mt-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-heading text-sm font-bold uppercase tracking-wider text-foreground">
                    Reset Password
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {forgotStep === "request"
                      ? "Enter your registered credentials to receive a reset code."
                      : "Enter the 6-digit code and choose a new password."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setViewState("form");
                    setForgotStep("request");
                  }}
                  className="text-xs text-muted-foreground underline hover:text-foreground"
                >
                  Back to Login
                </button>
              </div>

              {forgotStep === "request" ? (
                <form onSubmit={handleRequestPasswordReset} className="space-y-3.5">
                  {/* Email */}
                  <div className="flex items-center rounded-xl border border-input bg-background/50 px-3.5 py-3">
                    <Mail className="mr-3 h-4 w-4 text-muted-foreground" />
                    <input
                      type="email"
                      required
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      placeholder="Registered Email Address"
                      className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                    />
                  </div>

                  {/* Registered Mobile (+91) */}
                  <div className="flex items-center rounded-xl border border-input bg-background/50 px-3.5 py-3">
                    <Phone className="mr-3 h-4 w-4 text-muted-foreground" />
                    <span className="mr-2 border-r border-input pr-2 text-xs font-medium text-muted-foreground">
                      🇮🇳 +91
                    </span>
                    <input
                      type="tel"
                      value={forgotPhone}
                      onChange={(e) => setForgotPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                      placeholder="Registered 10-Digit Mobile"
                      className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={busy}
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-bold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
                  >
                    {busy ? (
                      <>
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                        <span>Sending Reset Code…</span>
                      </>
                    ) : (
                      <>
                        <span>Send Verification Code</span>
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleCompletePasswordReset} className="space-y-3.5">
                  <div className="rounded-xl border border-border bg-background/40 p-3 text-center text-xs text-muted-foreground">
                    Code sent to <span className="font-semibold text-foreground">{forgotEmail}</span>
                  </div>

                  {/* 6 Digit Input Boxes */}
                  <div className="my-4 flex justify-between gap-2">
                    {forgotOtp.map((digit, idx) => (
                      <input
                        key={idx}
                        ref={(el) => {
                          otpInputRefs.current[idx] = el;
                        }}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => handleOtpChange(idx, e.target.value, true)}
                        onKeyDown={(e) => handleOtpKeyDown(idx, e, true)}
                        onPaste={(e) => handleOtpPaste(e, true)}
                        className="h-12 w-12 rounded-xl border border-input bg-background/60 text-center font-mono text-xl font-bold text-foreground outline-none transition focus:border-electric focus:ring-1 focus:ring-electric"
                      />
                    ))}
                  </div>

                  {/* New Password */}
                  <div className="flex items-center rounded-xl border border-input bg-background/50 px-3.5 py-3">
                    <Lock className="mr-3 h-4 w-4 text-muted-foreground" />
                    <input
                      type={showForgotNewPassword ? "text" : "password"}
                      required
                      minLength={6}
                      value={forgotNewPassword}
                      onChange={(e) => setForgotNewPassword(e.target.value)}
                      placeholder="New Password (min 6 chars)"
                      className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                    />
                    <button
                      type="button"
                      onClick={() => setShowForgotNewPassword(!showForgotNewPassword)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      {showForgotNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>

                  {/* Confirm New Password */}
                  <div className="flex items-center rounded-xl border border-input bg-background/50 px-3.5 py-3">
                    <Lock className="mr-3 h-4 w-4 text-muted-foreground" />
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={forgotConfirmPassword}
                      onChange={(e) => setForgotConfirmPassword(e.target.value)}
                      placeholder="Confirm New Password"
                      className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={busy}
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-bold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
                  >
                    {busy ? (
                      <>
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                        <span>Resetting Password…</span>
                      </>
                    ) : (
                      <>
                        <span>Reset Password &amp; Log In</span>
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>
          ) : viewState === "otp_verify" ? (
            /* ------------------------------------------------------------- */
            /* VIEW: NEW USER OTP EMAIL VERIFICATION SCREEN                  */
            /* ------------------------------------------------------------- */
            <div className="mt-4 space-y-4">
              <div className="text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-electric/10 text-electric border border-electric/20">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <h2 className="font-heading text-base font-bold uppercase tracking-wider text-foreground">
                  Verify Your Email
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  We have sent a 6-digit verification code to:
                </p>
                <p className="mt-0.5 text-xs font-semibold text-foreground">{regEmail}</p>
              </div>

              <form onSubmit={handleVerifyRegistrationOtp} className="mt-6 space-y-4">
                {/* 6 Digit Input Boxes */}
                <div className="flex justify-between gap-2">
                  {otpDigits.map((digit, idx) => (
                    <input
                      key={idx}
                      ref={(el) => {
                        otpInputRefs.current[idx] = el;
                      }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleOtpChange(idx, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                      onPaste={(e) => handleOtpPaste(e)}
                      className="h-12 w-12 rounded-xl border border-input bg-background/60 text-center font-mono text-xl font-bold text-foreground outline-none transition focus:border-electric focus:ring-1 focus:ring-electric"
                    />
                  ))}
                </div>

                {/* Expiry & Resend Controls */}
                <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                  <span>
                    Expires in:{" "}
                    <span className={cn("font-mono font-bold", otpTimerSec < 60 ? "text-red-400" : "text-foreground")}>
                      {formatTimer(otpTimerSec)}
                    </span>
                  </span>

                  {resendCooldownSec > 0 ? (
                    <span>Resend in {resendCooldownSec}s</span>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={handleResendRegistrationOtp}
                      className="flex items-center gap-1 font-bold text-electric hover:underline disabled:opacity-50"
                    >
                      <RotateCcw className="h-3 w-3" />
                      <span>Resend OTP</span>
                    </button>
                  )}
                </div>

                {/* Verify Button */}
                <button
                  type="submit"
                  disabled={busy || otpDigits.join("").length !== 6}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-bold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
                >
                  {busy ? (
                    <>
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                      <span>Verifying &amp; Creating Account…</span>
                    </>
                  ) : (
                    <>
                      <span>Complete Registration</span>
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>

                {/* Change Email Button */}
                <button
                  type="button"
                  onClick={() => {
                    if (typeof window !== "undefined") {
                      try {
                        sessionStorage.removeItem("cavenhurst_reg_key");
                        sessionStorage.removeItem("cavenhurst_reg_email");
                        sessionStorage.removeItem("cavenhurst_reg_name");
                        sessionStorage.removeItem("cavenhurst_reg_phone");
                      } catch {
                        /* ignore */
                      }
                    }
                    setRegistrationKey("");
                    setViewState("form");
                  }}
                  className="w-full text-center text-xs text-muted-foreground underline hover:text-foreground pt-1"
                >
                  Change Email or Details
                </button>
              </form>
            </div>
          ) : tab === "signup" ? (
            /* ------------------------------------------------------------- */
            /* VIEW: NEW USER REGISTRATION FORM (EMAIL OTP MANDATORY)        */
            /* ------------------------------------------------------------- */
            <form onSubmit={handleSendRegistrationOtp} className="mt-5 space-y-3.5">
              <p className="text-center text-xs text-muted-foreground mb-4">
                Enter your details to receive your 6-digit email verification code.
              </p>

              {/* 1. Full Name */}
              <div className="flex items-center rounded-xl border border-input bg-background/50 px-3.5 py-3">
                <User className="mr-3 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Full Legal Name"
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>

              {/* 2. Mobile Number (+91, 10-digit validation) */}
              <div className="flex items-center rounded-xl border border-input bg-background/50 px-3.5 py-3">
                <Phone className="mr-3 h-4 w-4 text-muted-foreground" />
                <span className="mr-2 border-r border-input pr-2 text-xs font-semibold text-muted-foreground">
                  🇮🇳 +91
                </span>
                <input
                  type="tel"
                  required
                  value={regPhone}
                  onChange={(e) => setRegPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  placeholder="10-Digit Mobile Number"
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>

              {/* 3. Email Address */}
              <div className="flex items-center rounded-xl border border-input bg-background/50 px-3.5 py-3">
                <Mail className="mr-3 h-4 w-4 text-muted-foreground" />
                <input
                  type="email"
                  required
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  placeholder="Email Address"
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>

              {/* 4. Password */}
              <div className="flex items-center rounded-xl border border-input bg-background/50 px-3.5 py-3">
                <Lock className="mr-3 h-4 w-4 text-muted-foreground" />
                <input
                  type={showRegPassword ? "text" : "password"}
                  required
                  minLength={6}
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  placeholder="Password (min 6 characters)"
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
                <button
                  type="button"
                  onClick={() => setShowRegPassword(!showRegPassword)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {showRegPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              {/* 5. Confirm Password */}
              <div className="flex items-center rounded-xl border border-input bg-background/50 px-3.5 py-3">
                <Lock className="mr-3 h-4 w-4 text-muted-foreground" />
                <input
                  type={showRegConfirmPassword ? "text" : "password"}
                  required
                  minLength={6}
                  value={regConfirmPassword}
                  onChange={(e) => setRegConfirmPassword(e.target.value)}
                  placeholder="Confirm Password"
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
                <button
                  type="button"
                  onClick={() => setShowRegConfirmPassword(!showRegConfirmPassword)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {showRegConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={busy}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-bold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
              >
                {busy ? (
                  <>
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                    <span>Sending Verification Code…</span>
                  </>
                ) : (
                  <>
                    <span>Create Account &amp; Verify Email</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>
          ) : (
            /* ------------------------------------------------------------- */
            /* VIEW: EXISTING USER LOGIN                                     */
            /* ------------------------------------------------------------- */
            <form onSubmit={handleExistingUserLogin} className="mt-5 space-y-3.5">
              <p className="text-center text-xs text-muted-foreground mb-4">
                Access your orders, saved bag, wishlist, and bespoke profile.
              </p>

              {/* 1. Registered Mobile Number (+91) */}
              <div className="flex items-center rounded-xl border border-input bg-background/50 px-3.5 py-3">
                <Phone className="mr-3 h-4 w-4 text-muted-foreground" />
                <span className="mr-2 border-r border-input pr-2 text-xs font-semibold text-muted-foreground">
                  🇮🇳 +91
                </span>
                <input
                  type="tel"
                  required
                  value={loginPhone}
                  onChange={(e) => setLoginPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  placeholder="Registered 10-Digit Mobile"
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>

              {/* 2. Registered Email Address */}
              <div className="flex items-center rounded-xl border border-input bg-background/50 px-3.5 py-3">
                <Mail className="mr-3 h-4 w-4 text-muted-foreground" />
                <input
                  type="email"
                  required
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="Registered Email Address"
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>

              {/* 3. Password */}
              <div className="flex items-center rounded-xl border border-input bg-background/50 px-3.5 py-3">
                <Lock className="mr-3 h-4 w-4 text-muted-foreground" />
                <input
                  type={showLoginPassword ? "text" : "password"}
                  required
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="Password"
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
                <button
                  type="button"
                  onClick={() => setShowLoginPassword(!showLoginPassword)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {showLoginPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              {/* Forgot Password */}
              <div className="flex justify-end pt-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setForgotEmail(loginEmail);
                    setForgotPhone(loginPhone);
                    setViewState("forgot_password");
                    setForgotStep("request");
                  }}
                  className="text-xs font-medium text-muted-foreground hover:text-foreground underline"
                >
                  Forgot Password?
                </button>
              </div>

              {/* Sign In Button */}
              <button
                type="submit"
                disabled={busy}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-bold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
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

              {/* Social Login for Existing Google Users */}
              <div className="my-5 flex items-center gap-4 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                OR SIGN IN WITH GOOGLE
                <span className="h-px flex-1 bg-border" />
              </div>

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

              <div
                ref={googleBtnContainerRef}
                className="mt-2 flex min-h-[44px] w-full justify-center overflow-hidden"
              />
            </form>
          )}

          <p className="mt-6 text-center text-[11px] text-muted-foreground">
            By continuing, you agree to CAVENHURST's{" "}
            <Link to="/terms" className="underline hover:text-foreground">
              Terms of Service
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
