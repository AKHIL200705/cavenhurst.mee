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
 * Isolated Recharts analytics view so heavy charting code is lazy-loaded on demand.
 */
export default function SalesRevenueChart({ chartData, metric }: SalesRevenueChartProps) {
  return (
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
                const p = payload[0]!.payload as SalesChartPoint;
                return (
                  <div className="rounded-lg border border-border bg-popover p-3 text-xs shadow-xl">
                    <p className="font-semibold text-foreground">{p.date}</p>
                    <p className="mt-1 font-mono font-bold text-emerald-400">
                      Settled Revenue: {formatINR(p.revenue)}
                    </p>
                    <p className="font-mono text-amber-400">{p.orders} orders</p>
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
  );
}
