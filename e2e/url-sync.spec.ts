import { test, expect } from "@playwright/test";

/**
 * URL synchronisation — the router bridge.
 *
 * `navigate()` must push a real path, the browser back/forward buttons must
 * work, and a refresh must land on the same screen.
 */

test.describe.configure({ mode: "serial" });

test.describe("URL sync", () => {
  test("navigating updates the URL and the back button works", async ({ page }) => {
    await page.goto("/");
    await page.waitForResponse((r) => r.url().includes("/api/session"));

    // Home → Browse via the header link.
    await page.getByRole("link", { name: /Browse|រកប្រូល/ }).first().click();
    await page.waitForURL(/\/browse/);
    expect(page.url()).toContain("/browse");

    // Back returns to home.
    await page.goBack();
    await page.waitForURL((url) => !url.pathname.includes("/browse"));
    expect(new URL(page.url()).pathname).toBe("/");
  });

  test("a listing card links to a crawlable vehicle URL", async ({ page }) => {
    await page.goto("/browse");
    await page.waitForTimeout(1200);

    const link = page.locator('a[href^="/vehicles/"]').first();
    await expect(link).toBeVisible();

    const href = await link.getAttribute("href");
    expect(href).toMatch(/^\/vehicles\/.+/);

    await link.click();
    await page.waitForURL(/\/vehicles\/.+/);
    expect(page.url()).toContain("/vehicles/");
  });

  test("a direct visit to a listing URL renders the server-rendered page", async ({ page }) => {
    await page.goto("/browse");
    await page.waitForTimeout(1200);

    const href = await page.locator('a[href^="/vehicles/"]').first().getAttribute("href");
    expect(href).toBeTruthy();

    await page.goto(href!);
    await page.waitForTimeout(800);

    // The h1 is present in the server HTML — it must survive hydration.
    await expect(page.locator("h1").first()).toBeVisible();
    await expect(page.locator("h1").first()).not.toBeEmpty();
  });
});
