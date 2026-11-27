import { AlertTriangle, RefreshCw } from "lucide-react";
import { TableSkeletonRows } from "@/components/ui/skeletons";
import type { Json } from "@/integrations/supabase/types";

export interface AdminAuditLogItem {
  id: string;
  admin_user_id?: string | null | undefined;
  admin_email?: string | null | undefined;
  action: string;
  target_type: string;
  target_id: string;
  details?: Json | undefined;
  created_at: string;
}

export interface SystemErrorLogItem {
  id: string;
  actor_email?: string | null | undefined;
  action: string;
  target_type: string;
  target_id: string;
  details?: Json | undefined;
  created_at: string;
}

interface AuditLogsTabProps {
  logs: AdminAuditLogItem[];
  errorLogs?: SystemErrorLogItem[] | undefined;
  loading: boolean;
  onRefresh: () => void;
}

export function AuditLogsTab({ logs, errorLogs = [], loading, onRefresh }: AuditLogsTabProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-heading text-lg sm:text-xl font-bold uppercase tracking-tight text-foreground">
            Administrative Security Audit Trail
          </h2>
          <p className="text-xs text-muted-foreground font-sans">
            Immutable log of sensitive operations: status overrides, stock adjustments, refunds, and
            catalog changes.
          </p>
        </div>
        <button
          onClick={onRefresh}
          className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-accent"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh Trail
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/40 font-mono text-muted-foreground border-b border-border">
              <tr>
                <th className="p-3.5">Timestamp</th>
                <th className="p-3.5">Administrator</th>
                <th className="p-3.5">Action Executed</th>
                <th className="p-3.5">Target Type</th>
                <th className="p-3.5">Target Identifier</th>
                <th className="p-3.5">Audit Payload</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <TableSkeletonRows cols={6} rows={6} />
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted-foreground italic">
                    No administrative actions logged yet.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-accent/20 transition">
                    <td className="p-3.5 text-muted-foreground font-mono text-[11px]">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="p-3.5 font-semibold text-foreground">
                      {log.admin_email || "System Admin"}
                    </td>
                    <td className="p-3.5 font-mono font-bold text-gold uppercase text-[11px]">
                      {log.action}
                    </td>
                    <td className="p-3.5 font-mono uppercase text-silver">{log.target_type}</td>
                    <td className="p-3.5 font-mono text-[11px] select-all text-muted-foreground">
                      {log.target_id}
                    </td>
                    <td className="p-3.5 font-mono text-[10px] text-muted-foreground max-w-xs truncate">
                      {JSON.stringify(log.details || {})}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <h3 className="flex items-center gap-2 font-heading text-base font-bold uppercase tracking-tight text-foreground">
            <AlertTriangle className="h-4 w-4 text-amber-400" /> System & Checkout Error Telemetry
          </h3>
          <p className="text-xs text-muted-foreground font-sans">
            Structured backend exceptions logged during checkout, Razorpay verification, and API
            workflows.
          </p>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/40 font-mono text-muted-foreground border-b border-border">
                <tr>
                  <th className="p-3.5">Timestamp</th>
                  <th className="p-3.5">Event</th>
                  <th className="p-3.5">Source / Target</th>
                  <th className="p-3.5">Diagnostic Payload</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {errorLogs.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-6 text-center text-muted-foreground italic">
                      No recent system or checkout errors recorded.
                    </td>
                  </tr>
                ) : (
                  errorLogs.map((err) => (
                    <tr key={err.id} className="hover:bg-accent/20 transition">
                      <td className="p-3.5 text-muted-foreground font-mono text-[11px]">
                        {new Date(err.created_at).toLocaleString()}
                      </td>
                      <td className="p-3.5 font-mono font-bold text-amber-400 uppercase text-[11px]">
                        {err.action}
                      </td>
                      <td className="p-3.5 font-mono text-[11px] text-silver">
                        {err.target_type} · {err.target_id}
                      </td>
                      <td className="p-3.5 font-mono text-[10px] text-muted-foreground max-w-md truncate">
                        {JSON.stringify(err.details || {})}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
