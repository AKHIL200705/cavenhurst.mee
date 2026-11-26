import { createFileRoute, notFound } from "@tanstack/react-router";
import { CollectionView } from "@/components/site/CollectionView";
import { COLLECTIONS, type CollectionSlug, type Product } from "@/lib/products";
import { meta } from "@/components/site/InfoPage";
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
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.title} | CAVENHUSRT` },
          {
            name: "description",
            content: `${loaderData.tagline} Shop CAVENHUSRT ${loaderData.title}.`,
          },
          { property: "og:title", content: `${loaderData.title} | CAVENHUSRT` },
          { property: "og:description", content: loaderData.tagline },
          { property: "og:type", content: "website" },
          { name: "twitter:card", content: "summary_large_image" },
        ]
      : meta("Collection", "Explore CAVENHUSRT premium apparel collections.").meta,
  }),
  component: Collection,
});

function Collection() {
  const { slug, title, tagline, products } = Route.useLoaderData();
  return (
    <CollectionView key={slug} title={title} tagline={tagline} products={products} current={slug} />
  );
}
