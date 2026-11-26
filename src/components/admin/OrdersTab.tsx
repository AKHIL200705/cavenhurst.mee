import { useState } from "react";
import { formatINR } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { Search, Filter, Eye, Loader2, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import {
  OrderDetailsDialog,
  type OrderDetailsOrder,
  type OrderDetailsItem,
  type OrderDetailsAddress,
  type OrderDetailsPayment,
  type OrderDetailsShipment,
  type OrderDetailsRefund,
  type OrderStatusHistoryItem,
  type ShipmentTrackingEventItem,
} from "./OrderDetailsDialog";
import { getAdminOrderDetailsServerFn } from "@/server/admin";
import { toast } from "sonner";

export interface AdminOrderItem {
  id: string;
  order_number?: string | null | undefined;
  created_at: string;
  customer_name?: string | null | undefined;
  customer_email?: string | null | undefined;
  customer_phone?: string | null | undefined;
  payment_method?: string | null | undefined;
  payment_status: string;
  status: string;
  total: number;
  awb_number?: string | null | undefined;
  courier_partner?: string | null | undefined;
}

export interface AdminOrderDetailsResult {
  order: OrderDetailsOrder;
  items: OrderDetailsItem[];
  address: OrderDetailsAddress | null;
  payment: OrderDetailsPayment | null;
  shipment: OrderDetailsShipment | null;
  refunds: OrderDetailsRefund[];
  history?: OrderStatusHistoryItem[] | undefined;
  tracking?: ShipmentTrackingEventItem[] | undefined;
}

export interface OrdersTabProps {
  orders: AdminOrderItem[];
  totalCount: number;
  currentPage: number;
  limit: number;
  loading: boolean;
  filter: string;
  search: string;
  authToken?: string | undefined;
  onFilterChange: (f: string) => void;
  onSearchChange: (s: string) => void;
  onPageChange: (p: number) => void;
  onRefresh: () => void;
}

const FILTERS = [
  { id: "all", label: "All Orders" },
  { id: "pending_payment", label: "Pending Payment" },
  { id: "paid", label: "Paid" },
  { id: "cod", label: "Cash on Delivery" },
  { id: "processing", label: "Processing" },
  { id: "shipped", label: "Shipped" },
  { id: "delivered", label: "Delivered" },
  { id: "cancelled", label: "Cancelled" },
  { id: "rto_initiated", label: "RTO" },
  { id: "returned", label: "Returned" },
] as const;

export function OrdersTab({
  orders,
  totalCount,
  currentPage,
  limit,
  loading,
  filter,
  search,
  authToken,
  onFilterChange,
  onSearchChange,
  onPageChange,
  onRefresh,
}: OrdersTabProps) {
  const [selectedOrder, setSelectedOrder] = useState<AdminOrderItem | null>(null);
  const [detailsData, setDetailsData] = useState<AdminOrderDetailsResult | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const handleOpenDetails = async (order: AdminOrderItem) => {
    setSelectedOrder(order);
    setLoadingDetails(true);
    try {
      const details = await getAdminOrderDetailsServerFn({
        data: {
          authToken,
          orderId: order.id,
        },
      });
      setDetailsData(details as AdminOrderDetailsResult);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load order details");
      setSelectedOrder(null);
    } finally {
      setLoadingDetails(false);
    }
  };

  const totalPages = Math.ceil(totalCount / limit) || 1;

  return (
    <div className="space-y-6">
      {/* Controls Bar */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        {/* Search */}
        <div className="relative w-full lg:max-w-sm">
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search Order #, Customer, Phone, AWB..."
            className="w-full rounded-md border border-input bg-card px-3 py-2 pr-9 text-xs outline-none focus:border-electric"
          />
          <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1">
          <span className="flex items-center gap-1 text-xs font-bold text-silver mr-1">
            <Filter className="h-3 w-3" /> Filters:
          </span>
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => onFilterChange(f.id)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition",
                filter === f.id
                  ? "bg-primary font-bold text-primary-foreground shadow"
                  : "border border-border bg-card/50 text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Orders Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/40 font-mono text-muted-foreground border-b border-border">
              <tr>
                <th className="p-3.5">Order Number</th>
                <th className="p-3.5">Customer</th>
                <th className="p-3.5">Method</th>
                <th className="p-3.5">Payment Status</th>
                <th className="p-3.5">Logistics / AWB</th>
                <th className="p-3.5">Order Status</th>
                <th className="p-3.5 text-right">Total</th>
                <th className="p-3.5 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-silver">
                    <RefreshCw className="mx-auto h-5 w-5 animate-spin mb-2" />
                    Querying orders database...
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-muted-foreground italic">
                    No orders match your search or filter parameters.
                  </td>
                </tr>
              ) : (
                orders.map((o) => (
                  <tr key={o.id} className="hover:bg-accent/20 transition">
                    <td className="p-3.5">
                      <span className="font-mono font-bold text-foreground">
                        {o.order_number || o.id.slice(0, 8)}
                      </span>
                      <span className="block text-[10px] text-muted-foreground">
                        {new Date(o.created_at).toLocaleDateString()}
                      </span>
                    </td>
                    <td className="p-3.5">
                      <span className="font-medium text-foreground block">
                        {o.customer_name || "Guest Customer"}
                      </span>
                      <span className="text-[11px] text-muted-foreground block">
                        {o.customer_email || o.customer_phone || "—"}
                      </span>
                    </td>
                    <td className="p-3.5">
                      <span
                        className={`inline-block rounded px-2 py-0.5 text-[10px] font-mono font-bold uppercase ${
                          o.payment_method === "cod"
                            ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                            : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        }`}
                      >
                        {o.payment_method === "cod" ? "COD" : "Online"}
                      </span>
                    </td>
                    <td className="p-3.5 font-mono">
                      <span
                        className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                          o.payment_status === "paid"
                            ? "border border-[#2b4564] bg-[#122741] text-white"
                            : o.payment_status === "pending"
                              ? "border border-[#233b56] bg-[#0a1e35] text-[#cbd5e1]"
                              : "border border-[#233b56] bg-[#08192e] text-[#8fa3bd]"
                        }`}
                      >
                        {o.payment_status || "pending"}
                      </span>
                    </td>
                    <td className="p-3.5">
                      {o.awb_number ? (
                        <div>
                          <span className="font-mono text-electric font-bold block">
                            {o.awb_number}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {o.courier_partner || "ShipMaxx360"}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-[11px] italic">Unassigned</span>
                      )}
                    </td>
                    <td className="p-3.5 font-mono">
                      <span
                        className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                          o.status === "delivered"
                            ? "border border-[#2b4564] bg-[#122741] text-white"
                            : o.status === "cancelled"
                              ? "border border-[#233b56] bg-[#08192e] text-[#9fb2c9]"
                              : o.status === "processing"
                                ? "border border-[#2b4564] bg-[#0d243f] text-white"
                                : "bg-card text-muted-foreground border border-border"
                        }`}
                      >
                        {o.status}
                      </span>
                    </td>
                    <td className="p-3.5 text-right font-mono font-bold text-foreground">
                      {formatINR(o.total)}
                    </td>
                    <td className="p-3.5 text-center">
                      <button
                        onClick={() => handleOpenDetails(o)}
                        disabled={loadingDetails}
                        className="inline-flex items-center gap-1 rounded border border-border bg-card px-2.5 py-1 text-[11px] font-semibold hover:bg-accent transition disabled:opacity-50"
                      >
                        {loadingDetails && selectedOrder?.id === o.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Eye className="h-3 w-3" />
                        )}
                        View
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-xs text-muted-foreground">
          <span>
            Showing {orders.length} of {totalCount} total orders (Page {currentPage} of {totalPages}
            )
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage <= 1 || loading}
              className="rounded p-1 border border-border bg-card hover:bg-accent disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="font-mono font-bold text-foreground">{currentPage}</span>
            <button
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage >= totalPages || loading}
              className="rounded p-1 border border-border bg-card hover:bg-accent disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Details Dialog */}
      {selectedOrder && detailsData && (
        <OrderDetailsDialog
          order={detailsData.order}
          items={detailsData.items}
          address={detailsData.address}
          payment={detailsData.payment}
          shipment={detailsData.shipment}
          refunds={detailsData.refunds}
          history={detailsData.history || []}
          tracking={detailsData.tracking || []}
          authToken={authToken}
          onClose={() => {
            setSelectedOrder(null);
            setDetailsData(null);
          }}
          onUpdated={() => {
            setSelectedOrder(null);
            setDetailsData(null);
            onRefresh();
          }}
        />
      )}
    </div>
  );
}
