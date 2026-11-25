import { Link } from "@tanstack/react-router";
import { Heart, ShoppingBag } from "lucide-react";
import { useState, useRef, useCallback } from "react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { SIZES, imageFor, inStock, type Product } from "@/lib/products";
import { discountPercent, formatINR } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function ProductCard({ p, layout = "grid" }: { p: Product; layout?: "grid" | "list" }) {
  const { wishlist, toggleWish, add } = useStore();
  const [color, setColor] = useState(p.colors[0]?.name ?? "");
  const [heartPopping, setHeartPopping] = useState(false);
  const [addingBag, setAddingBag] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const wished = wishlist.includes(p.slug);
  const off = discountPercent(p.price, p.mrp);
  const available = inStock(p);

  // 3D Tilt and Specular Physics
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const card = cardRef.current;
    if (!card) return;

    // Check prefers-reduced-motion
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    // Max rotation 8 degrees for luxury understated aesthetic
    const rotateX = ((y - centerY) / centerY) * -8;
    const rotateY = ((x - centerX) / centerX) * 8;

    const glareX = (x / rect.width) * 100;
    const glareY = (y / rect.height) * 100;

    card.style.setProperty("--rotate-x", `${rotateX.toFixed(2)}deg`);
    card.style.setProperty("--rotate-y", `${rotateY.toFixed(2)}deg`);
    card.style.setProperty("--card-scale", "1.015");
    card.style.setProperty("--glare-x", `${glareX.toFixed(1)}%`);
    card.style.setProperty("--glare-y", `${glareY.toFixed(1)}%`);
    card.style.setProperty("--glare-opacity", "0.75");
  }, []);

  const handleMouseLeave = useCallback(() => {
    const card = cardRef.current;
    if (!card) return;

    card.style.setProperty("--rotate-x", "0deg");
    card.style.setProperty("--rotate-y", "0deg");
    card.style.setProperty("--card-scale", "1");
    card.style.setProperty("--glare-opacity", "0");
  }, []);

  const handleWishlistClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setHeartPopping(true);
    const added = toggleWish(p.slug);
    toast(added ? "Saved to wishlist" : "Removed from wishlist");
    setTimeout(() => setHeartPopping(false), 400);
  };

  const quickAdd = () => {
    const size =
      SIZES.find((s) => (p.stock[s] ?? 0) > 0 && s === "M") ??
      SIZES.find((s) => (p.stock[s] ?? 0) > 0);
    if (!size) {
      toast.error("Out of stock");
      return;
    }

    setAddingBag(true);
    if (add({ slug: p.slug, size, color, qty: 1 })) {
      toast.success(`${p.name} (${size}) added to bag`);
    } else {
      toast.error("No more stock in that size");
    }
    setTimeout(() => setAddingBag(false), 500);
  };

  return (
    <div className="perspective-container">
      <div
        ref={cardRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className={cn(
          "product-card-3d group relative overflow-hidden rounded-xl bg-paper text-paper-foreground shadow-card",
          layout === "list" && "flex",
        )}
      >
        {/* Specular Glare Surface */}
        <div className="specular-glare" />

        {/* Product Visual */}
        <Link
          to="/product/$slug"
          params={{ slug: p.slug }}
          className={cn(
            "relative block overflow-hidden",
            layout === "list" ? "w-40 shrink-0 sm:w-56" : "aspect-[4/5]",
          )}
        >
          <img
            src={imageFor(p, color)}
            key={color}
            alt={`${p.name} in ${color}`}
            loading="lazy"
            decoding="async"
            width={800}
            height={1000}
            className="product-image h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
          />

          {/* Luxury ambient shade vignette */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
        </Link>

        {/* Wishlist Button with Heart Pop Micro-Animation */}
        <Button
          variant="ghost"
          size="icon"
          aria-label={wished ? "Remove from wishlist" : "Add to wishlist"}
          aria-pressed={wished}
          title={wished ? "Remove from wishlist" : "Add to wishlist"}
          onClick={handleWishlistClick}
          className={cn(
            "glass-paper absolute right-3 top-3 z-20 rounded-full border border-border text-paper-foreground hover:bg-paper transition-transform active:scale-90",
            heartPopping && "animate-heart-pop",
          )}
        >
          <Heart className={cn("h-5 w-5 transition-colors", wished && "fill-sale text-sale")} />
        </Button>

        {/* Stock Badge */}
        {!available && (
          <span className="absolute left-3 top-3 z-20 rounded bg-paper-foreground px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-paper shadow-sm">
            Sold out
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
                <span className="rounded bg-sale px-1.5 py-0.5 font-heading text-[10px] font-bold uppercase tracking-wider text-destructive-foreground">
                  {off}% OFF
                </span>
              </>
            )}
          </div>

          <div className="mt-1 flex items-center justify-between">
            {/* Color Swatches */}
            <div className="flex gap-1.5">
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

            {/* Quick Add with Active Animation */}
            <Button
              size="icon"
              aria-label="Quick add to bag"
              title="Quick add to bag"
              disabled={!available}
              onClick={quickAdd}
              className={cn(
                "rounded-lg bg-paper-foreground text-paper hover:bg-paper-foreground/90 disabled:opacity-30 transition-all active:scale-95",
                addingBag && "scale-110 bg-electric text-white",
              )}
            >
              <ShoppingBag className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
