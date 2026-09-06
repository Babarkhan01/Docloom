import type { MetadataRoute } from "next";

// Pre-build checklist §2: crawl marketing pages, never /dashboard, /api or
// auth routes. (Customer docs sites live on their own subdomains and get
// their own robots rules later.)
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/terms", "/privacy"],
      disallow: ["/dashboard", "/login", "/api/"],
    },
  };
}