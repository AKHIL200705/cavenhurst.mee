import { createFileRoute, notFound } from "@tanstack/react-router";
import { CollectionView } from "@/components/site/CollectionView";
import { COLLECTIONS, type CollectionSlug, type Product } from "@/lib/products";
import { breadcrumbJsonLd, buildSeoHead, collectionJsonLd } from "@/lib/seo";
import { RouteLoadingSkeleton } from "@/components/ui/skeletons";
import { getStoreCatalogServerFn } from "@/server/catalog";

export const Route = createFileRoute("/collections/$slug")({
  loader: async ({
    params,
  }): Promise<{ slug: string; title: string; tagline: string; products: Product[] }> => {
    const c = COLLECTIONS[params.slug as CollectionSlug];
    if (!c) throw notFound();

    let allProducts: Product[] = [];
    try {
      const catalog = await getStoreCatalogServerFn();
      if (catalog) {
        allProducts = catalog;
      }
    } catch (err) {
      console.error("[Collections] Error loading catalog from database:", err);
    }

    const filtered = allProducts.filter(c.filter);
    return { slug: params.slug, title: c.title, tagline: c.tagline, products: filtered };
  },
  head: ({ loaderData }) =>
    loaderData
      ? buildSeoHead({
          title: loaderData.title,
          description: `${loaderData.tagline} Shop CAVENHUSRT ${loaderData.title} in premium heavyweight fits across India.`,
          path: `/collections/${loaderData.slug}`,
          image: loaderData.products[0]?.images[0],
          imageAlt: `CAVENHUSRT ${loaderData.title} collection`,
          jsonLd: [
            collectionJsonLd({
              title: `${loaderData.title} | CAVENHUSRT`,
              description: loaderData.tagline,
              path: `/collections/${loaderData.slug}`,
              products: loaderData.products,
            }),
            breadcrumbJsonLd([
              { name: "Home", path: "/" },
              { name: "Shop All", path: "/shop" },
              { name: loaderData.title, path: `/collections/${loaderData.slug}` },
            ]),
          ],
        })
      : buildSeoHead({
          title: "Collection",
          description: "Explore CAVENHUSRT premium apparel collections.",
          path: "/shop",
        }),
  pendingComponent: () => <RouteLoadingSkeleton variant="collection" />,
  component: Collection,
});

function Collection() {
  const { slug, title, tagline, products } = Route.useLoaderData();
  return (
    <CollectionView key={slug} title={title} tagline={tagline} products={products} current={slug} />
  );
}
