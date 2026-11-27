import { COLLECTIONS, PRODUCTS } from "@/lib/products";
import { absoluteUrl, getSiteUrl } from "@/lib/seo";
import { getDb } from "@/server/db";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

interface SitemapEntry {
  loc: string;
  lastmod?: string | undefined;
  changefreq: "daily" | "weekly" | "monthly";
  priority: string;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function fetchPublishedProductSlugs(): Promise<
  Array<{ slug: string; updated_at?: string | null | undefined }>
> {
  const sql = getDb();
  if (sql) {
    try {
      const rows = await sql<{ slug: string; updated_at?: string | null }[]>`
        SELECT slug, updated_at
        FROM public.products
        WHERE is_published = true
        ORDER BY rank ASC
      `;
      if (rows && rows.length > 0) return rows;
    } catch {
      // Fallback to Supabase REST / static catalog
    }
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("products")
      .select("slug, updated_at")
      .eq("is_published", true)
      .order("rank", { ascending: true });
    if (!error && data && data.length > 0) {
      return data;
    }
  } catch {
    // Fallback to static catalog
  }

  return PRODUCTS.map((p) => ({ slug: p.slug, updated_at: null }));
}

export async function generateSitemapXml(originOverride?: string): Promise<string> {
  const siteUrl = getSiteUrl(originOverride);
  const today = new Date().toISOString().slice(0, 10);
  const products = await fetchPublishedProductSlugs();

  const entries: SitemapEntry[] = [
    { loc: absoluteUrl("/", siteUrl), lastmod: today, changefreq: "daily", priority: "1.0" },
    { loc: absoluteUrl("/shop", siteUrl), lastmod: today, changefreq: "daily", priority: "0.9" },
    {
      loc: absoluteUrl("/new-arrivals", siteUrl),
      lastmod: today,
      changefreq: "daily",
      priority: "0.9",
    },
    {
      loc: absoluteUrl("/sale", siteUrl),
      lastmod: today,
      changefreq: "daily",
      priority: "0.85",
    },
    {
      loc: absoluteUrl("/mens", siteUrl),
      lastmod: today,
      changefreq: "daily",
      priority: "0.85",
    },
    ...Object.keys(COLLECTIONS).map((slug) => ({
      loc: absoluteUrl(`/collections/${slug}`, siteUrl),
      lastmod: today,
      changefreq: "daily" as const,
      priority: "0.85",
    })),
    ...products.map((p) => ({
      loc: absoluteUrl(`/product/${encodeURIComponent(p.slug)}`, siteUrl),
      lastmod: p.updated_at ? new Date(p.updated_at).toISOString().slice(0, 10) : today,
      changefreq: "weekly" as const,
      priority: "0.8",
    })),
    { loc: absoluteUrl("/about", siteUrl), changefreq: "monthly", priority: "0.6" },
    { loc: absoluteUrl("/faqs", siteUrl), changefreq: "monthly", priority: "0.6" },
    { loc: absoluteUrl("/shipping-returns", siteUrl), changefreq: "monthly", priority: "0.6" },
    { loc: absoluteUrl("/contact", siteUrl), changefreq: "monthly", priority: "0.6" },
    { loc: absoluteUrl("/track-order", siteUrl), changefreq: "monthly", priority: "0.5" },
    { loc: absoluteUrl("/privacy", siteUrl), changefreq: "monthly", priority: "0.3" },
    { loc: absoluteUrl("/terms", siteUrl), changefreq: "monthly", priority: "0.3" },
  ];

  const deduped = [...new Map(entries.map((entry) => [entry.loc, entry])).values()];
  const body = deduped
    .map(
      (entry) =>
        `  <url>\n    <loc>${escapeXml(entry.loc)}</loc>${entry.lastmod ? `\n    <lastmod>${escapeXml(entry.lastmod)}</lastmod>` : ""}\n    <changefreq>${entry.changefreq}</changefreq>\n    <priority>${entry.priority}</priority>\n  </url>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

export function generateRobotsTxt(originOverride?: string): string {
  const siteUrl = getSiteUrl(originOverride);
  return [
    "User-agent: *",
    "Allow: /",
    "Disallow: /admin",
    "Disallow: /admin/",
    "Disallow: /api/",
    "Disallow: /account",
    "Disallow: /cart",
    "Disallow: /checkout",
    "Disallow: /complete-profile",
    "Disallow: /login",
    "Disallow: /welcome",
    "Disallow: /wishlist",
    "",
    `Sitemap: ${siteUrl}/sitemap.xml`,
    "",
  ].join("\n");
}
