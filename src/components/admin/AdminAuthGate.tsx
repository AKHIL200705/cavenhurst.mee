import { useEffect, useState } from "react";
import {
  ShieldAlert,
  ShieldCheck,
  Lock,
  Mail,
  ArrowRight,
  RefreshCw,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { adminLoginServerFn, verifyCurrentAdminServerFn } from "@/server/admin";

interface AdminAuthGateProps {
  onAuthenticated: (token?: string) => void;
}

export function AdminAuthGate({ onAuthenticated }: AdminAuthGateProps) {
  const { user, sessionToken } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [verifiedCurrentAdmin, setVerifiedCurrentAdmin] = useState(false);

  useEffect(() => {
    let active = true;
    if (!user || !sessionToken) {
      setVerifiedCurrentAdmin(false);
      return;
    }

    void verifyCurrentAdminServerFn({ data: { authToken: sessionToken } })
      .then((res) => {
        if (active) setVerifiedCurrentAdmin(Boolean(res?.isAdmin));
      })
      .catch(() => {
        if (active) setVerifiedCurrentAdmin(false);
      });

    return () => {
      active = false;
    };
  }, [user, sessionToken]);

  const handleCurrentSessionLogin = async () => {
    if (!user?.email || !sessionToken) {
      toast.error("Active authenticated session token required.");
      return;
    }
    setLoading(true);
    try {
      const authRes = await adminLoginServerFn({
        data: { email: user.email.toLowerCase().trim(), authToken: sessionToken },
      });
      toast.success("Administrator session verified from active account.");
      onAuthenticated(authRes?.sessionToken);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to verify admin account");
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    try {
      const cleanEmail = email.trim().toLowerCase();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (error) {
        setErrorMsg(error.message);
        toast.error("Sign-in failed: " + error.message);
        return;
      }

      if (!data.user || !data.session?.access_token) {
        setErrorMsg("User account or session not found");
        return;
      }

      const serverAuth = await adminLoginServerFn({
        data: {
          email: cleanEmail,
          authToken: data.session.access_token,
        },
      });

      if (!serverAuth.success || !serverAuth.sessionToken) {
        await supabase.auth.signOut();
        setErrorMsg(
          "Access Denied: This account does not possess CAVENHUSRT administrator privileges.",
        );
        toast.error("Access denied: Not an administrator.");
        return;
      }

      toast.success("Administrator session verified.");
      onAuthenticated(serverAuth.sessionToken);
    } catch (err) {
      await supabase.auth.signOut().catch(() => {});
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
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#0d223a] border border-[#233c59] text-white">
            <ShieldAlert className="h-8 w-8 text-white" />
          </div>
          <span className="mt-4 font-heading text-xs uppercase tracking-wider text-silver">
            RESTRICTED ACCESS
          </span>
          <h1 className="mt-1 font-heading text-3xl font-bold uppercase tracking-tight text-foreground">
            CAVENHUSRT Admin Portal
          </h1>
          <p className="mt-2 text-xs text-muted-foreground">
            Please authenticate with your verified staff or administrator credentials to access
            operations, payments, inventory and fulfillment.
          </p>
        </div>

        {errorMsg && (
          <div className="mt-6 rounded-lg border border-[#2b4564] bg-[#0c2036] p-3 text-xs text-white">
            {errorMsg}
          </div>
        )}

        {verifiedCurrentAdmin && (
          <div className="mt-6 p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
              <UserCheck className="h-4 w-4" /> Detected Active Administrator
            </div>
            <p className="text-xs text-muted-foreground">
              Logged in as <strong className="text-foreground">{user?.email || "Admin"}</strong>
            </p>
            <button
              type="button"
              disabled={loading}
              onClick={handleCurrentSessionLogin}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-emerald-600 hover:bg-emerald-500 py-2.5 text-xs font-bold text-white transition shadow-md disabled:opacity-50"
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
                placeholder="admin@cavenhusrt.com"
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
            <ShieldCheck className="h-4 w-4 text-emerald-500" /> Administrator Provisioning
          </div>
          <p>
            Administrator access is enforced server-side and can only be granted by existing super
            admins or via Supabase service-role SQL.
          </p>
        </div>
      </div>
    </div>
  );
}
