import { formatINR } from "@/lib/pricing";
import { RefreshCw, RotateCcw } from "lucide-react";
import { TableSkeletonRows } from "@/components/ui/skeletons";

export interface AdminPaymentItem {
  id: string;
  order_id?: string | null | undefined;
  created_at: string;
  razorpay_payment_id?: string | null | undefined;
  razorpay_order_id?: string | null | undefined;
  gateway?: string | null | undefined;
  payment_method?: string | null | undefined;
  amount: number;
  status: string;
}

interface PaymentsTabProps {
  payments: AdminPaymentItem[];
  loading: boolean;
  onRefresh: () => void;
  onInitiateRefund: (payment: AdminPaymentItem) => void;
}

export function PaymentsTab({ payments, loading, onRefresh, onInitiateRefund }: PaymentsTabProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-heading text-lg sm:text-xl font-bold uppercase tracking-tight text-foreground">
            Razorpay Payment Audit & Reconciliation
          </h2>
          <p className="text-xs text-muted-foreground font-sans">
            Cryptographically verified payment records stored via webhook event capture and
            server-side verification.
          </p>
        </div>
        <button
          onClick={onRefresh}
          className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-accent"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh Records
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/40 font-mono text-muted-foreground border-b border-border">
              <tr>
                <th className="p-3.5">Timestamp</th>
                <th className="p-3.5">Payment ID</th>
                <th className="p-3.5">Razorpay Order ID</th>
                <th className="p-3.5">Gateway</th>
                <th className="p-3.5">Method</th>
                <th className="p-3.5 text-right">Amount</th>
                <th className="p-3.5 text-center">Gateway Status</th>
                <th className="p-3.5 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <TableSkeletonRows cols={8} rows={5} />
              ) : payments.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-muted-foreground italic">
                    No payment records captured in database.
                  </td>
                </tr>
              ) : (
                payments.map((p) => (
                  <tr key={p.id} className="hover:bg-accent/20 transition">
                    <td className="p-3.5 text-muted-foreground font-mono text-[11px]">
                      {new Date(p.created_at).toLocaleString()}
                    </td>
                    <td className="p-3.5 font-mono font-bold select-all text-foreground">
                      {p.razorpay_payment_id || "—"}
                    </td>
                    <td className="p-3.5 font-mono text-[11px] text-muted-foreground select-all">
                      {p.razorpay_order_id || "—"}
                    </td>
                    <td className="p-3.5 font-mono uppercase text-silver">{p.gateway}</td>
                    <td className="p-3.5 font-mono uppercase text-foreground">
                      {p.payment_method || "online"}
                    </td>
                    <td className="p-3.5 text-right font-mono font-bold text-emerald-400">
                      {formatINR(p.amount)}
                    </td>
                    <td className="p-3.5 text-center">
                      <span
                        className={`inline-block rounded px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase ${
                          p.status === "captured" || p.status === "paid"
                            ? "border border-[#2b4564] bg-[#122741] text-white"
                            : p.status === "refunded"
                              ? "border border-[#233b56] bg-[#08192e] text-[#9fb2c9]"
                              : "border border-[#233b56] bg-[#0a1e35] text-[#cbd5e1]"
                        }`}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td className="p-3.5 text-center">
                      {(p.status === "captured" || p.status === "paid") &&
                        p.razorpay_payment_id && (
                          <button
                            onClick={() => onInitiateRefund(p)}
                            className="inline-flex items-center gap-1 rounded border border-[#2b4564] bg-[#122741] px-2.5 py-1 text-[11px] font-bold text-white hover:bg-[#1a3454] transition"
                          >
                            <RotateCcw className="h-3 w-3 text-white" /> Refund
                          </button>
                        )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
