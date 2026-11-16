import { createFileRoute, notFound } from "@tanstack/react-router";
import { CollectionView } from "@/components/site/CollectionView";
import { COLLECTIONS, PRODUCTS, type CollectionSlug, type Product } from "@/lib/products";
import { meta } from "@/components/site/InfoPage";
import { getStoreCatalogServerFn } from "@/server/catalog";

export const Route = createFileRoute("/collections/$slug")({
  loader: async ({ params }): Promise<{ slug: string; title: string; tagline: string; products: Product[] }> => {
    const c = COLLECTIONS[params.slug as CollectionSlug];
    if (!c) throw notFound();

    let allProducts = PRODUCTS;
    try {
      const catalog = await getStoreCatalogServerFn();
      if (catalog && catalog.length > 0) {
        allProducts = catalog;
      }
    } catch {
      // Fallback
    }

    const filtered = allProducts.filter(c.filter);
    return { slug: params.slug, title: c.title, tagline: c.tagline, products: filtered };
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.title} | CAVENHURST` },
          {
            name: "description",
            content: `${loaderData.tagline} Shop CAVENHURST ${loaderData.title}.`,
          },
          { property: "og:title", content: `${loaderData.title} | CAVENHURST` },
          { property: "og:description", content: loaderData.tagline },
          { property: "og:type", content: "website" },
          { name: "twitter:card", content: "summary_large_image" },
        ]
      : meta("Collection", "Explore CAVENHURST premium apparel collections.").meta,
  }),
  component: Collection,
});

function Collection() {
  const { slug, title, tagline, products } = Route.useLoaderData();
  return (
    <CollectionView key={slug} title={title} tagline={tagline} products={products} current={slug} />
  );
}
