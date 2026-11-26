import { Suspense, lazy, useMemo, useState } from "react";
import { formatINR } from "@/lib/pricing";
import { ArrowUpRight, BarChart3, CreditCard, TrendingUp } from "lucide-react";
import type { OverviewData } from "./OverviewTab";

const SalesRevenueChart = lazy(() => import("./SalesRevenueChart"));

interface AnalyticsTabProps {
  data: OverviewData;
  onNavigateTab: (tab: string) => void;
}

function formatAxisLabel(dateStr: string, timeframe: "daily" | "weekly" | "monthly"): string {
  if (timeframe !== "daily") return dateStr;
  const parsed = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateStr.slice(5);
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function AnalyticsTab({ data, onNavigateTab }: AnalyticsTabProps) {
  const [timeframe, setTimeframe] = useState<"daily" | "weekly" | "monthly">("daily");
  const [metric, setMetric] = useState<"revenue" | "orders">("revenue");

  const chartData = useMemo(() => {
    const rawSeries =
      timeframe === "daily"
        ? data.dailySales
        : timeframe === "weekly" && data.weeklySales && data.weeklySales.length > 0
          ? data.weeklySales
          : data.monthlySales && data.monthlySales.length > 0
            ? data.monthlySales
            : data.dailySales;

    return rawSeries.map((d) => ({
      ...d,
      displayDate: formatAxisLabel(d.date, timeframe),
    }));
  }, [data.dailySales, data.monthlySales, data.weeklySales, timeframe]);

  const totalRevenueCombined = data.totalPaidRevenue + data.totalCodRevenue;
  const onlinePct =
    totalRevenueCombined > 0 ? Math.round((data.totalPaidRevenue / totalRevenueCombined) * 100) : 0;
  const codPct =
    totalRevenueCombined > 0 ? Math.round((data.totalCodRevenue / totalRevenueCombined) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-sans text-2xl sm:text-3xl font-bold tracking-tight text-white normal-case">
            Analytics
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-[#8fa3bd]">
            Sales trajectory, payment channel distribution & product demand
          </p>
        </div>

        <div className="inline-flex rounded-xl border border-[#1d344e] bg-[#06182c] p-1 text-xs">
          <button
            type="button"
            onClick={() => setMetric("revenue")}
            className={`rounded-lg px-3 py-1.5 font-semibold transition ${
              metric === "revenue" ? "bg-white text-[#031323]" : "text-[#9fb2c9] hover:text-white"
            }`}
          >
            Revenue (₹)
          </button>
          <button
            type="button"
            onClick={() => setMetric("orders")}
            className={`rounded-lg px-3 py-1.5 font-semibold transition ${
              metric === "orders" ? "bg-white text-[#031323]" : "text-[#9fb2c9] hover:text-white"
            }`}
          >
            Order Volume
          </button>
        </div>
      </div>

      {/* Main Analytics Chart */}
      <div className="min-w-0 overflow-hidden rounded-xl border border-[#1d344e] bg-[#06182c] p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
          <div className="flex items-center gap-2.5">
            <TrendingUp className="h-5 w-5 text-white" />
            <h2 className="font-sans text-base sm:text-lg font-semibold tracking-tight text-white normal-case">
              {metric === "revenue" ? "Sales & Revenue Analytics" : "Order Volume Analytics"}
            </h2>
          </div>

          <div className="inline-flex rounded-xl border border-[#1d344e] bg-[#041426] p-1 text-xs self-start">
            {(["daily", "weekly", "monthly"] as const).map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => setTimeframe(tf)}
                className={`rounded-lg px-3 py-1.5 font-semibold transition ${
                  timeframe === tf ? "bg-white text-[#031323]" : "text-[#9fb2c9] hover:text-white"
                }`}
              >
                {tf === "daily" ? "Daily" : tf === "weekly" ? "Weekly" : "Monthly"}
              </button>
            ))}
          </div>
        </div>

        <Suspense fallback={<div className="h-72 w-full animate-pulse rounded-xl bg-[#041426]" />}>
          <SalesRevenueChart chartData={chartData} metric={metric} />
        </Suspense>
      </div>

      {/* Payment Channels & Bestsellers */}
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="min-w-0 overflow-hidden rounded-xl border border-[#1d344e] bg-[#06182c] p-5 sm:p-6">
          <div className="flex items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2.5 min-w-0">
              <CreditCard className="h-4 w-4 shrink-0 text-white" />
              <h2 className="font-sans text-base font-semibold tracking-tight text-white normal-case">
                Payment Channel Distribution
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab("payments")}
              className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-[#cbd5e1] hover:text-white transition whitespace-nowrap"
            >
              View All <ArrowUpRight className="h-3.5 w-3.5 text-white" />
            </button>
          </div>

          <div className="space-y-4">
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#0d223a] flex">
              <div
                style={{ width: `${onlinePct}%` }}
                className="bg-white transition-all duration-500"
                title={`Online (Razorpay): ${onlinePct}%`}
              />
              <div
                style={{ width: `${codPct}%` }}
                className="bg-[#647a96] transition-all duration-500"
                title={`COD: ${codPct}%`}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="rounded-xl border border-[#1a3049] bg-[#041426] p-4">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-white" />
                  <span className="text-xs font-medium text-[#cbd5e1]">Online (Razorpay)</span>
                </div>
                <p className="mt-2 font-mono text-xl font-bold text-white">
                  {formatINR(data.totalPaidRevenue)}
                </p>
                <div className="mt-1 flex items-center justify-between text-[11px] text-[#8fa3bd]">
                  <span>{data.totalPaidOrders} orders</span>
                  <span className="font-semibold text-white">{onlinePct}%</span>
                </div>
              </div>

              <div className="rounded-xl border border-[#1a3049] bg-[#041426] p-4">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#647a96]" />
                  <span className="text-xs font-medium text-[#cbd5e1]">Cash on Delivery</span>
                </div>
                <p className="mt-2 font-mono text-xl font-bold text-white">
                  {formatINR(data.totalCodRevenue)}
                </p>
                <div className="mt-1 flex items-center justify-between text-[11px] text-[#8fa3bd]">
                  <span>{data.totalCodOrders} orders</span>
                  <span className="font-semibold text-white">{codPct}%</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="min-w-0 overflow-hidden rounded-xl border border-[#1d344e] bg-[#06182c] p-5 sm:p-6">
          <div className="flex items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2.5 min-w-0">
              <BarChart3 className="h-4 w-4 shrink-0 text-white" />
              <h2 className="font-sans text-base font-semibold tracking-tight text-white normal-case">
                Top-Selling Products
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab("products")}
              className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-[#cbd5e1] hover:text-white transition whitespace-nowrap"
            >
              All Products <ArrowUpRight className="h-3.5 w-3.5 text-white" />
            </button>
          </div>

          {!data.topSellingProducts || data.topSellingProducts.length === 0 ? (
            <div className="py-10 text-center text-xs text-[#8fa3bd]">
              No sales recorded yet across customer orders.
            </div>
          ) : (
            <div className="space-y-2.5">
              {data.topSellingProducts.slice(0, 5).map((item, idx) => (
                <div
                  key={item.slug || idx}
                  className="flex items-center justify-between rounded-xl border border-[#1a3049] bg-[#041426] px-3.5 py-2.5 text-xs"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[#233c59] bg-[#0a1e35] font-mono text-[11px] font-semibold text-white">
                      #{idx + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium text-white truncate">{item.name}</p>
                      <p className="text-[11px] text-[#8fa3bd] font-mono">
                        {item.quantity} {item.quantity === 1 ? "unit" : "units"} sold
                      </p>
                    </div>
                  </div>
                  <span className="font-mono font-semibold text-white ml-2">
                    {formatINR(item.revenue)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent Orders & Recent Registrations */}
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="min-w-0 overflow-hidden rounded-xl border border-[#1d344e] bg-[#06182c] p-5 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-sans text-base font-semibold tracking-tight text-white normal-case">
              Recent Orders
            </h2>
            <button
              type="button"
              onClick={() => onNavigateTab("orders")}
              className="text-xs font-medium text-[#cbd5e1] hover:text-white transition"
            >
              View Details →
            </button>
          </div>
          {!data.recentOrders || data.recentOrders.length === 0 ? (
            <p className="py-6 text-center text-xs text-[#8fa3bd]">No recent orders found.</p>
          ) : (
            <div className="space-y-2.5">
              {data.recentOrders.map((order) => (
                <div
                  key={order.id}
                  className="flex items-center justify-between rounded-xl border border-[#1a3049] bg-[#041426] px-3.5 py-3 text-xs"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-white">
                        {order.order_number || "Order"}
                      </span>
                      <span className="rounded-md border border-[#243d5c] bg-[#0c2036] px-2 py-0.5 text-[10px] font-medium text-[#cbd5e1] capitalize">
                        {order.status}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-[#8fa3bd]">
                      {order.customer_name || "Customer"} •{" "}
                      {new Date(order.created_at).toLocaleDateString("en-IN", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <span className="font-mono font-semibold text-white">
                    {formatINR(order.total)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="min-w-0 overflow-hidden rounded-xl border border-[#1d344e] bg-[#06182c] p-5 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-sans text-base font-semibold tracking-tight text-white normal-case">
              Recent Customer Registrations
            </h2>
            <button
              type="button"
              onClick={() => onNavigateTab("customers")}
              className="text-xs font-medium text-[#cbd5e1] hover:text-white transition"
            >
              View All →
            </button>
          </div>
          {!data.recentRegistrations || data.recentRegistrations.length === 0 ? (
            <p className="py-6 text-center text-xs text-[#8fa3bd]">
              No recent registrations found.
            </p>
          ) : (
            <div className="space-y-2.5">
              {data.recentRegistrations.map((cust) => (
                <div
                  key={cust.id}
                  className="flex items-center justify-between rounded-xl border border-[#1a3049] bg-[#041426] px-3.5 py-3 text-xs"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-white truncate">{cust.full_name}</p>
                    <p className="mt-0.5 font-mono text-[11px] text-[#8fa3bd] truncate">
                      {cust.email} {cust.phone ? `• ${cust.phone}` : ""}
                    </p>
                  </div>
                  <span className="text-[11px] text-[#8fa3bd] ml-2 whitespace-nowrap">
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
