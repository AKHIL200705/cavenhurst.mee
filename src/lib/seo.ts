import type * as React from "react";
import { inStock, resolveProductAsset, type Product } from "@/lib/products";

export const SITE_NAME = "CAVENHUSRT";
export const DEFAULT_SITE_URL = "https://cavenhusrt.in";
export const DEFAULT_OG_IMAGE_PATH = "/og-cover.jpg";
export const DEFAULT_SITE_DESCRIPTION =
  "Premium Indian unisex apparel crafted for everyday movement. Shop heavyweight oversized tees, brushed fleece hoodies, graphic prints, and fan edition essentials.";

export type JsonLdNode = Record<string, unknown>;

export interface BuildSeoHeadOptions {
  title: string;
  description: string;
  path?: string | undefined;
  type?: "website" | "product" | undefined;
  image?: string | undefined;
  imageAlt?: string | undefined;
  noIndex?: boolean | undefined;
  followLinks?: boolean | undefined;
  rawTitle?: boolean | undefined;
  extraMeta?: Array<React.JSX.IntrinsicElements["meta"]> | undefined;
  jsonLd?: JsonLdNode | JsonLdNode[] | undefined;
}

function normalizeOrigin(raw?: string | null): string {
  if (!raw) return "";
  const cleaned = raw
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/\/+$/, "");
  if (!cleaned) return "";
  if (cleaned.startsWith("http://") || cleaned.startsWith("https://")) return cleaned;
  return `https://${cleaned}`;
}

/**
 * Resolves the canonical site base URL consistently across SSR, browser hydration, and tests.
 */
export function getSiteUrl(originOverride?: string): string {
  const override = normalizeOrigin(originOverride);
  if (override) return override;

  const viteEnv =
    typeof import.meta !== "undefined" && import.meta.env
      ? (import.meta.env as Record<string, string | undefined>)
      : undefined;
  const fromVite = normalizeOrigin(viteEnv?.["VITE_SITE_URL"]);
  if (fromVite) return fromVite;

  if (typeof process !== "undefined" && process.env) {
    const fromEnv =
      normalizeOrigin(process.env["SITE_URL"]) ||
      normalizeOrigin(process.env["VITE_SITE_URL"]) ||
      normalizeOrigin(process.env["VERCEL_PROJECT_PRODUCTION_URL"]) ||
      normalizeOrigin(process.env["VERCEL_URL"]);
    if (fromEnv) return fromEnv;
  }

  return DEFAULT_SITE_URL;
}

/**
 * Resolves a route path or asset URL to an absolute canonical URL.
 */
export function absoluteUrl(pathOrUrl: string, originOverride?: string): string {
  const trimmed = (pathOrUrl || "").trim();
  if (!trimmed) return getSiteUrl(originOverride);
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  if (trimmed.startsWith("data:") || trimmed.startsWith("blob:")) {
    return `${getSiteUrl(originOverride)}${DEFAULT_OG_IMAGE_PATH}`;
  }
  const normalizedPath = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return `${getSiteUrl(originOverride)}${normalizedPath}`;
}

export function serializeJsonLd(schema: JsonLdNode): string {
  return JSON.stringify(schema).replace(/</g, "\\u003c");
}

/**
 * Builds consistent document head metadata, canonical links, Open Graph, Twitter cards, and JSON-LD scripts.
 */
export function buildSeoHead({
  title,
  description,
  path,
  type = "website",
  image = DEFAULT_OG_IMAGE_PATH,
  imageAlt = "CAVENHUSRT heavyweight streetwear and everyday essentials",
  noIndex = false,
  followLinks = !noIndex,
  rawTitle = false,
  extraMeta = [],
  jsonLd,
}: BuildSeoHeadOptions): {
  meta: Array<React.JSX.IntrinsicElements["meta"]>;
  links?: Array<React.JSX.IntrinsicElements["link"]>;
  scripts?: Array<React.JSX.IntrinsicElements["script"]>;
} {
  const fullTitle = rawTitle || title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`;
  const canonicalUrl = path ? absoluteUrl(path) : undefined;
  const resolvedImage = absoluteUrl(resolveProductAsset(image) || image || DEFAULT_OG_IMAGE_PATH);
  const robotsContent = noIndex
    ? followLinks
      ? "noindex, follow"
      : "noindex, nofollow"
    : "index, follow, max-image-preview:large";

  const metaTags: Array<React.JSX.IntrinsicElements["meta"]> = [
    { title: fullTitle },
    { name: "description", content: description },
    { name: "robots", content: robotsContent },
    { property: "og:site_name", content: SITE_NAME },
    { property: "og:locale", content: "en_IN" },
    { property: "og:type", content: type },
    { property: "og:title", content: fullTitle },
    { property: "og:description", content: description },
    { property: "og:image", content: resolvedImage },
    { property: "og:image:alt", content: imageAlt },
    ...(canonicalUrl ? [{ property: "og:url", content: canonicalUrl }] : []),
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: fullTitle },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: resolvedImage },
    ...extraMeta,
  ];

  const links: Array<React.JSX.IntrinsicElements["link"]> =
    canonicalUrl && !noIndex ? [{ rel: "canonical", href: canonicalUrl }] : [];

  const schemas = Array.isArray(jsonLd) ? jsonLd : jsonLd ? [jsonLd] : [];
  const scripts: Array<React.JSX.IntrinsicElements["script"]> = schemas.map((schema) => ({
    type: "application/ld+json",
    children: serializeJsonLd(schema),
  }));

  return {
    meta: metaTags,
    ...(links.length > 0 ? { links } : {}),
    ...(scripts.length > 0 ? { scripts } : {}),
  };
}

export function organizationJsonLd(originOverride?: string): JsonLdNode {
  const siteUrl = getSiteUrl(originOverride);
  return {
    "@context": "https://schema.org",
    "@type": "OnlineStore",
    name: SITE_NAME,
    url: siteUrl,
    logo: absoluteUrl("/favicon.png", originOverride),
    image: absoluteUrl(DEFAULT_OG_IMAGE_PATH, originOverride),
    description: DEFAULT_SITE_DESCRIPTION,
    email: "support@cavenhusrt.in",
    address: {
      "@type": "PostalAddress",
      addressCountry: "IN",
    },
  };
}

export function websiteJsonLd(originOverride?: string): JsonLdNode {
  const siteUrl = getSiteUrl(originOverride);
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: siteUrl,
    potentialAction: {
      "@type": "SearchAction",
      target: `${siteUrl}/search?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}

export function breadcrumbJsonLd(
  items: Array<{ name: string; path: string }>,
  originOverride?: string,
): JsonLdNode {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      name: item.name,
      item: absoluteUrl(item.path, originOverride),
    })),
  };
}

export function collectionJsonLd({
  title,
  description,
  path,
  products,
  originOverride,
}: {
  title: string;
  description: string;
  path: string;
  products: Product[];
  originOverride?: string;
}): JsonLdNode {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: title,
    description,
    url: absoluteUrl(path, originOverride),
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: products.length,
      itemListElement: products.slice(0, 12).map((p, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: absoluteUrl(`/product/${p.slug}`, originOverride),
        name: p.name,
        image: absoluteUrl(
          resolveProductAsset(p.images[0]) || DEFAULT_OG_IMAGE_PATH,
          originOverride,
        ),
      })),
    },
  };
}

export interface SeoProductReview {
  customer_name: string;
  rating: number;
  title?: string | null | undefined;
  review_text: string;
  created_at?: string | null | undefined;
}

export function productJsonLd({
  product,
  reviews = [],
  originOverride,
}: {
  product: Product;
  reviews?: SeoProductReview[] | undefined;
  originOverride?: string;
}): JsonLdNode {
  const url = absoluteUrl(`/product/${product.slug}`, originOverride);
  const images = product.images
    .map((img) => absoluteUrl(resolveProductAsset(img) || DEFAULT_OG_IMAGE_PATH, originOverride))
    .filter((v, idx, arr) => Boolean(v) && arr.indexOf(v) === idx);
  const available = inStock(product);

  const schema: JsonLdNode = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description,
    sku: product.slug,
    category: product.category === "hoodies" ? "Hoodies" : "T-Shirts",
    material: product.fabric,
    image: images.length > 0 ? images : [absoluteUrl(DEFAULT_OG_IMAGE_PATH, originOverride)],
    brand: {
      "@type": "Brand",
      name: SITE_NAME,
    },
    offers: {
      "@type": "Offer",
      url,
      priceCurrency: "INR",
      price: product.price,
      availability: available ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
      seller: {
        "@type": "Organization",
        name: SITE_NAME,
      },
    },
  };

  if (reviews.length > 0) {
    const avg =
      reviews.reduce((sum, r) => sum + Math.max(1, Math.min(5, Number(r.rating) || 5)), 0) /
      reviews.length;
    schema["aggregateRating"] = {
      "@type": "AggregateRating",
      ratingValue: Number(avg.toFixed(1)),
      reviewCount: reviews.length,
    };
    schema["review"] = reviews.slice(0, 5).map((r) => ({
      "@type": "Review",
      author: {
        "@type": "Person",
        name: r.customer_name,
      },
      reviewRating: {
        "@type": "Rating",
        ratingValue: Math.max(1, Math.min(5, Number(r.rating) || 5)),
        bestRating: 5,
      },
      name: r.title || undefined,
      reviewBody: r.review_text,
      datePublished: r.created_at ? String(r.created_at).slice(0, 10) : undefined,
    }));
  }

  return schema;
}

export function faqJsonLd(faqs: Array<[string, string]>): JsonLdNode {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map(([question, answer]) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: {
        "@type": "Answer",
        text: answer,
      },
    })),
  };
}
