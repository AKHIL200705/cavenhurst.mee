import { createFileRoute } from "@tanstack/react-router";
import { CollectionView } from "@/components/site/CollectionView";
import type { Product } from "@/lib/products";
import { meta } from "@/components/site/InfoPage";
import { getStoreCatalogServerFn } from "@/server/catalog";

export const Route = createFileRoute("/shop")({
  head: () => meta("Shop All", "Shop all CAVENHURST premium tees, hoodies and fan edition."),
  loader: async (): Promise<{ products: Product[] }> => {
    try {
      const catalog = await getStoreCatalogServerFn();
      return { products: catalog || [] };
    } catch {
      return { products: [] };
    }
  },
  component: ShopPage,
});

function ShopPage() {
  const { products } = Route.useLoaderData();
  return (
    <CollectionView
      title="Shop All"
      tagline="Premium apparel for everyday movement."
      products={products}
    />
  );
}
