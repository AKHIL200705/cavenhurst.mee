import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { WingMark } from "@/components/site/Logo";
import { meta } from "@/components/site/InfoPage";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import fabric from "@/assets/fabric-navy.jpg";

export const Route = createFileRoute("/login")({
  head: () => meta("Login / Sign Up", "Sign in to CAVENHURST to shop, track orders and more."),
  component: Login,
});

function Login() {
  const [tab, setTab] = useState<"login" | "signup">("login");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

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
  const google = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/login`,
      },
    });
    if (error) toast.error("Google sign-in failed. Please try again.");
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
          <button
            onClick={google}
            className="w-full rounded-xl border border-foreground py-4 font-bold"
          >
            Continue with Google
          </button>
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
