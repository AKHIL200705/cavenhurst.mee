import { formatINR } from "@/lib/pricing";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

export interface SalesChartPoint {
  date: string;
  displayDate: string;
  revenue: number;
  orders: number;
}

interface SalesRevenueChartProps {
  chartData: SalesChartPoint[];
  metric: "revenue" | "orders";
}

/**
 * Isolated Recharts analytics view rendering a clean monochrome white trajectory
 * over midnight navy with subtle slate grid lines.
 */
export default function SalesRevenueChart({ chartData, metric }: SalesRevenueChartProps) {
  return (
    <div className="h-64 sm:h-72 w-full min-w-0 overflow-hidden">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <AreaChart data={chartData} margin={{ top: 12, right: 14, left: -10, bottom: 4 }}>
          <defs>
            <linearGradient id="cavenhusrtWhiteSeries" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.14} />
              <stop offset="100%" stopColor="#FFFFFF" stopOpacity={0.0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            vertical={true}
            horizontal={true}
            stroke="rgba(148, 163, 184, 0.12)"
          />
          <XAxis
            dataKey="displayDate"
            stroke="#8FA3BD"
            tick={{ fill: "#8FA3BD", fontSize: 11 }}
            axisLine={{ stroke: "rgba(148, 163, 184, 0.16)" }}
            tickLine={false}
          />
          <YAxis
            stroke="#8FA3BD"
            tick={{ fill: "#8FA3BD", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
            tickFormatter={(v) => (metric === "revenue" ? `₹${v}` : `${v}`)}
          />
          <Tooltip
            cursor={{ stroke: "rgba(255, 255, 255, 0.25)", strokeDasharray: "3 3" }}
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const p = payload[0]!.payload as SalesChartPoint;
                return (
                  <div className="rounded-xl border border-[#243d5c] bg-[#06182c] px-3.5 py-2.5 text-xs shadow-2xl">
                    <p className="font-medium text-[#9fb2c9]">{p.date}</p>
                    <p className="mt-1 font-mono font-semibold text-white">
                      Revenue: {formatINR(p.revenue)}
                    </p>
                    <p className="font-mono text-[#cbd5e1]">{p.orders} orders</p>
                  </div>
                );
              }
              return null;
            }}
          />
          <Area
            type="linear"
            dataKey={metric}
            stroke="#FFFFFF"
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#cavenhusrtWhiteSeries)"
            dot={{ r: 3.5, fill: "#FFFFFF", strokeWidth: 0 }}
            activeDot={{ r: 5, fill: "#FFFFFF", stroke: "#06182c", strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
