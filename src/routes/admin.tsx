import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { meta } from "@/components/site/InfoPage";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  LayoutDashboard,
  Package,
  Tags,
  Boxes,
  CreditCard,
  Truck,
  Users,
  Ticket,
  ScrollText,
  Sliders,
  LogOut,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

import { AdminAuthGate } from "@/components/admin/AdminAuthGate";
import { OverviewTab, type OverviewData } from "@/components/admin/OverviewTab";
import { OrdersTab, type AdminOrderItem } from "@/components/admin/OrdersTab";
import { ProductsTab, type AdminProductListItem } from "@/components/admin/ProductsTab";
import {
  InventoryTab,
  type AdminInventoryItem,
  type AdminInventoryMovement,
} from "@/components/admin/InventoryTab";
import { PaymentsTab, type AdminPaymentItem } from "@/components/admin/PaymentsTab";
import { ShipmentsTab, type AdminShipmentItem } from "@/components/admin/ShipmentsTab";
import { CustomersTab, type AdminCustomerItem } from "@/components/admin/CustomersTab";
import { CouponsTab, type AdminCouponItem } from "@/components/admin/CouponsTab";
import { AuditLogsTab, type AdminAuditLogItem } from "@/components/admin/AuditLogsTab";
import { SettingsTab, type AdminSettingsData } from "@/components/admin/SettingsTab";

import {
  getAdminOverviewServerFn,
  getAdminOrdersServerFn,
  getAdminProductsServerFn,
  getAdminInventoryServerFn,
  getAdminPaymentsServerFn,
  getAdminShipmentsServerFn,
  getAdminCustomersServerFn,
  getAdminCouponsServerFn,
  getAdminAuditLogsServerFn,
  getAdminSettingsServerFn,
} from "@/server/admin";

export const Route = createFileRoute("/admin")({
  head: () =>
    meta(
      "Operations & Fulfillment Console",
      "CAVENHURST Admin Portal — End-to-end e-commerce management system.",
    ),
  component: AdminDashboard,
});

type AdminTab =
  | "overview"
  | "orders"
  | "products"
  | "inventory"
  | "payments"
  | "shipments"
  | "customers"
  | "coupons"
  | "audit"
  | "settings";

const NAV_TABS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "orders", label: "Orders", icon: Package },
  { id: "products", label: "Products", icon: Tags },
  { id: "inventory", label: "Inventory", icon: Boxes },
  { id: "payments", label: "Payments", icon: CreditCard },
  { id: "shipments", label: "Logistics", icon: Truck },
  { id: "customers", label: "Customers", icon: Users },
  { id: "coupons", label: "Coupons", icon: Ticket },
  { id: "audit", label: "Audit Logs", icon: ScrollText },
  { id: "settings", label: "Settings", icon: Sliders },
] as const;

function AdminDashboard() {
  const { user, ready } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [authToken, setAuthToken] = useState<string | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  const [loading, setLoading] = useState(false);

  // Data states
  const [overviewData, setOverviewData] = useState<OverviewData | null>(null);

  // Orders tab state
  const [orders, setOrders] = useState<AdminOrderItem[]>([]);
  const [totalOrdersCount, setTotalOrdersCount] = useState(0);
  const [orderPage, setOrderPage] = useState(1);
  const [orderFilter, setOrderFilter] = useState("all");
  const [orderSearch, setOrderSearch] = useState("");

  // Products & Inventory state
  const [products, setProducts] = useState<AdminProductListItem[]>([]);
  const [inventory, setInventory] = useState<AdminInventoryItem[]>([]);
  const [inventoryMovements, setInventoryMovements] = useState<AdminInventoryMovement[]>([]);

  // Payments & Shipments state
  const [payments, setPayments] = useState<AdminPaymentItem[]>([]);
  const [shipments, setShipments] = useState<AdminShipmentItem[]>([]);

  // Customers & Coupons & Logs & Settings
  const [customers, setCustomers] = useState<AdminCustomerItem[]>([]);
  const [coupons, setCoupons] = useState<AdminCouponItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AdminAuditLogItem[]>([]);
  const [settings, setSettings] = useState<AdminSettingsData | null>(null);

  // 1. Check admin authorization
  const verifyAdmin = useCallback(async () => {
    setAuthChecking(true);
    try {
      // 1. Check for active direct Google session first
      if (typeof window !== "undefined") {
        const stored = localStorage.getItem("cavenhurst_google_session");
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            if (parsed?.sessionToken && parsed?.user) {
              setAuthToken(parsed.sessionToken);
              if (
                parsed.user.isAdmin ||
                (parsed.user.email &&
                  ["akhilsaiabbireddy2007@gmail.com", "cavenhurst@gmail.com"].includes(
                    parsed.user.email.toLowerCase(),
                  ))
              ) {
                setIsAdmin(true);
                setAuthChecking(false);
                return;
              }
            }
          } catch {
            /* ignore */
          }
        }
      }

      // 2. Check current useAuth user
      if (user) {
        if (
          user.isAdmin ||
          (user.email &&
            ["akhilsaiabbireddy2007@gmail.com", "cavenhurst@gmail.com"].includes(
              user.email.toLowerCase(),
            ))
        ) {
          setIsAdmin(true);
          setAuthChecking(false);
          return;
        }
      }

      // 3. Check Supabase session
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (token) setAuthToken(token);

      if (!session?.user) {
        setIsAdmin(false);
        return;
      }

      const email = session.user.email?.toLowerCase();
      if (email && ["akhilsaiabbireddy2007@gmail.com", "cavenhurst@gmail.com"].includes(email)) {
        setIsAdmin(true);
        setAuthChecking(false);
        return;
      }

      const { data: adminRow } = await supabase
        .from("admin_users")
        .select("id")
        .or(`email.eq.${email},auth_user_id.eq.${session.user.id}`)
        .eq("is_active", true)
        .maybeSingle();

      if (adminRow) {
        setIsAdmin(true);
        setAuthChecking(false);
        return;
      }

      const { data: roleRow } = await supabase
        .from("user_roles")
        .select("role")
        .or(`user_id.eq.${session.user.id},user_id.eq.${email}`)
        .eq("role", "admin")
        .maybeSingle();

      setIsAdmin(Boolean(roleRow));
    } catch {
      setIsAdmin(false);
    } finally {
      setAuthChecking(false);
    }
  }, [user]);

  useEffect(() => {
    if (ready) {
      void verifyAdmin();
    }
  }, [ready, user, verifyAdmin]);

  // 2. Fetch tab-specific data
  const loadActiveTabData = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);

    try {
      let token = authToken;
      if (!token && typeof window !== "undefined") {
        try {
          const stored = localStorage.getItem("cavenhurst_google_session");
          if (stored) {
            const parsed = JSON.parse(stored);
            if (parsed?.sessionToken) token = parsed.sessionToken;
          }
        } catch {
          /* ignore */
        }
      }
      if (!token) {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        token = session?.access_token;
      }
      setAuthToken(token);

      switch (activeTab) {
        case "overview": {
          const res = await getAdminOverviewServerFn({ data: { authToken: token } });
          setOverviewData(res);
          break;
        }
        case "orders": {
          const res = await getAdminOrdersServerFn({
            data: {
              authToken: token,
              filter: orderFilter,
              search: orderSearch,
              page: orderPage,
              limit: 25,
            },
          });
          setOrders(res.orders as unknown as AdminOrderItem[]);
          setTotalOrdersCount(res.totalCount);
          break;
        }
        case "products": {
          const res = await getAdminProductsServerFn({ data: { authToken: token } });
          setProducts(res as unknown as AdminProductListItem[]);
          break;
        }
        case "inventory": {
          const res = await getAdminInventoryServerFn({ data: { authToken: token } });
          setInventory(res.inventory as AdminInventoryItem[]);
          setInventoryMovements(res.recentMovements as AdminInventoryMovement[]);
          break;
        }
        case "payments": {
          const res = await getAdminPaymentsServerFn({ data: { authToken: token } });
          setPayments(res);
          break;
        }
        case "shipments": {
          const res = await getAdminShipmentsServerFn({ data: { authToken: token } });
          setShipments(res);
          break;
        }
        case "customers": {
          const res = await getAdminCustomersServerFn({ data: { authToken: token } });
          setCustomers(res);
          break;
        }
        case "coupons": {
          const res = await getAdminCouponsServerFn({ data: { authToken: token } });
          setCoupons(res as unknown as AdminCouponItem[]);
          break;
        }
        case "audit": {
          const res = await getAdminAuditLogsServerFn({ data: { authToken: token } });
          setAuditLogs(res);
          break;
        }
        case "settings": {
          const res = await getAdminSettingsServerFn({ data: { authToken: token } });
          setSettings(res);
          break;
        }
      }
    } catch (err) {
      console.error("[Admin Data Fetch Error]", err);
      toast.error(err instanceof Error ? err.message : "Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  }, [isAdmin, activeTab, orderFilter, orderSearch, orderPage, authToken]);

  useEffect(() => {
    if (isAdmin) {
      void loadActiveTabData();
    }
  }, [isAdmin, activeTab, loadActiveTabData]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setIsAdmin(false);
    setAuthToken(undefined);
    toast.info("Logged out of administrator session.");
  };

  // Auth Checking Loading State
  if (authChecking || !ready) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
        <RefreshCw className="h-6 w-6 animate-spin text-silver" />
        <p className="font-mono text-xs uppercase tracking-brand text-muted-foreground">
          Authenticating Administrator...
        </p>
      </div>
    );
  }

  // Unauthorized Access Gate
  if (!isAdmin) {
    return <AdminAuthGate onAuthenticated={() => void verifyAdmin()} />;
  }

  return (
    <div className="min-h-screen bg-background pb-16">
      {/* Top Admin App Bar */}
      <div className="border-b border-border bg-card/60 backdrop-blur-md sticky top-0 z-40">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="font-serif text-2xl italic tracking-tight text-foreground">
                CAVENHURST
              </span>
              <span className="hidden sm:inline-block rounded-full border border-gold/40 bg-gold/10 px-2.5 py-0.5 font-mono text-[10px] font-bold text-gold">
                OPERATIONS CONSOLE
              </span>
            </div>

            <div className="flex items-center gap-3 text-xs">
              <div className="hidden md:flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                <span className="font-mono">{user?.email || "Admin"}</span>
              </div>

              <button
                onClick={() => void loadActiveTabData()}
                disabled={loading}
                className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 font-semibold text-foreground hover:bg-accent transition disabled:opacity-50"
                title="Refresh current dataset"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                <span className="hidden sm:inline">Refresh</span>
              </button>

              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 font-semibold text-muted-foreground hover:bg-rose-500/10 hover:text-rose-400 transition"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Log Out</span>
              </button>
            </div>
          </div>

          {/* Navigation Tabs Bar */}
          <div className="flex space-x-1 overflow-x-auto pb-1 pt-1 scrollbar-none">
            {NAV_TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 border-b-2 px-3.5 py-2.5 text-xs font-semibold whitespace-nowrap transition ${
                    isActive
                      ? "border-primary text-foreground font-bold"
                      : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
                  }`}
                >
                  <Icon className={`h-3.5 w-3.5 ${isActive ? "text-gold" : "text-silver"}`} />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Content Workspace */}
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-8">
        {activeTab === "overview" && overviewData && (
          <OverviewTab data={overviewData} onNavigateTab={(t) => setActiveTab(t as AdminTab)} />
        )}

        {activeTab === "orders" && (
          <OrdersTab
            orders={orders}
            totalCount={totalOrdersCount}
            currentPage={orderPage}
            limit={25}
            loading={loading}
            filter={orderFilter}
            search={orderSearch}
            authToken={authToken}
            onFilterChange={(f) => {
              setOrderFilter(f);
              setOrderPage(1);
            }}
            onSearchChange={(s) => {
              setOrderSearch(s);
              setOrderPage(1);
            }}
            onPageChange={(p) => setOrderPage(p)}
            onRefresh={() => void loadActiveTabData()}
          />
        )}

        {activeTab === "products" && (
          <ProductsTab
            products={products}
            loading={loading}
            authToken={authToken}
            onRefresh={() => void loadActiveTabData()}
          />
        )}

        {activeTab === "inventory" && (
          <InventoryTab
            inventory={inventory}
            movements={inventoryMovements}
            loading={loading}
            authToken={authToken}
            onRefresh={() => void loadActiveTabData()}
          />
        )}

        {activeTab === "payments" && (
          <PaymentsTab
            payments={payments}
            loading={loading}
            onRefresh={() => void loadActiveTabData()}
            onInitiateRefund={() => setActiveTab("orders")}
          />
        )}

        {activeTab === "shipments" && (
          <ShipmentsTab
            shipments={shipments}
            loading={loading}
            onRefresh={() => void loadActiveTabData()}
          />
        )}

        {activeTab === "customers" && (
          <CustomersTab
            customers={customers}
            loading={loading}
            onRefresh={() => void loadActiveTabData()}
          />
        )}

        {activeTab === "coupons" && (
          <CouponsTab
            coupons={coupons}
            loading={loading}
            authToken={authToken}
            onRefresh={() => void loadActiveTabData()}
          />
        )}

        {activeTab === "audit" && (
          <AuditLogsTab
            logs={auditLogs}
            loading={loading}
            onRefresh={() => void loadActiveTabData()}
          />
        )}

        {activeTab === "settings" && (
          <SettingsTab
            settings={settings}
            authToken={authToken}
            onRefresh={() => void loadActiveTabData()}
          />
        )}
      </main>
    </div>
  );
}
