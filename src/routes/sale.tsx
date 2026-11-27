import { createFileRoute } from "@tanstack/react-router";
import { CollectionView } from "@/components/site/CollectionView";
import { RouteLoadingSkeleton } from "@/components/ui/skeletons";
import type { Product } from "@/lib/products";
import { breadcrumbJsonLd, buildSeoHead, collectionJsonLd } from "@/lib/seo";
import { getStoreCatalogServerFn } from "@/server/catalog";

const SALE_DESCRIPTION =
  "Shop CAVENHUSRT sale collection with special pricing on heavyweight cotton oversized tees, hoodies, and graphic streetwear across India.";

export const Route = createFileRoute("/sale")({
  loader: async (): Promise<{ products: Product[] }> => {
    try {
      const catalog = await getStoreCatalogServerFn();
      return { products: (catalog || []).filter((p) => p.mrp > p.price) };
    } catch {
      return { products: [] };
    }
  },
  head: ({ loaderData }) =>
    buildSeoHead({
      title: "Sale Collection",
      description: SALE_DESCRIPTION,
      path: "/sale",
      jsonLd: [
        collectionJsonLd({
          title: "Sale Collection | CAVENHUSRT",
          description: SALE_DESCRIPTION,
          path: "/sale",
          products: loaderData?.products || [],
        }),
        breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Sale Collection", path: "/sale" },
        ]),
      ],
    }),
  pendingComponent: () => <RouteLoadingSkeleton variant="collection" />,
  component: SalePage,
});

function SalePage() {
  const { products } = Route.useLoaderData();
  return (
    <CollectionView
      title="Sale"
      tagline="Limited value drops on heavyweight streetwear essentials."
      products={products}
    />
  );
}
