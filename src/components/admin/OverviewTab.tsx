import { useState } from "react";
import { formatINR } from "@/lib/pricing";
import {
  TrendingUp,
  Package,
  CreditCard,
  Truck,
  AlertTriangle,
  Clock,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Users,
  AlertOctagon,
  ArrowUpRight,
  ShieldAlert,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

export interface OverviewData {
  totalOrders: number;
  totalPaidRevenue: number;
  totalCodRevenue: number;
  totalPaidOrders: number;
  totalCodOrders: number;
  pendingPayments: number;
  pendingOrders?: number;
  processingOrders: number;
  shippedOrders: number;
  deliveredOrders: number;
  cancelledOrders: number;
  rtoOrders: number;
  returnOrders: number;
  pendingReturns?: number;
  totalRefunded?: number;
  lowStockCount: number;
  outOfStockCount?: number;
  lowStockAlerts: Array<{ name: string; slug: string; size: string; stock: number }>;
  dailySales: Array<{ date: string; revenue: number; orders: number }>;
  weeklySales?: Array<{ date: string; revenue: number; orders: number }>;
  monthlySales?: Array<{ date: string; revenue: number; orders: number }>;
  paymentMethodBreakdown?: {
    online: { count: number; revenue: number };
    cod: { count: number; revenue: number };
  };
  topSellingProducts?: Array<{
    name: string;
    slug: string;
    quantity: number;
    revenue: number;
  }>;
  totalCustomers?: number;
  newCustomers?: number;
  totalProducts?: number;
  recentOrders?: Array<{
    id: string;
    order_number: string | null;
    total: number;
    status: string;
    payment_status?: string | null;
    created_at: string;
    customer_name: string | null;
  }>;
  recentRegistrations?: Array<{
    id: string;
    full_name: string;
    email: string | null;
    phone: string | null;
    created_at: string | null;
  }>;
}

interface OverviewTabProps {
  data: OverviewData;
  onNavigateTab: (tab: string) => void;
}

export function OverviewTab({ data, onNavigateTab }: OverviewTabProps) {
  const [timeframe, setTimeframe] = useState<"daily" | "weekly" | "monthly">("daily");
  const [metric, setMetric] = useState<"revenue" | "orders">("revenue");

  const rawSeries =
    timeframe === "daily"
      ? data.dailySales
      : timeframe === "weekly"
        ? (data.weeklySales && data.weeklySales.length > 0 ? data.weeklySales : data.dailySales)
        : (data.monthlySales && data.monthlySales.length > 0 ? data.monthlySales : data.dailySales);

  const chartData = rawSeries.map((d) => ({
    ...d,
    displayDate: timeframe === "daily" ? d.date.slice(5) : d.date,
  }));

  const totalRevenueCombined = data.totalPaidRevenue + data.totalCodRevenue;
  const onlineRevenuePct =
    totalRevenueCombined > 0
      ? Math.round((data.totalPaidRevenue / totalRevenueCombined) * 100)
      : 0;
  const codRevenuePct =
    totalRevenueCombined > 0
      ? Math.round((data.totalCodRevenue / totalRevenueCombined) * 100)
      : 0;

  return (
    <div className="space-y-8">
      {/* Executive KPI Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-5 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-brand text-silver">
              PAID REVENUE (RAZORPAY)
            </span>
            <CreditCard className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="mt-2 font-mono text-3xl font-bold text-emerald-400">
            {formatINR(data.totalPaidRevenue)}
          </p>
          <span className="mt-1 block text-xs text-muted-foreground">
            {data.totalPaidOrders} verified online settlements
          </span>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-brand text-silver">COD COMMITTED</span>
            <Package className="h-4 w-4 text-amber-500" />
          </div>
          <p className="mt-2 font-mono text-3xl font-bold text-amber-400">
            {formatINR(data.totalCodRevenue)}
          </p>
          <span className="mt-1 block text-xs text-muted-foreground">
            {data.totalCodOrders} Cash on Delivery bookings
          </span>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-brand text-silver">TOTAL ORDERS</span>
            <TrendingUp className="h-4 w-4 text-electric" />
          </div>
          <p className="mt-2 font-mono text-3xl font-bold text-foreground">{data.totalOrders}</p>
          <span className="mt-1 block text-xs text-muted-foreground">
            {data.processingOrders} in processing queue
          </span>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-brand text-silver">
              SHIPMAXX IN TRANSIT
            </span>
            <Truck className="h-4 w-4 text-electric" />
          </div>
          <p className="mt-2 font-mono text-3xl font-bold text-electric">{data.shippedOrders}</p>
          <span className="mt-1 block text-xs text-muted-foreground">
            {data.deliveredOrders} delivered to date
          </span>
        </div>

        {typeof data.totalCustomers === "number" && (
          <div className="rounded-xl border border-border bg-card p-5 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-brand text-silver">CUSTOMERS</span>
              <Users className="h-4 w-4 text-primary" />
            </div>
            <p className="mt-2 font-mono text-3xl font-bold text-foreground">
              {data.totalCustomers}
            </p>
            <span className="mt-1 block text-xs text-muted-foreground">
              {typeof data.newCustomers === "number" && data.newCustomers > 0
                ? `+${data.newCustomers} new this month`
                : "Active verified profiles"}
            </span>
          </div>
        )}

        {typeof data.totalProducts === "number" && (
          <div className="rounded-xl border border-border bg-card p-5 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-brand text-silver">CATALOG ITEMS</span>
              <Package className="h-4 w-4 text-gold" />
            </div>
            <p className="mt-2 font-mono text-3xl font-bold text-gold">{data.totalProducts}</p>
            <span className="mt-1 block text-xs text-muted-foreground">
              Active live products in store
            </span>
          </div>
        )}

        {typeof data.totalRefunded === "number" && data.totalRefunded > 0 && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-950/10 p-5 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-brand text-rose-400">TOTAL REFUNDED</span>
              <ShieldAlert className="h-4 w-4 text-rose-400" />
            </div>
            <p className="mt-2 font-mono text-3xl font-bold text-rose-400">
              {formatINR(data.totalRefunded)}
            </p>
            <span className="mt-1 block text-xs text-rose-300/70">
              Processed Razorpay reversals
            </span>
          </div>
        )}
      </div>

      {/* Secondary Operational Status Badges */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 text-xs">
        <button
          onClick={() => onNavigateTab("orders")}
          className="flex items-center justify-between rounded-lg border border-border bg-card/60 p-3 hover:bg-card transition"
        >
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="h-3.5 w-3.5 text-amber-400" /> Pending Payment
          </span>
          <span className="font-mono font-bold">{data.pendingPayments}</span>
        </button>

        <button
          onClick={() => onNavigateTab("orders")}
          className="flex items-center justify-between rounded-lg border border-border bg-card/60 p-3 hover:bg-card transition"
        >
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Package className="h-3.5 w-3.5 text-blue-400" /> Processing
          </span>
          <span className="font-mono font-bold">{data.processingOrders}</span>
        </button>

        <button
          onClick={() => onNavigateTab("orders")}
          className="flex items-center justify-between rounded-lg border border-border bg-card/60 p-3 hover:bg-card transition"
        >
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> Delivered
          </span>
          <span className="font-mono font-bold">{data.deliveredOrders}</span>
        </button>

        <button
          onClick={() => onNavigateTab("orders")}
          className="flex items-center justify-between rounded-lg border border-border bg-card/60 p-3 hover:bg-card transition"
        >
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <XCircle className="h-3.5 w-3.5 text-rose-400" /> Cancelled
          </span>
          <span className="font-mono font-bold">{data.cancelledOrders}</span>
        </button>

        <button
          onClick={() => onNavigateTab("returns")}
          className="flex items-center justify-between rounded-lg border border-border bg-card/60 p-3 hover:bg-card transition"
        >
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <RotateCcw className="h-3.5 w-3.5 text-orange-400" /> Returns Queue
          </span>
          <span className="font-mono font-bold">
            {typeof data.pendingReturns === "number"
              ? data.pendingReturns
              : data.rtoOrders + data.returnOrders}
          </span>
        </button>

        <button
          onClick={() => onNavigateTab("inventory")}
          className="flex items-center justify-between rounded-lg border border-border bg-card/60 p-3 hover:bg-card transition"
        >
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> Low Stock
          </span>
          <span className="font-mono font-bold text-amber-500">{data.lowStockCount}</span>
        </button>

        {typeof data.outOfStockCount === "number" && data.outOfStockCount > 0 && (
          <button
            onClick={() => onNavigateTab("inventory")}
            className="flex items-center justify-between rounded-lg border border-rose-500/30 bg-rose-950/20 p-3 hover:bg-rose-950/30 transition col-span-2 sm:col-span-1"
          >
            <span className="flex items-center gap-1.5 text-rose-400 font-semibold">
              <AlertOctagon className="h-3.5 w-3.5 text-rose-500" /> Out of Stock
            </span>
            <span className="font-mono font-bold text-rose-400">{data.outOfStockCount}</span>
          </button>
        )}
      </div>

      {/* Sales Trend Chart & Low-Stock Alerts */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Sales Chart with Timeframe and Metric Selectors */}
        <div className="lg:col-span-2 rounded-xl border border-border bg-card p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div>
              <span className="text-xs font-mono uppercase tracking-brand text-silver">
                SALES & REVENUE ANALYTICS
              </span>
              <h2 className="font-serif text-xl italic text-foreground">
                {metric === "revenue" ? "Revenue Trajectory" : "Order Volume Trajectory"}
              </h2>
            </div>

            {/* Timeframe & Metric Switchers */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-lg border border-border bg-background p-0.5 text-xs">
                <button
                  onClick={() => setTimeframe("daily")}
                  className={`rounded-md px-2.5 py-1 font-semibold transition ${
                    timeframe === "daily"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Daily (14D)
                </button>
                <button
                  onClick={() => setTimeframe("weekly")}
                  className={`rounded-md px-2.5 py-1 font-semibold transition ${
                    timeframe === "weekly"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Weekly (8W)
                </button>
                <button
                  onClick={() => setTimeframe("monthly")}
                  className={`rounded-md px-2.5 py-1 font-semibold transition ${
                    timeframe === "monthly"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Monthly (12M)
                </button>
              </div>

              <div className="inline-flex rounded-lg border border-border bg-background p-0.5 text-xs">
                <button
                  onClick={() => setMetric("revenue")}
                  className={`rounded-md px-2.5 py-1 font-semibold transition ${
                    metric === "revenue"
                      ? "bg-emerald-600 text-white"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Revenue (₹)
                </button>
                <button
                  onClick={() => setMetric("orders")}
                  className={`rounded-md px-2.5 py-1 font-semibold transition ${
                    metric === "orders"
                      ? "bg-amber-600 text-white"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Orders
                </button>
              </div>
            </div>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="metricGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor={metric === "revenue" ? "#10B981" : "#F59E0B"}
                      stopOpacity={0.4}
                    />
                    <stop
                      offset="95%"
                      stopColor={metric === "revenue" ? "#10B981" : "#F59E0B"}
                      stopOpacity={0.0}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                <XAxis dataKey="displayDate" stroke="#888" fontSize={11} tickLine={false} />
                <YAxis
                  stroke="#888"
                  fontSize={11}
                  tickLine={false}
                  tickFormatter={(v) => (metric === "revenue" ? `₹${v}` : `${v}`)}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const p = payload[0]!.payload as {
                        date: string;
                        revenue: number;
                        orders: number;
                      };
                      return (
                        <div className="rounded-lg border border-border bg-popover p-3 text-xs shadow-xl">
                          <p className="font-semibold text-foreground">{p.date}</p>
                          <p className="mt-1 text-emerald-400 font-mono font-bold">
                            Settled Revenue: {formatINR(p.revenue)}
                          </p>
                          <p className="text-amber-400 font-mono">{p.orders} orders</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Area
                  type="monotone"
                  dataKey={metric}
                  stroke={metric === "revenue" ? "#10B981" : "#F59E0B"}
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#metricGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Low Stock Warning Card */}
        <div className="rounded-xl border border-border bg-card p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-amber-500 mb-2">
              <AlertTriangle className="h-5 w-5" />
              <h2 className="font-serif text-lg italic text-foreground">Low-Stock Watchlist</h2>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Variants with remaining stock of 5 or fewer units require warehouse replenishment.
            </p>

            <div className="space-y-2.5 overflow-y-auto max-h-56 pr-1">
              {data.lowStockAlerts.length === 0 ? (
                <p className="text-xs text-muted-foreground py-6 text-center italic">
                  All catalog items adequately stocked.
                </p>
              ) : (
                data.lowStockAlerts.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between rounded-lg border border-border/50 bg-background/50 p-2.5 text-xs"
                  >
                    <div>
                      <p className="font-medium text-foreground">{item.name}</p>
                      <p className="text-[11px] text-muted-foreground">Size {item.size}</p>
                    </div>
                    <span
                      className={`font-mono font-bold ${
                        item.stock === 0 ? "text-rose-500" : "text-amber-400"
                      }`}
                    >
                      {item.stock === 0 ? "OUT OF STOCK" : `${item.stock} left`}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          <button
            onClick={() => onNavigateTab("inventory")}
            className="mt-4 w-full rounded-md border border-border bg-secondary py-2 text-xs font-semibold hover:bg-accent transition"
          >
            Manage Inventory & Restock
          </button>
        </div>
      </div>

      {/* Payment Channel Breakdown & Top-Selling Products */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Payment Channel Breakdown */}
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <span className="text-xs font-mono uppercase tracking-brand text-silver">
                PAYMENT METHODS
              </span>
              <h2 className="font-serif text-lg italic text-foreground">
                Payment Channel Distribution
              </h2>
            </div>
            <button
              onClick={() => onNavigateTab("payments")}
              className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
            >
              All Payments <ArrowUpRight className="h-3 w-3" />
            </button>
          </div>

          {/* Progress bar split */}
          <div className="space-y-4">
            <div className="h-3 w-full rounded-full bg-secondary overflow-hidden flex">
              <div
                style={{ width: `${onlineRevenuePct}%` }}
                className="bg-emerald-500 transition-all duration-500"
                title={`Online (Razorpay): ${onlineRevenuePct}%`}
              />
              <div
                style={{ width: `${codRevenuePct}%` }}
                className="bg-amber-500 transition-all duration-500"
                title={`COD: ${codRevenuePct}%`}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg border border-border/60 bg-background/50 p-4">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  <span className="text-xs font-semibold text-foreground">Online (Razorpay)</span>
                </div>
                <p className="mt-2 font-mono text-xl font-bold text-emerald-400">
                  {formatINR(data.totalPaidRevenue)}
                </p>
                <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>{data.totalPaidOrders} orders</span>
                  <span className="font-semibold text-foreground">{onlineRevenuePct}%</span>
                </div>
              </div>

              <div className="rounded-lg border border-border/60 bg-background/50 p-4">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                  <span className="text-xs font-semibold text-foreground">Cash on Delivery (COD)</span>
                </div>
                <p className="mt-2 font-mono text-xl font-bold text-amber-400">
                  {formatINR(data.totalCodRevenue)}
                </p>
                <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>{data.totalCodOrders} orders</span>
                  <span className="font-semibold text-foreground">{codRevenuePct}%</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Top-Selling Products */}
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <span className="text-xs font-mono uppercase tracking-brand text-silver">
                BESTSELLERS
              </span>
              <h2 className="font-serif text-lg italic text-foreground">
                Top-Selling Products
              </h2>
            </div>
            <button
              onClick={() => onNavigateTab("products")}
              className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
            >
              All Products <ArrowUpRight className="h-3 w-3" />
            </button>
          </div>

          {(!data.topSellingProducts || data.topSellingProducts.length === 0) ? (
            <div className="py-8 text-center text-xs text-muted-foreground italic">
              No sales recorded yet across customer orders.
            </div>
          ) : (
            <div className="space-y-3">
              {data.topSellingProducts.slice(0, 5).map((item, idx) => (
                <div
                  key={item.slug || idx}
                  className="flex items-center justify-between rounded-lg border border-border/50 bg-background/50 p-3 text-xs"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-secondary font-mono text-[11px] font-bold text-silver">
                      #{idx + 1}
                    </span>
                    <div>
                      <p className="font-medium text-foreground">{item.name}</p>
                      <p className="text-[11px] text-muted-foreground font-mono">
                        {item.quantity} {item.quantity === 1 ? "unit" : "units"} sold
                      </p>
                    </div>
                  </div>
                  <span className="font-mono font-bold text-emerald-400">
                    {formatINR(item.revenue)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent Orders & Recent Customer Registrations */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Orders */}
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-serif text-lg italic text-foreground">Recent Orders</h2>
            <button
              onClick={() => onNavigateTab("orders")}
              className="text-xs font-semibold text-primary hover:underline"
            >
              View all orders
            </button>
          </div>
          {(!data.recentOrders || data.recentOrders.length === 0) ? (
            <p className="text-xs text-muted-foreground py-6 text-center italic">
              No recent orders found.
            </p>
          ) : (
            <div className="space-y-3">
              {data.recentOrders.map((order) => (
                <div
                  key={order.id}
                  className="flex items-center justify-between rounded-lg border border-border/50 bg-background/50 p-3 text-xs"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-foreground">
                        {order.order_number || "Order"}
                      </span>
                      <span className="rounded bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary capitalize">
                        {order.status}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {order.customer_name || "Customer"} •{" "}
                      {new Date(order.created_at).toLocaleDateString("en-IN", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <span className="font-mono font-bold text-foreground">
                    {formatINR(order.total)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Customer Registrations */}
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-serif text-lg italic text-foreground">
              Recent Customer Registrations
            </h2>
            <button
              onClick={() => onNavigateTab("customers")}
              className="text-xs font-semibold text-primary hover:underline"
            >
              View all customers
            </button>
          </div>
          {(!data.recentRegistrations || data.recentRegistrations.length === 0) ? (
            <p className="text-xs text-muted-foreground py-6 text-center italic">
              No recent registrations found.
            </p>
          ) : (
            <div className="space-y-3">
              {data.recentRegistrations.map((cust) => (
                <div
                  key={cust.id}
                  className="flex items-center justify-between rounded-lg border border-border/50 bg-background/50 p-3 text-xs"
                >
                  <div>
                    <p className="font-medium text-foreground">{cust.full_name}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">
                      {cust.email} {cust.phone ? `• ${cust.phone}` : ""}
                    </p>
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    {cust.created_at
                      ? new Date(cust.created_at).toLocaleDateString("en-IN", {
                          month: "short",
                          day: "numeric",
                        })
                      : "Recently"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
