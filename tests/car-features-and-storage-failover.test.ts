import { describe, it, expect, vi, beforeEach } from "vitest";
import { getPlanCatalog } from "@/lib/api/plan-config";
import { toCardDTO, toDetailDTO } from "@/lib/api/mappers";
import {
  getStorageResilienceStatus,
  syncPendingFilesToR2,
  saveWithStorageFailover,
} from "@/lib/storage-resilience";
import { db } from "@/lib/db";
import * as r2Client from "@/lib/r2-client";
import * as minioClient from "@/lib/minio-client";

describe("Car Features & Storage Resilience Integration Tests", () => {
  describe("1. Free Plan Hiding when Disabled", () => {
    it("excludes the FREE plan from catalog when freePlan.enabled is false", async () => {
      const catalog = await getPlanCatalog({
        freePlan: {
          enabled: false,
          listingsLimit: 3,
          featuredLimit: 0,
          seats: 1,
        },
      });

      const freePlan = catalog.find((p) => p.plan === "FREE");
      expect(freePlan).toBeUndefined();
    });

    it("includes the FREE plan when freePlan.enabled is true", async () => {
      const catalog = await getPlanCatalog({
        freePlan: {
          enabled: true,
          listingsLimit: 3,
          featuredLimit: 0,
          seats: 1,
        },
      });

      const freePlan = catalog.find((p) => p.plan === "FREE");
      expect(freePlan).toBeDefined();
      expect(freePlan?.plan).toBe("FREE");
    });

    it("includes the FREE plan when includeDisabled is true (admin view)", async () => {
      const catalog = await getPlanCatalog({
        includeDisabled: true,
        freePlan: {
          enabled: false,
          listingsLimit: 3,
          featuredLimit: 0,
          seats: 1,
        },
      });

      const freePlan = catalog.find((p) => p.plan === "FREE");
      expect(freePlan).toBeDefined();
    });
  });

  describe("2. Price Masking & Optional Car Specs DTO Mappers", () => {
    const mockVehicle: any = {
      id: "veh-mask-1",
      make: "Toyota",
      model: "Prado",
      variant: "TX-L",
      year: 2022,
      priceUsd: 0,
      priceMasked: true,
      seats: 7,
      interiorColor: "Beige",
      fuelEconomy: "8.5 L/100km",
      mileageKm: 35000,
      transmission: "AUTOMATIC",
      fuel: "DIESEL",
      bodyType: "SUV",
      city: "Phnom Penh",
      district: "Chamkarmon",
      condition: "USED",
      status: "PUBLISHED",
      featured: true,
      views: 120,
      createdAt: new Date(),
      updatedAt: new Date(),
      images: [{ id: "img-1", url: "/api/uploads/car1.jpg", sortOrder: 0 }],
      documents: [],
      reports: [],
      seller: {
        id: "seller-1",
        name: "Sokha Auto",
        createdAt: new Date(),
        sellerProfile: {
          type: "DEALER",
          shopName: "Sokha Showroom",
          verified: true,
          memberSince: new Date(),
        },
      },
    };

    it("toCardDTO preserves priceMasked flag", () => {
      const card = toCardDTO(mockVehicle);
      expect(card.priceMasked).toBe(true);
      expect(card.make).toBe("Toyota");
      expect(card.model).toBe("Prado");
    });

    it("toDetailDTO includes optional specs: seats, interiorColor, fuelEconomy", () => {
      const detail = toDetailDTO(mockVehicle);
      expect(detail.priceMasked).toBe(true);
      expect(detail.seats).toBe(7);
      expect(detail.interiorColor).toBe("Beige");
      expect(detail.fuelEconomy).toBe("8.5 L/100km");
    });
  });

  describe("3. Storage Failover & Cloudflare R2 Sync", () => {
    it("reports storage resilience status with R2 and MinIO info", async () => {
      const status = await getStorageResilienceStatus();
      expect(status).toHaveProperty("r2Configured");
      expect(status).toHaveProperty("r2Healthy");
      expect(status).toHaveProperty("minioConfigured");
      expect(status).toHaveProperty("minioHealthy");
      expect(typeof status.pendingCount).toBe("number");
      expect(Array.isArray(status.pendingFiles)).toBe(true);
    });

    it("saves to MinIO fallback and queues pending sync when R2 fails", async () => {
      // Mock R2 upload failure
      const r2Spy = vi.spyOn(r2Client, "uploadToR2").mockRejectedValueOnce(new Error("R2 503 Service Unavailable"));
      const minioSpy = vi.spyOn(minioClient, "uploadToMinio").mockResolvedValueOnce("/api/uploads/test-car.jpg");

      const testBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
      const resultUrl = await saveWithStorageFailover(testBuffer, "image/jpeg", "test-failover-car.jpg");

      expect(resultUrl).toBe("/api/uploads/test-failover-car.jpg");

      // Verify pendingStorageSync record was created
      const pendingRecord = await db.pendingStorageSync.findUnique({
        where: { fileName: "test-failover-car.jpg" },
      });

      expect(pendingRecord).toBeDefined();
      expect(pendingRecord?.fileName).toBe("test-failover-car.jpg");
      expect(pendingRecord?.status).toBe("PENDING");

      r2Spy.mockRestore();
      minioSpy.mockRestore();

      // Clean up test record
      await db.pendingStorageSync.delete({
        where: { fileName: "test-failover-car.jpg" },
      }).catch(() => {});
    });

    it("syncs pending files from reserved storage to Cloudflare R2", async () => {
      // Create a test pending sync record
      await db.pendingStorageSync.upsert({
        where: { fileName: "test-sync-car.jpg" },
        create: {
          fileName: "test-sync-car.jpg",
          mimeType: "image/jpeg",
          byteSize: 100,
          source: "MINIO",
          status: "PENDING",
        },
        update: {
          status: "PENDING",
        },
      });

      // Mock getFromMinio and uploadToR2
      const minioGetSpy = vi.spyOn(minioClient, "getFromMinio").mockResolvedValueOnce({
        body: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
        contentType: "image/jpeg",
      });
      const r2UploadSpy = vi.spyOn(r2Client, "uploadToR2").mockResolvedValueOnce("https://pub-r2/test-sync-car.jpg");

      const syncResult = await syncPendingFilesToR2();
      expect(syncResult.synced).toBeGreaterThanOrEqual(1);

      const updatedRecord = await db.pendingStorageSync.findUnique({
        where: { fileName: "test-sync-car.jpg" },
      });
      expect(updatedRecord?.status).toBe("SYNCED");
      expect(updatedRecord?.syncedAt).toBeDefined();

      minioGetSpy.mockRestore();
      r2UploadSpy.mockRestore();

      // Clean up
      await db.pendingStorageSync.delete({
        where: { fileName: "test-sync-car.jpg" },
      }).catch(() => {});
    });
  });
});
