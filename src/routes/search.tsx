import { createFileRoute, Link } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useState } from "react";
import { ProductCard } from "@/components/site/ProductCard";
import { meta } from "@/components/site/InfoPage";
import { EmptyState } from "@/components/ui/empty-state";
import { RouteLoadingSkeleton } from "@/components/ui/skeletons";
import { resolveProductAsset, type Product } from "@/lib/products";
import { getStoreCatalogServerFn } from "@/server/catalog";
import { formatINR } from "@/lib/pricing";

export const Route = createFileRoute("/search")({
  validateSearch: (search: Record<string, unknown>): { q?: string | undefined } => ({
    q: typeof search["q"] === "string" ? search["q"] : undefined,
  }),
  loader: async (): Promise<{ products: Product[] }> => {
    try {
      const catalog = await getStoreCatalogServerFn();
      return { products: catalog || [] };
    } catch {
      return { products: [] };
    }
  },
  head: () =>
    meta("Search", "Search CAVENHUSRT premium apparel.", {
      path: "/search",
      noIndex: true,
      followLinks: true,
    }),
  pendingComponent: () => <RouteLoadingSkeleton variant="search" />,
  component: SearchPage,
});

function SearchPage() {
  const { products } = Route.useLoaderData();
  const search = Route.useSearch();
  const [q, setQ] = useState(search.q ?? "");
  const term = q.trim().toLowerCase();
  const results = term
    ? products.filter((p) =>
        [p.name, p.category, ...p.tags, ...p.colors.map((c) => c.name)]
          .join(" ")
          .toLowerCase()
          .includes(term),
      )
    : [];
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 font-sans">
      <h1 className="font-heading text-4xl sm:text-6xl font-bold uppercase tracking-tight text-foreground leading-none">
        Search
      </h1>
      <div className="relative mt-6">
        <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search tees, hoodies, colors…"
          className="w-full rounded-xl border border-input bg-transparent py-4 pl-12 pr-4 text-lg outline-none focus:border-electric"
        />
        {term && results.length > 0 && (
          <div className="absolute inset-x-0 top-full z-10 mt-2 rounded-xl border border-border bg-popover p-2 shadow-card">
            {results.slice(0, 5).map((p) => (
              <Link
                key={p.slug}
                to="/product/$slug"
                params={{ slug: p.slug }}
                className="flex items-center gap-3 rounded-lg p-2 hover:bg-secondary"
              >
                <img
                  src={resolveProductAsset(p.images[0])}
                  alt=""
                  className="h-12 w-10 rounded object-cover"
                />
                <span className="flex-1">{p.name}</span>
                <span className="text-sm text-silver">{formatINR(p.price)}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
      {!term && (
        <div className="mt-6 flex flex-wrap gap-2 text-sm">
          {["Oversized", "Hoodie", "Graphic", "Navy", "Jacket"].map((s) => (
            <button
              key={s}
              onClick={() => setQ(s)}
              className="rounded-full border border-border px-4 py-2 font-semibold"
            >
              {s}
            </button>
          ))}
        </div>
      )}
      {term && (
        <p className="mt-10 text-muted-foreground">
          <span className="font-bold text-foreground">{results.length}</span> results for “{q}”
        </p>
      )}
      {term && results.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No matches found"
          description={`No apparel matched "${q}". Try searching tees, hoodies, oversized, or navy.`}
          className="mt-8"
          action={
            <button
              type="button"
              onClick={() => setQ("")}
              className="rounded-md border border-border px-5 py-2 text-xs font-bold uppercase tracking-wider text-foreground hover:bg-secondary transition-colors"
            >
              Clear Search
            </button>
          }
        />
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
          {results.map((p) => (
            <ProductCard key={p.slug} p={p} />
          ))}
        </div>
      )}
    </div>
  );
}
