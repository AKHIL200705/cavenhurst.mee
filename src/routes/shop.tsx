import { createFileRoute } from "@tanstack/react-router";
import { CollectionView } from "@/components/site/CollectionView";
import { PRODUCTS } from "@/lib/products";
import { meta } from "@/components/site/InfoPage";

export const Route = createFileRoute("/shop")({
  head: () => meta("Shop All", "Shop all CAVENHURST premium tees, hoodies and fan edition."),
  component: () => (
    <CollectionView
      title="Shop All"
      tagline="Premium apparel for everyday movement."
      products={PRODUCTS}
    />
  ),
});
