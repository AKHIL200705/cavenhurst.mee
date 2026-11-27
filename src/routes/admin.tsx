import { Link, createFileRoute } from "@tanstack/react-router";
import { Suspense, lazy, useEffect, useState, useCallback, useRef } from "react";
import { meta } from "@/components/site/InfoPage";
import { Logo } from "@/components/site/Logo";
import { useAuth } from "@/lib/auth";
import { useStore } from "@/lib/store";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  LayoutGrid,
  Package,
  FolderTree,
  Layers,
  Boxes,
  CreditCard,
  Truck,
  RotateCcw,
  Users,
  Ticket,
  BarChart3,
  MessageSquare,
  ShieldCheck,
  ScrollText,
  Settings,
  LogOut,
  RefreshCw,
  Menu,
  Search,
  User,
  Heart,
  ShoppingBag,
  X,
} from "lucide-react";

import { AdminAuthGate } from "@/components/admin/AdminAuthGate";
import type { OverviewData } from "@/components/admin/OverviewTab";
import type { AdminOrderItem } from "@/components/admin/OrdersTab";
import type { AdminProductListItem } from "@/components/admin/ProductsTab";
import type { AdminCategoryItem } from "@/components/admin/CategoriesTab";
import type { AdminVariantItem } from "@/components/admin/VariantsTab";
import type {
  AdminInventoryItem,
  AdminInventoryMovement,
  AdminInventoryVariantRow,
} from "@/components/admin/InventoryTab";
import { PageTransition } from "@/components/ui/page-transition";
import { DashboardSkeleton, TableSkeleton } from "@/components/ui/skeletons";
import type { AdminPaymentItem } from "@/components/admin/PaymentsTab";
import type { AdminShipmentItem } from "@/components/admin/ShipmentsTab";
import type { AdminReturnItem } from "@/components/admin/ReturnsTab";
import type { AdminCustomerItem } from "@/components/admin/CustomersTab";
import type { AdminCouponItem } from "@/components/admin/CouponsTab";
import type { AdminReviewItem } from "@/components/admin/ReviewsTab";
import type { AdminUserRecord } from "@/components/admin/AdminUsersTab";
import type { AdminAuditLogItem, SystemErrorLogItem } from "@/components/admin/AuditLogsTab";
import type { AdminSettingsData } from "@/components/admin/SettingsTab";

const OverviewTab = lazy(() =>
  import("@/components/admin/OverviewTab").then((m) => ({ default: m.OverviewTab })),
);
const AnalyticsTab = lazy(() =>
  import("@/components/admin/AnalyticsTab").then((m) => ({ default: m.AnalyticsTab })),
);
const OrdersTab = lazy(() =>
  import("@/components/admin/OrdersTab").then((m) => ({ default: m.OrdersTab })),
);
const ProductsTab = lazy(() =>
  import("@/components/admin/ProductsTab").then((m) => ({ default: m.ProductsTab })),
);
const CategoriesTab = lazy(() =>
  import("@/components/admin/CategoriesTab").then((m) => ({ default: m.CategoriesTab })),
);
const VariantsTab = lazy(() =>
  import("@/components/admin/VariantsTab").then((m) => ({ default: m.VariantsTab })),
);
const InventoryTab = lazy(() =>
  import("@/components/admin/InventoryTab").then((m) => ({ default: m.InventoryTab })),
);
const PaymentsTab = lazy(() =>
  import("@/components/admin/PaymentsTab").then((m) => ({ default: m.PaymentsTab })),
);
const ShipmentsTab = lazy(() =>
  import("@/components/admin/ShipmentsTab").then((m) => ({ default: m.ShipmentsTab })),
);
const ReturnsTab = lazy(() =>
  import("@/components/admin/ReturnsTab").then((m) => ({ default: m.ReturnsTab })),
);
const CustomersTab = lazy(() =>
  import("@/components/admin/CustomersTab").then((m) => ({ default: m.CustomersTab })),
);
const CouponsTab = lazy(() =>
  import("@/components/admin/CouponsTab").then((m) => ({ default: m.CouponsTab })),
);
const ReviewsTab = lazy(() =>
  import("@/components/admin/ReviewsTab").then((m) => ({ default: m.ReviewsTab })),
);
const AdminUsersTab = lazy(() =>
  import("@/components/admin/AdminUsersTab").then((m) => ({ default: m.AdminUsersTab })),
);
const AuditLogsTab = lazy(() =>
  import("@/components/admin/AuditLogsTab").then((m) => ({ default: m.AuditLogsTab })),
);
const SettingsTab = lazy(() =>
  import("@/components/admin/SettingsTab").then((m) => ({ default: m.SettingsTab })),
);

import {
  getAdminOverviewServerFn,
  getAdminOrdersServerFn,
  getAdminProductsServerFn,
  getAdminCategoriesServerFn,
  getAdminVariantsServerFn,
  getAdminInventoryServerFn,
  getAdminPaymentsServerFn,
  getAdminShipmentsServerFn,
  getAdminReturnsServerFn,
  getAdminCustomersServerFn,
  getAdminCouponsServerFn,
  getAdminReviewsServerFn,
  getAdminUsersServerFn,
  getAdminAuditLogsServerFn,
  getAdminSettingsServerFn,
  getSystemErrorLogsServerFn,
  verifyCurrentAdminServerFn,
  adminLogoutServerFn,
} from "@/server/admin";

export const Route = createFileRoute("/admin")({
  head: () =>
    meta(
      "Operations & Fulfillment Console",
      "CAVENHUSRT Admin Portal — End-to-end e-commerce management system.",
    ),
  component: AdminDashboard,
});

type AdminTab =
  | "overview"
  | "orders"
  | "products"
  | "categories"
  | "variants"
  | "inventory"
  | "payments"
  | "shipments"
  | "returns"
  | "customers"
  | "coupons"
  | "analytics"
  | "settings"
  | "reviews"
  | "admin_users"
  | "audit";

const PRIMARY_NAV_TABS = [
  { id: "overview", label: "Dashboard", icon: LayoutGrid },
  { id: "orders", label: "Orders", icon: ShoppingBag },
  { id: "products", label: "Products", icon: Package },
  { id: "categories", label: "Categories", icon: FolderTree },
  { id: "variants", label: "Variants", icon: Layers },
  { id: "inventory", label: "Inventory", icon: Boxes },
  { id: "payments", label: "Payments", icon: CreditCard },
  { id: "shipments", label: "Logistics", icon: Truck },
  { id: "returns", label: "Returns", icon: RotateCcw },
  { id: "customers", label: "Customers", icon: Users },
  { id: "coupons", label: "Coupons", icon: Ticket },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "settings", label: "Settings", icon: Settings },
] as const;

const SYSTEM_NAV_TABS = [
  { id: "reviews", label: "Reviews", icon: MessageSquare },
  { id: "admin_users", label: "Admin Roles", icon: ShieldCheck },
  { id: "audit", label: "Audit Logs", icon: ScrollText },
] as const;

function AdminTopBar({
  onToggleSidebar,
  showSidebarToggle,
}: {
  onToggleSidebar?: () => void;
  showSidebarToggle: boolean;
}) {
  const { count, wishlist } = useStore();

  return (
    <header className="sticky top-0 z-40 border-b border-[#192c43] bg-[#041426]/95 backdrop-blur-md">
      <div className="grid h-16 grid-cols-[1fr_auto_1fr] items-center px-3 sm:px-6">
        <div className="flex items-center gap-3">
          {showSidebarToggle ? (
            <button
              type="button"
              onClick={onToggleSidebar}
              aria-label="Toggle navigation sidebar"
              className="rounded-lg p-1.5 text-white hover:bg-[#0d233d] transition"
            >
              <Menu className="h-5 w-5 text-white" />
            </button>
          ) : (
            <Link
              to="/"
              aria-label="Back to store"
              className="text-xs font-medium text-[#cbd5e1] hover:text-white transition"
            >
              Storefront
            </Link>
          )}
        </div>

        <Link to="/" aria-label="CAVENHUSRT home" className="justify-self-center">
          <Logo />
        </Link>

        <div className="flex items-center justify-end gap-2 sm:gap-5">
          <Link to="/search" aria-label="Search" className="p-1 text-white hover:opacity-80">
            <Search className="h-5 w-5 text-white" />
          </Link>
          <Link
            to="/account"
            aria-label="Account"
            className="hidden sm:inline-flex p-1 text-white hover:opacity-80"
          >
            <User className="h-5 w-5 text-white" />
          </Link>
          <Link
            to="/wishlist"
            aria-label="Wishlist"
            className="relative hidden sm:inline-flex p-1 text-white hover:opacity-80"
          >
            <Heart className="h-5 w-5 text-white" />
            {wishlist.length > 0 && (
              <span className="absolute -right-1.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-white px-1 text-[10px] font-bold text-[#031323]">
                {wishlist.length}
              </span>
            )}
          </Link>
          <Link
            to="/cart"
            aria-label="Shopping bag"
            className="relative inline-flex p-1 text-white hover:opacity-80"
          >
            <ShoppingBag className="h-5 w-5 text-white" />
            <span className="absolute -right-1.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-white px-1 text-[10px] font-bold text-[#031323]">
              {count}
            </span>
          </Link>
        </div>
      </div>
    </header>
  );
}

function AdminDashboard() {
  const { user, sessionToken, ready, signOut } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [authToken, setAuthToken] = useState<string | undefined>(sessionToken || undefined);
  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  const [loading, setLoading] = useState(false);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  const [categories, setCategories] = useState<AdminCategoryItem[]>([]);
  const [variants, setVariants] = useState<AdminVariantItem[]>([]);
  const [inventory, setInventory] = useState<AdminInventoryItem[]>([]);
  const [inventoryVariantRows, setInventoryVariantRows] = useState<AdminInventoryVariantRow[]>([]);
  const [inventoryMovements, setInventoryMovements] = useState<AdminInventoryMovement[]>([]);

  // Payments, Shipments & Returns state
  const [payments, setPayments] = useState<AdminPaymentItem[]>([]);
  const [shipments, setShipments] = useState<AdminShipmentItem[]>([]);
  const [returns, setReturns] = useState<AdminReturnItem[]>([]);

  // Customers, Coupons, Reviews, Admin Users, Logs & Settings
  const [customers, setCustomers] = useState<AdminCustomerItem[]>([]);
  const [coupons, setCoupons] = useState<AdminCouponItem[]>([]);
  const [reviews, setReviews] = useState<AdminReviewItem[]>([]);
  const [adminUsers, setAdminUsers] = useState<AdminUserRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AdminAuditLogItem[]>([]);
  const [systemErrorLogs, setSystemErrorLogs] = useState<SystemErrorLogItem[]>([]);
  const [settings, setSettings] = useState<AdminSettingsData | null>(null);

  // 1. Check admin authorization strictly via HttpOnly cookie or server-verified cryptographic token
  const verifyAdmin = useCallback(async () => {
    setAuthChecking(true);
    try {
      // Prefer HttpOnly session cookie verification first (no JS token storage needed)
      try {
        const cookieCheck = await verifyCurrentAdminServerFn({ data: {} });
        if (cookieCheck?.isAdmin) {
          setAuthToken(undefined);
          setIsAdmin(true);
          return;
        }
      } catch {
        // Fallback to candidate token checks
      }

      const candidateTokens: string[] = [];

      if (sessionToken) candidateTokens.push(sessionToken);

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token) {
        candidateTokens.push(session.access_token);
      }

      if (typeof window !== "undefined") {
        const stored = localStorage.getItem("cavenhusrt_google_session");
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            if (parsed?.sessionToken && typeof parsed.sessionToken === "string") {
              candidateTokens.push(parsed.sessionToken);
            }
          } catch {
            /* ignore */
          }
        }

        const adminTok = localStorage.getItem("cavenhusrt_admin_token");
        if (adminTok) candidateTokens.push(adminTok);
      }

      for (const candidate of candidateTokens) {
        try {
          const check = await verifyCurrentAdminServerFn({ data: { authToken: candidate } });
          if (check?.isAdmin) {
            setAuthToken(candidate);
            setIsAdmin(true);
            return;
          }
        } catch {
          // Try next candidate token
        }
      }

      setAuthToken(undefined);
      setIsAdmin(false);
    } catch {
      setIsAdmin(false);
    } finally {
      setAuthChecking(false);
    }
  }, [sessionToken]);

  useEffect(() => {
    if (ready) {
      void verifyAdmin();
    }
  }, [ready, user, verifyAdmin]);

  // 2. Fetch tab-specific data (uses optional token OR HttpOnly admin session cookie)
  const loadActiveTabData = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);

    try {
      let token = authToken;
      if (!token && sessionToken) {
        token = sessionToken;
      }
      if (!token) {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        token = session?.access_token;
      }
      if (!token && typeof window !== "undefined") {
        try {
          const stored = localStorage.getItem("cavenhusrt_google_session");
          if (stored) {
            const parsed = JSON.parse(stored);
            if (parsed?.sessionToken) token = parsed.sessionToken;
          }
        } catch {
          /* ignore */
        }
        if (!token) {
          const adminTok = localStorage.getItem("cavenhusrt_admin_token");
          if (adminTok) token = adminTok;
        }
      }

      setAuthToken(token);

      switch (activeTab) {
        case "overview":
        case "analytics": {
          const [res, variantRes] = await Promise.all([
            getAdminOverviewServerFn({ data: { authToken: token } }),
            getAdminVariantsServerFn({ data: { authToken: token } }).catch(() => []),
          ]);
          setOverviewData(res);
          setVariants((variantRes as unknown as AdminVariantItem[]) || []);
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
        case "categories": {
          const res = await getAdminCategoriesServerFn({ data: { authToken: token } });
          setCategories(res as unknown as AdminCategoryItem[]);
          break;
        }
        case "variants": {
          const res = await getAdminVariantsServerFn({ data: { authToken: token } });
          setVariants(res as unknown as AdminVariantItem[]);
          const prodRes = await getAdminProductsServerFn({ data: { authToken: token } });
          setProducts(prodRes as unknown as AdminProductListItem[]);
          break;
        }
        case "inventory": {
          const res = await getAdminInventoryServerFn({ data: { authToken: token } });
          setInventory(res.inventory as AdminInventoryItem[]);
          setInventoryVariantRows((res.variantRows as AdminInventoryVariantRow[]) || []);
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
        case "returns": {
          const res = await getAdminReturnsServerFn({ data: { authToken: token } });
          setReturns(res as unknown as AdminReturnItem[]);
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
        case "reviews": {
          const res = await getAdminReviewsServerFn({ data: { authToken: token } });
          setReviews(res as unknown as AdminReviewItem[]);
          break;
        }
        case "admin_users": {
          const res = await getAdminUsersServerFn({ data: { authToken: token } });
          setAdminUsers(res as unknown as AdminUserRecord[]);
          break;
        }
        case "audit": {
          const [res, errLogs] = await Promise.all([
            getAdminAuditLogsServerFn({ data: { authToken: token } }),
            getSystemErrorLogsServerFn({ data: { authToken: token } }),
          ]);
          setAuditLogs(res);
          setSystemErrorLogs(errLogs);
          break;
        }
        case "settings": {
          const res = await getAdminSettingsServerFn({ data: { authToken: token } });
          setSettings(res ?? null);
          break;
        }
      }
    } catch (err) {
      console.error("[Admin Data Fetch Error]", err);
      const msg = err instanceof Error ? err.message : "Failed to load dashboard data";
      if (msg.includes("Forbidden") || msg.includes("Unauthorized")) {
        if (typeof window !== "undefined") {
          localStorage.removeItem("cavenhusrt_admin_token");
        }
        setAuthToken(undefined);
        setIsAdmin(false);
      }
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [isAdmin, activeTab, orderFilter, orderSearch, orderPage, authToken, sessionToken]);

  useEffect(() => {
    if (isAdmin) {
      void loadActiveTabData();
    }
  }, [isAdmin, activeTab, loadActiveTabData]);

  // 3. Supabase Realtime multi-table subscription (with polling fallback when using server HMAC token)
  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    let activeChannel: ReturnType<typeof supabase.channel> | null = null;
    let pollInterval: ReturnType<typeof setInterval> | null = null;

    const triggerDebouncedRefresh = () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        void loadActiveTabData();
      }, 800);
    };

    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      if (session?.access_token) {
        activeChannel = supabase
          .channel("admin-live-updates")
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "orders" },
            triggerDebouncedRefresh,
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "payments" },
            triggerDebouncedRefresh,
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "inventory" },
            triggerDebouncedRefresh,
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "inventory_movements" },
            triggerDebouncedRefresh,
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "shipments" },
            triggerDebouncedRefresh,
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "profiles" },
            triggerDebouncedRefresh,
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "returns" },
            triggerDebouncedRefresh,
          )
          .subscribe((status) => {
            if (status === "SUBSCRIBED") {
              setRealtimeConnected(true);
            } else if (status === "CLOSED" || status === "CHANNEL_ERROR") {
              setRealtimeConnected(false);
            }
          });
      } else {
        setRealtimeConnected(true);
        pollInterval = setInterval(() => {
          void loadActiveTabData();
        }, 30_000);
      }
    });

    return () => {
      cancelled = true;
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (pollInterval) {
        clearInterval(pollInterval);
      }
      if (activeChannel) {
        void supabase.removeChannel(activeChannel);
      }
    };
  }, [isAdmin, loadActiveTabData]);

  const handleLogout = async () => {
    try {
      localStorage.removeItem("cavenhusrt_admin_token");
    } catch {
      /* ignore */
    }
    await adminLogoutServerFn({}).catch(() => {});
    await signOut();
    setIsAdmin(false);
    setAuthToken(undefined);
    toast.info("Logged out of administrator session.");
  };

  const handleToggleSidebar = () => {
    if (typeof window !== "undefined" && window.innerWidth >= 1024) {
      setSidebarCollapsed((prev) => !prev);
    } else {
      setMobileSidebarOpen((prev) => !prev);
    }
  };

  const handleSelectTab = (tabId: AdminTab) => {
    setActiveTab(tabId);
    setMobileSidebarOpen(false);
  };

  // Auth Checking Loading State
  if (authChecking || !ready) {
    return (
      <div className="min-h-screen bg-[#031323] text-white">
        <AdminTopBar showSidebarToggle={false} />
        <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-7">
          <DashboardSkeleton />
        </main>
      </div>
    );
  }

  // Unauthorized Access Gate
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[#031323]">
        <AdminTopBar showSidebarToggle={false} />
        <AdminAuthGate onAuthenticated={() => void verifyAdmin()} />
      </div>
    );
  }

  const sidebarContent = (isCompact: boolean) => (
    <div className="flex h-full flex-col justify-between bg-[#051629]">
      <nav aria-label="Admin sections" className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {PRIMARY_NAV_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleSelectTab(tab.id)}
              title={tab.label}
              aria-label={tab.label}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs transition ${
                isCompact ? "justify-center px-2" : ""
              } ${
                isActive
                  ? "border border-[#2b4564] bg-[#122741] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                  : "border border-transparent font-medium text-[#cbd5e1] hover:bg-[#0b1f36] hover:text-white"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0 text-white" />
              {!isCompact && <span className="truncate">{tab.label}</span>}
            </button>
          );
        })}

        <div className="my-2 border-t border-[#182c44] pt-2 space-y-1">
          {SYSTEM_NAV_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleSelectTab(tab.id)}
                title={tab.label}
                aria-label={tab.label}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-xs transition ${
                  isCompact ? "justify-center px-2" : ""
                } ${
                  isActive
                    ? "border border-[#2b4564] bg-[#122741] font-semibold text-white"
                    : "border border-transparent font-medium text-[#9fb2c9] hover:bg-[#0b1f36] hover:text-white"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0 text-white" />
                {!isCompact && <span className="truncate">{tab.label}</span>}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Sidebar Footer: Live Sync + Refresh + Log Out */}
      <div className="border-t border-[#182c44] p-3 space-y-2.5">
        <div
          className={`flex items-center ${isCompact ? "justify-center" : "justify-between px-1"} gap-2 text-[11px]`}
          title={
            realtimeConnected
              ? "Live Supabase Realtime active"
              : "Connecting to Supabase Realtime..."
          }
        >
          <span className="flex items-center gap-2 font-medium text-[#4ade80]">
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${
                realtimeConnected ? "bg-emerald-400 animate-pulse" : "bg-[#647a96]"
              }`}
            />
            {!isCompact && (
              <span className={realtimeConnected ? "text-emerald-400" : "text-[#8fa3bd]"}>
                {realtimeConnected ? "Live Sync Active" : "Connecting..."}
              </span>
            )}
          </span>

          {!isCompact && (
            <button
              type="button"
              onClick={() => void loadActiveTabData()}
              disabled={loading}
              aria-label="Refresh current dataset"
              title="Refresh current dataset"
              className="rounded-lg p-1.5 text-white hover:bg-[#102946] transition disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 text-white ${loading ? "animate-spin" : ""}`} />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={handleLogout}
          title="Log Out"
          aria-label="Log Out"
          className={`flex w-full items-center ${
            isCompact ? "justify-center px-2" : "gap-2.5 px-3"
          } rounded-xl border border-[#233a54] bg-[#081c32] py-2 text-xs font-medium text-white hover:bg-[#102946] transition`}
        >
          <LogOut className="h-3.5 w-3.5 shrink-0 text-white" />
          {!isCompact && <span>Log Out</span>}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#031323] text-white flex flex-col overflow-x-clip">
      <AdminTopBar onToggleSidebar={handleToggleSidebar} showSidebarToggle={true} />

      <div className="flex flex-1 min-w-0">
        {/* Desktop Fixed/Collapsible Left Sidebar */}
        <aside
          className={`hidden lg:block shrink-0 border-r border-[#182c44] sticky top-16 h-[calc(100vh-4rem)] transition-all duration-200 ${
            sidebarCollapsed ? "w-[72px]" : "w-56"
          }`}
        >
          {sidebarContent(sidebarCollapsed)}
        </aside>

        {/* Mobile Drawer Sidebar */}
        {mobileSidebarOpen && (
          <div className="fixed inset-0 z-50 flex lg:hidden">
            <div
              className="fixed inset-0 bg-black/70 backdrop-blur-xs"
              onClick={() => setMobileSidebarOpen(false)}
            />
            <aside className="relative z-10 flex h-full w-64 flex-col border-r border-[#182c44] bg-[#051629] shadow-2xl">
              <div className="flex h-16 items-center justify-between border-b border-[#182c44] px-4">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9fb2c9]">
                  OPERATIONS CONSOLE
                </span>
                <button
                  type="button"
                  onClick={() => setMobileSidebarOpen(false)}
                  aria-label="Close sidebar"
                  className="rounded-lg p-1.5 text-white hover:bg-[#102946]"
                >
                  <X className="h-4 w-4 text-white" />
                </button>
              </div>
              <div className="flex-1 overflow-hidden">{sidebarContent(false)}</div>
            </aside>
          </div>
        )}

        {/* Main Content Workspace */}
        <main className="flex-1 min-w-0 px-4 py-6 sm:px-6 lg:px-8 lg:py-7">
          <div className="mx-auto max-w-[1400px]">
            {activeTab !== "overview" && (
              <div className="mb-4 flex items-center justify-between border-b border-[#182c44] pb-3">
                <span className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-[#8fa3bd]">
                  OPERATIONS CONSOLE
                </span>
                <button
                  type="button"
                  onClick={() => void loadActiveTabData()}
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#223954] bg-[#071a30] px-2.5 py-1 text-xs font-medium text-white hover:bg-[#0d243f] transition disabled:opacity-50"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 text-white ${loading ? "animate-spin" : ""}`}
                  />
                  Refresh
                </button>
              </div>
            )}

            <Suspense
              fallback={
                activeTab === "overview" || activeTab === "analytics" ? (
                  <DashboardSkeleton />
                ) : (
                  <TableSkeleton cols={6} rows={6} />
                )
              }
            >
              <PageTransition transitionKey={activeTab}>
                {activeTab === "overview" &&
                  (overviewData ? (
                    <OverviewTab
                      data={overviewData}
                      variants={variants}
                      onNavigateTab={(t) => handleSelectTab(t as AdminTab)}
                    />
                  ) : (
                    <DashboardSkeleton />
                  ))}

                {activeTab === "analytics" &&
                  (overviewData ? (
                    <AnalyticsTab
                      data={overviewData}
                      onNavigateTab={(t) => handleSelectTab(t as AdminTab)}
                    />
                  ) : (
                    <DashboardSkeleton />
                  ))}

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

                {activeTab === "categories" && (
                  <CategoriesTab
                    categories={categories}
                    loading={loading}
                    onRefresh={() => void loadActiveTabData()}
                    authToken={authToken}
                  />
                )}

                {activeTab === "variants" && (
                  <VariantsTab
                    variants={variants}
                    products={products
                      .filter((p): p is typeof p & { id: string } => Boolean(p.id))
                      .map((p) => ({ id: p.id, name: p.name }))}
                    loading={loading}
                    onRefresh={() => void loadActiveTabData()}
                    authToken={authToken}
                  />
                )}

                {activeTab === "inventory" && (
                  <InventoryTab
                    inventory={inventory}
                    variantRows={inventoryVariantRows}
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
                    onInitiateRefund={() => handleSelectTab("orders")}
                  />
                )}

                {activeTab === "shipments" && (
                  <ShipmentsTab
                    shipments={shipments}
                    loading={loading}
                    onRefresh={() => void loadActiveTabData()}
                  />
                )}

                {activeTab === "returns" && (
                  <ReturnsTab
                    returns={returns}
                    loading={loading}
                    onRefresh={() => void loadActiveTabData()}
                    authToken={authToken}
                  />
                )}

                {activeTab === "customers" && (
                  <CustomersTab
                    customers={customers}
                    loading={loading}
                    authToken={authToken}
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

                {activeTab === "reviews" && (
                  <ReviewsTab
                    reviews={reviews}
                    loading={loading}
                    onRefresh={() => void loadActiveTabData()}
                    authToken={authToken}
                  />
                )}

                {activeTab === "admin_users" && (
                  <AdminUsersTab
                    adminUsers={adminUsers}
                    loading={loading}
                    onRefresh={() => void loadActiveTabData()}
                    authToken={authToken}
                  />
                )}

                {activeTab === "audit" && (
                  <AuditLogsTab
                    logs={auditLogs}
                    errorLogs={systemErrorLogs}
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
              </PageTransition>
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  );
}
