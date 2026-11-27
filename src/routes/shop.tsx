import { createFileRoute } from "@tanstack/react-router";
import { CollectionView } from "@/components/site/CollectionView";
import type { Product } from "@/lib/products";
import { breadcrumbJsonLd, buildSeoHead, collectionJsonLd } from "@/lib/seo";
import { RouteLoadingSkeleton } from "@/components/ui/skeletons";
import { getStoreCatalogServerFn } from "@/server/catalog";

const SHOP_DESCRIPTION =
  "Shop all CAVENHUSRT heavyweight oversized t-shirts, brushed fleece hoodies, graphic tees, and fan edition essentials in India.";

export const Route = createFileRoute("/shop")({
  loader: async (): Promise<{ products: Product[] }> => {
    try {
      const catalog = await getStoreCatalogServerFn();
      return { products: catalog || [] };
    } catch {
      return { products: [] };
    }
  },
  head: ({ loaderData }) =>
    buildSeoHead({
      title: "Shop All",
      description: SHOP_DESCRIPTION,
      path: "/shop",
      jsonLd: [
        collectionJsonLd({
          title: "Shop All | CAVENHUSRT",
          description: SHOP_DESCRIPTION,
          path: "/shop",
          products: loaderData?.products || [],
        }),
        breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Shop All", path: "/shop" },
        ]),
      ],
    }),
  pendingComponent: () => <RouteLoadingSkeleton variant="collection" />,
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
