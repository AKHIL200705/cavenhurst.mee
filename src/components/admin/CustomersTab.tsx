import { useState } from "react";
import { formatINR } from "@/lib/pricing";
import { Search, RefreshCw, Mail, Phone } from "lucide-react";

export interface AdminCustomerItem {
  id: string;
  name: string;
  email: string;
  phone: string;
  orderCount: number;
  totalSpent: number;
  createdAt?: string | undefined;
}

interface CustomersTabProps {
  customers: AdminCustomerItem[];
  loading: boolean;
  onRefresh: () => void;
}

export function CustomersTab({ customers, loading, onRefresh }: CustomersTabProps) {
  const [search, setSearch] = useState("");

  const filtered = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase()) ||
      c.phone.includes(search),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-serif text-xl italic">Customer Accounts & Guest Buyers</h2>
          <p className="text-xs text-muted-foreground">
            Aggregated purchasing activity across registered patrons and verified guest
            transactions.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative w-64">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, email, phone..."
              className="w-full rounded-md border border-input bg-card px-3 py-1.5 pr-8 text-xs outline-none focus:border-gold"
            />
            <Search className="absolute right-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <button
            onClick={onRefresh}
            className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-accent"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/40 font-mono text-muted-foreground border-b border-border">
              <tr>
                <th className="p-3.5">Customer Name</th>
                <th className="p-3.5">Email Address</th>
                <th className="p-3.5">Contact Phone</th>
                <th className="p-3.5 text-center">Lifetime Orders</th>
                <th className="p-3.5 text-right">Total Spent</th>
                <th className="p-3.5 text-right">Customer Since</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-silver">
                    <RefreshCw className="mx-auto h-5 w-5 animate-spin mb-2" />
                    Querying customer records...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted-foreground italic">
                    No customers found matching search query.
                  </td>
                </tr>
              ) : (
                filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-accent/20 transition">
                    <td className="p-3.5 font-semibold text-foreground">{c.name}</td>
                    <td className="p-3.5 text-muted-foreground">
                      {c.email ? (
                        <span className="flex items-center gap-1.5">
                          <Mail className="h-3 w-3 text-silver" /> {c.email}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="p-3.5 text-muted-foreground font-mono">
                      {c.phone ? (
                        <span className="flex items-center gap-1.5">
                          <Phone className="h-3 w-3 text-silver" /> {c.phone}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="p-3.5 text-center font-mono font-bold text-foreground">
                      {c.orderCount}
                    </td>
                    <td className="p-3.5 text-right font-mono font-bold text-emerald-400">
                      {formatINR(c.totalSpent)}
                    </td>
                    <td className="p-3.5 text-right font-mono text-[11px] text-muted-foreground">
                      {c.createdAt ? new Date(c.createdAt).toLocaleDateString() : "Guest"}
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
