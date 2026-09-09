import type { MetadataRoute } from "next";

// Pre-build checklist §2: crawl marketing pages and public docs, never
// /dashboard, /api or auth routes. Customer docs live at /docs/{subdomain}
// (wildcard {subdomain}.docloom.app domains come with the custom domain).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/terms", "/privacy", "/docs/"],
      disallow: ["/dashboard", "/login", "/api/"],
    },
  };
}