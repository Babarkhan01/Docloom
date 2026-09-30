import type { MetadataRoute } from "next";

// Pre-build checklist §2: crawl marketing pages and public docs, never
// /dashboard, /api or auth routes. Customer docs live at /docs/{subdomain}
// (wildcard {subdomain}.docloom.app domains come with the custom domain).
// /share is token-gated draft content — never indexed, even when a crawler
// somehow follows a shared link.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/terms", "/privacy", "/refunds", "/eula", "/cookies", "/docs/", "/playground"],
      disallow: ["/dashboard", "/admin", "/login", "/api/", "/share"],
    },
  };
}