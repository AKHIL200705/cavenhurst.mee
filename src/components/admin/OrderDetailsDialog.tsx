import { useState } from "react";
import { formatINR } from "@/lib/pricing";
import { X, Truck, CreditCard, User, MapPin, RotateCcw, Ban } from "lucide-react";
import { toast } from "sonner";
import {
  updateAdminOrderStatusServerFn,
  cancelAdminOrderServerFn,
  createAdminShipmentServerFn,
  initiateAdminRefundServerFn,
} from "@/server/admin";

export interface OrderDetailsOrder {
  id: string;
  order_number?: string | null | undefined;
  created_at: string;
  status: string;
  shipment_status?: string | null | undefined;
  payment_method?: string | null | undefined;
  payment_status: string;
  razorpay_payment_id?: string | null | undefined;
  razorpay_order_id?: string | null | undefined;
  courier_partner?: string | null | undefined;
  awb_number?: string | null | undefined;
  customer_name?: string | null | undefined;
  customer_email?: string | null | undefined;
  customer_phone?: string | null | undefined;
  subtotal?: number | null | undefined;
  discount?: number | null | undefined;
  shipping_fee?: number | null | undefined;
  taxes?: number | null | undefined;
  total: number;
}

export interface OrderDetailsItem {
  id?: string | undefined;
  name: string;
  size: string;
  color: string;
  qty: number;
  price: number;
  product_id?: string | null | undefined;
}

export interface OrderDetailsAddress {
  full_name?: string | null | undefined;
  email?: string | null | undefined;
  phone?: string | null | undefined;
  address_line1?: string | null | undefined;
  address_line2?: string | null | undefined;
  city?: string | null | undefined;
  state?: string | null | undefined;
  pincode?: string | null | undefined;
  country?: string | null | undefined;
}

export interface OrderDetailsPayment {
  id?: string | undefined;
  payment_id?: string | undefined;
  razorpay_payment_id?: string | null | undefined;
  razorpay_order_id?: string | null | undefined;
  amount?: number | undefined;
  currency?: string | undefined;
  status?: string | undefined;
  payment_method?: string | null | undefined;
  created_at?: string | undefined;
}

export interface OrderDetailsShipment {
  id?: string | undefined;
  courier_partner?: string | null | undefined;
  awb_number?: string | null | undefined;
  status?: string | null | undefined;
  shipping_label_url?: string | null | undefined;
}

export interface OrderDetailsRefund {
  id: string;
  razorpay_refund_id?: string | null | undefined;
  amount: number;
  status: string;
  reason?: string | null | undefined;
  created_at?: string | undefined;
}

export interface OrderDetailsProps {
  order: OrderDetailsOrder;
  items: OrderDetailsItem[];
  address?: OrderDetailsAddress | null | undefined;
  payment?: OrderDetailsPayment | null | undefined;
  shipment?: OrderDetailsShipment | null | undefined;
  refunds: OrderDetailsRefund[];
  authToken?: string | undefined;
  onClose: () => void;
  onUpdated: () => void;
}

export function OrderDetailsDialog({
  order,
  items,
  address,
  payment,
  shipment,
  refunds,
  authToken,
  onClose,
  onUpdated,
}: OrderDetailsProps) {
  const [loading, setLoading] = useState(false);
  const [newStatus, setNewStatus] = useState(order.status || "processing");
  const [newShipmentStatus, setNewShipmentStatus] = useState(
    order.shipment_status || "unfulfilled",
  );
  const [refundAmount, setRefundAmount] = useState<string>(String(order.total || 0));
  const [refundReason, setRefundReason] = useState("");
  const [showRefundForm, setShowRefundForm] = useState(false);

  const handleUpdateStatus = async () => {
    setLoading(true);
    try {
      await updateAdminOrderStatusServerFn({
        data: {
          authToken,
          orderId: order.id,
          status: newStatus,
          shipmentStatus: newShipmentStatus,
        },
      });
      toast.success("Order status updated successfully.");
      onUpdated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update order status");
    } finally {
      setLoading(false);
    }
  };

  const handleCancelOrder = async () => {
    if (!window.confirm("Are you sure you want to cancel this order and restock items?")) return;
    setLoading(true);
    try {
      await cancelAdminOrderServerFn({
        data: {
          authToken,
          orderId: order.id,
          reason: "Cancelled by administrator via operations portal",
        },
      });
      toast.success("Order cancelled and inventory successfully restocked.");
      onUpdated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Cancellation failed");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateShipment = async () => {
    setLoading(true);
    try {
      const res = await createAdminShipmentServerFn({
        data: {
          authToken,
          orderId: order.id,
        },
      });
      toast.success(
        `Shipment created: AWB ${res.result.awbNumber || "Generated"} via ${res.result.courierPartner || "ShipMaxx360"}`,
      );
      onUpdated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to dispatch shipment");
    } finally {
      setLoading(false);
    }
  };

  const handleProcessRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(refundAmount);
    if (!amount || amount <= 0 || amount > order.total) {
      toast.error(`Refund amount must be between ₹1 and ₹${order.total}`);
      return;
    }

    setLoading(true);
    try {
      const res = await initiateAdminRefundServerFn({
        data: {
          authToken,
          orderId: order.id,
          amountInRupees: amount,
          reason: refundReason || "Customer refund requested",
        },
      });
      toast.success(`Refund initiated successfully on Razorpay (ID: ${res.refundId})`);
      setShowRefundForm(false);
      onUpdated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Refund initiation failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-4xl rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-6 my-8 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border pb-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="font-mono text-xs uppercase tracking-brand text-silver">
                ORDER DETAILS
              </span>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[10px] font-bold text-primary">
                {order.order_number || order.id.slice(0, 8)}
              </span>
            </div>
            <h2 className="mt-1 font-serif text-2xl italic">Order Fulfillment & Payment Docket</h2>
            <p className="text-xs text-muted-foreground">
              Placed on {new Date(order.created_at).toLocaleString()}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-muted-foreground hover:bg-accent hover:text-foreground transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 2-Column Overview */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Customer & Address */}
          <div className="rounded-xl border border-border bg-background/50 p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-silver uppercase tracking-brand">
              <User className="h-4 w-4 text-electric" /> Customer Profile
            </div>
            <div className="text-xs space-y-1">
              <p className="font-bold text-sm text-foreground">
                {address?.full_name || order.customer_name || "Guest Customer"}
              </p>
              <p className="text-muted-foreground">
                Email: {address?.email || order.customer_email || "Not provided"}
              </p>
              <p className="text-muted-foreground">
                Phone: {address?.phone || order.customer_phone || "Not provided"}
              </p>
            </div>

            <div className="pt-2 border-t border-border/50">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-silver mb-1">
                <MapPin className="h-3.5 w-3.5 text-amber-500" /> Shipping Destination
              </div>
              {address ? (
                <div className="text-xs text-muted-foreground leading-relaxed">
                  <p>{address.address_line1}</p>
                  {address.address_line2 && <p>{address.address_line2}</p>}
                  <p>
                    {address.city}, {address.state} — {address.pincode}
                  </p>
                  <p>{address.country}</p>
                </div>
              ) : (
                <p className="text-xs italic text-muted-foreground">No physical address stored.</p>
              )}
            </div>
          </div>

          {/* Payment & Logistics Status */}
          <div className="rounded-xl border border-border bg-background/50 p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-silver uppercase tracking-brand">
              <CreditCard className="h-4 w-4 text-emerald-500" /> Financial & Shipping State
            </div>
            <div className="text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Payment Method:</span>
                <span className="font-mono font-bold uppercase">
                  {order.payment_method === "cod" ? "Cash On Delivery" : "Razorpay Online"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Payment Status:</span>
                <span
                  className={`font-mono font-bold uppercase ${
                    order.payment_status === "paid" ? "text-emerald-400" : "text-amber-400"
                  }`}
                >
                  {order.payment_status}
                </span>
              </div>
              {order.razorpay_payment_id && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Razorpay Payment ID:</span>
                  <span className="font-mono text-[11px] select-all">
                    {order.razorpay_payment_id}
                  </span>
                </div>
              )}
              {order.razorpay_order_id && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Razorpay Order ID:</span>
                  <span className="font-mono text-[11px] select-all">
                    {order.razorpay_order_id}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between pt-2 border-t border-border/50">
                <span className="text-muted-foreground">Shipment Courier:</span>
                <span className="font-semibold">
                  {order.courier_partner || shipment?.courier_partner || "Unassigned"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">AWB Tracking Number:</span>
                <span className="font-mono font-bold text-electric">
                  {order.awb_number || shipment?.awb_number || "None"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Itemized Products Table */}
        <div className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-brand text-silver">
            Purchased Garments ({items.length})
          </h3>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/40 font-mono text-muted-foreground border-b border-border">
                <tr>
                  <th className="p-3">Garment</th>
                  <th className="p-3">Size</th>
                  <th className="p-3">Colour</th>
                  <th className="p-3 text-center">Qty</th>
                  <th className="p-3 text-right">Price</th>
                  <th className="p-3 text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-4 text-center italic text-muted-foreground">
                      No order items recorded in database.
                    </td>
                  </tr>
                ) : (
                  items.map((item, idx) => (
                    <tr key={idx} className="hover:bg-accent/20">
                      <td className="p-3 font-medium text-foreground">{item.name}</td>
                      <td className="p-3 font-mono">{item.size}</td>
                      <td className="p-3">{item.color}</td>
                      <td className="p-3 text-center font-mono">{item.qty}</td>
                      <td className="p-3 text-right font-mono">{formatINR(item.price)}</td>
                      <td className="p-3 text-right font-mono font-bold">
                        {formatINR(item.price * item.qty)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Totals Breakdown */}
        <div className="flex justify-end">
          <div className="w-72 space-y-1.5 rounded-xl border border-border bg-background/50 p-4 text-xs">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal:</span>
              <span className="font-mono">{formatINR(order.subtotal || order.total)}</span>
            </div>
            {Boolean(order.discount) && (
              <div className="flex justify-between text-emerald-400">
                <span>Promotional Discount:</span>
                <span className="font-mono">-{formatINR(order.discount || 0)}</span>
              </div>
            )}
            <div className="flex justify-between text-muted-foreground">
              <span>Shipping Fee:</span>
              <span className="font-mono">
                {order.shipping_fee ? formatINR(order.shipping_fee) : "Free"}
              </span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Taxes (GST Included):</span>
              <span className="font-mono">{formatINR(order.taxes || 0)}</span>
            </div>
            <div className="flex justify-between text-sm font-bold border-t border-border pt-2 text-foreground">
              <span>Total Amount:</span>
              <span className="font-mono text-emerald-400">{formatINR(order.total)}</span>
            </div>
          </div>
        </div>

        {/* Existing Refunds */}
        {refunds && refunds.length > 0 && (
          <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 space-y-2">
            <span className="text-xs font-bold uppercase tracking-brand text-rose-400">
              Processed Refunds
            </span>
            {refunds.map((r, i) => (
              <div
                key={i}
                className="flex items-center justify-between text-xs text-muted-foreground"
              >
                <span>Refund ID: {r.razorpay_refund_id || r.id}</span>
                <span className="font-mono font-bold text-rose-400">
                  {formatINR(r.amount)} ({r.status})
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Action Controls */}
        <div className="border-t border-border pt-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Status Modifiers */}
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs font-semibold text-silver">Order Status:</label>
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-1.5 text-xs outline-none focus:border-electric"
              >
                <option value="pending_payment">Pending Payment</option>
                <option value="paid">Paid</option>
                <option value="processing">Processing</option>
                <option value="shipped">Shipped</option>
                <option value="delivered">Delivered</option>
                <option value="cancelled">Cancelled</option>
                <option value="returned">Returned</option>
              </select>

              <label className="text-xs font-semibold text-silver ml-2">Logistics:</label>
              <select
                value={newShipmentStatus}
                onChange={(e) => setNewShipmentStatus(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-1.5 text-xs outline-none focus:border-electric"
              >
                <option value="unfulfilled">Unfulfilled</option>
                <option value="shipment_created">Shipment Created</option>
                <option value="shipped">Shipped</option>
                <option value="in_transit">In Transit</option>
                <option value="out_for_delivery">Out for Delivery</option>
                <option value="delivered">Delivered</option>
                <option value="rto_initiated">RTO Initiated</option>
                <option value="rto_delivered">RTO Delivered</option>
              </select>

              <button
                onClick={handleUpdateStatus}
                disabled={loading}
                className="rounded-md bg-secondary px-3 py-1.5 text-xs font-semibold hover:bg-accent transition"
              >
                Apply Status
              </button>
            </div>

            {/* Quick Actions */}
            <div className="flex flex-wrap items-center gap-2">
              {!order.awb_number && order.status !== "cancelled" && (
                <button
                  onClick={handleCreateShipment}
                  disabled={loading}
                  className="flex items-center gap-1.5 rounded-md bg-electric/20 border border-electric/40 px-3 py-1.5 text-xs font-bold text-electric hover:bg-electric/30 transition"
                >
                  <Truck className="h-3.5 w-3.5" /> Ship with ShipMaxx360
                </button>
              )}

              {order.payment_status === "paid" && order.razorpay_payment_id && (
                <button
                  onClick={() => setShowRefundForm(!showRefundForm)}
                  className="flex items-center gap-1.5 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-bold text-rose-400 hover:bg-rose-500/20 transition"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Razorpay Refund
                </button>
              )}

              {order.status !== "cancelled" && (
                <button
                  onClick={handleCancelOrder}
                  disabled={loading}
                  className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-bold text-muted-foreground hover:text-rose-400 transition"
                >
                  <Ban className="h-3.5 w-3.5" /> Cancel & Restock
                </button>
              )}
            </div>
          </div>

          {/* Refund Inline Form */}
          {showRefundForm && (
            <form
              onSubmit={handleProcessRefund}
              className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-rose-400 uppercase tracking-brand">
                  Execute Official Razorpay API Refund
                </span>
                <button
                  type="button"
                  onClick={() => setShowRefundForm(false)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Dismiss
                </button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs text-silver mb-1">Refund Amount (₹)</label>
                  <input
                    type="number"
                    max={order.total}
                    min={1}
                    value={refundAmount}
                    onChange={(e) => setRefundAmount(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs font-mono outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-silver mb-1">Administrative Reason</label>
                  <input
                    type="text"
                    placeholder="Customer cancellation or return"
                    value={refundReason}
                    onChange={(e) => setRefundReason(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-md bg-rose-600 py-2 text-xs font-bold text-white hover:bg-rose-500 transition"
              >
                {loading ? "Transmitting to Razorpay Gateway..." : "Confirm & Issue Refund"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
