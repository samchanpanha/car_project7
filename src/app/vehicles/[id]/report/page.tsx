import type { Metadata } from "next";
import { AppChrome } from "@/components/marketplace/app-chrome";

type Params = Promise<{ id: string }>;

export const metadata: Metadata = {
  title: "AI Vehicle Report",
  robots: { index: false, follow: true },
};

export default async function VehicleReportPage({ params }: { params: Params }) {
  const { id } = await params;
  return <AppChrome initialView={{ name: "report", vehicleId: id }} />;
}
