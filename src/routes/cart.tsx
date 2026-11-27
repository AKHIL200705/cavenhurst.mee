import { createFileRoute, Link } from "@tanstack/react-router";
import { Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { meta } from "@/components/site/InfoPage";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingButton } from "@/components/ui/loading-button";
import { SIZES, getProduct, imageFor, resolveProductAsset, type Size } from "@/lib/products";
import { calculateOrderPricingPaise, FREE_SHIPPING_THRESHOLD, formatINR } from "@/lib/pricing";
import { Summary } from "@/components/site/Summary";
import { useStore } from "@/lib/store";
import { validateCouponServerFn } from "@/server/orders";

export const Route = createFileRoute("/cart")({
  head: () =>
    meta("Shopping Bag", "Review your CAVENHUSRT shopping bag.", {
      path: "/cart",
      noIndex: true,
    }),
  component: Cart,
});

function Cart() {
  const { cart, setQty, updateVariant, remove, subtotal, coupon, couponRule, setCoupon } =
    useStore();
  const [code, setCode] = useState("");
  const [applyingCoupon, setApplyingCoupon] = useState(false);

  if (cart.length === 0)
    return (
      <div className="mx-auto max-w-4xl px-4 py-16">
        <EmptyState
          icon={ShoppingBag}
          title="Your bag is empty"
          description="Explore CAVENHUSRT apparel and add pieces to your shopping bag."
          action={
            <Link
              to="/shop"
              className="inline-block rounded-md bg-primary px-8 py-3.5 font-sans text-xs sm:text-sm font-bold uppercase tracking-[0.16em] text-primary-foreground shadow-lg hover:opacity-90 transition-opacity"
            >
              Continue shopping
            </Link>
          }
        />
      </div>
    );

  const pricing = calculateOrderPricingPaise({
    subtotalRupees: subtotal,
    couponCode: coupon,
    couponRule,
  });
  const remaining = Math.max(0, FREE_SHIPPING_THRESHOLD - pricing.subtotal + pricing.discount);
  return (
    <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 lg:grid-cols-[1fr_380px] font-sans">
      <div>
        <h1 className="font-heading text-4xl sm:text-6xl font-bold uppercase tracking-tight leading-none text-foreground">
          Shopping Bag
        </h1>
        {remaining > 0 && (
          <p className="mt-3 text-xs sm:text-sm text-silver font-medium">
            Add <span className="font-bold text-foreground">{formatINR(remaining)}</span> more for
            free shipping.
          </p>
        )}
        <ul className="mt-8 divide-y divide-border">
          {cart.map((c, i) => {
            const p = getProduct(c.slug);
            const itemName = c.name || p?.name;
            if (!itemName) return null;
            const itemPrice = c.price ?? p?.price ?? 0;
            const itemImage = resolveProductAsset(c.image) || (p ? imageFor(p, c.color) : "");
            const stockMap = c.sizeStock || p?.stock || {};
            const maxStock = c.maxStock ?? stockMap[c.size] ?? 10;
            const availableSizes = SIZES.filter((s) => (stockMap[s] ?? 1) > 0 || s === c.size);
            const availableColors =
              c.availableColors && c.availableColors.length > 0
                ? c.availableColors
                : p?.colors.map((col) => col.name) || [c.color];

            return (
              <li
                key={`${c.slug}-${c.size}-${c.color}`}
                className="flex gap-4 py-5 animate-in fade-in"
              >
                {itemImage ? (
                  <img
                    src={itemImage}
                    alt={itemName}
                    className="h-32 w-24 rounded-lg bg-paper object-cover"
                  />
                ) : (
                  <div className="h-32 w-24 rounded-lg bg-muted flex items-center justify-center text-xs text-muted-foreground">
                    CAVENHUSRT
                  </div>
                )}
                <div className="flex flex-1 flex-col">
                  <Link to="/product/$slug" params={{ slug: c.slug }} className="font-bold">
                    {itemName}
                  </Link>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {availableColors.length > 1 ? (
                      <select
                        aria-label={`Color for ${itemName}`}
                        value={c.color}
                        onChange={(e) => {
                          if (!updateVariant(i, c.size, e.target.value)) {
                            toast.error("Selected colour is currently unavailable");
                          }
                        }}
                        className="rounded border border-border bg-background px-2 py-1 text-xs font-medium text-foreground outline-none focus:border-electric"
                      >
                        {availableColors.map((colName) => (
                          <option key={colName} value={colName}>
                            {colName}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span>{c.color}</span>
                    )}
                    <span aria-hidden="true">·</span>
                    <select
                      aria-label={`Size for ${itemName}`}
                      value={c.size}
                      onChange={(e) => {
                        const nextSize = e.target.value as Size;
                        if (!updateVariant(i, nextSize, c.color)) {
                          toast.error(`Size ${nextSize} is out of stock`);
                        }
                      }}
                      className="rounded border border-border bg-background px-2 py-1 text-xs font-medium text-foreground outline-none focus:border-electric"
                    >
                      {availableSizes.map((s) => (
                        <option key={s} value={s}>
                          Size {s}
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className="mt-1.5 font-bold">{formatINR(itemPrice)}</p>
                  <div className="mt-auto flex items-center justify-between">
                    <div className="flex items-center rounded-md border border-border">
                      <button
                        aria-label="Decrease"
                        onClick={() => setQty(i, c.qty - 1)}
                        className="p-2"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="w-8 text-center text-sm">{c.qty}</span>
                      <button
                        aria-label="Increase"
                        onClick={() => {
                          if (c.qty >= maxStock) toast.error("No more stock in this size");
                          setQty(i, c.qty + 1);
                        }}
                        className="p-2"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <button
                      aria-label="Remove"
                      onClick={() => remove(i)}
                      className="text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
      <aside className="h-fit rounded-xl border border-border bg-card p-6 lg:sticky lg:top-24">
        <h2 className="mb-4 font-heading text-base font-bold uppercase tracking-wider text-foreground">
          ORDER SUMMARY
        </h2>
        <form
          className="mb-5 flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const k = code.trim().toUpperCase();
            if (!k) {
              toast.error("Enter a coupon code");
              return;
            }
            setApplyingCoupon(true);
            try {
              const res = await validateCouponServerFn({
                data: { code: k, subtotalRupees: subtotal },
              });
              if (res.valid && res.rule) {
                setCoupon(res.rule.code, res.rule);
                setCode("");
                toast.success(res.message);
              } else {
                toast.error(res.message || "Invalid coupon code");
              }
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Could not verify coupon");
            } finally {
              setApplyingCoupon(false);
            }
          }}
        >
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Coupon code (e.g. CAVEN10)"
            disabled={applyingCoupon}
            className="flex-1 rounded-md border border-input bg-transparent px-3 py-2 text-xs uppercase font-bold tracking-wider outline-none focus:border-electric disabled:opacity-60"
          />
          <LoadingButton
            type="submit"
            variant="secondary"
            loading={applyingCoupon}
            loadingText="Applying"
            className="px-4 text-xs font-bold uppercase tracking-wider"
          >
            Apply
          </LoadingButton>
        </form>
        {coupon && (
          <button
            type="button"
            onClick={() => setCoupon(null, null)}
            className="mb-3 text-xs underline text-muted-foreground hover:text-foreground"
          >
            Remove {coupon}
          </button>
        )}
        <Summary couponCodeOverride={coupon} couponRuleOverride={couponRule} />
        <Link
          to="/checkout"
          search={{ mode: "cart" }}
          className="mt-6 block rounded-md bg-primary py-3.5 text-center font-sans text-xs sm:text-sm font-bold uppercase tracking-[0.16em] text-primary-foreground shadow-lg hover:opacity-90 transition-opacity"
        >
          Proceed to Checkout
        </Link>
      </aside>
    </div>
  );
}
