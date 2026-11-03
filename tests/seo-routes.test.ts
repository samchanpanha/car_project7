import { afterEach, describe, expect, it, vi } from "vitest";
import { pathToView, toQueryString, viewToPath } from "@/lib/routes";
import type { View } from "@/lib/store";
import { activeFacets, browseSeo } from "@/lib/browse-seo";
import { vehicleJsonLd, vehicleName, vehicleSeo } from "@/lib/vehicle-seo";
import type { VehicleDetailWithFilesDTO } from "@/lib/listing-types";

/** Minimal but complete listing fixture. */
function makeVehicle(overrides: Partial<VehicleDetailWithFilesDTO> = {}): VehicleDetailWithFilesDTO {
  return {
    id: "veh-1",
    listingCategory: "CAR",
    make: "Toyota",
    model: "Camry",
    variant: null,
    year: 2019,
    priceUsd: 18500,
    priceMasked: false,
    mileageKm: 62000,
    transmission: "AUTOMATIC",
    fuel: "PETROL",
    bodyType: "SEDAN",
    city: "Phnom Penh",
    condition: "USED",
    status: "PUBLISHED",
    featured: false,
    views: 120,
    createdAt: "2026-01-02T03:04:05.000Z",
    updatedAt: "2026-01-03T03:04:05.000Z",
    images: ["https://pub.example/seed/toyota_camry_1.jpg"],
    seller: { id: "u-1", name: "Sopheap", type: "PRIVATE", verified: false },
    sellerFull: { id: "u-1", name: "Sopheap", type: "PRIVATE", verified: false },
    trust: { docsProvided: 2, reportAvailable: true },
    documents: [],
    description: "Well kept family sedan.",
    ...overrides,
  } as VehicleDetailWithFilesDTO;
}

describe("routes: view ↔ path round trip", () => {
  const views: View[] = [
    { name: "home" },
    { name: "browse" },
    { name: "browse", q: "camry", make: "toyota", sort: "price_asc", category: "CAR" },
    { name: "detail", vehicleId: "veh-42" },
    { name: "report", vehicleId: "veh-42" },
    { name: "sell" },
    { name: "messages" },
    { name: "messages", conversationId: "conv-9" },
    { name: "favorites" },
    { name: "seller", userId: "u-7" },
    { name: "compare" },
    { name: "auth" },
    { name: "auth", tab: "signup" },
    { name: "dashboard" },
    { name: "dashboard", tab: "subscription" },
    { name: "guide" },
    { name: "guide", tab: "payments" },
  ];

  it.each(views.map((v) => [viewToPath(v), v] as const))(
    "round-trips %s",
    (path, view) => {
      expect(viewToPath(pathToView(path))).toBe(path);
    }
  );

  it("maps unknown paths to home", () => {
    expect(pathToView("/nope/deep")).toEqual({ name: "home" });
  });

  it("ignores invalid sort/category values", () => {
    const view = pathToView("/browse", "sort=bogus&category=BOGUS");
    expect(view.name).toBe("browse");
    if (view.name === "browse") {
      expect(view.sort).toBeUndefined();
      expect(view.category).toBeUndefined();
    }
  });

  it("flattens Next searchParams records", () => {
    expect(toQueryString({ q: "camry", make: ["toyota", "honda"], empty: undefined })).toBe(
      "q=camry&make=toyota"
    );
  });
});

describe("browse SEO rules", () => {
  it("indexes the clean browse page", () => {
    const seo = browseSeo(new URLSearchParams());
    expect(seo.indexable).toBe(true);
    expect(seo.canonical).toBe("/browse");
  });

  it("indexes a single make or category facet and canonicalises it", () => {
    expect(browseSeo(new URLSearchParams("make=toyota")).canonical).toBe("/browse?make=toyota");
    expect(browseSeo(new URLSearchParams("category=CAR")).canonical).toBe("/browse?category=CAR");
    expect(browseSeo(new URLSearchParams("category=CAR")).indexable).toBe(true);
  });

  it("drops ad-hoc filters from the canonical URL", () => {
    const seo = browseSeo(new URLSearchParams("make=toyota&priceMin=1000&sort=price_asc&page=3"));
    expect(seo.canonical).toBe("/browse?make=toyota");
  });

  it("noindexes keyword searches and multi-filter combinations", () => {
    expect(browseSeo(new URLSearchParams("q=camry")).indexable).toBe(false);
    expect(browseSeo(new URLSearchParams("make=toyota&bodyType=SEDAN")).indexable).toBe(false);
    expect(activeFacets(new URLSearchParams("make=toyota&sort=price_asc"))).toEqual(["make"]);
  });
});

describe("vehicle SEO", () => {
  it("builds a price-bearing title for published cars", () => {
    const seo = vehicleSeo(makeVehicle());
    expect(seo.title).toBe("2019 Toyota Camry for Sale in Phnom Penh — $18,500");
    expect(seo.indexable).toBe(true);
    expect(seo.image).toBe("https://pub.example/seed/toyota_camry_1.jpg");
  });

  it("omits the price when the seller masked it", () => {
    const seo = vehicleSeo(makeVehicle({ priceMasked: true }));
    expect(seo.price).toBeNull();
    expect(seo.title).not.toContain("$");
  });

  it("keeps sold listings out of the index", () => {
    expect(vehicleSeo(makeVehicle({ status: "SOLD" })).indexable).toBe(false);
  });

  it("names spare parts without a year", () => {
    expect(
      vehicleName(makeVehicle({ listingCategory: "SPARE_PART", make: "Brembo", model: "Brake Pads", year: 0 }))
    ).toBe("Brembo Brake Pads");
  });

  it("emits Car / Motorcycle / Product schema per category", () => {
    expect(vehicleJsonLd(makeVehicle())).toContain('"Car"');
    expect(vehicleJsonLd(makeVehicle({ listingCategory: "MOTOR" }))).toContain('"Motorcycle"');
    expect(vehicleJsonLd(makeVehicle({ listingCategory: "SPARE_PART" }))).toContain('"Product"');
  });

  it("escapes markup in user-authored listing text", () => {
    const json = vehicleJsonLd(makeVehicle({ description: "</script><img src=x onerror=alert(1)>" }));
    expect(json).not.toContain("</script>");
    expect(json).toContain("\\u003c/script>");
  });
});

describe("sitemap resilience", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("still lists static pages when the backend is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("ECONNREFUSED"))
    );
    const { default: sitemap } = await import("@/app/sitemap");
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);
    expect(urls.some((u) => u.includes("/browse"))).toBe(true);
    expect(urls.some((u) => u.includes("/guide"))).toBe(true);
    expect(urls.some((u) => u.includes("/vehicles/"))).toBe(false);
  });

  it("appends published vehicles with lastmod", async () => {
    const card = makeVehicle();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ items: [card], total: 1, page: 1, pageSize: 100, pageCount: 1 }),
      })
    );
    const { default: sitemap } = await import("@/app/sitemap");
    const entries = await sitemap();
    const vehicleEntry = entries.find((e) => e.url.includes("/vehicles/veh-1"));
    expect(vehicleEntry).toBeDefined();
    expect(vehicleEntry?.lastModified).toEqual(new Date(card.createdAt));
    expect(vehicleEntry?.images).toEqual(card.images);
  });
});
