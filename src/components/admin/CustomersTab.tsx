import { useState, useMemo } from "react";
import { formatINR } from "@/lib/pricing";
import {
  Search,
  RefreshCw,
  Mail,
  Phone,
  Download,
  Eye,
  MapPin,
  Package,
  CreditCard,
  X,
  Loader2,
  Copy,
  CheckCircle2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { getAdminCustomerDetailsServerFn } from "@/server/admin";
import type { Tables } from "@/integrations/supabase/types";
import { toast } from "sonner";

type CustomerOrderSummary = {
  id: string;
  order_number: string | null;
  total: number;
  status: string;
  payment_status: string | null;
  shipment_status: string | null;
  awb_number: string | null;
  created_at: string;
  items: unknown;
};

interface CustomerDetailsState {
  customer: Tables<"customers">;
  addresses: Tables<"customer_addresses">[];
  orders: CustomerOrderSummary[];
  payments: Tables<"payments">[];
}

export interface AdminCustomerItem {
  id: string;
  name: string;
  email: string;
  phone: string;
  mobileNumber?: string | null | undefined;
  profileCompleted?: boolean | null | undefined;
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
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [customerDetails, setCustomerDetails] = useState<CustomerDetailsState | null>(null);

  // Filter customers based on search query and status dropdown
  const filtered = useMemo(() => {
    return customers.filter((c) => {
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        (c.mobileNumber && c.mobileNumber.includes(q)) ||
        (c.authUid && c.authUid.toLowerCase().includes(q)) ||
        c.id.toLowerCase().includes(q);

      if (!matchesSearch) return false;

      if (statusFilter === "profile_completed") return c.profileCompleted === true;
      if (statusFilter === "profile_incomplete") return c.profileCompleted !== true;
      if (statusFilter === "with_orders") return c.orderCount > 0;
      if (statusFilter === "active") return c.status === "active";
      if (statusFilter === "inactive") return c.status !== "active";

      return true;
    });
  }, [customers, search, statusFilter]);

  // Pagination slice
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginatedCustomers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage, pageSize]);

  const handleCopy = (text: string, label: string) => {
    if (!text) return;
    navigator.clipboard
      .writeText(text)
      .then(() => toast.success(`Copied ${label} to clipboard`))
      .catch(() => toast.error("Could not copy to clipboard"));
  };

  const handleExportCSV = () => {
    if (filtered.length === 0) {
      toast.error("No customers to export");
      return;
    }

    const headers = [
      "Customer Name",
      "Email Address",
      "Mobile / Contact Number",
      "Profile Status",
      "Auth Provider",
      "Auth UUID",
      "Total Orders",
      "Lifetime Spend (INR)",
      "Account Status",
      "Registration Date",
    ];

    const rows = filtered.map((c) => [
      `"${c.name.replace(/"/g, '""')}"`,
      `"${c.email.replace(/"/g, '""')}"`,
      `"${(c.mobileNumber || c.phone || "").replace(/"/g, '""')}"`,
      `"${c.profileCompleted ? "Completed" : "Incomplete"}"`,
      `"${(c.loginProvider || "email").replace(/"/g, '""')}"`,
      `"${(c.authUid || c.id).replace(/"/g, '""')}"`,
      c.orderCount,
      c.totalSpent,
      `"${c.status || "active"}"`,
      `"${c.createdAt ? new Date(c.createdAt).toLocaleDateString("en-IN") : ""}"`,
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `cavenhurst-customers-${new Date().toISOString().slice(0, 10)}.csv`,
    );
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
          <h2 className="font-heading text-lg sm:text-xl font-bold uppercase tracking-tight text-foreground">
            Customer Directory & Management
          </h2>
          <p className="text-xs text-muted-foreground font-sans">
            Authoritative customer identities, mobile verification status, lifetime expenditures,
            and order history.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative w-64">
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search name, email, phone, UUID..."
              className="w-full rounded-md border border-input bg-card px-3 py-1.5 pr-8 text-xs text-foreground outline-none focus:border-electric"
            />
            <Search className="absolute right-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="rounded-md border border-input bg-card px-3 py-1.5 text-xs text-foreground outline-none"
          >
            <option value="all">All Customers ({customers.length})</option>
            <option value="profile_completed">✓ Profile Completed</option>
            <option value="profile_incomplete">⚠ Profile Incomplete</option>
            <option value="with_orders">Has Orders (&gt;0)</option>
            <option value="active">Active Accounts</option>
            <option value="inactive">Inactive Accounts</option>
          </select>

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-accent transition"
          >
            <Download className="h-3.5 w-3.5" /> Export CSV
          </button>

          <button
            onClick={onRefresh}
            className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-accent transition"
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
                <th className="p-3.5">Mobile Number</th>
                <th className="p-3.5 text-center">Profile Status</th>
                <th className="p-3.5">Auth UID / Provider</th>
                <th className="p-3.5 text-center">Orders</th>
                <th className="p-3.5 text-right">Lifetime Spend</th>
                <th className="p-3.5 text-center">Account</th>
                <th className="p-3.5 text-right">Registered</th>
                <th className="p-3.5 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-silver">
                    <RefreshCw className="mx-auto h-5 w-5 animate-spin mb-2" />
                    Querying customer records...
                  </td>
                </tr>
              ) : paginatedCustomers.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-muted-foreground italic">
                    No customers found matching search criteria.
                  </td>
                </tr>
              ) : (
                paginatedCustomers.map((c) => {
                  const displayPhone = c.mobileNumber || c.phone;
                  const cleanPhone = displayPhone ? displayPhone.replace(/\D/g, "").slice(-10) : "";

                  return (
                    <tr key={c.id} className="hover:bg-accent/20 transition">
                      {/* Name */}
                      <td className="p-3.5 font-semibold text-foreground">
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary text-[11px] font-bold text-foreground">
                            {c.name ? c.name.charAt(0).toUpperCase() : "C"}
                          </div>
                          <span>{c.name}</span>
                        </div>
                      </td>

                      {/* Email */}
                      <td className="p-3.5 text-muted-foreground">
                        {c.email ? (
                          <span className="flex items-center gap-1.5">
                            <Mail className="h-3 w-3 text-silver" /> {c.email}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>

                      {/* Mobile Number */}
                      <td className="p-3.5 text-muted-foreground">
                        {cleanPhone ? (
                          <div className="flex items-center gap-1.5 font-mono">
                            <Phone className="h-3 w-3 text-silver" />
                            <span>+91 {cleanPhone}</span>
                            <button
                              onClick={() => handleCopy(`+91${cleanPhone}`, "mobile number")}
                              title="Copy mobile number"
                              className="text-muted-foreground hover:text-foreground"
                            >
                              <Copy className="h-2.5 w-2.5" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-muted-foreground/60 italic">Not provided</span>
                        )}
                      </td>

                      {/* Profile Status */}
                      <td className="p-3.5 text-center">
                        {c.profileCompleted ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-500">
                            <CheckCircle2 className="h-3 w-3" /> Completed
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-500">
                            <AlertCircle className="h-3 w-3" /> Incomplete
                          </span>
                        )}
                      </td>

                      {/* Auth UID & Provider */}
                      <td className="p-3.5 font-mono text-[11px] text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-bold uppercase">
                            {c.loginProvider || "AUTH"}
                          </span>
                          <span className="truncate max-w-[100px]" title={c.authUid || c.id}>
                            {(c.authUid || c.id).slice(0, 8)}...
                          </span>
                          <button
                            onClick={() => handleCopy(c.authUid || c.id, "customer UUID")}
                            title="Copy customer UUID"
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <Copy className="h-2.5 w-2.5" />
                          </button>
                        </div>
                      </td>

                      {/* Orders */}
                      <td className="p-3.5 text-center font-mono font-semibold">
                        <span className="rounded-full bg-secondary/80 px-2 py-0.5 text-[11px]">
                          {c.orderCount}
                        </span>
                      </td>

                      {/* Lifetime Spend */}
                      <td className="p-3.5 text-right font-mono font-semibold text-foreground">
                        {formatINR(c.totalSpent)}
                      </td>

                      {/* Status */}
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

                      {/* Registered Date */}
                      <td className="p-3.5 text-right text-muted-foreground">
                        {c.createdAt
                          ? new Date(c.createdAt).toLocaleDateString("en-IN", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })
                          : "—"}
                      </td>

                      {/* Actions */}
                      <td className="p-3.5 text-center">
                        <button
                          onClick={() => handleViewDetails(c.id)}
                          className="flex items-center gap-1 rounded border border-border px-2 py-1 text-[11px] font-semibold hover:bg-accent text-primary"
                        >
                          <Eye className="h-3 w-3" /> Details
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Toolbar */}
        {!loading && filtered.length > 0 && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-t border-border px-4 py-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <span>
                Showing {(currentPage - 1) * pageSize + 1} to{" "}
                {Math.min(currentPage * pageSize, filtered.length)} of {filtered.length} customers
              </span>
              <span className="mx-1">•</span>
              <span>Rows per page:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="rounded border border-input bg-card px-2 py-0.5 text-xs text-foreground outline-none"
              >
                <option value={10}>10</option>
                <option value={15}>15</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </div>

            <div className="flex items-center gap-1">
              <button
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="rounded p-1.5 border border-border hover:bg-accent disabled:opacity-40 disabled:pointer-events-none"
                aria-label="Previous Page"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>

              <span className="px-2 font-mono">
                {currentPage} / {totalPages}
              </span>

              <button
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="rounded p-1.5 border border-border hover:bg-accent disabled:opacity-40 disabled:pointer-events-none"
                aria-label="Next Page"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Customer Details Modal */}
      {selectedCustomerId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-border bg-card p-6 shadow-2xl space-y-6">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div>
                <h3 className="font-heading text-lg sm:text-xl font-bold uppercase tracking-tight text-foreground">
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
                    <span className="text-[10px] text-muted-foreground uppercase font-mono">
                      Email Address
                    </span>
                    <p className="font-semibold text-foreground">
                      {customerDetails.customer.email || "—"}
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase font-mono">
                      Contact Phone
                    </span>
                    <p className="font-semibold text-foreground font-mono">
                      {customerDetails.customer.phone
                        ? `+91 ${customerDetails.customer.phone.replace(/\D/g, "").slice(-10)}`
                        : "—"}
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase font-mono">
                      Auth UID / Sub
                    </span>
                    <p
                      className="font-mono text-foreground truncate"
                      title={customerDetails.customer.auth_provider_uid || ""}
                    >
                      {customerDetails.customer.auth_provider_uid || "—"}
                    </p>
                  </div>
                </div>

                {/* Addresses */}
                <div>
                  <h4 className="font-bold flex items-center gap-1.5 text-sm mb-3">
                    <MapPin className="h-4 w-4 text-primary" /> Saved Address Book (
                    {customerDetails.addresses.length})
                  </h4>
                  {customerDetails.addresses.length === 0 ? (
                    <p className="text-muted-foreground italic bg-muted/10 p-3 rounded-lg border border-border">
                      No addresses saved on file.
                    </p>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {customerDetails.addresses.map((addr) => (
                        <div
                          key={addr.id}
                          className="rounded-lg border border-border bg-card p-3 space-y-1"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-foreground">{addr.full_name}</span>
                            {addr.is_default && (
                              <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[9px] font-bold text-primary uppercase">
                                Default
                              </span>
                            )}
                          </div>
                          <p className="text-muted-foreground font-mono">{addr.phone}</p>
                          <p className="text-muted-foreground">{addr.address_line1}</p>
                          {addr.address_line2 && (
                            <p className="text-muted-foreground">{addr.address_line2}</p>
                          )}
                          <p className="text-muted-foreground">
                            {addr.city}, {addr.state} - {addr.postal_code}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Orders History */}
                <div>
                  <h4 className="font-bold flex items-center gap-1.5 text-sm mb-3">
                    <Package className="h-4 w-4 text-primary" /> Order History (
                    {customerDetails.orders.length})
                  </h4>
                  {customerDetails.orders.length === 0 ? (
                    <p className="text-muted-foreground italic bg-muted/10 p-3 rounded-lg border border-border">
                      No orders placed yet.
                    </p>
                  ) : (
                    <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
                      {customerDetails.orders.map((ord) => (
                        <div
                          key={ord.id}
                          className="flex items-center justify-between p-3 bg-card hover:bg-accent/10 transition"
                        >
                          <div>
                            <span className="font-mono font-bold text-foreground">
                              #{ord.order_number || ord.id.slice(0, 8)}
                            </span>
                            <span className="ml-2 text-muted-foreground">
                              {new Date(ord.created_at).toLocaleDateString("en-IN", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              })}
                            </span>
                          </div>
                          <div className="flex items-center gap-4">
                            <span className="font-mono font-bold text-foreground">
                              {formatINR(ord.total)}
                            </span>
                            <span className="rounded bg-secondary px-2 py-0.5 text-[10px] font-bold uppercase font-mono">
                              {ord.status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Payments */}
                <div>
                  <h4 className="font-bold flex items-center gap-1.5 text-sm mb-3">
                    <CreditCard className="h-4 w-4 text-primary" /> Payment Transactions (
                    {customerDetails.payments.length})
                  </h4>
                  {customerDetails.payments.length === 0 ? (
                    <p className="text-muted-foreground italic bg-muted/10 p-3 rounded-lg border border-border">
                      No payment transaction logs available.
                    </p>
                  ) : (
                    <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
                      {customerDetails.payments.map((pmt) => (
                        <div key={pmt.id} className="flex items-center justify-between p-3 bg-card">
                          <div>
                            <span className="font-mono font-bold text-foreground">
                              {(pmt.gateway || "razorpay").toUpperCase()} •{" "}
                              {pmt.razorpay_payment_id || pmt.id.slice(0, 8)}
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-mono font-bold text-foreground">
                              {formatINR(pmt.amount)}
                            </span>
                            <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-500">
                              {pmt.status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
