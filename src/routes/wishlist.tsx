import { createFileRoute, Link } from "@tanstack/react-router";
import { ProductCard } from "@/components/site/ProductCard";
import { meta } from "@/components/site/InfoPage";
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
  head: () => meta("Wishlist", "Your saved CAVENHURST pieces."),
  component: Wishlist,
});

function Wishlist() {
  const { products } = Route.useLoaderData();
  const { wishlist } = useStore();
  const items = products.filter((p) => wishlist.includes(p.slug));
  return (
    <div className="mx-auto max-w-7xl px-4 py-12">
      <h1 className="font-serif text-5xl italic">Wishlist</h1>
      {items.length === 0 ? (
        <div className="py-20 text-center text-muted-foreground">
          Nothing saved yet.{" "}
          <Link to="/shop" className="underline text-foreground">
            Start exploring
          </Link>
        </div>
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
