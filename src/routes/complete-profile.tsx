import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import {
  ArrowRight,
  Loader2,
  CheckCircle2,
  ShieldCheck,
  Phone,
  User,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { WingMark } from "@/components/site/Logo";
import { meta } from "@/components/site/InfoPage";
import { useAuth } from "@/lib/auth";
import { completeCustomerProfileServerFn } from "@/server/customers";
import { toast } from "sonner";

export const Route = createFileRoute("/complete-profile")({
  head: () =>
    meta(
      "Complete Your Profile — CAVENHUSRT",
      "Welcome to CAVENHUSRT. Complete your profile details to unlock your bespoke shopping experience.",
    ),
  validateSearch: (search: Record<string, unknown>) => {
    return {
      returnTo: typeof search["returnTo"] === "string" ? search["returnTo"] : undefined,
    };
  },
  component: CompleteProfilePage,
});

function CompleteProfilePage() {
  const { user, sessionToken, refreshProfile, signOut } = useAuth();
  const search = useSearch({ from: "/complete-profile" });
  const navigate = useNavigate();

  const [fullName, setFullName] = useState(() => {
    const metaName = user?.user_metadata?.["full_name"] || user?.user_metadata?.["name"] || "";
    return typeof metaName === "string" && metaName && metaName.toLowerCase() !== "customer"
      ? metaName
      : "";
  });
  const [mobileNumber, setMobileNumber] = useState(() => {
    const metaPhone =
      user?.user_metadata?.["mobile_number"] || user?.user_metadata?.["phone"] || user?.phone || "";
    if (!metaPhone) return "";
    const clean = String(metaPhone).replace(/\D/g, "").slice(-10);
    return clean.length === 10 ? clean : "";
  });
  const countryCode = "+91";
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [success, setSuccess] = useState(false);

  // Handle Indian mobile number formatting (only digits, max 10)
  const handleMobileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const digitsOnly = raw.replace(/\D/g, "").slice(0, 10);
    setMobileNumber(digitsOnly);
    if (errorMessage) setErrorMessage("");
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFullName(e.target.value);
    if (errorMessage) setErrorMessage("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");

    const trimmedName = fullName.trim();
    if (!trimmedName || trimmedName.length < 2) {
      setErrorMessage("Please enter your full legal name (at least 2 characters).");
      return;
    }

    if (!mobileNumber || mobileNumber.length !== 10) {
      setErrorMessage("Please enter a valid 10-digit Indian mobile number.");
      return;
    }

    if (!/^[6-9]\d{9}$/.test(mobileNumber)) {
      setErrorMessage("Indian mobile numbers must start with 6, 7, 8, or 9.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await completeCustomerProfileServerFn({
        data: {
          authToken: sessionToken ?? undefined,
          fullName: trimmedName,
          mobileNumber,
          countryCode,
        },
      });

      if (result.success) {
        setSuccess(true);
        toast.success("Profile completed successfully. Welcome to CAVENHUSRT.");
        await refreshProfile();
        const destination = search.returnTo || "/";
        void navigate({ to: destination, replace: true });
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to update profile. Please try again.";
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-[85vh] w-full items-center justify-center overflow-hidden px-4 py-16 sm:px-6">
      {/* Background ambient luxury glow */}
      <div
        className="pointer-events-none absolute -top-40 left-1/2 -z-10 h-96 w-96 -translate-x-1/2 rounded-full opacity-20 blur-3xl"
        style={{
          background: "radial-gradient(circle, var(--electric) 0%, transparent 70%)",
        }}
      />

      <div className="w-full max-w-md animate-in fade-in zoom-in-95 duration-500">
        <div className="relative rounded-2xl border border-border/80 bg-card/70 p-6 sm:p-8 backdrop-blur-xl shadow-2xl">
          {/* Brand Wordmark & Crest */}
          <div className="flex flex-col items-center text-center">
            <WingMark className="h-12 w-auto text-silver" />
            <span className="mt-4 font-heading text-[10px] font-bold uppercase tracking-wider text-silver">
              MANDATORY ACCOUNT VERIFICATION
            </span>
            <h1 className="mt-1 font-heading text-2xl sm:text-4xl font-bold uppercase tracking-tight text-foreground leading-none">
              COMPLETE YOUR PROFILE
            </h1>
            <p className="mt-2 font-sans text-xs sm:text-sm text-muted-foreground leading-relaxed max-w-sm">
              Welcome to CAVENHUSRT. Complete your details to continue.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            {/* Full Name */}
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 font-mono text-xs text-silver uppercase tracking-wider">
                <User className="h-3.5 w-3.5 text-electric" /> Full Legal Name
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="e.g. Akhil Sai"
                  value={fullName}
                  onChange={handleNameChange}
                  disabled={submitting || success}
                  className="w-full rounded-lg border border-border bg-background/80 px-3.5 py-2.5 text-sm outline-none transition focus:border-electric focus:ring-1 focus:ring-electric/30 disabled:opacity-50"
                />
              </div>
            </div>

            {/* Mobile Number with Country Code */}
            <div className="space-y-1.5">
              <label className="flex flex-wrap items-center justify-between gap-1 font-mono text-xs text-silver uppercase tracking-wider">
                <span className="flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5 text-electric" /> Mobile Number
                </span>
                <span className="text-[10px] text-muted-foreground font-mono">
                  {mobileNumber.length}/10 digits
                </span>
              </label>

              <div className="flex rounded-lg border border-border bg-background/80 focus-within:border-electric focus-within:ring-1 focus-within:ring-electric/30 transition overflow-hidden">
                {/* Country Code Pill */}
                <div className="flex items-center gap-1 border-r border-border bg-muted/30 px-3 font-mono text-xs text-foreground font-semibold select-none">
                  <span>🇮🇳</span>
                  <span>{countryCode}</span>
                </div>

                {/* Mobile Digits */}
                <input
                  type="tel"
                  inputMode="numeric"
                  required
                  placeholder="9876543210"
                  value={mobileNumber}
                  onChange={handleMobileChange}
                  disabled={submitting || success}
                  maxLength={10}
                  className="w-full bg-transparent px-3.5 py-2.5 text-sm font-mono outline-none disabled:opacity-50"
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Used strictly for delivery coordination and order dispatch notifications via
                SMS/WhatsApp.
              </p>
            </div>

            {/* Error Display */}
            {errorMessage && (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-200 animate-in fade-in slide-in-from-top-1"
              >
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <p className="leading-snug">{errorMessage}</p>
              </div>
            )}

            {/* Submit Button */}
            <Button
              type="submit"
              disabled={submitting || success}
              className="w-full h-12 rounded-lg bg-primary text-primary-foreground font-sans text-xs sm:text-sm font-bold tracking-[0.16em] uppercase shadow-lg hover:bg-primary/90 transition-all flex items-center justify-center gap-2 group cursor-pointer"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> SAVING DETAILS...
                </>
              ) : success ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" /> VERIFIED
                </>
              ) : (
                <>
                  CONTINUE{" "}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </>
              )}
            </Button>
          </form>

          {/* Security & Sign Out Footer */}
          <div className="mt-6 pt-5 border-t border-border/50 flex flex-col items-center gap-3 text-center">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
              <span>Protected by CAVENHUSRT 256-bit encryption</span>
            </div>

            <button
              onClick={() => {
                void signOut().then(() => navigate({ to: "/login", replace: true }));
              }}
              className="text-[11px] text-muted-foreground hover:text-foreground transition underline underline-offset-4"
            >
              Sign out or switch account
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
