import { ExternalLink, RefreshCw } from "lucide-react";

export interface AdminShipmentItem {
  id: string;
  order_id?: string | null | undefined;
  order_number?: string | null | undefined;
  awb_number?: string | null | undefined;
  courier_partner?: string | null | undefined;
  payment_mode?: string | null | undefined;
  pickup_pincode?: string | null | undefined;
  delivery_pincode?: string | null | undefined;
  package_weight_grams?: number | null | undefined;
  status: string;
  shipping_label_url?: string | null | undefined;
}

interface ShipmentsTabProps {
  shipments: AdminShipmentItem[];
  loading: boolean;
  onRefresh: () => void;
}

export function ShipmentsTab({ shipments, loading, onRefresh }: ShipmentsTabProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-heading text-lg sm:text-xl font-bold uppercase tracking-tight text-foreground">
            ShipMaxx360 Logistics & Fulfillment Registry
          </h2>
          <p className="text-xs text-muted-foreground">
            Official courier partners, generated AWB waybills, package manifests, and delivery
            statuses.
          </p>
        </div>
        <button
          onClick={onRefresh}
          className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-accent"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh Shipments
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/40 font-mono text-muted-foreground border-b border-border">
              <tr>
                <th className="p-3.5">Order Number</th>
                <th className="p-3.5">AWB Tracking #</th>
                <th className="p-3.5">Courier Partner</th>
                <th className="p-3.5">Payment Mode</th>
                <th className="p-3.5">Route (Pincodes)</th>
                <th className="p-3.5">Package Weight</th>
                <th className="p-3.5 text-center">Fulfillment Status</th>
                <th className="p-3.5 text-right">Waybill Label</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-silver">
                    <RefreshCw className="mx-auto h-5 w-5 animate-spin mb-2" />
                    Querying shipment records...
                  </td>
                </tr>
              ) : shipments.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-muted-foreground italic">
                    No active shipments registered in system.
                  </td>
                </tr>
              ) : (
                shipments.map((s) => (
                  <tr key={s.id} className="hover:bg-accent/20 transition">
                    <td className="p-3.5 font-mono font-bold text-foreground">{s.order_number}</td>
                    <td className="p-3.5 font-mono font-bold text-electric select-all">
                      {s.awb_number || "Pending AWB"}
                    </td>
                    <td className="p-3.5 font-semibold text-foreground">
                      {s.courier_partner || "ShipMaxx360 Network"}
                    </td>
                    <td className="p-3.5 font-mono uppercase text-silver">
                      {s.payment_mode || "prepaid"}
                    </td>
                    <td className="p-3.5 font-mono text-[11px] text-muted-foreground">
                      {s.pickup_pincode} → {s.delivery_pincode}
                    </td>
                    <td className="p-3.5 font-mono">
                      {s.package_weight_grams ? `${s.package_weight_grams}g` : "500g"}
                    </td>
                    <td className="p-3.5 text-center font-mono">
                      <span
                        className={`inline-block rounded px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                          s.status === "delivered"
                            ? "bg-emerald-500/20 text-emerald-400"
                            : s.status === "shipped" || s.status === "in_transit"
                              ? "bg-electric/20 text-electric"
                              : s.status === "rto_initiated"
                                ? "bg-rose-500/20 text-rose-400"
                                : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {s.status}
                      </span>
                    </td>
                    <td className="p-3.5 text-right">
                      {s.shipping_label_url ? (
                        <a
                          href={s.shipping_label_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 font-mono text-electric hover:underline text-[11px]"
                        >
                          Label PDF <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <span className="text-muted-foreground text-[10px] italic">No Label</span>
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
