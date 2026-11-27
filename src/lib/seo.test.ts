import { describe, expect, it } from "vitest";
import { PRODUCTS } from "@/lib/products";
import {
  breadcrumbJsonLd,
  buildSeoHead,
  collectionJsonLd,
  faqJsonLd,
  productJsonLd,
  websiteJsonLd,
} from "@/lib/seo";
import { generateRobotsTxt } from "@/server/seo";

describe("SEO utilities and Schema.org structured data", () => {
  it("builds canonical link, OpenGraph image, and robots directives for indexable pages", () => {
    const head = buildSeoHead({
      title: "Shop All",
      description: "Shop all CAVENHUSRT apparel.",
      path: "/shop",
    });

    expect(head.links).toEqual([{ rel: "canonical", href: "https://cavenhusrt.in/shop" }]);
    expect(head.meta).toEqual(
      expect.arrayContaining([
        { title: "Shop All | CAVENHUSRT" },
        { name: "description", content: "Shop all CAVENHUSRT apparel." },
        { name: "robots", content: "index, follow, max-image-preview:large" },
        { property: "og:url", content: "https://cavenhusrt.in/shop" },
        { property: "og:image", content: "https://cavenhusrt.in/og-cover.jpg" },
        { name: "twitter:image", content: "https://cavenhusrt.in/og-cover.jpg" },
      ]),
    );
  });

  it("emits noindex and omits canonical link on private/utility routes", () => {
    const privateHead = buildSeoHead({
      title: "Checkout",
      description: "Secure checkout.",
      path: "/checkout",
      noIndex: true,
    });

    expect(privateHead.links).toBeUndefined();
    expect(privateHead.meta).toEqual(
      expect.arrayContaining([{ name: "robots", content: "noindex, nofollow" }]),
    );

    const searchHead = buildSeoHead({
      title: "Search",
      description: "Search products.",
      path: "/search",
      noIndex: true,
      followLinks: true,
    });
    expect(searchHead.meta).toEqual(
      expect.arrayContaining([{ name: "robots", content: "noindex, follow" }]),
    );
  });

  it("generates valid Product, CollectionPage, BreadcrumbList, WebSite, and FAQPage JSON-LD", () => {
    const prod = PRODUCTS[0]!;
    const prodSchema = productJsonLd({
      product: prod,
      reviews: [{ customer_name: "Aarav", rating: 5, review_text: "Heavyweight fabric" }],
      originOverride: "https://cavenhusrt.in",
    });
    expect(prodSchema["@type"]).toBe("Product");
    expect((prodSchema["offers"] as Record<string, unknown>)["priceCurrency"]).toBe("INR");
    expect((prodSchema["offers"] as Record<string, unknown>)["price"]).toBe(prod.price);
    expect((prodSchema["aggregateRating"] as Record<string, unknown>)["ratingValue"]).toBe(5);

    const colSchema = collectionJsonLd({
      title: "Shop All",
      description: "All drops",
      path: "/shop",
      products: PRODUCTS,
      originOverride: "https://cavenhusrt.in",
    });
    expect(colSchema["@type"]).toBe("CollectionPage");

    const bcSchema = breadcrumbJsonLd([
      { name: "Home", path: "/" },
      { name: "Shop All", path: "/shop" },
    ]);
    expect(bcSchema["@type"]).toBe("BreadcrumbList");

    const webSchema = websiteJsonLd("https://cavenhusrt.in");
    expect(webSchema["@type"]).toBe("WebSite");

    const faqSchema = faqJsonLd([["How long does delivery take?", "3-7 days"]]);
    expect(faqSchema["@type"]).toBe("FAQPage");
  });

  it("generates robots.txt disallowing private/admin routes and linking sitemap.xml", () => {
    const robots = generateRobotsTxt("https://cavenhusrt.in");
    expect(robots).toContain("Disallow: /admin");
    expect(robots).toContain("Disallow: /checkout");
    expect(robots).toContain("Disallow: /api/");
    expect(robots).toContain("Sitemap: https://cavenhusrt.in/sitemap.xml");
  });
});
