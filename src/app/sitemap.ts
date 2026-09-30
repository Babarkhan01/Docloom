import type { MetadataRoute } from "next";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { repos } from "@/lib/schema";
import { appUrl } from "@/lib/env";

/**
 * /sitemap.xml — pre-build checklist §2: crawl marketing pages plus every
 * published customer docs page (generated docs are genuinely good, unique SEO
 * content, so they belong in the index; drafts and share links do not).
 *
 * DB-backed so a docs page that just went live is crawlable on the next fetch.
 * The query is wrapped: a sitemap must never 500 and take the marketing site's
 * crawlability down with it — on a DB blip we still return the static routes.
 */
export const dynamic = "force-dynamic";

const LEGAL_ROUTES = ["/privacy", "/terms", "/refunds", "/eula", "/cookies"] as const;
// Comparison / SEO landing pages (P2.7): factual pages that answer buyer
// questions and end in the playground CTA.
const COMPARISON_ROUTES = ["/vs/next-swagger-doc", "/vs/mintlify", "/generate-openapi-from-zod"] as const;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = appUrl();
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/playground`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    ...COMPARISON_ROUTES.map((path) => ({
      url: `${base}${path}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    ...LEGAL_ROUTES.map((path) => ({
      url: `${base}${path}`,
      lastModified: now,
      changeFrequency: "yearly" as const,
      priority: 0.3,
    })),
  ];

  let docsRoutes: MetadataRoute.Sitemap = [];
  try {
    const rows = await db
      .select({ subdomain: repos.docsSubdomain, updatedAt: repos.updatedAt })
      .from(repos)
      .where(and(isNotNull(repos.publishedGenerationId), eq(repos.status, "active")));
    docsRoutes = rows.map((row) => ({
      url: `${base}/docs/${row.subdomain}`,
      lastModified: row.updatedAt ?? now,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }));
  } catch (err) {
    console.error("[sitemap] docs lookup failed — serving static routes only:", err);
  }

  return [...staticRoutes, ...docsRoutes];
}
