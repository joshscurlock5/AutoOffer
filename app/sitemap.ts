import type { MetadataRoute } from "next";
import { site } from "@/lib/site-config";
import { allArticles, GUIDE_DEFAULT_UPDATED } from "@/lib/guides";

// Next.js serves this at /sitemap.xml. Google Search Console reads it to
// discover and crawl every public page. /admin and /api are intentionally
// excluded (private). New guide articles appear automatically because the
// article list is pulled from lib/guides.ts (single source of truth).
export default function sitemap(): MetadataRoute.Sitemap {
  const base = site.url.replace(/\/$/, "");

  // Static, indexable pages. priority/changeFrequency are hints only.
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1.0 },
    { url: `${base}/get-offer`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${base}/car-selling-guide`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/referral`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/about`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/contact`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/terms`, changeFrequency: "yearly", priority: 0.3 },
  ];

  // One entry per guide article, with its last-updated date.
  const articlePages: MetadataRoute.Sitemap = allArticles.map((a) => ({
    url: `${base}/car-selling-guide/${a.slug}`,
    lastModified: a.updated ?? a.published ?? GUIDE_DEFAULT_UPDATED,
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  return [...staticPages, ...articlePages];
}
