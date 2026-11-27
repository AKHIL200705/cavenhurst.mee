import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import {
  Check,
  ChevronRight,
  Heart,
  Minus,
  Plus,
  Truck,
  Star,
  Rotate3d,
  ZoomIn,
  ZoomOut,
  Sparkles,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { LoadingButton } from "@/components/ui/loading-button";
import { RouteLoadingSkeleton } from "@/components/ui/skeletons";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ProductCard } from "@/components/site/ProductCard";
import { SIZES, imageFor, type Size, type Product } from "@/lib/products";
import { discountPercent, formatINR } from "@/lib/pricing";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { meta } from "@/components/site/InfoPage";
import {
  getProductBySlugServerFn,
  getProductReviewsServerFn,
  submitProductReviewServerFn,
  getStoreCatalogServerFn,
} from "@/server/catalog";
import { checkPincodeServiceabilityFn } from "@/server/orders";
import { useAuth } from "@/lib/auth";

export interface ProductReviewItem {
  id: string;
  customer_name: string;
  rating: number;
  title?: string | null;
  review_text: string;
  created_at?: string | null;
}

export const Route = createFileRoute("/product/$slug")({
  loader: async ({
    params,
  }): Promise<{ product: Product; reviews: ProductReviewItem[]; related: Product[] }> => {
    let p: Product | null = null;
    try {
      p = await getProductBySlugServerFn({ data: { slug: params.slug } });
    } catch {
      p = null;
    }
    if (!p) throw notFound();

    let reviews: ProductReviewItem[] = [];
    try {
      reviews = (await getProductReviewsServerFn({
        data: { productSlug: params.slug },
      })) as ProductReviewItem[];
    } catch {
      reviews = [];
    }

    let related: Product[] = [];
    try {
      const catalog = await getStoreCatalogServerFn();
      if (catalog) {
        related = catalog.filter((x) => x.slug !== p.slug && x.category === p.category).slice(0, 4);
      }
    } catch {
      related = [];
    }

    return { product: p, reviews, related };
  },
  head: ({ loaderData }) => ({
    meta: loaderData?.product
      ? [
          { title: `${loaderData.product.name} | CAVENHUSRT` },
          { name: "description", content: loaderData.product.description },
          { property: "og:title", content: `${loaderData.product.name} | CAVENHUSRT` },
          { property: "og:description", content: loaderData.product.description },
          { property: "og:type", content: "product" },
          { name: "twitter:card", content: "summary_large_image" },
        ]
      : meta("Product", "Discover CAVENHUSRT premium everyday apparel.").meta,
  }),
  pendingComponent: () => <RouteLoadingSkeleton variant="product" />,
  component: ProductPage,
});

function ProductPage() {
  const { product: p, reviews: reviewsList, related } = Route.useLoaderData();
  const { user, sessionToken } = useAuth();
  const { add, startDirectBuy, toggleWish, wishlist } = useStore();
  const navigate = useNavigate();
  const [img, setImg] = useState(0);
  const [color, setColor] = useState(p.colors[0]?.name || "Default");
  const [size, setSize] = useState<Size | null>(null);
  const [qty, setQty] = useState(1);
  const [pin, setPin] = useState("");
  const [pinMsg, setPinMsg] = useState("");
  const [checkingPin, setCheckingPin] = useState(false);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewName, setReviewName] = useState(user?.user_metadata?.full_name || "");
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewTitle, setReviewTitle] = useState("");
  const [reviewText, setReviewText] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);

  // Multi-Angle Viewer & Zoom State
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [zoomActive, setZoomActive] = useState(false);
  const [zoomPos, setZoomPos] = useState({ x: 50, y: 50 });
  const [addedToBag, setAddedToBag] = useState(false);
  const [buyingNow, setBuyingNow] = useState(false);
  const addedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (addedTimerRef.current) clearTimeout(addedTimerRef.current);
    };
  }, []);

  const off = discountPercent(p.price, p.mrp);
  const stock = size ? (p.stock[size] ?? 0) : 0;
  const allOut = SIZES.every((s) => (p.stock[s] ?? 0) <= 0);
  const isSelectedOut = allOut || (Boolean(size) && stock <= 0);
  const main = imageFor(p, color);
  const gallery = [main, ...p.images.filter((i) => i !== main), main, main].slice(0, 4);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsDragging(true);
    setDragStartX(e.clientX);
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));

    if (isDragging) {
      const deltaX = e.clientX - dragStartX;
      const threshold = 35;
      if (Math.abs(deltaX) > threshold) {
        const step = deltaX > 0 ? -1 : 1;
        setImg((prev) => (prev + step + gallery.length) % gallery.length);
        setDragStartX(e.clientX);
      }
    } else {
      setZoomPos({ x, y });
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsDragging(false);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const handlePointerLeave = () => {
    setIsDragging(false);
  };

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast.error("Please sign in to submit a review.");
      return;
    }
    if (!reviewText.trim()) {
      toast.error("Please provide review text.");
      return;
    }
    setSubmittingReview(true);
    try {
      await submitProductReviewServerFn({
        data: {
          authToken: sessionToken ?? undefined,
          productSlug: p.slug,
          customerName: reviewName.trim() || "Verified Buyer",
          rating: reviewRating,
          title: reviewTitle.trim() || undefined,
          reviewText: reviewText.trim(),
        },
      });
      toast.success("Thank you! Your review has been submitted for moderation.");
      setReviewText("");
      setReviewTitle("");
      setShowReviewForm(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to submit review");
    } finally {
      setSubmittingReview(false);
    }
  };

  const addToBag = () => {
    if (!size) {
      toast.error("Please select a size");
      return;
    }
    if (stock <= 0) {
      toast.error("This size is out of stock");
      return;
    }
    if (
      !add({
        slug: p.slug,
        name: p.name,
        price: p.price,
        mrp: p.mrp,
        image: main,
        size,
        color,
        qty,
        maxStock: stock,
      })
    ) {
      toast.error(`Only ${stock} left in ${size}`);
      return;
    }
    toast.success(`Added to bag — ${p.name}, ${color}, ${size}`);
    setAddedToBag(true);
    if (addedTimerRef.current) clearTimeout(addedTimerRef.current);
    addedTimerRef.current = setTimeout(() => setAddedToBag(false), 1800);
  };

  const buyNow = () => {
    if (buyingNow) return;
    if (!size) {
      toast.error("Please select a size");
      return;
    }
    if (stock <= 0) {
      toast.error("This size is out of stock");
      return;
    }
    setBuyingNow(true);
    if (
      !startDirectBuy({
        slug: p.slug,
        name: p.name,
        price: p.price,
        mrp: p.mrp,
        image: main,
        size,
        color,
        qty,
        maxStock: stock,
      })
    ) {
      setBuyingNow(false);
      toast.error(`Only ${stock} left in ${size}`);
      return;
    }
    void navigate({ to: "/checkout", search: { mode: "direct" } });
  };

  const checkPin = async () => {
    if (!/^[1-9]\d{5}$/.test(pin)) {
      setPinMsg("Enter a valid 6-digit PIN code.");
      return;
    }
    setCheckingPin(true);
    try {
      const res = await checkPincodeServiceabilityFn({
        data: { pincode: pin, paymentMode: "prepaid" },
      });
      if (!res.serviceable) {
        if (res.providerStatus === "pending_credentials") {
          setPinMsg(
            `PIN ${pin} format valid — live ShipMaxx360 courier serviceability check is pending merchant credentials.`,
          );
          return;
        }
        setPinMsg(res.message || `Delivery currently unavailable for PIN ${pin}.`);
        return;
      }
      const etaDays = res.estimatedDays || 5;
      const d = new Date();
      d.setDate(d.getDate() + etaDays);
      const courier = res.courierPartner ? ` via ${res.courierPartner}` : "";
      const codInfo = res.codAvailable ? "COD & Online available." : "Prepaid available.";
      setPinMsg(
        `Delivery to ${pin}${courier} in ~${etaDays} business days (est. ${d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}). ${codInfo}`,
      );
    } catch (err) {
      setPinMsg(err instanceof Error ? err.message : "Could not check delivery availability.");
    } finally {
      setCheckingPin(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <nav className="mb-6 flex min-w-0 items-center gap-2 overflow-hidden text-sm text-muted-foreground">
        <Link to="/" className="hover:text-foreground">
          Home
        </Link>
        <ChevronRight className="h-4 w-4" />
        <Link to="/shop" className="hover:text-foreground">
          Shop
        </Link>
        <ChevronRight className="h-4 w-4" />
        <span className="truncate font-bold text-foreground">{p.name}</span>
      </nav>
      <div className="grid gap-10 lg:grid-cols-2">
        <div className="min-w-0">
          {/* Multi-Angle 3D Product Viewer */}
          <div
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onPointerLeave={handlePointerLeave}
            className={cn(
              "group relative aspect-[4/5] overflow-hidden rounded-2xl bg-paper select-none shadow-card touch-none",
              isDragging ? "cursor-grabbing" : zoomActive ? "cursor-zoom-out" : "cursor-grab",
            )}
            title="Drag horizontally to switch angles | Click zoom to inspect texture"
          >
            {/* Editorial Heritage Label */}
            <div className="pointer-events-none absolute top-4 left-4 z-20">
              <div className="flex items-center gap-2 rounded-full border border-silver/30 bg-black/60 px-3.5 py-1.5 text-[10px] font-mono tracking-widest text-silver backdrop-blur-md shadow-xl">
                <Sparkles className="h-3 w-3 text-silver" />
                <span>HERITAGE CRAFT • 260 GSM</span>
              </div>
            </div>

            {allOut && (
              <div className="pointer-events-none absolute top-4 right-4 z-20 rounded border border-red-500/85 bg-red-600 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm">
                Out of Stock
              </div>
            )}

            {/* Rotation Control Indicator */}
            <div className="absolute bottom-4 right-4 z-20 flex items-center gap-1.5 rounded-full border border-white/20 bg-black/55 px-3 py-1.5 text-[11px] text-white/90 backdrop-blur-md pointer-events-none shadow-md">
              <Rotate3d className="h-3.5 w-3.5 text-silver" />
              <span>Angle {img + 1}/4 (Drag to rotate)</span>
            </div>

            {/* Texture Zoom Toggle */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setZoomActive((v) => !v);
              }}
              aria-pressed={zoomActive}
              aria-label={zoomActive ? "Reset zoom" : "Zoom in on product image"}
              className="absolute bottom-4 left-4 z-20 flex items-center gap-1.5 rounded-full border border-white/20 bg-black/55 px-3 py-1.5 text-[11px] text-white/90 backdrop-blur-md hover:bg-black/75 transition shadow-md"
            >
              {zoomActive ? (
                <ZoomOut className="h-3.5 w-3.5 text-silver" />
              ) : (
                <ZoomIn className="h-3.5 w-3.5 text-silver" />
              )}
              <span>{zoomActive ? "Reset Zoom" : "2x Zoom"}</span>
            </button>

            {/* Smooth Crossfade Product Image */}
            <img
              key={`${color}-${img}`}
              src={gallery[img]}
              alt={`${p.name} perspective ${img + 1}`}
              width={800}
              height={1000}
              decoding="async"
              draggable={false}
              className={cn(
                "h-full w-full object-cover animate-in fade-in duration-300 transition-transform ease-out motion-reduce:animate-none",
                zoomActive ? "scale-[2.2]" : "scale-100",
              )}
              style={
                zoomActive
                  ? {
                      transformOrigin: `${zoomPos.x}% ${zoomPos.y}%`,
                    }
                  : undefined
              }
            />
          </div>

          {/* Angle Thumbnails */}
          <div className="mt-4 grid grid-cols-4 gap-3">
            {gallery.map((g, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setImg(i)}
                aria-label={`View angle ${i + 1}`}
                className={cn(
                  "group relative aspect-square overflow-hidden rounded-xl border-2 bg-paper transition-all",
                  img === i
                    ? "border-electric ring-2 ring-electric/30 scale-105 shadow-md"
                    : "border-transparent opacity-75 hover:opacity-100",
                )}
              >
                <img
                  src={g}
                  alt={`${p.name} thumbnail ${i + 1}`}
                  loading="lazy"
                  decoding="async"
                  className={cn("h-full w-full object-cover", i % 2 && "scale-x-[-1]")}
                />
                <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 font-mono text-[9px] text-white">
                  {i === 0 ? "Front" : i === 1 ? "Profile" : i === 2 ? "Back" : "Macro"}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="min-w-0 font-sans">
          <p className="font-heading text-xs uppercase tracking-brand text-electric">CAVENHUSRT</p>
          <h1 className="mt-2 font-heading text-3xl sm:text-5xl lg:text-6xl font-bold uppercase tracking-tight leading-none text-foreground">
            {p.name}
          </h1>
          <div className="mt-4 flex flex-wrap items-baseline gap-3">
            <span className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">
              {formatINR(p.price)}
            </span>
            {off > 0 && (
              <>
                <span className="text-base font-medium text-muted-foreground line-through">
                  {formatINR(p.mrp)}
                </span>
                <span className="rounded border border-border bg-secondary px-2.5 py-0.5 font-heading text-xs font-bold uppercase tracking-wider text-foreground">
                  {off}% OFF
                </span>
              </>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Inclusive of all taxes</p>
          <p className="mt-5 text-sm sm:text-base text-silver leading-relaxed">{p.description}</p>

          <div className="mt-6">
            <p className="text-xs uppercase font-bold tracking-wider text-muted-foreground">
              Color: <span className="text-foreground font-extrabold">{color}</span>
            </p>
            <div className="mt-2 flex gap-2">
              {p.colors.map((c) => (
                <button
                  key={c.name}
                  aria-label={c.name}
                  onClick={() => {
                    setColor(c.name);
                    setImg(0);
                  }}
                  className={cn(
                    "h-9 w-9 rounded-full border border-border",
                    color === c.name && "ring-2 ring-electric ring-offset-2 ring-offset-background",
                  )}
                  style={{ background: c.hex }}
                />
              ))}
            </div>
          </div>

          <div className="mt-6">
            <div className="flex items-center justify-between text-xs uppercase font-bold tracking-wider">
              <span>
                Size{size && <span className="text-foreground font-extrabold">: {size}</span>}
              </span>
              <Dialog>
                <DialogTrigger className="underline text-silver hover:text-foreground">
                  Size guide
                </DialogTrigger>
                <DialogContent className="w-[calc(100vw-2rem)] max-w-md bg-background">
                  <DialogTitle className="font-heading text-2xl font-bold uppercase tracking-tight">
                    Size guide (inches)
                  </DialogTitle>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-silver">
                          <th className="py-2">Size</th>
                          <th>Chest</th>
                          <th>Length</th>
                          <th>Shoulder</th>
                        </tr>
                      </thead>
                      <tbody>
                        {SIZES.map((s, i) => (
                          <tr key={s} className="border-t border-border">
                            <td className="py-2">{s}</td>
                            <td>{38 + i * 2}</td>
                            <td>{27 + i}</td>
                            <td>{18 + i}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
              {SIZES.map((s) => {
                const out = (p.stock[s] ?? 0) <= 0;
                return (
                  <button
                    key={s}
                    type="button"
                    disabled={out}
                    aria-pressed={size === s}
                    aria-label={out ? `Size ${s} out of stock` : undefined}
                    title={out ? `${s} — Out of stock` : `Select size ${s}`}
                    onClick={() => {
                      setSize(s);
                      setQty(1);
                    }}
                    className={cn(
                      "rounded-md border border-border py-2.5 text-sm transition-all duration-150",
                      size === s &&
                        "border-foreground bg-primary font-bold text-primary-foreground shadow-sm",
                      !out && size !== s && "hover:border-silver/70 hover:bg-card",
                      out &&
                        "cursor-not-allowed border-red-500/50 bg-red-500/10 text-red-400 line-through opacity-80",
                    )}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
            {allOut && (
              <p className="mt-2 inline-flex items-center rounded border border-red-500/75 bg-red-500/15 px-2.5 py-0.5 text-xs font-semibold text-red-400">
                Out of Stock
              </p>
            )}
            {size && stock > 0 && stock <= 5 && (
              <p className="mt-2 text-xs text-silver">
                Only {stock} left in {size}
              </p>
            )}
            {size && stock > 5 && (
              <p className="mt-2 text-xs text-muted-foreground">In stock — Ready to ship</p>
            )}
          </div>

          <div className="mt-6 flex items-center gap-3">
            <div className="flex items-center rounded-md border border-border">
              <button
                aria-label="Decrease"
                onClick={() => setQty(Math.max(1, qty - 1))}
                className="p-3"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-8 text-center font-bold">{qty}</span>
              <button
                aria-label="Increase"
                onClick={() => setQty(size ? Math.min(stock, qty + 1) : qty + 1)}
                className="p-3"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <button
              type="button"
              onClick={() =>
                toast(toggleWish(p.slug) ? "Saved to wishlist" : "Removed from wishlist")
              }
              className="rounded-md border border-border p-3 transition-transform duration-150 hover:border-foreground/50 active:scale-95"
              aria-label="Wishlist"
              aria-pressed={wishlist.includes(p.slug)}
            >
              <Heart
                className={cn(
                  "h-5 w-5 transition-colors",
                  wishlist.includes(p.slug)
                    ? "fill-foreground text-foreground"
                    : "text-muted-foreground",
                )}
              />
            </button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {isSelectedOut ? (
              <button
                type="button"
                disabled
                className="col-span-2 cursor-not-allowed rounded-md border border-red-500/80 bg-red-500/15 py-3.5 font-sans text-xs sm:text-sm font-bold uppercase tracking-[0.16em] text-red-400"
              >
                Out of Stock
              </button>
            ) : (
              <>
                <LoadingButton
                  type="button"
                  variant="outline"
                  aria-label="Add to Cart"
                  onClick={addToBag}
                  className={cn(
                    "h-auto rounded-md border border-foreground bg-transparent py-3.5 font-sans text-xs sm:text-sm font-bold uppercase tracking-[0.16em] text-foreground transition-all hover:bg-foreground/10 active:scale-[0.99]",
                    addedToBag && "bg-foreground/10",
                  )}
                >
                  {addedToBag ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Check className="h-4 w-4" aria-hidden="true" />
                      Added!
                    </span>
                  ) : (
                    "Add to Cart"
                  )}
                </LoadingButton>
                <LoadingButton
                  type="button"
                  loading={buyingNow}
                  loadingText="Proceeding..."
                  onClick={buyNow}
                  className="h-auto rounded-md bg-primary py-3.5 font-sans text-xs sm:text-sm font-bold uppercase tracking-[0.16em] text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.99]"
                >
                  Buy Now
                </LoadingButton>
              </>
            )}
          </div>

          <div className="mt-6 rounded-xl border border-border p-4">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Truck className="h-4 w-4" /> Check delivery
            </p>
            <div className="mt-3 flex gap-2">
              <input
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                placeholder="Enter PIN code"
                className="min-w-0 flex-1 rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none"
              />
              <button
                type="button"
                onClick={checkPin}
                disabled={checkingPin}
                className="shrink-0 rounded-md bg-secondary px-4 text-sm font-bold disabled:opacity-50"
              >
                {checkingPin ? "Checking..." : "Check"}
              </button>
            </div>
            {pinMsg && <p className="mt-2 text-xs text-silver">{pinMsg}</p>}
          </div>

          <Accordion type="single" collapsible className="mt-6">
            <AccordionItem value="spec">
              <AccordionTrigger>Specifications</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                Fit: {p.fit}
                <br />
                Category: {p.category.replace("-", " ")}
                <br />
                Made in India
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="fabric">
              <AccordionTrigger>Fabric details</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">{p.fabric}</AccordionContent>
            </AccordionItem>
            <AccordionItem value="wash">
              <AccordionTrigger>Washing instructions</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                Machine wash cold, inside out. Do not bleach. Tumble dry low. Do not iron on print.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="returns">
              <AccordionTrigger>Return policy</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                Easy 7-day returns and exchanges on unworn items with tags.{" "}
                <Link to="/shipping-returns" className="underline">
                  Learn more
                </Link>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="reviews">
              <AccordionTrigger className="flex items-center justify-between">
                <span>Customer reviews ({reviewsList.length})</span>
              </AccordionTrigger>
              <AccordionContent className="space-y-4 pt-2 text-muted-foreground">
                {reviewsList.length === 0 ? (
                  <p className="text-xs">No reviews yet. Be the first to review this piece.</p>
                ) : (
                  <div className="space-y-3">
                    {reviewsList.map((r: ProductReviewItem) => (
                      <div
                        key={r.id}
                        className="rounded-lg border border-border/50 bg-card/40 p-3 space-y-1"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-foreground">{r.customer_name}</span>
                          <div className="flex items-center text-gold">
                            {Array.from({ length: r.rating || 5 }).map((_, i) => (
                              <Star key={i} className="h-3 w-3 fill-current" />
                            ))}
                          </div>
                        </div>
                        {r.title && (
                          <p className="text-xs font-medium text-foreground">{r.title}</p>
                        )}
                        <p className="text-xs text-muted-foreground">{r.review_text}</p>
                      </div>
                    ))}
                  </div>
                )}

                {!showReviewForm ? (
                  <button
                    type="button"
                    onClick={() => setShowReviewForm(true)}
                    className="mt-2 text-xs font-semibold text-gold underline hover:opacity-80"
                  >
                    + Write a Review
                  </button>
                ) : (
                  <form
                    onSubmit={handleReviewSubmit}
                    className="mt-3 space-y-3 rounded-lg border border-border bg-card/60 p-3"
                  >
                    <div className="text-xs font-bold text-foreground">Write Your Review</div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs">Rating:</span>
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            type="button"
                            key={star}
                            onClick={() => setReviewRating(star)}
                            className="p-0.5 text-gold"
                          >
                            <Star
                              className={cn(
                                "h-4 w-4",
                                star <= reviewRating ? "fill-current" : "text-muted-foreground",
                              )}
                            />
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <input
                        type="text"
                        placeholder="Your name"
                        value={reviewName}
                        onChange={(e) => setReviewName(e.target.value)}
                        className="w-full rounded border border-input bg-background/50 px-2.5 py-1.5 text-xs outline-none focus:border-gold"
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        placeholder="Review title (e.g. Exceptional fabric & drape)"
                        value={reviewTitle}
                        onChange={(e) => setReviewTitle(e.target.value)}
                        className="w-full rounded border border-input bg-background/50 px-2.5 py-1.5 text-xs outline-none focus:border-gold"
                      />
                    </div>
                    <div>
                      <textarea
                        rows={3}
                        required
                        placeholder="Share your thoughts on the fit, quality and craftsmanship..."
                        value={reviewText}
                        onChange={(e) => setReviewText(e.target.value)}
                        className="w-full rounded border border-input bg-background/50 px-2.5 py-1.5 text-xs outline-none focus:border-gold"
                      />
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setShowReviewForm(false)}
                        className="rounded px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={submittingReview}
                        className="rounded bg-primary px-3 py-1 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                      >
                        {submittingReview ? "Submitting..." : "Submit Review"}
                      </button>
                    </div>
                  </form>
                )}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </div>

      {related.length > 0 && (
        <>
          <h2 className="mt-16 text-xl font-bold tracking-brand">YOU MAY ALSO LIKE</h2>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
            {related.map((x) => (
              <ProductCard key={x.slug} p={x} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
