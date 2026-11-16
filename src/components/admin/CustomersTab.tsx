import { useState } from "react";
import { formatINR } from "@/lib/pricing";
import { Search, RefreshCw, Mail, Phone, Download, Eye, MapPin, Package, CreditCard, X, Loader2 } from "lucide-react";
import { getAdminCustomerDetailsServerFn } from "@/server/admin";
import { toast } from "sonner";

export interface AdminCustomerItem {
  id: string;
  name: string;
  email: string;
  phone: string;
  loginProvider?: string | null | undefined;
  orderCount: number;
  totalSpent: number;
  status?: string | null | undefined;
  authUid?: string | null | undefined;
  createdAt?: string | null | undefined;
  lastLogin?: string | null | undefined;
}

interface CustomersTabProps {
  customers: AdminCustomerItem[];
  loading: boolean;
  onRefresh: () => void;
  authToken?: string | undefined;
}

export function CustomersTab({ customers, loading, onRefresh, authToken }: CustomersTabProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [customerDetails, setCustomerDetails] = useState<{
    customer: any;
    addresses: any[];
    orders: any[];
    payments: any[];
  } | null>(null);

  const filtered = customers.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase()) ||
      c.phone.includes(search) ||
      (c.authUid && c.authUid.toLowerCase().includes(search.toLowerCase()));

    if (!matchesSearch) return false;

    if (statusFilter === "with_orders") return c.orderCount > 0;
    if (statusFilter === "active") return c.status === "active";
    if (statusFilter === "inactive") return c.status !== "active";

    return true;
  });

  const handleExportCSV = () => {
    if (filtered.length === 0) {
      toast.error("No customers to export");
      return;
    }

    const headers = [
      "Customer Name",
      "Email Address",
      "Phone",
      "Auth Provider / UID",
      "Account Status",
      "Total Orders",
      "Total Spent (INR)",
      "Registration Date",
    ];

    const rows = filtered.map((c) => [
      `"${c.name.replace(/"/g, '""')}"`,
      `"${c.email.replace(/"/g, '""')}"`,
      `"${c.phone.replace(/"/g, '""')}"`,
      `"${(c.authUid || c.loginProvider || "").replace(/"/g, '""')}"`,
      `"${c.status || "active"}"`,
      c.orderCount,
      c.totalSpent,
      `"${c.createdAt ? new Date(c.createdAt).toLocaleDateString("en-IN") : ""}"`,
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `cavenhurst-customers-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(`Exported ${filtered.length} customer records to CSV`);
  };

  const handleViewDetails = async (customerId: string) => {
    setSelectedCustomerId(customerId);
    setLoadingDetails(true);
    try {
      const data = await getAdminCustomerDetailsServerFn({
        data: { authToken, customerId },
      });
      setCustomerDetails(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load customer details");
      setSelectedCustomerId(null);
    } finally {
      setLoadingDetails(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-serif text-xl italic">Customer Directory & Management</h2>
          <p className="text-xs text-muted-foreground">
            Authoritative customer identities, contact parameters, lifetime expenditures, and order history.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-64">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, email, phone, UID..."
              className="w-full rounded-md border border-input bg-card px-3 py-1.5 pr-8 text-xs outline-none focus:border-gold"
            />
            <Search className="absolute right-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-md border border-input bg-card px-3 py-1.5 text-xs outline-none"
          >
            <option value="all">All Customers</option>
            <option value="with_orders">Has Orders (&gt;0)</option>
            <option value="active">Active Accounts</option>
            <option value="inactive">Inactive Accounts</option>
          </select>

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-accent"
          >
            <Download className="h-3.5 w-3.5" /> Export CSV
          </button>

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
                <th className="p-3.5">Auth UID / Provider</th>
                <th className="p-3.5 text-center">Orders</th>
                <th className="p-3.5 text-right">Lifetime Spend</th>
                <th className="p-3.5 text-center">Status</th>
                <th className="p-3.5 text-right">Joined</th>
                <th className="p-3.5 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-silver">
                    <RefreshCw className="mx-auto h-5 w-5 animate-spin mb-2" />
                    Querying customer records...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-muted-foreground italic">
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
                    <td className="p-3.5 text-muted-foreground">
                      {c.phone ? (
                        <span className="flex items-center gap-1.5">
                          <Phone className="h-3 w-3 text-silver" /> {c.phone}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="p-3.5 font-mono text-[11px] text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-bold uppercase">
                          {c.loginProvider || "AUTH"}
                        </span>
                        <span className="truncate max-w-[120px]" title={c.authUid || ""}>
                          {c.authUid ? c.authUid.slice(0, 12) + "..." : "—"}
                        </span>
                      </div>
                    </td>
                    <td className="p-3.5 text-center font-mono font-semibold">
                      <span className="rounded-full bg-secondary/80 px-2 py-0.5 text-[11px]">
                        {c.orderCount}
                      </span>
                    </td>
                    <td className="p-3.5 text-right font-mono font-semibold text-foreground">
                      {formatINR(c.totalSpent)}
                    </td>
                    <td className="p-3.5 text-center">
                      <span
                        className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                          c.status === "active"
                            ? "bg-emerald-500/10 text-emerald-500"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {c.status || "active"}
                      </span>
                    </td>
                    <td className="p-3.5 text-right text-muted-foreground">
                      {c.createdAt
                        ? new Date(c.createdAt).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })
                        : "—"}
                    </td>
                    <td className="p-3.5 text-center">
                      <button
                        onClick={() => handleViewDetails(c.id)}
                        className="flex items-center gap-1 rounded border border-border px-2 py-1 text-[11px] font-semibold hover:bg-accent text-primary"
                      >
                        <Eye className="h-3 w-3" /> Details
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Customer Details Modal */}
      {selectedCustomerId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-border bg-card p-6 shadow-2xl space-y-6">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div>
                <h3 className="font-serif text-xl italic text-foreground">
                  {customerDetails?.customer?.full_name || "Customer Details"}
                </h3>
                <p className="text-xs text-muted-foreground">
                  Account ID: <span className="font-mono">{selectedCustomerId}</span>
                </p>
              </div>
              <button
                onClick={() => {
                  setSelectedCustomerId(null);
                  setCustomerDetails(null);
                }}
                className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {loadingDetails ? (
              <div className="py-16 text-center text-silver">
                <Loader2 className="mx-auto h-8 w-8 animate-spin mb-3 text-primary" />
                Retrieving customer details, address book and order timeline...
              </div>
            ) : customerDetails ? (
              <div className="space-y-6 text-xs">
                {/* Profile Overview */}
                <div className="grid gap-3 sm:grid-cols-3 rounded-lg border border-border bg-muted/20 p-4">
                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase font-mono">Email Address</span>
                    <p className="font-semibold text-foreground">{customerDetails.customer.email || "—"}</p>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase font-mono">Contact Phone</span>
                    <p className="font-semibold text-foreground">{customerDetails.customer.phone || "—"}</p>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase font-mono">Auth UID / Sub</span>
                    <p className="font-mono text-foreground truncate" title={customerDetails.customer.auth_provider_uid || ""}>
                      {customerDetails.customer.auth_provider_uid || "—"}
                    </p>
                  </div>
                </div>

                {/* Addresses */}
                <div>
                  <h4 className="font-bold flex items-center gap-1.5 text-sm mb-3">
                    <MapPin className="h-4 w-4 text-primary" /> Saved Address Book ({customerDetails.addresses.length})
                  </h4>
                  {customerDetails.addresses.length === 0 ? (
                    <p className="text-muted-foreground italic">No addresses saved in address book.</p>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {customerDetails.addresses.map((a: any) => (
                        <div key={a.id} className="rounded-lg border border-border p-3 space-y-1">
                          <div className="flex items-center justify-between font-semibold">
                            <span>{a.full_name}</span>
                            {a.is_default && (
                              <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded font-mono">
                                DEFAULT
                              </span>
                            )}
                          </div>
                          <p className="text-muted-foreground">{a.phone}</p>
                          <p>{a.address_line1}{a.address_line2 ? `, ${a.address_line2}` : ""}</p>
                          <p className="text-muted-foreground">{a.city}, {a.state} - {a.postal_code}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Orders */}
                <div>
                  <h4 className="font-bold flex items-center gap-1.5 text-sm mb-3">
                    <Package className="h-4 w-4 text-primary" /> Order History ({customerDetails.orders.length})
                  </h4>
                  {customerDetails.orders.length === 0 ? (
                    <p className="text-muted-foreground italic">No orders placed yet.</p>
                  ) : (
                    <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
                      {customerDetails.orders.map((o: any) => (
                        <div key={o.id} className="p-3 flex items-center justify-between hover:bg-accent/10">
                          <div>
                            <span className="font-mono font-bold text-foreground">#{o.order_number || o.id.slice(0, 8)}</span>
                            <span className="ml-2 rounded bg-secondary px-1.5 py-0.5 text-[10px] font-bold uppercase">
                              {o.status}
                            </span>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              {new Date(o.created_at).toLocaleDateString("en-IN", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              })}
                            </p>
                          </div>
                          <div className="text-right">
                            <span className="font-mono font-bold">{formatINR(o.total)}</span>
                            <p className="text-[11px] text-silver capitalize">{o.payment_status || "Pending"}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Payments */}
                <div>
                  <h4 className="font-bold flex items-center gap-1.5 text-sm mb-3">
                    <CreditCard className="h-4 w-4 text-primary" /> Payment Records ({customerDetails.payments.length})
                  </h4>
                  {customerDetails.payments.length === 0 ? (
                    <p className="text-muted-foreground italic">No payment transactions recorded.</p>
                  ) : (
                    <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
                      {customerDetails.payments.map((p: any) => (
                        <div key={p.id} className="p-3 flex items-center justify-between hover:bg-accent/10">
                          <div>
                            <span className="font-mono font-bold text-foreground">
                              {p.razorpay_payment_id || p.id.slice(0, 8)}
                            </span>
                            <span className="ml-2 rounded bg-secondary px-1.5 py-0.5 text-[10px] font-bold uppercase">
                              {p.status}
                            </span>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              {p.payment_method?.toUpperCase()} via {p.gateway}
                            </p>
                          </div>
                          <div className="text-right">
                            <span className="font-mono font-bold">{formatINR(p.amount)}</span>
                            <p className="text-[11px] text-muted-foreground">
                              {new Date(p.created_at).toLocaleDateString("en-IN")}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            <div className="flex justify-end pt-4 border-t border-border">
              <button
                onClick={() => {
                  setSelectedCustomerId(null);
                  setCustomerDetails(null);
                }}
                className="rounded-md border border-border px-4 py-2 text-xs font-semibold hover:bg-accent"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
