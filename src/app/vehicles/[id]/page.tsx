import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppChrome } from "@/components/marketplace/app-chrome";
import { fetchVehicle } from "@/lib/backend";
import { SITE_NAME, absoluteUrl, vehiclePath, vehicleUrl } from "@/lib/seo";
import { vehicleJsonLd, vehicleName, vehicleSeo } from "@/lib/vehicle-seo";

type Params = Promise<{ id: string }>;

/** Listings change price/status often enough that 10 minutes of ISR is the
 *  sweet spot between freshness and backend load. */
export const revalidate = 600;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const res = await fetchVehicle(id);

  if (!res.ok) {
    // A genuine 404 should not be indexed; an outage should not deindex a live
    // listing, so leave the metadata generic and let Google retry later.
    if (!res.network && res.status === 404) {
      return { title: "Listing not found", robots: { index: false, follow: false } };
    }
    return { title: "Vehicle listing" };
  }

  const vehicle = res.data.vehicle;
  if (!vehicle) return { title: "Vehicle listing" };

  const seo = vehicleSeo(vehicle);
  const url = vehicleUrl(vehicle.id);

  return {
    title: seo.title,
    description: seo.description,
    alternates: { canonical: absoluteUrl(vehiclePath(vehicle.id)) },
    robots: seo.indexable
      ? {
          index: true,
          follow: true,
          googleBot: { index: true, follow: true, "max-image-preview": "large" },
        }
      : { index: false, follow: true },
    openGraph: {
      type: "website",
      title: seo.title,
      description: seo.description,
      url,
      siteName: SITE_NAME,
      images: [{ url: seo.image, alt: vehicleName(vehicle) }],
    },
    twitter: {
      card: "summary_large_image",
      title: seo.title,
      description: seo.description,
      images: [seo.image],
    },
    other: seo.price
      ? {
          "product:price:amount": String(vehicle.priceUsd),
          "product:price:currency": "USD",
        }
      : {},
  };
}

export default async function VehiclePage({ params }: { params: Params }) {
  const { id } = await params;
  const res = await fetchVehicle(id);

  if (!res.ok && !res.network && res.status === 404) {
    notFound();
  }

  // On a backend outage we still render the view — the client retries the
  // request and shows its own error state, rather than a hard 404.
  if (!res.ok) {
    return <AppChrome initialView={{ name: "detail", vehicleId: id }} />;
  }

  const payload = res.data;

  return (
    <>
      <script
        type="application/ld+json"
        // `vehicleJsonLd` escapes "<" so user-authored listing text cannot
        // terminate the script element.
        dangerouslySetInnerHTML={{ __html: vehicleJsonLd(payload.vehicle) }}
      />
      <AppChrome initialView={{ name: "detail", vehicleId: id }} initialVehicle={payload} />
    </>
  );
}
