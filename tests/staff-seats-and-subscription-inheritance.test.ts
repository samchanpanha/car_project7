import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET as getStaff, POST as postStaff } from "@/app/api/tenant/staff/route";
import { PATCH as patchStaff, DELETE as deleteStaff } from "@/app/api/tenant/staff/[memberId]/route";
import { canManageTenant, canWriteTenant } from "@/lib/api/guards";
import { db } from "@/lib/db";
import * as guards from "@/lib/api/guards";
import * as sessionModule from "@/lib/session";

describe("Staff Seats Limit & Subscription Inheritance Tests", () => {
  const mockTenant = { id: "ten_test_123", name: "Test Motors", slug: "test-motors", status: "ACTIVE" };
  const mockOwner = { id: "mem_owner_1", userId: "usr_owner_1", role: "OWNER", status: "ACTIVE", tenantId: mockTenant.id };
  const mockSalesStaff = { id: "mem_sales_1", userId: "usr_sales_1", role: "SALES_STAFF", status: "ACTIVE", tenantId: mockTenant.id };
  const mockDemoUser: sessionModule.DemoUser = {
    id: "usr_owner_1",
    name: "Owner",
    role: "DEALER",
    phone: "+85512000001",
    locale: "km",
    email: null,
    phoneVerified: true,
    avatarUrl: null,
    passwordHash: null,
    telegramId: null,
    telegramUsername: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    isBlacklisted: false,
    blacklistReason: null,
    blacklistedAt: null,
    sellerProfile: null,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("1. Role Guard Boundaries", () => {
    it("allows OWNER and MANAGER to manage staff and subscriptions", () => {
      expect(canManageTenant("OWNER")).toBe(true);
      expect(canManageTenant("MANAGER")).toBe(true);
      expect(canManageTenant("SALES_STAFF")).toBe(false);
      expect(canManageTenant("INVENTORY_MANAGER")).toBe(false);
    });

    it("allows OWNER, MANAGER, and INVENTORY_MANAGER to write inventory", () => {
      expect(canWriteTenant("OWNER")).toBe(true);
      expect(canWriteTenant("MANAGER")).toBe(true);
      expect(canWriteTenant("INVENTORY_MANAGER")).toBe(true);
      expect(canWriteTenant("SALES_STAFF")).toBe(false);
    });
  });

  describe("2. Seat Limits in Staff API", () => {
    it("returns seat metadata (seatsLimit, seatsUsed, plan) on GET /api/tenant/staff", async () => {
      vi.spyOn(guards, "requireTenantMember").mockResolvedValue({
        user: mockDemoUser,
        member: mockOwner as any,
        tenant: mockTenant as any,
      });

      vi.spyOn(db.tenantMember, "findMany").mockResolvedValue([
        {
          id: "mem_owner_1",
          userId: "usr_owner_1",
          role: "OWNER",
          status: "ACTIVE",
          createdAt: new Date(),
          user: { name: "Owner", phone: "+85512000001" },
        },
      ] as any);

      vi.spyOn(db.subscription, "findUnique").mockResolvedValue({
        id: "sub_1",
        tenantId: mockTenant.id,
        plan: "BASIC",
        status: "ACTIVE",
        seats: 3,
      } as any);

      const res = await getStaff();
      expect(res.status).toBe(200);
      const json = await res.json();

      expect(json.seatsLimit).toBe(3);
      expect(json.seatsUsed).toBe(1);
      expect(json.plan).toBe("BASIC");
      expect(json.members).toHaveLength(1);
    });

    it("blocks inviting staff when seat limit is reached (e.g. 1/1 on Free or 3/3 on Basic)", async () => {
      vi.spyOn(guards, "requireTenantMember").mockResolvedValue({
        user: mockDemoUser,
        member: mockOwner as any,
        tenant: mockTenant as any,
      });

      // Free plan with 1 seat
      vi.spyOn(db.subscription, "findUnique").mockResolvedValue({
        id: "sub_1",
        tenantId: mockTenant.id,
        plan: "FREE",
        status: "ACTIVE",
        seats: 1,
      } as any);

      // Already 1 active member (the owner)
      vi.spyOn(db.user, "findUnique").mockResolvedValue(null);
      vi.spyOn(db.tenantMember, "count").mockResolvedValue(1);

      const req = new Request("http://localhost/api/tenant/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Sokha Staff",
          phone: "+85512999888",
          role: "SALES_STAFF",
        }),
      });

      const res = await postStaff(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.code).toBe("SEAT_LIMIT_REACHED");
      expect(json.seatsLimit).toBe(1);
      expect(json.seatsUsed).toBe(1);
    });

    it("blocks inviting staff when dealership subscription is expired", async () => {
      vi.spyOn(guards, "requireTenantMember").mockResolvedValue({
        user: mockDemoUser,
        member: mockOwner as any,
        tenant: mockTenant as any,
      });

      vi.spyOn(db.subscription, "findUnique").mockResolvedValue({
        id: "sub_1",
        tenantId: mockTenant.id,
        plan: "BASIC",
        status: "EXPIRED",
        seats: 3,
      } as any);

      const req = new Request("http://localhost/api/tenant/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Sokha Staff",
          phone: "+85512999888",
          role: "SALES_STAFF",
        }),
      });

      const res = await postStaff(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.code).toBe("SUBSCRIPTION_EXPIRED");
    });

    it("allows inviting staff when seats are available", async () => {
      vi.spyOn(guards, "requireTenantMember").mockResolvedValue({
        user: mockDemoUser,
        member: mockOwner as any,
        tenant: mockTenant as any,
      });

      // Basic plan with 3 seats
      vi.spyOn(db.subscription, "findUnique").mockResolvedValue({
        id: "sub_1",
        tenantId: mockTenant.id,
        plan: "BASIC",
        status: "ACTIVE",
        seats: 3,
      } as any);

      // Only 1 seat used currently
      vi.spyOn(db.user, "findUnique").mockResolvedValue(null);
      vi.spyOn(db.tenantMember, "count").mockResolvedValue(1);

      const mockUpsertUser = vi.spyOn(db.user, "upsert").mockResolvedValue({
        id: "usr_new_staff",
        name: "Sokha Staff",
        phone: "+85512999888",
        role: "DEALER",
      } as any);

      const mockUpsertMember = vi.spyOn(db.tenantMember, "upsert").mockResolvedValue({
        id: "mem_new_staff",
        userId: "usr_new_staff",
        tenantId: mockTenant.id,
        role: "SALES_STAFF",
        status: "ACTIVE",
        createdAt: new Date(),
        user: { name: "Sokha Staff", phone: "+85512999888" },
      } as any);

      vi.spyOn(db.auditLog, "create").mockResolvedValue({} as any);

      const req = new Request("http://localhost/api/tenant/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Sokha Staff",
          phone: "+85512999888",
          role: "SALES_STAFF",
        }),
      });

      const res = await postStaff(req);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.name).toBe("Sokha Staff");
      expect(json.role).toBe("SALES_STAFF");
      expect(mockUpsertUser).toHaveBeenCalled();
      expect(mockUpsertMember).toHaveBeenCalled();
    });

    it("blocks reactivating a suspended staff member if seat limit is reached", async () => {
      vi.spyOn(guards, "requireTenantMember").mockResolvedValue({
        user: mockDemoUser,
        member: mockOwner as any,
        tenant: mockTenant as any,
      });

      vi.spyOn(db.tenantMember, "findFirst").mockResolvedValue({
        id: "mem_suspended_1",
        tenantId: mockTenant.id,
        userId: "usr_suspended_1",
        role: "SALES_STAFF",
        status: "SUSPENDED",
        user: { name: "Suspended Staff" },
      } as any);

      vi.spyOn(db.subscription, "findUnique").mockResolvedValue({
        id: "sub_1",
        tenantId: mockTenant.id,
        plan: "FREE",
        status: "ACTIVE",
        seats: 1,
      } as any);

      // 1 seat already used by the owner
      vi.spyOn(db.tenantMember, "count").mockResolvedValue(1);

      const req = new Request("http://localhost/api/tenant/staff/mem_suspended_1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ACTIVE" }),
      });

      const res = await patchStaff(req, { params: Promise.resolve({ memberId: "mem_suspended_1" }) });
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.code).toBe("SEAT_LIMIT_REACHED");
    });

    it("allows removing a staff member to free up a seat", async () => {
      vi.spyOn(guards, "requireTenantMember").mockResolvedValue({
        user: mockDemoUser,
        member: mockOwner as any,
        tenant: mockTenant as any,
      });

      vi.spyOn(db.tenantMember, "findFirst").mockResolvedValue({
        id: "mem_suspended_1",
        tenantId: mockTenant.id,
        userId: "usr_suspended_1",
        role: "SALES_STAFF",
        status: "SUSPENDED",
        user: { name: "Suspended Staff" },
      } as any);

      vi.spyOn(db.subscription, "findUnique").mockResolvedValue({
        id: "sub_1",
        tenantId: mockTenant.id,
        plan: "FREE",
        status: "ACTIVE",
        seats: 1,
      } as any);

      // 1 seat already used by the owner
      vi.spyOn(db.tenantMember, "count").mockResolvedValue(1);

      const req = new Request("http://localhost/api/tenant/staff/mem_suspended_1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ACTIVE" }),
      });

      const res = await patchStaff(req, { params: Promise.resolve({ memberId: "mem_suspended_1" }) });
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.code).toBe("SEAT_LIMIT_REACHED");
    });

    it("allows removing a staff member to free up a seat", async () => {
      vi.spyOn(guards, "requireTenantMember").mockResolvedValue({
        user: mockDemoUser,
        member: mockOwner as any,
        tenant: mockTenant as any,
      });

      vi.spyOn(db.tenantMember, "findFirst").mockResolvedValue({
        id: "mem_to_remove",
        tenantId: mockTenant.id,
        userId: "usr_to_remove",
        role: "SALES_STAFF",
        status: "ACTIVE",
        user: { name: "Former Staff" },
      } as any);

      const deleteSpy = vi.spyOn(db.tenantMember, "delete").mockResolvedValue({} as any);
      vi.spyOn(db.auditLog, "create").mockResolvedValue({} as any);

      const req = new Request("http://localhost/api/tenant/staff/mem_to_remove", {
        method: "DELETE",
      });

      const res = await deleteStaff(req, { params: Promise.resolve({ memberId: "mem_to_remove" }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(deleteSpy).toHaveBeenCalledWith({ where: { id: "mem_to_remove" } });
    });
  });

  describe("3. Subscription Inheritance & Expiry Suspension", () => {
    it("suspends car creation for staff when parent dealership subscription is inactive/expired", async () => {
      const { POST: postVehicle } = await import("@/app/api/vehicles/route");

      vi.spyOn(sessionModule, "isGuestRequest").mockResolvedValue(false);
      vi.spyOn(sessionModule, "getDemoUser").mockResolvedValue({
        id: "usr_sales_1",
        name: "Sales Staff",
        role: "DEALER",
        phone: "+85512999888",
        locale: "km",
      } as any);
      vi.spyOn(sessionModule, "getCurrentUser").mockResolvedValue({
        id: "usr_sales_1",
        name: "Sales Staff",
        role: "DEALER",
        phone: "+85512999888",
        locale: "km",
      } as any);

      vi.spyOn(db.tenantMember, "findFirst").mockResolvedValue({
        userId: "usr_sales_1",
        tenantId: mockTenant.id,
        status: "ACTIVE",
        role: "SALES_STAFF",
        tenant: {
          ...mockTenant,
          subscription: {
            plan: "BASIC",
            status: "EXPIRED", // Dealership expired
            listingsLimit: 15,
          },
        },
      } as any);

      const req = new Request("http://localhost/api/vehicles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          make: "Toyota",
          model: "Prius",
          year: 2022,
          priceUsd: 28000,
          mileageKm: 30000,
          transmission: "AUTOMATIC",
          fuel: "HYBRID",
          bodyType: "SEDAN",
          city: "Phnom Penh",
          accidentDeclared: "NONE_DECLARED",
        }),
      });

      const res = await postVehicle(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.code).toBe("DEALERSHIP_SUBSCRIPTION_EXPIRED");
    });

    it("allows car creation when parent dealership subscription is ACTIVE", async () => {
      const { POST: postVehicle } = await import("@/app/api/vehicles/route");

      vi.spyOn(sessionModule, "isGuestRequest").mockResolvedValue(false);
      vi.spyOn(sessionModule, "getDemoUser").mockResolvedValue({
        id: "usr_sales_1",
        name: "Sales Staff",
        role: "DEALER",
        phone: "+85512999888",
        locale: "km",
      } as any);
      vi.spyOn(sessionModule, "getCurrentUser").mockResolvedValue({
        id: "usr_sales_1",
        name: "Sales Staff",
        role: "DEALER",
        phone: "+85512999888",
        locale: "km",
      } as any);

      vi.spyOn(db.tenantMember, "findFirst").mockResolvedValue({
        userId: "usr_sales_1",
        tenantId: mockTenant.id,
        status: "ACTIVE",
        role: "SALES_STAFF",
        tenant: {
          ...mockTenant,
          subscription: {
            plan: "PRO",
            status: "ACTIVE", // Parent subscription active
            listingsLimit: 50,
          },
        },
      } as any);

      vi.spyOn(db.vehicle, "count").mockResolvedValue(5); // 5 of 50 used

      const createSpy = vi.spyOn(db.vehicle, "create").mockResolvedValue({
        id: "veh_new_car_123",
      } as any);

      const req = new Request("http://localhost/api/vehicles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          make: "Lexus",
          model: "RX350",
          year: 2023,
          priceUsd: 85000,
          mileageKm: 15000,
          transmission: "AUTOMATIC",
          fuel: "PETROL",
          bodyType: "SUV",
          city: "Phnom Penh",
          accidentDeclared: "NONE_DECLARED",
          images: Array.from({ length: 25 }, (_, i) => `https://cars-storage.r2/photo_${i}.jpg`),
        }),
      });

      const res = await postVehicle(req);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.vehicle.id).toBe("veh_new_car_123");

      // Verify the car was assigned to the parent dealership tenantId and createdById was the staff
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: mockTenant.id,
            createdById: "usr_sales_1",
            make: "Lexus",
            model: "RX350",
          }),
        }),
      );
    });
  });

  describe("4. Unlimited Images Support", () => {
    it("accepts listings with 30+ photos without truncation", async () => {
      const { POST: postVehicle } = await import("@/app/api/vehicles/route");

      vi.spyOn(sessionModule, "isGuestRequest").mockResolvedValue(false);
      vi.spyOn(sessionModule, "getDemoUser").mockResolvedValue({
        id: "usr_owner_1",
        name: "Owner",
        role: "DEALER",
        phone: "+85512000001",
        locale: "km",
      } as any);
      vi.spyOn(sessionModule, "getCurrentUser").mockResolvedValue({
        id: "usr_owner_1",
        name: "Owner",
        role: "DEALER",
        phone: "+85512000001",
        locale: "km",
      } as any);

      vi.spyOn(db.tenantMember, "findFirst").mockResolvedValue({
        userId: "usr_owner_1",
        tenantId: mockTenant.id,
        status: "ACTIVE",
        role: "OWNER",
        tenant: {
          ...mockTenant,
          subscription: {
            plan: "PRO",
            status: "ACTIVE",
            listingsLimit: 50,
          },
        },
      } as any);

      vi.spyOn(db.vehicle, "count").mockResolvedValue(1);

      let createdData: any = null;
      (vi.spyOn(db.vehicle, "create") as any).mockImplementation(async (args: any) => {
        createdData = args.data;
        return { id: "veh_unlimited_photos" };
      });

      // 40 high resolution photo URLs
      const photoUrls = Array.from({ length: 40 }, (_, i) => `https://cars-storage.r2.cloudflarestorage.com/image_${i}.webp`);

      const req = new Request("http://localhost/api/vehicles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          make: "Porsche",
          model: "Cayenne",
          year: 2024,
          priceUsd: 165000,
          mileageKm: 5000,
          transmission: "AUTOMATIC",
          fuel: "PETROL",
          bodyType: "SUV",
          city: "Phnom Penh",
          accidentDeclared: "NONE_DECLARED",
          images: photoUrls,
        }),
      });

      const res = await postVehicle(req);
      expect(res.status).toBe(201);
      expect(createdData.images.create).toHaveLength(40);
      expect(createdData.images.create[0]).toEqual({ url: photoUrls[0], sortOrder: 0 });
      expect(createdData.images.create[39]).toEqual({ url: photoUrls[39], sortOrder: 39 });
    });
  });
});
