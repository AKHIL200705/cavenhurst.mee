import { createFileRoute, Link } from "@tanstack/react-router";
import { ProductCard } from "@/components/site/ProductCard";
import { meta } from "@/components/site/InfoPage";
import { EmptyState } from "@/components/ui/empty-state";
import { RouteLoadingSkeleton } from "@/components/ui/skeletons";
import { Heart } from "lucide-react";
import type { Product } from "@/lib/products";
import { getStoreCatalogServerFn } from "@/server/catalog";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/wishlist")({
  loader: async (): Promise<{ products: Product[] }> => {
    try {
      const catalog = await getStoreCatalogServerFn();
      return { products: catalog || [] };
    } catch {
      return { products: [] };
    }
  },
  head: () => meta("Wishlist", "Your saved CAVENHUSRT pieces."),
  pendingComponent: () => <RouteLoadingSkeleton variant="wishlist" />,
  component: Wishlist,
});

function Wishlist() {
  const { products } = Route.useLoaderData();
  const { wishlist } = useStore();
  const items = products.filter((p) => wishlist.includes(p.slug));
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 font-sans">
      <h1 className="font-heading text-4xl sm:text-6xl font-bold uppercase tracking-tight text-foreground leading-none">
        Wishlist
      </h1>
      {items.length === 0 ? (
        <EmptyState
          icon={Heart}
          title="Your wishlist is empty"
          description="Save signature silhouettes and essentials to revisit anytime."
          className="mt-8"
          action={
            <Link
              to="/shop"
              className="inline-block rounded-md bg-primary px-6 py-3 text-xs font-bold uppercase tracking-[0.16em] text-primary-foreground transition-opacity hover:opacity-90"
            >
              Start Exploring
            </Link>
          }
        />
      ) : (
        <div className="mt-8 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
          {items.map((p) => (
            <ProductCard key={p.slug} p={p} />
          ))}
        </div>
      )}
    </div>
  );
}
