import { Link } from "@tanstack/react-router";
import { Heart, ShoppingBag } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { SIZES, imageFor, inStock, type Product } from "@/lib/products";
import { discountPercent, formatINR } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function ProductCard({ p, layout = "grid" }: { p: Product; layout?: "grid" | "list" }) {
  const { wishlist, toggleWish, add } = useStore();
  const [color, setColor] = useState(p.colors[0]?.name ?? "");
  const wished = wishlist.includes(p.slug);
  const off = discountPercent(p.price, p.mrp);
  const available = inStock(p);

  const quickAdd = () => {
    const size =
      SIZES.find((s) => (p.stock[s] ?? 0) > 0 && s === "M") ??
      SIZES.find((s) => (p.stock[s] ?? 0) > 0);
    if (!size) {
      toast.error("Out of stock");
      return;
    }
    if (add({ slug: p.slug, size, color, qty: 1 }))
      toast.success(`${p.name} (${size}) added to bag`);
    else toast.error("No more stock in that size");
  };

  return (
    <div
      className={cn(
        "product-motion group relative overflow-hidden rounded-lg bg-paper text-paper-foreground shadow-card",
        layout === "list" && "flex",
      )}
    >
      <Link
        to="/product/$slug"
        params={{ slug: p.slug }}
        className={cn(
          "block overflow-hidden",
          layout === "list" ? "w-40 shrink-0 sm:w-56" : "aspect-[4/5]",
        )}
      >
        <img
          src={imageFor(p, color)}
          key={color}
          alt={`${p.name} in ${color}`}
          loading="lazy"
          width={800}
          height={1000}
          className="product-image h-full w-full object-cover"
        />
      </Link>
      <Button
        variant="ghost"
        size="icon"
        aria-label={wished ? "Remove from wishlist" : "Add to wishlist"}
        aria-pressed={wished}
        title={wished ? "Remove from wishlist" : "Add to wishlist"}
        onClick={() => toast(toggleWish(p.slug) ? "Saved to wishlist" : "Removed from wishlist")}
        className="glass-paper absolute right-3 top-3 rounded-full border border-border text-paper-foreground hover:bg-paper"
      >
        <Heart className={cn("h-5 w-5", wished && "fill-sale text-sale")} />
      </Button>
      {!available && (
        <span className="absolute left-3 top-3 rounded bg-paper-foreground px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-paper">
          Sold out
        </span>
      )}
      <div className="flex flex-1 flex-col gap-1.5 p-3 sm:p-4">
        <Link
          to="/product/$slug"
          params={{ slug: p.slug }}
          className="text-sm font-bold leading-tight sm:text-base"
        >
          {p.name}
        </Link>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-base font-extrabold sm:text-lg">{formatINR(p.price)}</span>
          {off > 0 && (
            <>
              <span className="text-xs text-paper-foreground/50 line-through">
                {formatINR(p.mrp)}
              </span>
              <span className="rounded bg-sale px-1.5 py-0.5 text-[10px] font-bold text-destructive-foreground">
                {off}% OFF
              </span>
            </>
          )}
        </div>
        <div className="mt-1 flex items-center justify-between">
          <div className="flex gap-1.5">
            {p.colors.map((c) => (
              <Button
                variant="ghost"
                size="icon"
                key={c.name}
                aria-label={c.name}
                aria-pressed={color === c.name}
                title={c.name}
                onClick={() => setColor(c.name)}
                className={cn(
                  "h-5 w-5 rounded-full border border-paper-foreground/20 p-0",
                  color === c.name && "ring-2 ring-electric ring-offset-1",
                )}
                style={{ backgroundColor: c.hex }}
              />
            ))}
          </div>
          <Button
            size="icon"
            aria-label="Quick add to bag"
            title="Quick add to bag"
            disabled={!available}
            onClick={quickAdd}
            className="rounded-lg bg-paper-foreground text-paper hover:bg-paper-foreground/90 disabled:opacity-30"
          >
            <ShoppingBag className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
