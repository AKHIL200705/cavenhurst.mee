import { createFileRoute } from "@tanstack/react-router";
import { CollectionView } from "@/components/site/CollectionView";
import { RouteLoadingSkeleton } from "@/components/ui/skeletons";
import type { Product } from "@/lib/products";
import { breadcrumbJsonLd, buildSeoHead, collectionJsonLd } from "@/lib/seo";
import { getStoreCatalogServerFn } from "@/server/catalog";

const MENS_DESCRIPTION =
  "Shop CAVENHUSRT men's & unisex streetwear collection — heavyweight boxy tees, brushed fleece hoodies, and everyday essentials across India.";

export const Route = createFileRoute("/mens")({
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
      title: "Men's Collection",
      description: MENS_DESCRIPTION,
      path: "/mens",
      jsonLd: [
        collectionJsonLd({
          title: "Men's Collection | CAVENHUSRT",
          description: MENS_DESCRIPTION,
          path: "/mens",
          products: loaderData?.products || [],
        }),
        breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Men's Collection", path: "/mens" },
        ]),
      ],
    }),
  pendingComponent: () => <RouteLoadingSkeleton variant="collection" />,
  component: MensCollectionPage,
});

function MensCollectionPage() {
  const { products } = Route.useLoaderData();
  return (
    <CollectionView
      title="Men's Collection"
      tagline="Unisex boxy cuts and heavyweight cotton staples tailored for everyday wear."
      products={products}
    />
  );
}
