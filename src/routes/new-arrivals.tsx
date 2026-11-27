import { createFileRoute } from "@tanstack/react-router";
import { CollectionView } from "@/components/site/CollectionView";
import { RouteLoadingSkeleton } from "@/components/ui/skeletons";
import type { Product } from "@/lib/products";
import { breadcrumbJsonLd, buildSeoHead, collectionJsonLd } from "@/lib/seo";
import { getStoreCatalogServerFn } from "@/server/catalog";

const NEW_ARRIVALS_DESCRIPTION =
  "Shop the latest CAVENHUSRT new arrivals in India — heavyweight oversized tees, brushed fleece hoodies, and limited streetwear drops.";

export const Route = createFileRoute("/new-arrivals")({
  loader: async (): Promise<{ products: Product[] }> => {
    try {
      const catalog = await getStoreCatalogServerFn();
      return { products: (catalog || []).filter((p) => p.isNew) };
    } catch {
      return { products: [] };
    }
  },
  head: ({ loaderData }) =>
    buildSeoHead({
      title: "New Arrivals",
      description: NEW_ARRIVALS_DESCRIPTION,
      path: "/new-arrivals",
      jsonLd: [
        collectionJsonLd({
          title: "New Arrivals | CAVENHUSRT",
          description: NEW_ARRIVALS_DESCRIPTION,
          path: "/new-arrivals",
          products: loaderData?.products || [],
        }),
        breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "New Arrivals", path: "/new-arrivals" },
        ]),
      ],
    }),
  pendingComponent: () => <RouteLoadingSkeleton variant="collection" />,
  component: NewArrivalsPage,
});

function NewArrivalsPage() {
  const { products } = Route.useLoaderData();
  return (
    <CollectionView
      title="New Arrivals"
      tagline="Fresh heavyweight silhouettes built for everyday movement."
      products={products}
    />
  );
}
