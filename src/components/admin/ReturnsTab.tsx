import { useState } from "react";
import { formatINR } from "@/lib/pricing";
import { RotateCcw, RefreshCw, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { updateAdminReturnStatusServerFn } from "@/server/admin";

export interface AdminReturnItem {
  id: string;
  order_id: string;
  customer_id: string | null;
  return_number: string;
  reason: string;
  status: string;
  refund_amount: number;
  awb_number: string | null;
  courier_partner: string | null;
  admin_notes: string | null;
  created_at: string;
  orders?: {
    order_number: string;
    total: number;
    customer_name: string;
    customer_email: string;
    customer_phone: string;
  } | null;
}

interface ReturnsTabProps {
  returns: AdminReturnItem[];
  loading: boolean;
  onRefresh: () => void;
  authToken?: string | undefined;
}

export function ReturnsTab({ returns, loading, onRefresh, authToken }: ReturnsTabProps) {
  const [selectedReturn, setSelectedReturn] = useState<AdminReturnItem | null>(null);
  const [newStatus, setNewStatus] = useState<string>("approved");
  const [adminNotes, setAdminNotes] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const handleUpdateStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReturn) return;

    setSaving(true);
    try {
      await updateAdminReturnStatusServerFn({
        data: {
          authToken,
          returnId: selectedReturn.id,
          status: newStatus,
          adminNotes: adminNotes.trim() || undefined,
        },
      });
      toast.success(`Return #${selectedReturn.return_number} marked as ${newStatus}`);
      setSelectedReturn(null);
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update return status");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-heading text-lg sm:text-xl font-bold uppercase tracking-tight text-foreground">
            Customer Return Requests
          </h2>
          <p className="text-xs text-muted-foreground font-sans">
            Process return authorizations, reverse logistics pickups, and replacement/refund
            approvals.
          </p>
        </div>

        <button
          onClick={onRefresh}
          className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-accent"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <table className="w-full text-left text-xs">
          <thead className="bg-muted/40 font-mono text-muted-foreground border-b border-border">
            <tr>
              <th className="p-3.5">Return #</th>
              <th className="p-3.5">Order Ref</th>
              <th className="p-3.5">Customer</th>
              <th className="p-3.5">Reason</th>
              <th className="p-3.5 text-right">Refund Value</th>
              <th className="p-3.5 text-center">Status</th>
              <th className="p-3.5 text-right">Requested</th>
              <th className="p-3.5 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr>
                <td colSpan={8} className="p-8 text-center text-silver">
                  <RefreshCw className="mx-auto h-5 w-5 animate-spin mb-2" />
                  Querying return requests...
                </td>
              </tr>
            ) : returns.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-8 text-center text-muted-foreground italic">
                  No active return requests found.
                </td>
              </tr>
            ) : (
              returns.map((r) => (
                <tr key={r.id} className="hover:bg-accent/20 transition">
                  <td className="p-3.5 font-mono font-bold text-foreground flex items-center gap-1.5">
                    <RotateCcw className="h-3.5 w-3.5 text-primary" /> #{r.return_number}
                  </td>
                  <td className="p-3.5 font-mono text-[11px] text-muted-foreground">
                    #{r.orders?.order_number || r.order_id.slice(0, 8)}
                  </td>
                  <td className="p-3.5">
                    <p className="font-semibold text-foreground">
                      {r.orders?.customer_name || "Customer"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">{r.orders?.customer_email}</p>
                  </td>
                  <td className="p-3.5 max-w-xs truncate" title={r.reason}>
                    {r.reason}
                  </td>
                  <td className="p-3.5 text-right font-mono font-bold text-foreground">
                    {formatINR(r.refund_amount)}
                  </td>
                  <td className="p-3.5 text-center">
                    <span
                      className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                        r.status === "approved" || r.status === "refunded"
                          ? "bg-emerald-500/10 text-emerald-500"
                          : r.status === "rejected"
                            ? "bg-sale/20 text-sale"
                            : "bg-secondary text-foreground"
                      }`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="p-3.5 text-right text-muted-foreground">
                    {new Date(r.created_at).toLocaleDateString("en-IN")}
                  </td>
                  <td className="p-3.5 text-center">
                    <button
                      onClick={() => {
                        setSelectedReturn(r);
                        setNewStatus(r.status);
                        setAdminNotes(r.admin_notes || "");
                      }}
                      className="rounded border border-border px-2 py-1 text-[11px] font-semibold hover:bg-accent text-primary"
                    >
                      Manage
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Return Details & Status Modal */}
      {selectedReturn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in">
          <form
            onSubmit={handleUpdateStatus}
            className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h3 className="font-heading text-base sm:text-lg font-bold uppercase tracking-tight text-foreground">
                  Process Return #{selectedReturn.return_number}
                </h3>
                <p className="text-xs text-muted-foreground">
                  Order #{selectedReturn.orders?.order_number || selectedReturn.order_id}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedReturn(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Customer:</span>
                <span className="font-semibold text-foreground">
                  {selectedReturn.orders?.customer_name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Contact Email:</span>
                <span className="font-semibold text-foreground">
                  {selectedReturn.orders?.customer_email}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Refund Value:</span>
                <span className="font-bold text-foreground font-mono">
                  {formatINR(selectedReturn.refund_amount)}
                </span>
              </div>
              <div className="pt-1 border-t border-border">
                <span className="text-muted-foreground">Customer Reason:</span>
                <p className="mt-1 text-foreground">{selectedReturn.reason}</p>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground">
                Update Return Status *
              </label>
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-semibold"
              >
                <option value="requested">Requested (Awaiting Review)</option>
                <option value="approved">Approved (Reverse Pickup Scheduled)</option>
                <option value="in_transit">In Transit (Courier Dispatched)</option>
                <option value="inspected">Inspected (Quality Passed)</option>
                <option value="refunded">Refunded (Completed)</option>
                <option value="rejected">Rejected (Denied)</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground">
                Internal Admin Notes
              </label>
              <textarea
                rows={3}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-xs"
                placeholder="Notes on return condition, tracking, or refund authorization..."
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setSelectedReturn(null)}
                className="rounded-md border border-border px-4 py-2 text-xs font-semibold hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Save Status
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
