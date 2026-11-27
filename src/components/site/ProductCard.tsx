import { Link } from "@tanstack/react-router";
import { Check, Eye, Heart, ShoppingBag } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import {
  SIZES,
  imageFor,
  inStock,
  resolveProductAsset,
  type Product,
  type Size,
} from "@/lib/products";
import { discountPercent, formatINR } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

export function ProductCard({ p, layout = "grid" }: { p: Product; layout?: "grid" | "list" }) {
  const { wishlist, toggleWish, add } = useStore();
  const [color, setColor] = useState(p.colors[0]?.name ?? "");
  const [heartPopping, setHeartPopping] = useState(false);
  const [justAdded, setJustAdded] = useState(false);
  const [quickViewOpen, setQuickViewOpen] = useState(false);
  const [quickSize, setQuickSize] = useState<Size | null>(
    () =>
      SIZES.find((s) => (p.stock[s] ?? 0) > 0 && s === "M") ??
      SIZES.find((s) => (p.stock[s] ?? 0) > 0) ??
      null,
  );

  const wished = wishlist.includes(p.slug);
  const off = discountPercent(p.price, p.mrp);
  const available = inStock(p);

  const primarySrc = imageFor(p, color);
  const secondaryCandidate = p.images.length > 1 ? resolveProductAsset(p.images[1]) : undefined;
  const hoverSrc =
    secondaryCandidate && secondaryCandidate !== primarySrc ? secondaryCandidate : null;

  const handleWishlistClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setHeartPopping(true);
    const added = toggleWish(p.slug);
    toast(added ? "Saved to wishlist" : "Removed from wishlist");
    setTimeout(() => setHeartPopping(false), 380);
  };

  const handleAddToBag = (chosenSize: Size | null, chosenColor: string) => {
    if (!chosenSize || (p.stock[chosenSize] ?? 0) <= 0) {
      toast.error("Out of stock");
      return false;
    }

    if (
      add({
        slug: p.slug,
        name: p.name,
        price: p.price,
        mrp: p.mrp,
        image: imageFor(p, chosenColor),
        size: chosenSize,
        color: chosenColor,
        qty: 1,
        maxStock: p.stock[chosenSize] ?? 0,
      })
    ) {
      setJustAdded(true);
      toast.success(`${p.name} (${chosenSize}) added to bag`);
      setTimeout(() => setJustAdded(false), 750);
      return true;
    }

    toast.error("No more stock in that size");
    return false;
  };

  const quickAdd = () => {
    const fallbackSize =
      SIZES.find((s) => (p.stock[s] ?? 0) > 0 && s === "M") ??
      SIZES.find((s) => (p.stock[s] ?? 0) > 0) ??
      null;
    handleAddToBag(fallbackSize, color);
  };

  const quickStock = quickSize ? (p.stock[quickSize] ?? 0) : 0;

  return (
    <>
      <div
        className={cn(
          "product-card-surface group relative overflow-hidden rounded-xl border border-border/35 bg-paper text-paper-foreground shadow-card",
          layout === "list" && "flex",
        )}
      >
        {/* Product Visual */}
        <Link
          to="/product/$slug"
          params={{ slug: p.slug }}
          className={cn(
            "relative block overflow-hidden bg-paper",
            layout === "list" ? "w-40 shrink-0 sm:w-56" : "aspect-[4/5]",
          )}
        >
          <img
            src={primarySrc}
            key={primarySrc}
            alt={`${p.name} in ${color}`}
            loading="lazy"
            decoding="async"
            width={800}
            height={1000}
            className="product-image h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
          />

          {hoverSrc && (
            <img
              src={hoverSrc}
              alt=""
              aria-hidden="true"
              loading="lazy"
              decoding="async"
              width={800}
              height={1000}
              className="pointer-events-none absolute inset-0 hidden h-full w-full object-cover opacity-0 transition-opacity duration-500 ease-out group-hover:opacity-100 motion-reduce:hidden sm:block"
            />
          )}

          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
        </Link>

        {/* Top-Right Quick Controls: Wishlist + Quick View */}
        <div className="absolute right-2.5 top-2.5 z-20 flex flex-col gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={wished ? "Remove from wishlist" : "Add to wishlist"}
            aria-pressed={wished}
            title={wished ? "Remove from wishlist" : "Add to wishlist"}
            onClick={handleWishlistClick}
            className={cn(
              "glass-paper h-8 w-8 rounded-full border border-border text-paper-foreground hover:bg-paper transition-transform active:scale-90 sm:h-9 sm:w-9",
              heartPopping && "animate-heart-pop",
            )}
          >
            <Heart
              className={cn(
                "h-4 w-4 transition-colors sm:h-4.5 sm:w-4.5",
                wished && "fill-paper-foreground text-paper-foreground",
              )}
            />
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Quick view ${p.name}`}
            title={`Quick view ${p.name}`}
            onClick={(e) => {
              e.stopPropagation();
              setQuickViewOpen(true);
            }}
            className="glass-paper h-8 w-8 rounded-full border border-border text-paper-foreground opacity-90 hover:bg-paper sm:h-9 sm:w-9 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
          >
            <Eye className="h-4 w-4" />
          </Button>
        </div>

        {/* Out of Stock Badge (strict red-only indicator) */}
        {!available && (
          <span className="absolute left-2.5 top-2.5 z-20 rounded border border-red-500/85 bg-red-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm">
            Out of Stock
          </span>
        )}

        {/* Product Meta */}
        <div className="relative z-10 flex flex-1 flex-col gap-1.5 p-3.5 sm:p-4 font-sans">
          <Link
            to="/product/$slug"
            params={{ slug: p.slug }}
            className="text-xs sm:text-sm font-bold uppercase tracking-tight text-paper-foreground hover:text-electric transition-colors line-clamp-1"
          >
            {p.name}
          </Link>

          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-base sm:text-lg font-black tracking-tight text-paper-foreground">
              {formatINR(p.price)}
            </span>
            {off > 0 && (
              <>
                <span className="text-xs font-medium text-paper-foreground/50 line-through">
                  {formatINR(p.mrp)}
                </span>
                <span className="rounded border border-paper-foreground/15 bg-paper-foreground/10 px-1.5 py-0.5 font-heading text-[10px] font-bold uppercase tracking-wider text-paper-foreground">
                  {off}% OFF
                </span>
              </>
            )}
          </div>

          <div className="mt-1 flex items-center justify-between">
            {/* Color Swatches */}
            <div className="flex flex-wrap gap-1.5">
              {p.colors.map((c) => (
                <button
                  type="button"
                  key={c.name}
                  aria-label={c.name}
                  aria-pressed={color === c.name}
                  title={c.name}
                  onClick={() => setColor(c.name)}
                  className={cn(
                    "h-5 w-5 rounded-full border border-paper-foreground/20 p-0 transition-transform hover:scale-110",
                    color === c.name && "ring-2 ring-electric ring-offset-1 scale-105",
                  )}
                  style={{ backgroundColor: c.hex }}
                />
              ))}
            </div>

            {/* Quick Add with Instant Visual Confirmation */}
            <Button
              type="button"
              size="icon"
              aria-label={!available ? "Out of stock" : "Quick add to bag"}
              title={!available ? "Out of stock" : "Quick add to bag"}
              disabled={!available}
              onClick={quickAdd}
              className={cn(
                "rounded-lg transition-all active:scale-95",
                !available
                  ? "border border-red-500/85 bg-red-500/15 text-red-600 opacity-90"
                  : justAdded
                    ? "bg-electric text-white"
                    : "bg-paper-foreground text-paper hover:bg-paper-foreground/90",
              )}
            >
              {justAdded ? <Check className="h-4 w-4" /> : <ShoppingBag className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Quick View Modal */}
      <Dialog open={quickViewOpen} onOpenChange={setQuickViewOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-xl bg-background p-4 sm:p-6">
          <DialogTitle className="font-heading text-xl font-bold uppercase tracking-tight text-foreground">
            {p.name}
          </DialogTitle>
          <div className="mt-2 grid gap-5 sm:grid-cols-2">
            <div className="aspect-[4/5] overflow-hidden rounded-xl bg-paper">
              <img
                src={primarySrc}
                alt={`${p.name} in ${color}`}
                className="h-full w-full object-cover"
              />
            </div>
            <div className="flex flex-col font-sans">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-xl font-black text-foreground">{formatINR(p.price)}</span>
                {off > 0 && (
                  <span className="text-xs text-muted-foreground line-through">
                    {formatINR(p.mrp)}
                  </span>
                )}
              </div>
              <p className="mt-2 text-xs text-muted-foreground line-clamp-3 leading-relaxed">
                {p.description}
              </p>

              {/* Color Picker */}
              <div className="mt-4">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Color: <strong className="text-foreground">{color}</strong>
                </span>
                <div className="mt-2 flex flex-wrap gap-2">
                  {p.colors.map((c) => (
                    <button
                      type="button"
                      key={c.name}
                      aria-label={c.name}
                      onClick={() => setColor(c.name)}
                      className={cn(
                        "h-7 w-7 rounded-full border border-border",
                        color === c.name &&
                          "ring-2 ring-electric ring-offset-2 ring-offset-background",
                      )}
                      style={{ backgroundColor: c.hex }}
                    />
                  ))}
                </div>
              </div>

              {/* Size Picker */}
              <div className="mt-4">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Size
                </span>
                <div className="mt-2 grid grid-cols-3 gap-1.5">
                  {SIZES.map((s) => {
                    const out = (p.stock[s] ?? 0) <= 0;
                    return (
                      <button
                        type="button"
                        key={s}
                        disabled={out}
                        onClick={() => setQuickSize(s)}
                        className={cn(
                          "rounded-md border border-border py-1.5 text-xs font-semibold transition",
                          quickSize === s && "bg-primary text-primary-foreground",
                          out &&
                            "cursor-not-allowed border-red-500/40 text-red-400/80 line-through",
                        )}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-auto space-y-2 pt-5">
                {!available || quickStock <= 0 ? (
                  <Button
                    type="button"
                    disabled
                    className="w-full border border-red-500/80 bg-red-500/15 font-bold uppercase tracking-[0.14em] text-red-400 opacity-100"
                  >
                    Out of Stock
                  </Button>
                ) : (
                  <Button
                    type="button"
                    onClick={() => {
                      if (handleAddToBag(quickSize, color)) {
                        setQuickViewOpen(false);
                      }
                    }}
                    className="w-full font-bold uppercase tracking-[0.14em]"
                  >
                    Add to Bag — {quickSize}
                  </Button>
                )}
                <Link
                  to="/product/$slug"
                  params={{ slug: p.slug }}
                  onClick={() => setQuickViewOpen(false)}
                  className="block text-center text-xs font-semibold text-silver underline-offset-4 hover:underline"
                >
                  View Full Product Details
                </Link>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
