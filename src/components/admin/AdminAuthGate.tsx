import { useState } from "react";
import { ShieldAlert, ShieldCheck, Lock, Mail, ArrowRight, RefreshCw, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

interface AdminAuthGateProps {
  onAuthenticated: () => void;
}

export function AdminAuthGate({ onAuthenticated }: AdminAuthGateProps) {
  const { user } = useAuth();
  const [email, setEmail] = useState("akhilsaiabbireddy2007@gmail.com");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isCurrentSessionAdmin =
    user?.isAdmin ||
    (user?.email &&
      ["akhilsaiabbireddy2007@gmail.com", "cavenhurst@gmail.com"].includes(
        user.email.toLowerCase(),
      ));

  const handleCurrentSessionLogin = () => {
    toast.success("Administrator session verified from active account.");
    onAuthenticated();
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setErrorMsg(error.message);
        toast.error("Sign-in failed: " + error.message);
        return;
      }

      if (!data.user) {
        setErrorMsg("User account not found");
        return;
      }

      const userEmail = data.user.email?.toLowerCase();
      const isAllowedEmail =
        userEmail &&
        ["akhilsaiabbireddy2007@gmail.com", "cavenhurst@gmail.com"].includes(userEmail);

      let isAdminUser = Boolean(isAllowedEmail);

      if (!isAdminUser) {
        const { data: roleRow } = await supabase
          .from("user_roles")
          .select("role")
          .or(`user_id.eq.${data.user.id},user_id.eq.${userEmail}`)
          .eq("role", "admin")
          .maybeSingle();
        isAdminUser = Boolean(roleRow);
      }

      if (!isAdminUser) {
        const { data: whitelist } = await supabase
          .from("admin_whitelist")
          .select("email")
          .eq("email", userEmail || "")
          .maybeSingle();
        isAdminUser = Boolean(whitelist);
      }

      if (!isAdminUser) {
        setErrorMsg(
          "Access Denied: This account does not possess CAVENHURST administrator privileges.",
        );
        toast.error("Access denied: Not an administrator.");
        return;
      }

      toast.success("Administrator session verified.");
      onAuthenticated();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Authentication error";
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[75vh] items-center justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-2xl backdrop-blur-md">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20 text-primary">
            <ShieldAlert className="h-8 w-8 text-gold" />
          </div>
          <span className="mt-4 font-mono text-xs uppercase tracking-brand text-silver">
            RESTRICTED ACCESS
          </span>
          <h1 className="mt-1 font-serif text-3xl italic tracking-tight">
            CAVENHURST Admin Portal
          </h1>
          <p className="mt-2 text-xs text-muted-foreground">
            Please authenticate with your verified staff or administrator credentials to access
            operations, payments, inventory and fulfillment.
          </p>
        </div>

        {errorMsg && (
          <div className="mt-6 rounded-lg border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-400">
            {errorMsg}
          </div>
        )}

        {isCurrentSessionAdmin && (
          <div className="mt-6 p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
              <UserCheck className="h-4 w-4" /> Detected Active Administrator
            </div>
            <p className="text-xs text-muted-foreground">
              Logged in as <strong className="text-foreground">{user?.email || "Akhil Sai Abbireddy"}</strong>
            </p>
            <button
              type="button"
              onClick={handleCurrentSessionLogin}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-emerald-600 hover:bg-emerald-500 py-2.5 text-xs font-bold text-white transition shadow-md"
            >
              Continue with Verified Admin Account <ArrowRight className="h-3.5 w-3.5" />
            </button>
            <div className="relative py-2 flex items-center justify-center">
              <div className="border-t border-border w-full"></div>
              <span className="bg-card px-2 text-[10px] text-muted-foreground uppercase font-mono absolute">
                Or Sign In with Password
              </span>
            </div>
          </div>
        )}

        <form onSubmit={handleLogin} className="mt-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-silver mb-1.5">
              Administrator Email
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@cavenhurst.com"
                className="w-full rounded-md border border-input bg-background/50 px-3 py-2 pl-9 text-sm outline-none focus:border-gold transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-silver mb-1.5">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full rounded-md border border-input bg-background/50 px-3 py-2 pl-9 text-sm outline-none focus:border-gold transition"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-primary py-2.5 text-sm font-bold text-primary-foreground hover:opacity-90 transition disabled:opacity-50"
          >
            {loading ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" /> Verifying Credentials...
              </>
            ) : (
              <>
                Enter Operations Console <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </form>

        <div className="mt-8 rounded-xl border border-border bg-background/30 p-4 text-[11px] text-muted-foreground space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <ShieldCheck className="h-4 w-4 text-emerald-500" /> Initial Administrator Setup
          </div>
          <p>
            For security, admin privileges must be granted directly via PostgreSQL in Supabase. Run:
          </p>
          <code className="block rounded bg-card p-1.5 font-mono text-[10px] text-silver select-all">
            SELECT public.assign_admin_role_by_email('your-email@example.com');
          </code>
        </div>
      </div>
    </div>
  );
}
