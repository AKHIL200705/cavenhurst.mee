import { Link } from "@tanstack/react-router";
import { ChevronRight, Grid2x2, Home, List, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { SIZES, inStock, type Product } from "@/lib/products";
import { formatINR } from "@/lib/pricing";
import { ProductCard } from "./ProductCard";
import { cn } from "@/lib/utils";
import fabric from "@/assets/fabric-navy.jpg";

const SORTS = {
  newest: "Newest",
  low: "Price: Low to High",
  high: "Price: High to Low",
  best: "Best Selling",
  popular: "Popularity",
} as const;
type SortKey = keyof typeof SORTS;

export function CollectionView({
  title,
  tagline,
  products,
  current,
}: {
  title: string;
  tagline: string;
  products: Product[];
  current?: string;
}) {
  const [sort, setSort] = useState<SortKey>("newest");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [sizes, setSizes] = useState<string[]>([]);
  const [colors, setColors] = useState<string[]>([]);
  const [cats, setCats] = useState<string[]>([]);
  const [onlyStock, setOnlyStock] = useState(false);
  const [price, setPrice] = useState<[number, number]>([0, 5000]);

  const allColors = useMemo(
    () => [...new Map(products.flatMap((p) => p.colors).map((c) => [c.name, c])).values()],
    [products],
  );

  const list = useMemo(() => {
    let l = products.filter(
      (p) =>
        (!sizes.length || sizes.some((s) => (p.stock[s as never] ?? 0) > 0)) &&
        (!colors.length || p.colors.some((c) => colors.includes(c.name))) &&
        (!cats.length || cats.includes(p.category)) &&
        (!onlyStock || inStock(p)) &&
        p.price >= price[0] &&
        p.price <= price[1],
    );
    l = [...l].sort((a, b) =>
      sort === "low"
        ? a.price - b.price
        : sort === "high"
          ? b.price - a.price
          : sort === "best"
            ? b.sold - a.sold
            : sort === "popular"
              ? b.sold * 0.7 - a.sold * 0.7 + (a.rank - b.rank)
              : Number(b.isNew) - Number(a.isNew) || a.rank - b.rank,
    );
    return l;
  }, [products, sizes, colors, cats, onlyStock, price, sort]);

  const toggle = (arr: string[], set: (v: string[]) => void, v: string) =>
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const chips: [string, string][] = [
    ["t-shirts", "All T-Shirts"],
    ["oversized", "Oversized"],
    ["graphic", "Graphic"],
    ["fan-edition", "Fan Edition"],
    ["hoodies", "Hoodies"],
  ];

  return (
    <div>
      <section className="relative overflow-hidden border-b border-border">
        <img
          src={fabric}
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-70"
          width={1600}
          height={1000}
        />
        <div className="absolute inset-0 bg-hero-gradient" />
        <div className="relative mx-auto max-w-7xl px-4 py-16 sm:py-24">
          <p className="text-xs tracking-brand text-silver">CAVENHURST</p>
          <h1 className="mt-3 font-display text-5xl font-semibold uppercase italic sm:text-7xl">
            {title}
          </h1>
          <p className="mt-3 text-lg text-silver">{tagline}</p>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="flex items-center justify-between text-sm">
          <nav className="flex items-center gap-2 text-muted-foreground">
            <Link to="/" className="flex items-center gap-1 hover:text-foreground">
              <Home className="h-4 w-4" />
              Home
            </Link>
            <ChevronRight className="h-4 w-4" />
            <span className="font-bold text-foreground">{title}</span>
          </nav>
          <span className="font-bold">{list.length} Products</span>
        </div>

        <div className="mt-5 flex items-center gap-3 rounded-xl border border-border px-3 py-2">
          <Sheet>
            <SheetTrigger className="flex items-center gap-2 px-2 py-1.5 text-sm font-bold">
              <SlidersHorizontal className="h-4 w-4" />
              Filter
            </SheetTrigger>
            <SheetContent side="left" className="w-80 overflow-y-auto bg-background">
              <SheetTitle className="font-serif text-2xl">Filters</SheetTitle>
              <div className="mt-6 space-y-7 text-sm">
                <FilterGroup title="Category">
                  {["t-shirts", "hoodies"].map((c) => (
                    <Pill key={c} on={cats.includes(c)} onClick={() => toggle(cats, setCats, c)}>
                      {c.replace("-", " ")}
                    </Pill>
                  ))}
                </FilterGroup>
                <FilterGroup title="Size">
                  {SIZES.map((s) => (
                    <Pill key={s} on={sizes.includes(s)} onClick={() => toggle(sizes, setSizes, s)}>
                      {s}
                    </Pill>
                  ))}
                </FilterGroup>
                <FilterGroup title="Color">
                  {allColors.map((c) => (
                    <Pill
                      key={c.name}
                      on={colors.includes(c.name)}
                      onClick={() => toggle(colors, setColors, c.name)}
                    >
                      <span
                        className="mr-1.5 inline-block h-3 w-3 rounded-full align-middle"
                        style={{ background: c.hex }}
                      />
                      {c.name}
                    </Pill>
                  ))}
                </FilterGroup>
                <div>
                  <h4 className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-silver">
                    Price: {formatINR(price[0])} – {formatINR(price[1])}
                  </h4>
                  <Slider
                    min={0}
                    max={5000}
                    step={100}
                    value={price}
                    onValueChange={(v) => setPrice(v as [number, number])}
                  />
                </div>
                <label className="flex items-center gap-2 font-semibold">
                  <input
                    type="checkbox"
                    checked={onlyStock}
                    onChange={(e) => setOnlyStock(e.target.checked)}
                  />{" "}
                  In stock only
                </label>
                <button
                  className="text-xs underline text-muted-foreground"
                  onClick={() => {
                    setSizes([]);
                    setColors([]);
                    setCats([]);
                    setOnlyStock(false);
                    setPrice([0, 5000]);
                  }}
                >
                  Clear all
                </button>
              </div>
            </SheetContent>
          </Sheet>
          <div className="h-6 w-px bg-border" />
          <label className="flex min-w-0 flex-1 items-center justify-center gap-1 text-xs sm:gap-2 sm:text-sm">
            <span className="hidden font-semibold text-muted-foreground sm:inline">Sort:</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="min-w-0 max-w-full truncate bg-transparent font-bold outline-none"
            >
              {Object.entries(SORTS).map(([k, v]) => (
                <option key={k} value={k} className="bg-background">
                  {v}
                </option>
              ))}
            </select>
          </label>
          <div className="flex shrink-0 gap-1">
            <button
              aria-label="Grid view"
              onClick={() => setView("grid")}
              className={cn(
                "rounded-md p-2",
                view === "grid" && "bg-primary text-primary-foreground",
              )}
            >
              <Grid2x2 className="h-4 w-4" />
            </button>
            <button
              aria-label="List view"
              onClick={() => setView("list")}
              className={cn(
                "rounded-md p-2",
                view === "list" && "bg-primary text-primary-foreground",
              )}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
          <Link
            to="/shop"
            className={cn(
              "shrink-0 rounded-full border border-border px-4 py-2 text-sm font-semibold",
              !current && "bg-primary font-bold text-primary-foreground",
            )}
          >
            All
          </Link>
          {chips.map(([slug, l]) => (
            <Link
              key={slug}
              to="/collections/$slug"
              params={{ slug }}
              className={cn(
                "shrink-0 rounded-full border border-border px-4 py-2 text-sm font-semibold",
                current === slug && "bg-primary font-bold text-primary-foreground",
              )}
            >
              {l}
            </Link>
          ))}
        </div>

        {products.length === 0 ? (
          <div className="py-24 text-center space-y-3">
            <p className="font-serif text-2xl italic text-foreground">No Products Available</p>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Our artisans are currently preparing new silhouettes in the workshop. Please check back shortly or visit our collections.
            </p>
          </div>
        ) : list.length === 0 ? (
          <p className="py-20 text-center text-muted-foreground">
            No products match these filters.
          </p>
        ) : (
          <div
            className={cn(
              "mt-6 grid gap-3 sm:gap-5",
              view === "grid"
                ? "grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
                : "grid-cols-1 lg:grid-cols-2",
            )}
          >
            {list.map((p) => (
              <ProductCard key={p.slug} p={p} layout={view} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-silver">{title}</h4>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}
function Pill({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full border border-border px-3 py-1.5 capitalize",
        on && "bg-primary font-bold text-primary-foreground",
      )}
    >
      {children}
    </button>
  );
}


