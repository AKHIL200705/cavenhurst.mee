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
  processingOrders: number;
  shippedOrders: number;
  deliveredOrders: number;
  cancelledOrders: number;
  rtoOrders: number;
  returnOrders: number;
  lowStockCount: number;
  lowStockAlerts: Array<{ name: string; slug: string; size: string; stock: number }>;
  dailySales: Array<{ date: string; revenue: number; orders: number }>;
}

interface OverviewTabProps {
  data: OverviewData;
  onNavigateTab: (tab: string) => void;
}

export function OverviewTab({ data, onNavigateTab }: OverviewTabProps) {
  const chartData = data.dailySales.map((d) => ({
    ...d,
    displayDate: d.date.slice(5),
  }));

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
            {data.totalPaidOrders} verified online transactions
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
      </div>

      {/* Secondary Status Badges */}
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
          onClick={() => onNavigateTab("orders")}
          className="flex items-center justify-between rounded-lg border border-border bg-card/60 p-3 hover:bg-card transition"
        >
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <RotateCcw className="h-3.5 w-3.5 text-orange-400" /> RTO / Returns
          </span>
          <span className="font-mono font-bold">{data.rtoOrders + data.returnOrders}</span>
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
      </div>

      {/* Sales Trend Chart & Low-Stock Alerts */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Sales Chart */}
        <div className="lg:col-span-2 rounded-xl border border-border bg-card p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <span className="text-xs font-mono uppercase tracking-brand text-silver">
                REVENUE VELOCITY
              </span>
              <h2 className="font-serif text-xl italic">Last 7 Days Sales Trajectory</h2>
            </div>
            <span className="rounded bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
              Live Real-Time
            </span>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#C7D1DF" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#C7D1DF" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                <XAxis dataKey="displayDate" stroke="#888" fontSize={11} tickLine={false} />
                <YAxis
                  stroke="#888"
                  fontSize={11}
                  tickLine={false}
                  tickFormatter={(v) => `₹${v}`}
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
                            Revenue: {formatINR(p.revenue)}
                          </p>
                          <p className="text-muted-foreground">{p.orders} orders placed</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#C7D1DF"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#revGrad)"
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
              Products with remaining stock of 3 or fewer units require warehouse restocking.
            </p>

            <div className="space-y-3 overflow-y-auto max-h-56 pr-1">
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
                    <span className="font-mono font-bold text-amber-400">{item.stock} left</span>
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
    </div>
  );
}
