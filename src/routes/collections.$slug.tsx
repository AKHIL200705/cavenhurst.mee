import { createFileRoute, notFound } from "@tanstack/react-router";
import { CollectionView } from "@/components/site/CollectionView";
import { COLLECTIONS, PRODUCTS, type CollectionSlug } from "@/lib/products";
import { meta } from "@/components/site/InfoPage";

export const Route = createFileRoute("/collections/$slug")({
  loader: ({ params }) => {
    const c = COLLECTIONS[params.slug as CollectionSlug];
    if (!c) throw notFound();
    return { slug: params.slug, title: c.title, tagline: c.tagline };
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
  const { slug, title, tagline } = Route.useLoaderData();
  const products = PRODUCTS.filter(COLLECTIONS[slug as CollectionSlug].filter);
  return (
    <CollectionView key={slug} title={title} tagline={tagline} products={products} current={slug} />
  );
}
