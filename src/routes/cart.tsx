import { createFileRoute, Link } from "@tanstack/react-router";
import { Minus, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { meta } from "@/components/site/InfoPage";
import { getProduct, imageFor } from "@/lib/products";
import { COUPONS, FREE_SHIPPING_THRESHOLD, formatINR } from "@/lib/pricing";
import { Summary } from "@/components/site/Summary";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/cart")({
  head: () => meta("Shopping Bag", "Review your CAVENHURST shopping bag."),
  component: Cart,
});

function Cart() {
  const { cart, setQty, remove, subtotal, coupon, setCoupon } = useStore();
  const [code, setCode] = useState("");
  if (cart.length === 0)
    return (
      <div className="py-28 text-center">
        <h1 className="font-serif text-5xl italic">Your bag is empty</h1>
        <Link
          to="/shop"
          className="mt-6 inline-block rounded-md bg-primary px-6 py-3 text-primary-foreground"
        >
          Continue shopping
        </Link>
      </div>
    );
  const remaining = FREE_SHIPPING_THRESHOLD - subtotal;
  return (
    <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 lg:grid-cols-[1fr_380px]">
      <div>
        <h1 className="font-serif text-5xl italic">Shopping Bag</h1>
        {remaining > 0 && (
          <p className="mt-3 text-sm text-silver">
            Add <span className="font-bold">{formatINR(remaining)}</span> more for free shipping.
          </p>
        )}
        <ul className="mt-8 divide-y divide-border">
          {cart.map((c, i) => {
            const p = getProduct(c.slug);
            const itemName = c.name || p?.name;
            if (!itemName) return null;
            const itemPrice = c.price ?? p?.price ?? 0;
            const itemImage = c.image || (p ? imageFor(p, c.color) : "");
            const maxStock = c.maxStock ?? (p?.stock?.[c.size] ?? 10);

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
                    CAVENHURST
                  </div>
                )}
                <div className="flex flex-1 flex-col">
                  <Link to="/product/$slug" params={{ slug: c.slug }} className="font-bold">
                    {itemName}
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    {c.color} · Size {c.size}
                  </p>
                  <p className="mt-1 font-bold">{formatINR(itemPrice)}</p>
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
                          if (c.qty >= maxStock)
                            toast.error("No more stock in this size");
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
                      className="text-muted-foreground hover:text-sale"
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
        <h2 className="mb-4 text-sm font-bold tracking-brand">ORDER SUMMARY</h2>
        <form
          className="mb-5 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const k = code.trim().toUpperCase();
            if (COUPONS[k]) {
              setCoupon(k);
              toast.success(`${k} applied — ${COUPONS[k].label}`);
            } else toast.error("Invalid coupon code");
          }}
        >
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Coupon code"
            className="flex-1 rounded-md border border-input bg-transparent px-3 py-2 text-sm uppercase outline-none"
          />
          <button className="rounded-md bg-secondary px-4 text-sm font-bold">Apply</button>
        </form>
        {coupon && (
          <button
            onClick={() => setCoupon(null)}
            className="mb-3 text-xs underline text-muted-foreground"
          >
            Remove {coupon}
          </button>
        )}
        <Summary />
        <Link
          to="/checkout"
          className="mt-6 block rounded-md bg-primary py-3.5 text-center font-bold text-primary-foreground"
        >
          Proceed to Checkout
        </Link>
      </aside>
    </div>
  );
}
