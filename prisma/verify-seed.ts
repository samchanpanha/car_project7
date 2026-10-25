// KhLan — verify seed: prints row counts per table + 2 sample vehicles.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

if (!process.env.DATABASE_URL) {
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const envFile = path.join(projectRoot, ".env");
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
      const match = line.match(/^\s*DATABASE_URL\s*=\s*(.*)\s*$/);
      if (match) {
        process.env.DATABASE_URL = match[1].trim().replace(/^["']|["']$/g, "");
        break;
      }
    }
  }
}

const prisma = new PrismaClient();

async function main() {
  const counts = {
    users: await prisma.user.count(),
    sellerProfiles: await prisma.sellerProfile.count(),
    vehicles: await prisma.vehicle.count(),
    vehicleImages: await prisma.vehicleImage.count(),
    vehicleDocuments: await prisma.vehicleDocument.count(),
    vehicleHistoryReports: await prisma.vehicleHistoryReport.count(),
    favorites: await prisma.favorite.count(),
    conversations: await prisma.conversation.count(),
    messages: await prisma.message.count(),
    reportedContent: await prisma.reportedContent.count(),
    auditLogs: await prisma.auditLog.count(),
  };
  console.log("Row counts per table:");
  console.table(counts);

  const samples = await prisma.vehicle.findMany({
    take: 2,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      make: true,
      model: true,
      variant: true,
      year: true,
      priceUsd: true,
      status: true,
      featured: true,
    },
  });
  console.log("2 newest sample vehicles:");
  console.table(samples);

  const byStatus = await prisma.vehicle.groupBy({
    by: ["status"],
    _count: { _all: true },
  });
  console.log(
    "Vehicles by status:",
    byStatus.map((s) => `${s.status}: ${s._count._all}`).join(", ")
  );

  const byCategory = await prisma.vehicle.groupBy({
    by: ["listingCategory"],
    _count: { _all: true },
  });
  console.log(
    "Vehicles by category:",
    byCategory.map((c) => `${c.listingCategory}: ${c._count._all}`).join(", ")
  );

  const conv = await prisma.conversation.findUnique({
    where: { id: "conv_demo_1" },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  console.log(
    `conv_demo_1: ${conv ? conv.messages.length : 0} messages (expected 3)`
  );

  const pradoReport = await prisma.vehicleHistoryReport.findFirst({
    where: { vehicleId: "veh_prado_2018" },
  });
  if (pradoReport) {
    const checks = JSON.parse(pradoReport.checksJson) as unknown[];
    const limits = JSON.parse(pradoReport.limitationsJson ?? "[]") as unknown[];
    console.log(
      `veh_prado_2018 report: status=${pradoReport.status}, checks=${checks.length} (expected 10), limitations=${limits.length}, confidence=${pradoReport.overallConfidence}`
    );
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
