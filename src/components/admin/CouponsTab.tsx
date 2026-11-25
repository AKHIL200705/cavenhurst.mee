import { useState } from "react";
import { formatINR } from "@/lib/pricing";
import { Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { saveAdminCouponServerFn, deleteAdminCouponServerFn } from "@/server/admin";

export interface AdminCouponItem {
  id: string;
  code: string;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  min_order_value: number;
  max_discount?: number | null | undefined;
  usage_limit?: number | null | undefined;
  times_used: number;
  expires_at?: string | null | undefined;
  is_active: boolean;
  created_at: string;
}

interface CouponsTabProps {
  coupons: AdminCouponItem[];
  loading: boolean;
  authToken?: string | undefined;
  onRefresh: () => void;
}

export function CouponsTab({ coupons, loading, authToken, onRefresh }: CouponsTabProps) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState<"percentage" | "fixed">("percentage");
  const [discountValue, setDiscountValue] = useState("10");
  const [minOrderValue, setMinOrderValue] = useState("1500");
  const [maxDiscount, setMaxDiscount] = useState("");
  const [usageLimit, setUsageLimit] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const handleCreateCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) {
      toast.error("Coupon code is required");
      return;
    }

    setSubmitting(true);
    try {
      await saveAdminCouponServerFn({
        data: {
          authToken,
          coupon: {
            code: code.trim().toUpperCase(),
            discount_type: discountType,
            discount_value: Number(discountValue) || 0,
            min_order_value: Number(minOrderValue) || 0,
            max_discount: maxDiscount ? Number(maxDiscount) : null,
            usage_limit: usageLimit ? Number(usageLimit) : null,
            is_active: isActive,
          },
        },
      });

      toast.success("Coupon created successfully.");
      setShowAddModal(false);
      setCode("");
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create coupon");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (couponId: string) => {
    if (!window.confirm("Are you sure you want to delete this promotional coupon?")) return;
    try {
      await deleteAdminCouponServerFn({
        data: {
          authToken,
          couponId,
        },
      });
      toast.success("Coupon deleted.");
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete coupon");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-heading text-lg sm:text-xl font-bold uppercase tracking-tight text-foreground">
            Storewide Coupons & Promotional Discounts
          </h2>
          <p className="text-xs text-muted-foreground font-sans">
            Configure server-enforced coupon codes, percentage reductions, and cart eligibility
            limits.
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:opacity-90 transition shadow"
        >
          <Plus className="h-4 w-4" /> Create Coupon
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {coupons.map((c) => (
          <div
            key={c.id}
            className="rounded-xl border border-border bg-card p-5 relative flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="font-mono text-lg font-bold tracking-wider text-gold">
                  {c.code}
                </span>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] font-bold ${
                    c.is_active
                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {c.is_active ? "Active" : "Disabled"}
                </span>
              </div>

              <div className="space-y-1.5 text-xs text-muted-foreground">
                <p>
                  Benefit:{" "}
                  <strong className="text-foreground">
                    {c.discount_type === "percentage"
                      ? `${c.discount_value}% OFF`
                      : `${formatINR(c.discount_value)} OFF`}
                  </strong>
                </p>
                <p>
                  Min Order:{" "}
                  <strong className="text-foreground">
                    {c.min_order_value ? formatINR(c.min_order_value) : "None"}
                  </strong>
                </p>
                <p>
                  Times Redeemed: <strong className="text-foreground">{c.times_used || 0}</strong>
                  {c.usage_limit && ` / ${c.usage_limit}`}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-border/50 pt-3 mt-4">
              <button
                onClick={() => handleDelete(c.id)}
                className="text-muted-foreground hover:text-rose-400 p-1 text-xs"
                title="Delete coupon"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Create Coupon Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between border-b border-border pb-3">
              <div>
                <span className="font-heading text-xs uppercase tracking-wider text-silver">
                  DISCOUNT CAMPAIGN
                </span>
                <h3 className="font-heading text-lg sm:text-xl font-bold uppercase tracking-tight text-foreground">
                  Create Promotional Coupon
                </h3>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="rounded-full p-1.5 text-muted-foreground hover:bg-accent"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateCoupon} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-silver mb-1">Coupon Code</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. HERITAGE20"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  className="w-full rounded-md border border-input bg-background p-2 font-mono uppercase tracking-wider outline-none focus:border-gold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-silver mb-1">Discount Type</label>
                  <select
                    value={discountType}
                    onChange={(e) => setDiscountType(e.target.value as "percentage" | "fixed")}
                    className="w-full rounded-md border border-input bg-background p-2 outline-none"
                  >
                    <option value="percentage">Percentage (%)</option>
                    <option value="fixed">Fixed Amount (₹)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-silver mb-1">Discount Value</label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={discountValue}
                    onChange={(e) => setDiscountValue(e.target.value)}
                    className="w-full rounded-md border border-input bg-background p-2 font-mono outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-silver mb-1">
                    Min Order Value (₹)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={minOrderValue}
                    onChange={(e) => setMinOrderValue(e.target.value)}
                    className="w-full rounded-md border border-input bg-background p-2 font-mono outline-none"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-silver mb-1">
                    Max Cap (₹, optional)
                  </label>
                  <input
                    type="number"
                    min={0}
                    placeholder="e.g. 500"
                    value={maxDiscount}
                    onChange={(e) => setMaxDiscount(e.target.value)}
                    className="w-full rounded-md border border-input bg-background p-2 font-mono outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="flex items-center gap-2 cursor-pointer font-semibold pt-1">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="rounded border-input text-gold"
                  />
                  <span>Activate immediately in checkout</span>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="rounded-md border border-border px-4 py-2 font-semibold hover:bg-accent"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-md bg-primary px-5 py-2 font-bold text-primary-foreground hover:opacity-90 transition disabled:opacity-50"
                >
                  {submitting ? "Saving..." : "Create Coupon"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
