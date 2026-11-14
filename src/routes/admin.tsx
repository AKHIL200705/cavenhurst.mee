import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowUpDown,
  CheckCircle2,
  Clock,
  Filter,
  Package,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Truck,
} from "lucide-react";
import { meta } from "@/components/site/InfoPage";
import { formatINR } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { getAdminOrdersServerFn } from "@/server/orders";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin")({
  head: () => meta("Admin Dashboard", "CAVENHURST Admin Portal — Orders, Razorpay & ShipMaxx360."),
  component: AdminDashboard,
});

type AdminOrder = {
  id: string;
  order_number: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  total: number;
  status: string;
  payment_method: string | null;
  payment_status: string | null;
  shipment_status: string | null;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  awb_number: string | null;
  courier_partner: string | null;
  created_at: string;
};

const FILTERS = [
  { id: "all", label: "All Orders" },
  { id: "pending_payment", label: "Pending Payment" },
  { id: "paid", label: "Paid" },
  { id: "cod", label: "Cash on Delivery" },
  { id: "processing", label: "Processing" },
  { id: "shipped", label: "Shipped" },
  { id: "out_for_delivery", label: "Out for Delivery" },
  { id: "delivered", label: "Delivered" },
  { id: "cancelled", label: "Cancelled" },
  { id: "rto_initiated", label: "RTO" },
  { id: "returned", label: "Returned" },
] as const;

function AdminDashboard() {
  const { user, ready } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  // Check admin role
  useEffect(() => {
    if (!ready) return;
    if (!user) {
      setIsAdmin(false);
      setLoading(false);
      return;
    }

    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle()
      .then(({ data }) => {
        // If user is admin in user_roles or authenticated owner
        const authorized = Boolean(data);
        setIsAdmin(authorized);
        if (authorized) {
          void loadOrders(activeFilter, searchTerm);
        } else {
          setLoading(false);
        }
      });
  }, [user, ready]);

  const loadOrders = async (filter: string, search: string) => {
    setLoading(true);
    try {
      const data = await getAdminOrdersServerFn({
        data: { filter, search },
      });
      setOrders(data as AdminOrder[]);
    } catch (err) {
      console.error("Failed to load admin orders:", err);
      toast.error("Failed to fetch orders");
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (filter: string) => {
    setActiveFilter(filter);
    void loadOrders(filter, searchTerm);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void loadOrders(activeFilter, searchTerm);
  };

  if (!ready || isAdmin === null) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <RefreshCw className="h-6 w-6 animate-spin text-silver" />
      </div>
    );
  }

  // Unauthorized access warning
  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <ShieldAlert className="mx-auto h-16 w-16 text-rose-500" />
        <h1 className="mt-4 font-serif text-3xl italic">Admin Access Required</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You must be signed in with a verified CAVENHURST administrator account to view the
          operations dashboard.
        </p>
        <Link
          to="/login"
          className="mt-6 inline-block rounded-md bg-primary px-6 py-3 font-bold text-primary-foreground"
        >
          Sign in as Admin
        </Link>
      </div>
    );
  }

  // Summary Metrics
  const totalRevenue = orders
    .filter((o) => o.payment_status === "paid" || o.payment_method === "cod")
    .reduce((s, o) => s + (o.total || 0), 0);
  const totalPaid = orders.filter((o) => o.payment_status === "paid").length;
  const totalCod = orders.filter((o) => o.payment_method === "cod").length;
  const totalActiveShipments = orders.filter((o) =>
    ["shipment_created", "shipped", "in_transit", "out_for_delivery"].includes(
      o.shipment_status || "",
    ),
  ).length;

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <span className="text-xs font-bold tracking-brand text-silver">
            CAVENHURST OPERATIONS
          </span>
          <h1 className="font-serif text-4xl italic">Fulfillment & Payments Dashboard</h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => void loadOrders(activeFilter, searchTerm)}
            className="flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-semibold hover:bg-accent"
          >
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-xs uppercase tracking-brand text-silver">TOTAL ACTIVE ORDERS</p>
          <p className="mt-2 font-mono text-3xl font-bold">{orders.length}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-xs uppercase tracking-brand text-silver">PAID (RAZORPAY)</p>
          <p className="mt-2 font-mono text-3xl font-bold text-emerald-500">{totalPaid}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-xs uppercase tracking-brand text-silver">CASH ON DELIVERY</p>
          <p className="mt-2 font-mono text-3xl font-bold text-amber-500">{totalCod}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-xs uppercase tracking-brand text-silver">SHIPMAXX360 IN TRANSIT</p>
          <p className="mt-2 font-mono text-3xl font-bold text-electric">{totalActiveShipments}</p>
        </div>
      </div>

      {/* Security Note on Online Payments */}
      <div className="flex items-center gap-3 rounded-lg border border-border bg-background p-4 text-xs text-muted-foreground">
        <ShieldCheck className="h-5 w-5 text-emerald-500 shrink-0" />
        <span>
          <strong>Security Policy:</strong> Online payments are verified strictly through Razorpay
          HMAC SHA-256 signatures or signed webhooks. Administrators cannot manually override
          payment statuses without verified cryptographic proof.
        </span>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <form onSubmit={handleSearchSubmit} className="flex gap-2">
          <div className="relative flex-1 sm:w-80">
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search Order #, Customer, AWB"
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 pr-9 text-sm outline-none focus:border-electric"
            />
            <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
          </div>
          <button type="submit" className="rounded-md bg-secondary px-4 text-sm font-semibold">
            Search
          </button>
        </form>

        {/* Filter Badges */}
        <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-2">
          <span className="flex items-center gap-1 text-xs font-bold text-silver mr-2">
            <Filter className="h-3 w-3" /> Filters:
          </span>
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => handleFilterChange(f.id)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition",
                activeFilter === f.id
                  ? "bg-primary font-bold text-primary-foreground"
                  : "border border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Orders Table */}
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-background/50 text-xs uppercase tracking-brand text-silver">
            <tr>
              <th className="px-4 py-3.5">Order</th>
              <th className="px-4 py-3.5">Customer</th>
              <th className="px-4 py-3.5">Payment (Razorpay)</th>
              <th className="px-4 py-3.5">Shipping (ShipMaxx360)</th>
              <th className="px-4 py-3.5">AWB / Courier</th>
              <th className="px-4 py-3.5 text-right">Total</th>
              <th className="px-4 py-3.5 text-right">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                  <RefreshCw className="mx-auto h-5 w-5 animate-spin" />
                  <p className="mt-2 text-xs">Loading orders...</p>
                </td>
              </tr>
            ) : orders.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                  <Package className="mx-auto h-8 w-8 text-silver mb-2" />
                  No orders match this filter.
                </td>
              </tr>
            ) : (
              orders.map((o) => (
                <tr key={o.id} className="hover:bg-accent/40 transition">
                  <td className="px-4 py-4 font-mono font-bold text-foreground">
                    #{o.order_number || o.id.slice(0, 8)}
                  </td>
                  <td className="px-4 py-4">
                    <p className="font-semibold">{o.customer_name || "Guest Shopper"}</p>
                    <p className="text-xs text-muted-foreground">
                      {o.customer_phone || o.customer_email}
                    </p>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-col gap-1">
                      <span
                        className={cn(
                          "w-fit rounded px-2 py-0.5 text-[11px] font-bold uppercase",
                          o.payment_status === "paid" && "bg-emerald-500/10 text-emerald-500",
                          o.payment_status === "pending" && "bg-amber-500/10 text-amber-500",
                          o.payment_status === "failed" && "bg-rose-500/10 text-rose-500",
                        )}
                      >
                        {o.payment_method === "cod" ? "COD · " : "Online · "}
                        {o.payment_status || "Pending"}
                      </span>
                      {o.razorpay_payment_id && (
                        <span className="font-mono text-[10px] text-silver truncate max-w-[140px]">
                          {o.razorpay_payment_id}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <span
                      className={cn(
                        "w-fit rounded px-2 py-0.5 text-[11px] font-bold uppercase",
                        o.shipment_status === "delivered" && "bg-emerald-500/10 text-emerald-500",
                        ["shipped", "in_transit", "out_for_delivery"].includes(
                          o.shipment_status || "",
                        ) && "bg-blue-500/10 text-blue-500",
                        o.shipment_status === "rto_initiated" && "bg-rose-500/10 text-rose-500",
                        (!o.shipment_status || o.shipment_status === "unfulfilled") &&
                          "bg-secondary text-secondary-foreground",
                      )}
                    >
                      {o.shipment_status?.replace(/_/g, " ") || "Unfulfilled"}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    {o.awb_number ? (
                      <div>
                        <p className="font-mono font-semibold text-xs text-foreground">
                          {o.awb_number}
                        </p>
                        <p className="text-[11px] text-silver">
                          {o.courier_partner || "ShipMaxx360"}
                        </p>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-4 text-right font-mono font-bold text-foreground">
                    {formatINR(o.total)}
                  </td>
                  <td className="px-4 py-4 text-right text-xs text-muted-foreground">
                    {new Date(o.created_at).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                    })}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
