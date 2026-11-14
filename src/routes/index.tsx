import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Gem, RefreshCw, ShieldCheck, Truck } from "lucide-react";
import { ProductCard } from "@/components/site/ProductCard";
import { WingMark } from "@/components/site/Logo";
import { PRODUCTS } from "@/lib/products";
import hero from "@/assets/hero-urban-motion.jpg";
import teeCream from "@/assets/tee-cream.jpg";
import hoodie from "@/assets/hoodie-navy.jpg";
import graphic from "@/assets/tee-graphic.jpg";
import fan from "@/assets/tee-fan-black.jpg";
import teeNavy from "@/assets/tee-navy.jpg";
import fabric from "@/assets/fabric-navy.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CAVENHURST — Urban Motion | Premium Apparel" },
      {
        name: "description",
        content:
          "Modern fits. Premium comfort. Designed for the city. Shop premium tees, hoodies and fan edition from CAVENHURST.",
      },
      { property: "og:title", content: "CAVENHURST — Urban Motion" },
      { property: "og:description", content: "Premium apparel for everyday movement." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

const collections = [
  { slug: "t-shirts", title: "T-Shirts", img: teeCream },
  { slug: "oversized", title: "Oversized", img: teeNavy },
  { slug: "hoodies", title: "Hoodies", img: hoodie },
  { slug: "graphic", title: "Graphics", img: graphic },
  { slug: "fan-edition", title: "Fan Edition", img: fan },
];

function Home() {
  const arrivals = PRODUCTS.filter((p) => p.isNew);
  return (
    <>
      <section className="relative overflow-hidden">
        <img
          src={hero}
          alt="Model wearing the CAVENHURST Urban Motion hoodie"
          width={1600}
          height={1008}
          className="absolute inset-0 h-full w-full object-cover object-[70%_center]"
        />
        <div className="absolute inset-0 bg-hero-gradient" />
        <div className="relative mx-auto flex h-[78vh] min-h-[560px] max-h-[760px] max-w-7xl flex-col justify-center px-4 py-20">
          <p className="text-xs tracking-brand text-silver animate-in fade-in slide-in-from-bottom-2 duration-700">
            CAVENHURST
          </p>
          <h1 className="mt-4 font-serif text-6xl font-semibold uppercase italic leading-[0.9] sm:text-8xl animate-in fade-in slide-in-from-bottom-4 duration-700">
            Urban
            <br />
            Motion
          </h1>
          <div className="mt-6 h-px w-12 bg-foreground" />
          <p className="mt-6 max-w-xs text-lg text-silver">
            Modern fits. Premium comfort. Designed for the city.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              to="/shop"
              className="inline-flex w-fit items-center gap-3 rounded-md bg-primary px-6 py-3 font-bold text-primary-foreground transition hover:gap-4"
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
                className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
              />
              <div className="absolute inset-0 bg-fade-gradient" />
              <span className="absolute bottom-4 left-4 flex items-center gap-2 text-lg font-bold sm:text-xl">
                {c.title} <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-16">
        <div className="flex items-end justify-between">
          <h2 className="text-xl font-bold tracking-brand sm:text-2xl">NEW ARRIVALS</h2>
          <Link
            to="/shop"
            className="flex items-center gap-2 text-sm font-semibold hover:gap-3 transition-all"
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
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="relative mx-auto grid max-w-7xl items-center gap-8 px-4 py-20 md:grid-cols-2">
          <div className="hidden justify-center md:flex">
            <WingMark className="h-32 w-auto text-silver drop-shadow-2xl" />
          </div>
          <div className="md:border-l md:border-border md:pl-10">
            <p className="font-script text-2xl text-silver">The Essentials Edit</p>
            <h2 className="mt-3 font-serif text-5xl font-semibold uppercase italic leading-none">
              Made to move
              <br />
              with you.
            </h2>
            <p className="mt-4 text-silver">Versatile fits. Timeless design. Everyday wear.</p>
            <Link
              to="/collections/$slug"
              params={{ slug: "oversized" }}
              className="mt-6 inline-flex items-center gap-3 rounded-md bg-primary px-6 py-3 font-bold text-primary-foreground"
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
            alt="CAVENHURST campaign"
            loading="lazy"
            className="aspect-[16/10] w-full rounded-xl object-cover"
          />
          <div>
            <p className="text-xs tracking-brand">OUR STORY</p>
            <h2 className="mt-3 font-serif text-4xl font-semibold sm:text-5xl">
              A Unisex Clothing Brand Rooted in Simplicity
            </h2>
            <p className="mt-4 text-paper-foreground/70">
              We create modern, versatile and long-lasting wardrobe essentials for everyone.
            </p>
            <Link
              to="/about"
              className="mt-6 inline-flex items-center gap-3 rounded-md bg-paper-foreground px-6 py-3 font-bold text-paper"
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
      <h2 className="text-center text-lg font-bold uppercase tracking-brand sm:text-xl">
        {children}
      </h2>
      <span className="h-px w-16 bg-silver/60" />
    </div>
  );
}
