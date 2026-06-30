import type { MetadataRoute } from "next";
import { site } from "@/lib/site-config";

// Next.js serves this at /robots.txt. Allows search engines to crawl the
// public site, blocks the private admin + API routes, and points crawlers
// at the sitemap so Google Search Console can find every page.
export default function robots(): MetadataRoute.Robots {
  const base = site.url.replace(/\/$/, "");
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/api/"],
    },
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
