import type { MetadataRoute } from "next";
import { fetchVehiclePages } from "@/lib/backend";
import type { VehicleCardDTO } from "@/lib/types";
import { absoluteUrl, vehiclePath } from "@/lib/seo";

/**
 * `/sitemap.xml`
 *
 * Generated per request (`force-dynamic`) so it always reflects the live
 * catalogue. The backend call inside is still cached for an hour by the
 * fetch cache, so a crawler hitting /sitemap.xml costs one cached request.
 *
 * A static/prerendered sitemap would be built before the Spring Boot backend
 * exists (the Docker builder stage has no `backend:8080`), which would bake
 * an empty vehicle list into the image.
 *
 * The vehicle section is best-effort: if the backend is unreachable the
 * sitemap still lists the static pages instead of failing the whole request.
 */
export const dynamic = "force-dynamic";

function lastModified(value?: string | null): Date {
  if (!value) return new Date();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function imageUrls(vehicle: VehicleCardDTO): string[] | undefined {
  const images = (vehicle.images ?? []).filter(Boolean).slice(0, 3);
  return images.length ? images.map((src) => absoluteUrl(src)) : undefined;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: absoluteUrl("/"),
      lastModified: now,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: absoluteUrl("/browse"),
      lastModified: now,
      changeFrequency: "hourly",
      priority: 0.9,
    },
    {
      url: absoluteUrl("/browse?category=CAR"),
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: absoluteUrl("/browse?category=MOTOR"),
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: absoluteUrl("/browse?category=SPARE_PART"),
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.7,
    },
    {
      url: absoluteUrl("/sell"),
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: absoluteUrl("/guide"),
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: absoluteUrl("/trust"),
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: absoluteUrl("/financing"),
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: absoluteUrl("/ev"),
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.6,
    },
  ];

  const { vehicles } = await fetchVehiclePages();
  const seen = new Set<string>();
  const vehicleRoutes: MetadataRoute.Sitemap = [];

  for (const vehicle of vehicles) {
    if (!vehicle?.id || seen.has(vehicle.id)) continue;
    seen.add(vehicle.id);
    vehicleRoutes.push({
      url: absoluteUrl(vehiclePath(vehicle.id)),
      lastModified: lastModified(vehicle.createdAt),
      changeFrequency: "weekly",
      priority: 0.8,
      images: imageUrls(vehicle),
    });
  }

  return [...staticRoutes, ...vehicleRoutes];
}
