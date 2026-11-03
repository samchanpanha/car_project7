import type { MetadataRoute } from "next";
import { SITE_URL, absoluteUrl } from "@/lib/seo";

/**
 * `/robots.txt`
 *
 * Only `/api/` is disallowed. Private UI routes (`/dashboard`, `/favorites`,
 * `/messages`, …) are intentionally crawlable and carry `noindex` metadata
 * instead — a disallowed URL can never be crawled, so its `noindex` would
 * never be seen and the URL could still be indexed from external links.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/"],
      },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
    host: SITE_URL,
  };
}
