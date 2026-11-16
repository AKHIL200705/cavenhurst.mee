import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { ChevronRight, Heart, Minus, Plus, Truck, Star } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
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
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/product/$slug")({
  loader: async ({ params }): Promise<{ product: Product; reviews: any[]; related: Product[] }> => {
    let p: Product | null = null;
    try {
      p = await getProductBySlugServerFn({ data: { slug: params.slug } });
    } catch {
      p = null;
    }
    if (!p) throw notFound();

    let reviews: any[] = [];
    try {
      reviews = await getProductReviewsServerFn({ data: { productSlug: params.slug } });
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
          { title: `${loaderData.product.name} | CAVENHURST` },
          { name: "description", content: loaderData.product.description },
          { property: "og:title", content: `${loaderData.product.name} | CAVENHURST` },
          { property: "og:description", content: loaderData.product.description },
          { property: "og:type", content: "product" },
          { name: "twitter:card", content: "summary_large_image" },
        ]
      : meta("Product", "Discover CAVENHURST premium everyday apparel.").meta,
  }),
  component: ProductPage,
});

function ProductPage() {
  const { product: p, reviews: initialReviews, related } = Route.useLoaderData();
  const { user } = useAuth();
  const { add, toggleWish, wishlist } = useStore();
  const navigate = useNavigate();
  const [img, setImg] = useState(0);
  const [color, setColor] = useState(p.colors[0]?.name || "Default");
  const [size, setSize] = useState<Size | null>(null);
  const [qty, setQty] = useState(1);
  const [pin, setPin] = useState("");
  const [pinMsg, setPinMsg] = useState("");
  const [reviewsList, setReviewsList] = useState(initialReviews);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewName, setReviewName] = useState(user?.user_metadata?.full_name || "");
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewTitle, setReviewTitle] = useState("");
  const [reviewText, setReviewText] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);

  const off = discountPercent(p.price, p.mrp);
  const stock = size ? (p.stock[size] ?? 0) : 0;
  const main = imageFor(p, color);
  const gallery = [main, ...p.images.filter((i) => i !== main), main, main].slice(0, 4);

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewText.trim()) {
      toast.error("Please provide review text.");
      return;
    }
    setSubmittingReview(true);
    try {
      await submitProductReviewServerFn({
        data: {
          productSlug: p.slug,
          customerName: reviewName.trim() || "Verified Buyer",
          rating: reviewRating,
          title: reviewTitle.trim() || undefined,
          reviewText: reviewText.trim(),
          customerAuthUid: user?.id,
        },
      });
      toast.success("Thank you! Your review has been submitted.");
      setReviewsList([
        {
          id: Math.random().toString(),
          customer_name: reviewName.trim() || "Verified Buyer",
          rating: reviewRating,
          title: reviewTitle.trim(),
          review_text: reviewText.trim(),
          created_at: new Date().toISOString(),
        },
        ...reviewsList,
      ]);
      setReviewText("");
      setReviewTitle("");
      setShowReviewForm(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to submit review");
    } finally {
      setSubmittingReview(false);
    }
  };

  const addToBag = (buy = false) => {
    if (!size) {
      toast.error("Please select a size");
      return;
    }
    if (stock <= 0) {
      toast.error("This size is out of stock");
      return;
    }
    if (!add({ slug: p.slug, size, color, qty })) {
      toast.error(`Only ${stock} left in ${size}`);
      return;
    }
    toast.success(`Added to bag — ${p.name}, ${color}, ${size}`);
    if (buy) navigate({ to: "/checkout" });
  };

  const checkPin = () => {
    if (!/^[1-9]\d{5}$/.test(pin)) {
      setPinMsg("Enter a valid 6-digit PIN code.");
      return;
    }
    const d = new Date();
    d.setDate(d.getDate() + 5);
    setPinMsg(
      `Delivery to ${pin} usually takes 3–7 business days. Estimated by ${d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}.`,
    );
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
          <div className="aspect-[4/5] overflow-hidden rounded-xl bg-paper">
            <img
              key={`${color}-${img}`}
              src={gallery[img]}
              alt={p.name}
              width={800}
              height={1000}
              className="h-full w-full object-cover animate-in fade-in"
            />
          </div>
          <div className="mt-3 grid grid-cols-4 gap-3">
            {gallery.map((g, i) => (
              <button
                key={i}
                onClick={() => setImg(i)}
                className={cn(
                  "aspect-square overflow-hidden rounded-lg border-2 border-transparent bg-paper",
                  img === i && "border-electric",
                )}
              >
                <img
                  src={g}
                  alt={`${p.name} view ${i + 1}`}
                  loading="lazy"
                  className={cn("h-full w-full object-cover", i % 2 && "scale-x-[-1]")}
                />
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs tracking-brand text-silver">CAVENHURST</p>
          <h1 className="mt-2 font-serif text-4xl font-semibold sm:text-5xl">{p.name}</h1>
          <div className="mt-4 flex items-center gap-3">
            <span className="text-2xl font-bold">{formatINR(p.price)}</span>
            {off > 0 && (
              <>
                <span className="text-muted-foreground line-through">{formatINR(p.mrp)}</span>
                <span className="rounded bg-sale px-2 py-0.5 text-xs font-bold">{off}% OFF</span>
              </>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Inclusive of all taxes</p>
          <p className="mt-5 text-silver">{p.description}</p>

          <div className="mt-6">
            <p className="text-sm font-semibold">
              Color: <span className="font-bold text-silver">{color}</span>
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
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold">
                Size{size && <span className="font-bold">: {size}</span>}
              </span>
              <Dialog>
                <DialogTrigger className="underline text-silver">Size guide</DialogTrigger>
                <DialogContent className="bg-background">
                  <DialogTitle className="font-serif text-2xl">Size guide (inches)</DialogTitle>
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
                </DialogContent>
              </Dialog>
            </div>
            <div className="mt-2 grid grid-cols-6 gap-2">
              {SIZES.map((s) => {
                const out = (p.stock[s] ?? 0) <= 0;
                return (
                  <button
                    key={s}
                    disabled={out}
                    onClick={() => {
                      setSize(s);
                      setQty(1);
                    }}
                    className={cn(
                      "rounded-md border border-border py-2.5 text-sm transition",
                      size === s && "bg-primary font-bold text-primary-foreground",
                      out && "cursor-not-allowed opacity-30 line-through",
                    )}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
            {size && stock > 0 && stock <= 5 && (
              <p className="mt-2 text-xs text-sale">
                Only {stock} left in {size}
              </p>
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
              onClick={() =>
                toast(toggleWish(p.slug) ? "Saved to wishlist" : "Removed from wishlist")
              }
              className="rounded-md border border-border p-3"
              aria-label="Wishlist"
            >
              <Heart
                className={cn("h-5 w-5", wishlist.includes(p.slug) && "fill-sale text-sale")}
              />
            </button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <button
              onClick={() => addToBag()}
              className="rounded-md border border-foreground py-3.5 font-bold hover:bg-foreground/10"
            >
              Add to Cart
            </button>
            <button
              onClick={() => addToBag(true)}
              className="rounded-md bg-primary py-3.5 font-bold text-primary-foreground"
            >
              Buy Now
            </button>
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
                className="flex-1 rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none"
              />
              <button onClick={checkPin} className="rounded-md bg-secondary px-4 text-sm font-bold">
                Check
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
                    {reviewsList.map((r: any) => (
                      <div key={r.id} className="rounded-lg border border-border/50 bg-card/40 p-3 space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-foreground">{r.customer_name}</span>
                          <div className="flex items-center text-gold">
                            {Array.from({ length: r.rating || 5 }).map((_, i) => (
                              <Star key={i} className="h-3 w-3 fill-current" />
                            ))}
                          </div>
                        </div>
                        {r.title && <p className="text-xs font-medium text-foreground">{r.title}</p>}
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
                  <form onSubmit={handleReviewSubmit} className="mt-3 space-y-3 rounded-lg border border-border bg-card/60 p-3">
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
