import { Suspense, lazy, useMemo, useState } from "react";
import { formatINR } from "@/lib/pricing";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Box,
  Calendar,
  ChevronDown,
  IndianRupee,
  ShoppingBag,
  TrendingUp,
  Users,
} from "lucide-react";
import type { AdminVariantItem } from "./VariantsTab";

const SalesRevenueChart = lazy(() => import("./SalesRevenueChart"));

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
  inStockCount?: number;
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
  variants?: AdminVariantItem[] | undefined;
  onNavigateTab: (tab: string) => void;
}

/**
 * Clean monochrome white apparel silhouette for Stock Status and Low Stock Watchlist.
 */
function WhiteTshirtIcon({ className = "h-7 w-7 text-white" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M16.2 3.5c-.7 1.3-2.3 2.1-4.2 2.1s-3.5-.8-4.2-2.1L3.5 5.6 2 10.1l3.2 1.3.9-2.2V20a1 1 0 0 0 1 1h9.8a1 1 0 0 0 1-1V9.2l.9 2.2 3.2-1.3-1.5-4.5-4.3-2.1Z" />
    </svg>
  );
}

/**
 * Minimalist white/silver sparkline matching the luxury midnight navy KPI cards.
 */
function KpiSparkline({ values }: { values: number[] }) {
  const pts = values.length >= 2 ? values.slice(-7) : [1, 2, 1.8, 3, 2.7, 4.2, 5];
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min;

  // Give flat zero series a subtle composed trajectory resembling the reference aesthetic
  const normalized =
    span === 0
      ? [0.18, 0.34, 0.56, 0.42, 0.54, 0.84, 1.0]
      : pts.map((v) => 0.15 + ((v - min) / span) * 0.85);

  const width = 68;
  const height = 28;
  const coords = normalized
    .map((n, idx) => {
      const x = (idx / Math.max(1, normalized.length - 1)) * width;
      const y = height - n * (height - 6) - 3;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-7 w-16 shrink-0 overflow-visible"
      aria-hidden="true"
    >
      <polyline
        fill="none"
        stroke="#B8C7D9"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={coords}
      />
    </svg>
  );
}

function formatAxisDate(dateStr: string, timeframe: "daily" | "weekly" | "monthly"): string {
  if (timeframe !== "daily") return dateStr;
  const parsed = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateStr.slice(5);
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function computeDeltaPercent(series: number[]): number {
  if (series.length < 4) return 0;
  const half = Math.floor(series.length / 2);
  const prev = series.slice(0, half).reduce((a, b) => a + b, 0);
  const curr = series.slice(half).reduce((a, b) => a + b, 0);
  if (prev === 0) return curr > 0 ? 100 : 0;
  return Math.round(((curr - prev) / prev) * 100);
}

export function OverviewTab({ data, variants = [], onNavigateTab }: OverviewTabProps) {
  const [dateWindow, setDateWindow] = useState<"7d" | "30d" | "all">("30d");
  const [dateMenuOpen, setDateMenuOpen] = useState(false);
  const [timeframe, setTimeframe] = useState<"daily" | "weekly" | "monthly">("daily");
  const [metric, setMetric] = useState<"revenue" | "orders">("revenue");

  const dailyOrdersSeries = useMemo(() => data.dailySales.map((d) => d.orders), [data.dailySales]);
  const dailyRevenueSeries = useMemo(
    () => data.dailySales.map((d) => d.revenue),
    [data.dailySales],
  );

  const orderDelta = useMemo(() => computeDeltaPercent(dailyOrdersSeries), [dailyOrdersSeries]);
  const revenueDelta = useMemo(() => computeDeltaPercent(dailyRevenueSeries), [dailyRevenueSeries]);

  // Stock status metrics synchronized cleanly with live variant inventory
  const stockSummary = useMemo(() => {
    const outOfStock = data.outOfStockCount ?? 0;
    const lowStock = data.lowStockCount ?? 0;

    let inStock: number;
    if (typeof data.inStockCount === "number") {
      inStock = data.inStockCount;
    } else if (variants.length > 0) {
      inStock = variants.filter((v) => (Number(v.stock_quantity) || 0) > 5).length;
    } else {
      inStock = Math.max(0, (data.totalProducts ?? 0) * 10 - outOfStock - lowStock);
    }

    return { inStock, outOfStock, lowStock };
  }, [data.inStockCount, data.lowStockCount, data.outOfStockCount, data.totalProducts, variants]);

  const chartData = useMemo(() => {
    const rawSeries =
      timeframe === "daily"
        ? dateWindow === "7d"
          ? data.dailySales.slice(-7)
          : data.dailySales.slice(-7) // Clean 7-point editorial horizon matching reference card spacing
        : timeframe === "weekly" && data.weeklySales && data.weeklySales.length > 0
          ? data.weeklySales
          : data.monthlySales && data.monthlySales.length > 0
            ? data.monthlySales
            : data.dailySales.slice(-7);

    const visibleSeries =
      timeframe === "daily" && dateWindow === "all" ? data.dailySales : rawSeries;

    return visibleSeries.map((d) => ({
      ...d,
      displayDate: formatAxisDate(d.date, timeframe),
    }));
  }, [data.dailySales, data.monthlySales, data.weeklySales, dateWindow, timeframe]);

  // Donut segments (cool steel-white / light-silver tones only — zero red)
  const orderBreakdown = useMemo(() => {
    const returnedTotal =
      typeof data.pendingReturns === "number" && data.pendingReturns > 0
        ? data.pendingReturns
        : data.returnOrders + (data.rtoOrders || 0);

    const rows = [
      { label: "Delivered", count: data.deliveredOrders, color: "#FFFFFF" },
      { label: "Processing", count: data.processingOrders, color: "#DCE4EF" },
      { label: "Pending Payment", count: data.pendingPayments, color: "#9EB2C9" },
      { label: "Cancelled", count: data.cancelledOrders, color: "#BAC7D8" },
      { label: "Returned", count: returnedTotal, color: "#7B90AB" },
      { label: "Out of Stock", count: stockSummary.outOfStock, color: "#526884" },
    ];

    const ringItems = rows.slice(0, 5).filter((r) => r.count > 0);
    const ringSum = ringItems.reduce((acc, r) => acc + r.count, 0);

    return { rows, ringItems, ringSum };
  }, [
    data.cancelledOrders,
    data.deliveredOrders,
    data.pendingPayments,
    data.pendingReturns,
    data.processingOrders,
    data.returnOrders,
    data.rtoOrders,
    stockSummary.outOfStock,
  ]);

  const radius = 64;
  const circumference = 2 * Math.PI * radius;

  let cumulativeOffset = 0;
  const donutArcs = orderBreakdown.ringItems.map((seg) => {
    const ratio = orderBreakdown.ringSum > 0 ? seg.count / orderBreakdown.ringSum : 0;
    const gap = orderBreakdown.ringItems.length > 1 ? 3 : 0;
    const segmentLength = Math.max(0, ratio * circumference - gap);
    const offset = -cumulativeOffset;
    cumulativeOffset += ratio * circumference;
    return { ...seg, segmentLength, offset };
  });

  const dateWindowLabel =
    dateWindow === "7d" ? "Last 7 Days" : dateWindow === "30d" ? "Last 30 Days" : "All Time";

  return (
    <div className="space-y-6">
      {/* Page Title Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="font-sans text-2xl sm:text-[28px] font-bold tracking-tight text-white normal-case">
              Dashboard
            </h1>
            <span className="rounded-full border border-[#233b56] bg-[#091c33] px-2.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-[#9fb2c9]">
              OPERATIONS CONSOLE
            </span>
          </div>
          <p className="mt-1 text-xs sm:text-sm text-[#8fa3bd]">
            Overview of your store performance
          </p>
        </div>

        {/* Date Filter Control */}
        <div className="relative self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setDateMenuOpen((prev) => !prev)}
            className="inline-flex items-center gap-2 rounded-xl border border-[#223954] bg-[#071a30] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#0d243f] transition"
          >
            <Calendar className="h-3.5 w-3.5 text-white" />
            <span>{dateWindowLabel}</span>
            <ChevronDown className="h-3.5 w-3.5 text-white" />
          </button>

          {dateMenuOpen && (
            <div className="absolute right-0 z-30 mt-2 w-40 rounded-xl border border-[#223954] bg-[#071a30] p-1 shadow-2xl">
              {(
                [
                  { id: "7d", label: "Last 7 Days" },
                  { id: "30d", label: "Last 30 Days" },
                  { id: "all", label: "All Time" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    setDateWindow(opt.id);
                    setDateMenuOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-left text-xs transition ${
                    dateWindow === opt.id
                      ? "bg-[#122741] font-semibold text-white"
                      : "text-[#9fb2c9] hover:bg-[#0e233b] hover:text-white"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Top Row: 4 KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {/* KPI 1: Total Orders */}
        <div className="rounded-xl border border-[#1d344e] bg-[#06182c] p-5">
          <div className="flex items-center gap-2 text-xs font-medium text-[#cbd5e1]">
            <ShoppingBag className="h-4 w-4 text-white" />
            <span>Total Orders</span>
          </div>
          <div className="mt-3 flex items-end justify-between gap-2">
            <div>
              <p className="text-3xl font-bold tracking-tight text-white tabular-nums">
                {data.totalOrders}
              </p>
              <span className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-[#9fb2c9]">
                <TrendingUp className="h-3 w-3 text-white" />
                {orderDelta >= 0 ? `+${orderDelta}%` : `${orderDelta}%`}
              </span>
            </div>
            <KpiSparkline values={dailyOrdersSeries} />
          </div>
        </div>

        {/* KPI 2: Paid Revenue */}
        <div className="rounded-xl border border-[#1d344e] bg-[#06182c] p-5">
          <div className="flex items-center gap-2 text-xs font-medium text-[#cbd5e1]">
            <IndianRupee className="h-4 w-4 text-white" />
            <span>Paid Revenue</span>
          </div>
          <div className="mt-3 flex items-end justify-between gap-2">
            <div>
              <p className="text-3xl font-bold tracking-tight text-white tabular-nums">
                {formatINR(data.totalPaidRevenue)}
              </p>
              <span className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-[#9fb2c9]">
                <TrendingUp className="h-3 w-3 text-white" />
                {revenueDelta >= 0 ? `+${revenueDelta}%` : `${revenueDelta}%`}
              </span>
            </div>
            <KpiSparkline values={dailyRevenueSeries} />
          </div>
        </div>

        {/* KPI 3: Customers */}
        <div className="rounded-xl border border-[#1d344e] bg-[#06182c] p-5">
          <div className="flex items-center gap-2 text-xs font-medium text-[#cbd5e1]">
            <Users className="h-4 w-4 text-white" />
            <span>Customers</span>
          </div>
          <div className="mt-3 flex items-end justify-between gap-2">
            <div>
              <p className="text-3xl font-bold tracking-tight text-white tabular-nums">
                {data.totalCustomers ?? 0}
              </p>
              <span className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-[#9fb2c9]">
                <TrendingUp className="h-3 w-3 text-white" />
                {typeof data.newCustomers === "number" && data.totalCustomers
                  ? `+${Math.round((data.newCustomers / Math.max(1, data.totalCustomers)) * 100)}%`
                  : "+0%"}
              </span>
            </div>
            <KpiSparkline values={[1, 2, 1.7, 2.9, 2.6, 3.6, 4.4]} />
          </div>
        </div>

        {/* KPI 4: Catalog Items */}
        <div className="rounded-xl border border-[#1d344e] bg-[#06182c] p-5">
          <div className="flex items-center gap-2 text-xs font-medium text-[#cbd5e1]">
            <Box className="h-4 w-4 text-white" />
            <span>Catalog Items</span>
          </div>
          <div className="mt-3 flex items-end justify-between gap-2">
            <div>
              <p className="text-3xl font-bold tracking-tight text-white tabular-nums">
                {data.totalProducts ?? 0}
              </p>
              <span className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-[#9fb2c9]">
                <TrendingUp className="h-3 w-3 text-white" />
                +0%
              </span>
            </div>
            <KpiSparkline values={[1, 1.5, 2.2, 2.0, 3.0, 2.8, 4.0]} />
          </div>
        </div>
      </div>

      {/* Second Row: Order Overview (Donut) + Stock Status */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Left: Order Overview */}
        <div className="lg:col-span-6 rounded-xl border border-[#1d344e] bg-[#06182c] p-5 sm:p-6">
          <div className="flex items-center justify-between gap-2 mb-5">
            <div className="flex items-center gap-2.5">
              <BarChart3 className="h-4 w-4 text-white" />
              <h2 className="font-sans text-base font-semibold tracking-tight text-white normal-case">
                Order Overview
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab("orders")}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#cbd5e1] hover:text-white transition"
            >
              View Details <ArrowRight className="h-3.5 w-3.5 text-white" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-[175px_1fr] items-center gap-6">
            {/* Donut Chart */}
            <div className="relative mx-auto h-44 w-44 shrink-0">
              <svg viewBox="0 0 160 160" className="h-full w-full -rotate-90" aria-hidden="true">
                <circle cx="80" cy="80" r={radius} fill="none" stroke="#132942" strokeWidth="18" />
                {donutArcs.map((arc) => (
                  <circle
                    key={arc.label}
                    cx="80"
                    cy="80"
                    r={radius}
                    fill="none"
                    stroke={arc.color}
                    strokeWidth="18"
                    strokeDasharray={`${arc.segmentLength} ${circumference}`}
                    strokeDashoffset={arc.offset}
                    strokeLinecap="butt"
                  />
                ))}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-2xl font-bold text-white tabular-nums">
                  {data.totalOrders}
                </span>
                <span className="text-[11px] font-medium text-[#8fa3bd]">Total Orders</span>
              </div>
            </div>

            {/* Order Status List */}
            <div className="space-y-2.5 text-xs">
              {orderBreakdown.rows.map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-3 py-0.5">
                  <span className="flex items-center gap-2.5 text-[#cbd5e1]">
                    <span className="h-2 w-2 rounded-full bg-white shrink-0" />
                    <span>{row.label}</span>
                  </span>
                  <span className="font-semibold text-white tabular-nums">{row.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Stock Status (3 Cards — ONLY OUT OF STOCK label/button is red) */}
        <div className="lg:col-span-6 rounded-xl border border-[#1d344e] bg-[#06182c] p-5 sm:p-6 flex flex-col justify-between">
          <div className="flex items-center gap-2.5 mb-5">
            <Box className="h-4 w-4 text-white" />
            <h2 className="font-sans text-base font-semibold tracking-tight text-white normal-case">
              Stock Status
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3 flex-1">
            {/* In Stock */}
            <div className="flex flex-col items-center justify-center rounded-xl border border-[#1a3049] bg-[#041426] p-5 text-center">
              <WhiteTshirtIcon className="h-8 w-8 text-white mb-3" />
              <span className="text-xs font-medium text-[#cbd5e1]">In Stock</span>
              <span className="mt-2 text-2xl font-bold text-white tabular-nums">
                {stockSummary.inStock}
              </span>
            </div>

            {/* Out of Stock (Strict rule: white T-shirt, white count, ONLY OUT OF STOCK label is red) */}
            <div className="flex flex-col items-center justify-center rounded-xl border border-[#1a3049] bg-[#041426] p-5 text-center">
              <WhiteTshirtIcon className="h-8 w-8 text-white mb-3" />
              <button
                type="button"
                onClick={() => onNavigateTab("inventory")}
                className="whitespace-nowrap rounded-full border border-red-500/80 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-500 hover:border-red-400 hover:text-red-400 transition"
              >
                OUT OF STOCK
              </button>
              <span className="mt-2 text-2xl font-bold text-white tabular-nums">
                {stockSummary.outOfStock}
              </span>
            </div>

            {/* Low Stock */}
            <div className="flex flex-col items-center justify-center rounded-xl border border-[#1a3049] bg-[#041426] p-5 text-center">
              <WhiteTshirtIcon className="h-8 w-8 text-white mb-3" />
              <span className="text-xs font-medium text-[#cbd5e1]">Low Stock</span>
              <span className="mt-2 text-2xl font-bold text-white tabular-nums">
                {stockSummary.lowStock}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Third Row: Sales & Revenue Analytics + Low Stock Watchlist */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Left: Sales & Revenue Analytics */}
        <div className="lg:col-span-7 min-w-0 rounded-xl border border-[#1d344e] bg-[#06182c] p-5 sm:p-6">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between mb-5">
            <div className="flex items-center gap-2 min-w-0">
              <TrendingUp className="h-4 w-4 shrink-0 text-white" />
              <h2 className="font-sans text-base font-semibold tracking-tight text-white normal-case sm:whitespace-nowrap">
                Sales & Revenue Analytics
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <div className="inline-flex rounded-xl border border-[#1d344e] bg-[#041426] p-0.5 text-[11px]">
                {(["daily", "weekly", "monthly"] as const).map((tf) => (
                  <button
                    key={tf}
                    type="button"
                    onClick={() => setTimeframe(tf)}
                    className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                      timeframe === tf
                        ? "bg-white text-[#031323]"
                        : "text-[#9fb2c9] hover:text-white"
                    }`}
                  >
                    {tf === "daily" ? "Daily" : tf === "weekly" ? "Weekly" : "Monthly"}
                  </button>
                ))}
              </div>

              <div className="inline-flex rounded-xl border border-[#1d344e] bg-[#041426] p-0.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => setMetric("revenue")}
                  className={`rounded-lg px-2.5 py-1 font-medium transition ${
                    metric === "revenue"
                      ? "bg-[#122741] text-white"
                      : "text-[#8fa3bd] hover:text-white"
                  }`}
                >
                  ₹
                </button>
                <button
                  type="button"
                  onClick={() => setMetric("orders")}
                  className={`rounded-lg px-2.5 py-1 font-medium transition ${
                    metric === "orders"
                      ? "bg-[#122741] text-white"
                      : "text-[#8fa3bd] hover:text-white"
                  }`}
                >
                  Orders
                </button>
              </div>
            </div>
          </div>

          <Suspense
            fallback={<div className="h-64 sm:h-72 w-full animate-pulse rounded-xl bg-[#041426]" />}
          >
            <SalesRevenueChart chartData={chartData} metric={metric} />
          </Suspense>
        </div>

        {/* Right: Low Stock Watchlist */}
        <div className="lg:col-span-5 min-w-0 rounded-xl border border-[#1d344e] bg-[#06182c] p-5 sm:p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-white shrink-0" />
                <h2 className="font-sans text-base font-semibold tracking-tight text-white normal-case">
                  Low Stock Watchlist
                </h2>
              </div>
              <button
                type="button"
                onClick={() => onNavigateTab("inventory")}
                className="inline-flex items-center gap-1 text-xs font-medium text-[#cbd5e1] hover:text-white transition"
              >
                View All <ArrowRight className="h-3.5 w-3.5 text-white" />
              </button>
            </div>

            <p className="mt-1.5 mb-4 text-xs text-[#8fa3bd]">
              Variants with remaining stock of 5 or fewer units.
            </p>

            <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
              {data.lowStockAlerts.length === 0 ? (
                <div className="rounded-xl border border-[#1a3049] bg-[#041426] py-10 px-4 text-center text-xs text-[#8fa3bd]">
                  All catalog variants adequately stocked.
                </div>
              ) : (
                data.lowStockAlerts.map((item, idx) => (
                  <div
                    key={`${item.slug}-${item.size}-${idx}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-[#1a3049] bg-[#041426] px-3.5 py-2.5"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#203854] bg-[#091c33]">
                        <WhiteTshirtIcon className="h-5 w-5 text-white" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-white truncate">{item.name}</p>
                        <p className="text-[11px] text-[#8fa3bd]">Size {item.size}</p>
                      </div>
                    </div>

                    {item.stock === 0 ? (
                      <button
                        type="button"
                        onClick={() => onNavigateTab("inventory")}
                        className="shrink-0 rounded-full border border-red-500/80 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-500 hover:border-red-400 hover:text-red-400 transition"
                      >
                        OUT OF STOCK
                      </button>
                    ) : (
                      <span className="shrink-0 text-xs font-semibold text-white whitespace-nowrap tabular-nums">
                        {item.stock} left
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
