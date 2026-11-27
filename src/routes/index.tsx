import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Gem, RefreshCw, ShieldCheck, Truck } from "lucide-react";
import { ProductCard } from "@/components/site/ProductCard";
import { WingMark } from "@/components/site/Logo";
import { RouteLoadingSkeleton } from "@/components/ui/skeletons";
import type { Product } from "@/lib/products";
import { getStoreCatalogServerFn } from "@/server/catalog";
import hero from "@/assets/hero-urban-motion.jpg";
import teeCream from "@/assets/tee-cream.jpg";
import hoodie from "@/assets/hoodie-navy.jpg";
import graphic from "@/assets/tee-graphic.jpg";
import fan from "@/assets/tee-fan-black.jpg";
import teeNavy from "@/assets/tee-navy.jpg";
import fabric from "@/assets/fabric-navy.jpg";

export const Route = createFileRoute("/")({
  loader: async (): Promise<{ products: Product[] }> => {
    try {
      const catalog = await getStoreCatalogServerFn();
      return { products: catalog || [] };
    } catch (err) {
      console.error("[Home] Error loading store catalog from database:", err);
      return { products: [] };
    }
  },
  head: () => ({
    meta: [
      { title: "CAVENHUSRT — Urban Motion | Premium Apparel" },
      {
        name: "description",
        content:
          "Modern fits. Premium comfort. Designed for the city. Shop premium tees, hoodies and fan edition from CAVENHUSRT.",
      },
      { property: "og:title", content: "CAVENHUSRT — Urban Motion" },
      { property: "og:description", content: "Premium apparel for everyday movement." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
  pendingComponent: () => <RouteLoadingSkeleton variant="home" />,
});

const collections = [
  { slug: "t-shirts", title: "T-Shirts", img: teeCream },
  { slug: "oversized", title: "Oversized", img: teeNavy },
  { slug: "hoodies", title: "Hoodies", img: hoodie },
  { slug: "graphic", title: "Graphics", img: graphic },
  { slug: "fan-edition", title: "Fan Edition", img: fan },
];

function Home() {
  const { products } = Route.useLoaderData();
  const arrivals = products.filter((p) => p.isNew);
  return (
    <>
      <section className="relative overflow-hidden">
        <img
          src={hero}
          alt="Model wearing the CAVENHUSRT Urban Motion hoodie"
          width={1600}
          height={1008}
          fetchPriority="high"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover object-[70%_center]"
        />
        <div className="absolute inset-0 bg-hero-gradient" />
        <div className="relative mx-auto flex h-[78vh] min-h-[560px] max-h-[760px] max-w-7xl flex-col justify-center px-4 py-20">
          <p className="font-heading text-xs uppercase tracking-brand text-silver animate-in fade-in slide-in-from-bottom-2 duration-700">
            CAVENHUSRT
          </p>
          <h1 className="mt-4 font-heading text-6xl sm:text-8xl lg:text-9xl font-bold uppercase tracking-tight leading-[0.88] animate-in fade-in slide-in-from-bottom-4 duration-700">
            Urban
            <br />
            Motion
          </h1>
          <div className="mt-6 h-1 w-16 bg-electric" />
          <p className="mt-6 max-w-sm font-sans text-base sm:text-lg font-medium text-silver">
            Modern fits. Premium comfort. Designed for the city.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              to="/shop"
              className="inline-flex w-fit items-center gap-3 rounded-md bg-primary px-7 py-3.5 font-sans text-xs sm:text-sm font-bold uppercase tracking-[0.16em] text-primary-foreground transition hover:gap-4 shadow-xl"
            >
              Explore Collection <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-navy-deep">
        <div className="mx-auto grid max-w-7xl grid-cols-2 divide-border px-4 py-6 sm:grid-cols-4 sm:divide-x">
          {[
            [Truck, "Fast & Reliable Shipping"],
            [RefreshCw, "Easy Returns"],
            [ShieldCheck, "Secure Payments"],
            [Gem, "Premium Quality"],
          ].map(([Icon, l]) => {
            const I = Icon as typeof Truck;
            return (
              <div
                key={l as string}
                className="flex flex-col items-center gap-2 py-3 text-center text-sm font-semibold"
              >
                <I className="h-6 w-6 text-silver" strokeWidth={1.5} />
                {l as string}
              </div>
            );
          })}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16">
        <SectionTitle>Shop by Collection</SectionTitle>
        <div className="mt-8 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-5">
          {collections.map((c) => (
            <Link
              key={c.slug}
              to="/collections/$slug"
              params={{ slug: c.slug }}
              className="group relative aspect-[4/3] overflow-hidden rounded-xl border border-border lg:aspect-[3/4]"
            >
              <img
                src={c.img}
                alt={c.title}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
              />
              <div className="absolute inset-0 bg-fade-gradient" />
              <span className="absolute bottom-3 left-3 right-3 flex items-center gap-1.5 font-heading text-base font-bold uppercase tracking-wide sm:bottom-4 sm:left-4 sm:right-4 sm:gap-2 sm:text-xl">
                {c.title}{" "}
                <ArrowRight className="h-4 w-4 shrink-0 transition group-hover:translate-x-1" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-16">
        <div className="flex items-end justify-between">
          <h2 className="font-heading text-2xl sm:text-3xl font-bold uppercase tracking-wider text-foreground">
            NEW ARRIVALS
          </h2>
          <Link
            to="/shop"
            className="flex items-center gap-2 font-sans text-xs sm:text-sm font-bold uppercase tracking-wider text-silver hover:text-foreground transition-all"
          >
            View All <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="mt-6 flex snap-x gap-4 overflow-x-auto pb-4">
          {arrivals.map((p) => (
            <div key={p.slug} className="w-56 shrink-0 snap-start sm:w-64">
              <ProductCard p={p} />
            </div>
          ))}
        </div>
      </section>

      <section className="relative overflow-hidden border-y border-border">
        <img
          src={fabric}
          alt=""
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="relative mx-auto grid max-w-7xl items-center gap-8 px-4 py-20 md:grid-cols-2">
          <div className="hidden justify-center md:flex">
            <WingMark className="h-32 w-auto text-silver drop-shadow-2xl" />
          </div>
          <div className="md:border-l md:border-border md:pl-10">
            <p className="font-heading text-xs font-bold uppercase tracking-brand text-electric">
              THE ESSENTIALS EDIT
            </p>
            <h2 className="mt-3 font-heading text-4xl sm:text-6xl font-bold uppercase leading-none tracking-tight">
              Made to move
              <br />
              with you.
            </h2>
            <p className="mt-4 font-sans text-sm sm:text-base font-medium text-silver">
              Versatile fits. Timeless design. Everyday wear.
            </p>
            <Link
              to="/collections/$slug"
              params={{ slug: "oversized" }}
              className="mt-6 inline-flex items-center gap-3 rounded-md bg-primary px-7 py-3.5 font-sans text-xs sm:text-sm font-bold uppercase tracking-[0.16em] text-primary-foreground transition hover:opacity-90 shadow-lg"
            >
              Shop Oversized <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <section className="bg-paper text-paper-foreground">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-16 md:grid-cols-2">
          <img
            src={hero}
            alt="CAVENHUSRT campaign"
            loading="lazy"
            decoding="async"
            className="aspect-[16/10] w-full rounded-xl object-cover"
          />
          <div>
            <p className="font-heading text-xs font-bold uppercase tracking-brand text-electric">
              OUR STORY
            </p>
            <h2 className="mt-3 font-heading text-3xl sm:text-5xl font-bold uppercase tracking-tight text-paper-foreground">
              A Unisex Clothing Brand Rooted in Simplicity
            </h2>
            <p className="mt-4 font-sans text-sm sm:text-base font-medium text-paper-foreground/75 leading-relaxed">
              We create modern, versatile and long-lasting wardrobe essentials for everyone.
            </p>
            <Link
              to="/about"
              className="mt-6 inline-flex items-center gap-3 rounded-md bg-paper-foreground px-7 py-3.5 font-sans text-xs sm:text-sm font-bold uppercase tracking-[0.16em] text-paper transition hover:opacity-90 shadow-lg"
            >
              Read Our Story <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center gap-5">
      <span className="h-px w-16 bg-silver/60" />
      <h2 className="text-center font-heading text-xl sm:text-2xl font-bold uppercase tracking-wider text-foreground">
        {children}
      </h2>
      <span className="h-px w-16 bg-silver/60" />
    </div>
  );
}
