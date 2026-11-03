import { test, expect } from "@playwright/test";

/**
 * SEO regression suite.
 *
 * These assertions run against the RAW server response (no JavaScript), which
 * is exactly what a crawler sees. They cover the metadata contract, the
 * robots/sitemap contract and the canonical URL rules.
 */

test.describe.configure({ mode: "serial" });

/** Read the raw HTML without waiting for hydration. */
async function rawHtml(page: import("@playwright/test").Page, path: string) {
  const res = await page.request.get(path);
  expect(res.status()).toBe(200);
  return res.text();
}

function metaContent(html: string, attr: "name" | "property", key: string): string | null {
  const re = new RegExp(`<meta ${attr}="${key}" content="([^"]*)"`);
  const match = html.match(re);
  return match ? match[1] : null;
}

test.describe("SEO metadata", () => {
  test("robots.txt allows crawling, blocks the API and points at the sitemap", async ({ page }) => {
    const res = await page.request.get("/robots.txt");
    expect(res.status()).toBe(200);
    const body = await res.text();

    expect(body).toContain("User-Agent: *");
    expect(body).toContain("Allow: /");
    expect(body).toContain("Disallow: /api/");
    expect(body).toMatch(/Sitemap: https?:\/\/.+\/sitemap\.xml/);
  });

  test("sitemap.xml is valid and lists the public routes", async ({ page }) => {
    const res = await page.request.get("/sitemap.xml");
    expect(res.status()).toBe(200);
    const body = await res.text();

    expect(body).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
    expect(body).toContain("</urlset>");
    expect(body).toMatch(/<loc>[^<]*\/browse<\/loc>/);
    expect(body).toMatch(/<loc>[^<]*\/guide<\/loc>/);
    expect(body).toMatch(/<loc>[^<]*\/sell<\/loc>/);
    // Vehicle detail pages are the ranking pages — they must be listed.
    expect(body).toMatch(/<loc>[^<]*\/vehicles\/[^<]+<\/loc>/);
  });

  test("manifest.webmanifest is served and references the icons", async ({ page }) => {
    const res = await page.request.get("/manifest.webmanifest");
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain("icon-192.png");
    expect(body).toContain("icon-512.png");
  });

  test("the home page carries the full social card set", async ({ page }) => {
    const html = await rawHtml(page, "/");

    expect(html).toMatch(/<title>[^<]*KhLan[^<]*<\/title>/);
    expect(metaContent(html, "name", "description")).toBeTruthy();
    expect(metaContent(html, "property", "og:title")).toBeTruthy();
    expect(metaContent(html, "property", "og:description")).toBeTruthy();
    expect(metaContent(html, "property", "og:image")).toContain("/og/");
    expect(metaContent(html, "name", "twitter:card")).toBe("summary_large_image");
    expect(metaContent(html, "name", "robots")).toContain("index");
    // Self-referencing canonical — the root page must not inherit the
    // canonical of another route. The homepage canonical is the bare origin
    // (no trailing slash), so assert on the URL, not on its shape.
    const canonical = html.match(/<link rel="canonical" href="([^"]*)"/)?.[1];
    expect(canonical, "missing homepage canonical").toBeTruthy();
    expect(canonical).toMatch(/^https?:\/\/[^/]+\/?$/);
  });

  test("listing pages are indexable while account pages are not", async ({ page }) => {
    const vehicleId = await firstVehicleId(page);
    const vehicleHtml = await rawHtml(page, `/vehicles/${vehicleId}`);

    expect(metaContent(vehicleHtml, "name", "robots")).toContain("index");
    expect(vehicleHtml).toMatch(/<link rel="canonical" href="[^"]*\/vehicles\/[^"]*"/);
    expect(vehicleHtml).toContain('type="application/ld+json"');

    for (const path of ["/favorites", "/dashboard", "/messages", "/compare"]) {
      const html = await rawHtml(page, path);
      expect(metaContent(html, "name", "robots")).toContain("noindex");
    }
  });

  test("every indexable page has an absolute canonical", async ({ page }) => {
    for (const path of ["/", "/browse", "/browse?make=toyota", "/sell", "/guide"]) {
      const html = await rawHtml(page, path);
      const canonical = html.match(/<link rel="canonical" href="([^"]*)"/)?.[1];
      expect(canonical, `missing canonical on ${path}`).toBeTruthy();
      expect(canonical, `relative canonical on ${path}`).toMatch(/^https?:\/\//);
    }
  });

  test("listing content is server-rendered, not client-only", async ({ page }) => {
    const vehicleId = await firstVehicleId(page);
    const html = await rawHtml(page, `/vehicles/${vehicleId}`);

    // The make/model and the price must be in the raw HTML for crawlers that
    // do not execute JavaScript.
    expect(html).toMatch(/<h1[^>]*>[^<]*\w+/);
    expect(html).toMatch(/\$\d/);
    expect(html).toContain("Phnom Penh");
  });

  test("browse pages canonicalise and noindex ad-hoc filters", async ({ page }) => {
    const clean = await rawHtml(page, "/browse");
    expect(metaContent(clean, "name", "robots")).toContain("index");
    expect(clean).toMatch(/<link rel="canonical" href="[^"]*\/browse"/);

    const search = await rawHtml(page, "/browse?q=camry");
    expect(metaContent(search, "name", "robots")).toContain("noindex");
    expect(metaContent(search, "name", "robots")).toContain("follow");
  });
});

/** Read one vehicle id from the sitemap. */
async function firstVehicleId(page: import("@playwright/test").Page): Promise<string> {
  const res = await page.request.get("/sitemap.xml");
  const body = await res.text();
  const match = body.match(/<loc>[^<]*\/vehicles\/([^<]+)<\/loc>/);
  if (!match) test.skip(true, "no vehicles published");
  return match![1];
}
