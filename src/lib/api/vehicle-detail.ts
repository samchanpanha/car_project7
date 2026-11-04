import { db } from "@/lib/db";
import { toDetailDTO, toCardDTO, vehicleCardInclude } from "@/lib/api/mappers";
import type { VehicleDetailPayload } from "@/lib/backend";

export async function getVehicleDetailPayload(id: string): Promise<VehicleDetailPayload | null> {
  if (!id || typeof id !== "string") return null;

  const vehicle = await db.vehicle.findUnique({
    where: { id },
    include: vehicleCardInclude,
  });

  if (!vehicle) return null;

  // Background view count increment
  db.vehicle
    .update({
      where: { id },
      data: { views: { increment: 1 } },
    })
    .catch(() => {});

  const similarVehicles = await db.vehicle.findMany({
    where: {
      status: "PUBLISHED",
      id: { not: id },
      OR: [
        { make: vehicle.make },
        { bodyType: vehicle.bodyType },
        { listingCategory: vehicle.listingCategory },
      ],
    },
    include: vehicleCardInclude,
    take: 4,
    orderBy: { createdAt: "desc" },
  });

  const vehicleDto = toDetailDTO(vehicle);
  const similarDtos = similarVehicles.map(toCardDTO);

  return {
    vehicle: vehicleDto as any,
    similar: similarDtos,
  };
}

