// KhLan — demo seed script (Cambodia AI car marketplace)
import crypto from "node:crypto";
// Run with: bun prisma/seed.ts
// Deterministic ids so API routes / frontend can reference them (see worklog Task 2-b).

import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import type { ReportCheck } from "../src/lib/types";
import seedImages from "./seed-images.json";

// Belt & suspenders: Prisma Client usually loads .env itself, but make sure
// DATABASE_URL is available when running via `bun prisma/seed.ts`.
if (!process.env.DATABASE_URL) {
  const envFile = path.resolve(import.meta.dir, "..", ".env");
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
      }
    }
  }
}

const prisma = new PrismaClient();

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const daysAgo = (d: number) => new Date(Date.now() - d * DAY);
const daysFromNow = (d: number) => new Date(Date.now() + d * DAY);
const hoursAgo = (h: number) => new Date(Date.now() - h * HOUR);
// N days from now at a fixed local hour (for appointment demo slots, e.g. 10:00).
const daysFromNowAt = (d: number, hour: number) => {
  const dt = daysFromNow(d);
  dt.setHours(hour, 0, 0, 0);
  return dt;
};

// Dealer seller users own tenant-scoped vehicles; private sellers stay tenantId null.
const TENANT_BY_SELLER: Record<string, string> = {
  usr_dealer_sokha: "tenant_sokha",
  usr_dealer_ppauto: "tenant_ppauto",
};

const IMG = seedImages as Record<string, string[]>;

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

async function seedUsers() {
  await prisma.user.createMany({
    data: [
      {
        id: "usr_demo_buyer",
        phone: "+85511998877",
        name: "Dara Sok",
        role: "BUYER",
        locale: "km",
        phoneVerified: true,
      },
      {
        id: "usr_dealer_sokha",
        phone: "+85512998001",
        name: "Sokha Chea",
        role: "DEALER",
        phoneVerified: true,
      },
      {
        id: "usr_dealer_ppauto",
        phone: "+85512998002",
        name: "Rithy Chan",
        role: "DEALER",
        phoneVerified: true,
      },
      {
        id: "usr_priv_vireak",
        phone: "+85512998003",
        name: "Vireak Tan",
        role: "SELLER",
      },
      {
        id: "usr_priv_sopheak",
        phone: "+85512998004",
        name: "Sopheak Ngin",
        role: "SELLER",
      },
      {
        id: "usr_admin",
        phone: "+85512998009",
        name: "Nita Meng",
        role: "SUPER_ADMIN",
      },
      {
        id: "usr_staff_chan",
        phone: "+85511223344",
        name: "Chan Rithy",
        role: "DEALER",
        phoneVerified: true,
      },
      {
        id: "usr_staff_sophea",
        phone: "+85511556677",
        name: "Sophea Tep",
        role: "DEALER",
        phoneVerified: true,
      },
    ],
  });

  // Auth demo data: every persona shares the password "khlan123" (scrypt
  // salt:hash, matching src/lib/auth.ts) so the login form is testable;
  // the buyer carries a demo Telegram binding for Mini App sign-in testing.
  const salt = crypto.randomBytes(16).toString("hex");
  const demoHash = `${salt}:${crypto.scryptSync("khlan123", salt, 64).toString("hex")}`;
  await prisma.user.updateMany({
    where: { id: { in: ["usr_demo_buyer", "usr_dealer_sokha", "usr_staff_chan", "usr_staff_sophea", "usr_dealer_ppauto", "usr_priv_vireak", "usr_priv_sopheak", "usr_admin"] } },
    data: { passwordHash: demoHash },
  });
  await prisma.user.update({
    where: { id: "usr_demo_buyer" },
    data: { telegramId: "77700001", telegramUsername: "dara_khlan" },
  });
}

async function seedSellerProfiles() {
  await prisma.sellerProfile.createMany({
    data: [
      {
        userId: "usr_dealer_sokha",
        type: "DEALER",
        shopName: "Sokha Motors",
        tenantId: "tenant_sokha",
        city: "Phnom Penh",
        verified: true,
        verification: "VERIFIED",
        responseRate: 96,
        ratingAvg: 4.7,
        ratingCount: 128,
        memberSince: new Date("2021-03-15T00:00:00Z"),
        bio: "Trusted dealer of premium Japanese SUVs and MPVs in Phnom Penh since 2015. Every car inspected and documented.",
        bioKm:
          "ពាណិជ្ជករទំនុកចិត្ត លក់ឡានត្រកូលជប៉ុនពីឆ្នាំ២០១៥។ ឡានទាំងអស់ត្រូវបានពិនិត្យនិងមានឯកសារច្បាស់លាស់។",
        phone: "+85512998001",
        telegram: "@sokhamotors",
      },
      {
        userId: "usr_dealer_ppauto",
        type: "DEALER",
        shopName: "PP Auto Trust",
        tenantId: "tenant_ppauto",
        city: "Phnom Penh",
        verified: true,
        verification: "VERIFIED",
        responseRate: 88,
        ratingAvg: 4.4,
        ratingCount: 63,
        memberSince: new Date("2022-07-01T00:00:00Z"),
        bio: "Family-run dealership focusing on well-maintained family SUVs and crossovers.",
        bioKm: "រង្វាន់គ្រួសារលក់ឡានគ្រួសារដែលថែរក្សាល្អ។",
      },
      {
        userId: "usr_priv_vireak",
        type: "PRIVATE",
        city: "Phnom Penh",
        verified: false,
        verification: "UNVERIFIED",
        responseRate: 72,
        ratingAvg: 4.1,
        ratingCount: 7,
        memberSince: new Date("2024-02-10T00:00:00Z"),
      },
      {
        userId: "usr_priv_sopheak",
        type: "PRIVATE",
        city: "Kandal",
        verified: false,
        verification: "UNVERIFIED",
        responseRate: 64,
        ratingAvg: 3.9,
        ratingCount: 4,
        memberSince: new Date("2024-09-22T00:00:00Z"),
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// Tenants (multi-tenant dealership orgs), members & subscriptions
// ---------------------------------------------------------------------------

async function seedTenants() {
  await prisma.tenant.createMany({
    data: [
      {
        id: "tenant_sokha",
        name: "Sokha Motors Group",
        slug: "sokha-motors",
        city: "Phnom Penh",
        address: "St. 271, Toul Kork",
        phone: "+85511777888",
        telegram: "@sokhamotors",
        verified: true,
        verification: "VERIFIED",
        status: "ACTIVE",
        bio: "Sokha Motors Group is a trusted Phnom Penh dealership group with two showrooms, offering fully inspected and documented vehicles backed by transparent AI history reports.",
        bioKm:
          "ក្រុមហ៊ុន Sokha Motors Group គឺជាក្រុមអាជីវកម្មលក់ឡានដែលមានទំនុកចិត្តនៅភ្នំពេញ មានសាលបង្ហាញ ២ ដែលលក់ឡានបានពិនិត្យពេញលេញ និងមានរបាយការណ៍ AI ច្បាស់លាស់។",
      },
      {
        id: "tenant_ppauto",
        name: "PP Auto Trust",
        slug: "pp-auto-trust",
        city: "Phnom Penh",
        address: "Russian Blvd 110",
        phone: "+85512444555",
        verified: false,
        verification: "PENDING",
        status: "ACTIVE",
        bio: "Family-run dealership on Russian Blvd focusing on well-maintained family SUVs and crossovers.",
        bioKm: "ក្រុមហ៊ុនលក់ឡានគ្រួសារនៅផ្លូវរុស្ស៊ី ផ្តោតលើឡានគ្រួសារដែលថែរក្សាល្អ។",
      },
    ],
  });

  await prisma.tenantMember.createMany({
    data: [
      { tenantId: "tenant_sokha", userId: "usr_dealer_sokha", role: "OWNER" },
      { tenantId: "tenant_sokha", userId: "usr_staff_chan", role: "SALES_STAFF" },
      {
        tenantId: "tenant_sokha",
        userId: "usr_staff_sophea",
        role: "INVENTORY_MANAGER",
      },
      { tenantId: "tenant_ppauto", userId: "usr_dealer_ppauto", role: "OWNER" },
    ],
  });

  // Plans/limits match the PlanDTO tier contract in src/lib/dashboard-types.ts.
  await prisma.subscription.createMany({
    data: [
      {
        tenantId: "tenant_sokha",
        plan: "PRO",
        status: "ACTIVE",
        billingCycle: "MONTHLY",
        priceUsd: 149,
        listingsLimit: 50,
        featuredLimit: 10,
        seats: 8,
        startedAt: daysAgo(45),
        currentPeriodEnd: daysFromNow(15),
      },
      {
        tenantId: "tenant_ppauto",
        plan: "BASIC",
        status: "ACTIVE",
        billingCycle: "MONTHLY",
        priceUsd: 49,
        listingsLimit: 15,
        featuredLimit: 3,
        seats: 3,
        startedAt: daysAgo(20),
        currentPeriodEnd: daysFromNow(10),
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// Dashboard demo data: saved searches, appointments, platform settings
// ---------------------------------------------------------------------------

async function seedDashboardData() {
  // Customer dashboard — saved searches for the demo buyer.
  await prisma.savedSearch.createMany({
    data: [
      {
        userId: "usr_demo_buyer",
        name: "SUVs under $30k",
        queryJson: JSON.stringify({ bodyType: "SUV", priceMax: 30000, sort: "newest" }),
        alertsEnabled: true,
      },
      {
        userId: "usr_demo_buyer",
        name: "Toyota latest",
        queryJson: JSON.stringify({ make: "Toyota", sort: "newest" }),
        alertsEnabled: false,
      },
    ],
  });

  // Buyer appointments — sellerId/tenantId mirror the vehicle's owner.
  await prisma.appointment.createMany({
    data: [
      {
        id: "apt_demo_prado",
        vehicleId: "veh_prado_2018",
        buyerId: "usr_demo_buyer",
        sellerId: "usr_dealer_sokha",
        tenantId: "tenant_sokha",
        scheduledAt: daysFromNowAt(3, 10),
        status: "REQUESTED",
        notes: "Want to inspect and test drive on weekend.",
        createdAt: daysAgo(1),
      },
      {
        id: "apt_demo_lexus",
        vehicleId: "veh_lexus_rx350",
        buyerId: "usr_demo_buyer",
        sellerId: "usr_dealer_sokha",
        tenantId: "tenant_sokha",
        scheduledAt: daysFromNowAt(2, 14),
        status: "CONFIRMED",
        notes: "Please prepare service records.",
        createdAt: daysAgo(1),
      },
      {
        id: "apt_demo_crv",
        vehicleId: "veh_crv_2019",
        buyerId: "usr_demo_buyer",
        sellerId: "usr_dealer_ppauto",
        tenantId: "tenant_ppauto",
        scheduledAt: daysAgo(6),
        status: "COMPLETED",
        notes: null,
        createdAt: daysAgo(8),
      },
    ],
  });

  // Platform settings (super admin dashboard) — valueJson stores the raw JSON value.
  await prisma.platformSetting.createMany({
    data: [
      { key: "commissionPct", valueJson: JSON.stringify(2.5) },
      { key: "featuredListingPriceUsd", valueJson: JSON.stringify(25) },
      { key: "autoApproveListings", valueJson: JSON.stringify(false) },
      { key: "maintenanceMode", valueJson: JSON.stringify(false) },
      // Manual KHQR payment instructions shown to sellers (KHQR payload intentionally
      // empty — the Super Admin pastes their own bank-issued KHQR in Settings).
      {
        key: "payments.manualConfig",
        valueJson: JSON.stringify({
          accountName: "KhLan Payments (Sokha Chan)",
          khqrPayload: null,
          khqrImageUrl: null,
          instructionsEn:
            "1. Scan the KHQR with your banking app\n2. Transfer the exact USD amount\n3. Include the payment reference in the transfer note\n4. Submit your bank transaction reference here\n5. Contact the admin on Telegram after paying",
          instructionsKm:
            "១. ស្កេន KHQR ដោយកម្មវិធីធនាគាររបស់អ្នក\n២. បញ្ជូនចំនួនត្រឹមត្រូវជាដុល្លារ\n៣. ដាក់លេខយោងក្នុងកំណត់សម្គាល់បញ្ជូន\n៤. ដាក់ស្នើលេខយោងប្រតិបត្តិការធនាគារនៅទីនេះ\n៥. ទាក់ទងអ្នកគ្រប់គ្រងតាម Telegram បន្ទាប់ពីបញ្ជូន",
          telegram: "@khlan_admin",
        }),
      },
    ],
  });

  // Subscription payment demo — one manual request awaiting admin verification.
  await prisma.subscriptionPayment.create({
    data: {
      id: "pay_demo_manual_1",
      tenantId: "tenant_ppauto",
      plan: "BASIC",
      billingCycle: "MONTHLY",
      amountUsd: 49,
      months: 1,
      method: "MANUAL",
      status: "AWAITING_VERIFICATION",
      reference: "PAY-DEMO-000001",
      manualRef: "FT241118Z8877",
      note: "Transferred via ACLEDA this morning, receipt attached.",
      createdAt: daysAgo(1),
    },
  });

  // Buyer purchase requests — one pending, one accepted (seller can complete it).
  await prisma.purchaseRequest.createMany({
    data: [
      {
        id: "pur_demo_prado",
        vehicleId: "veh_prado_2018",
        buyerId: "usr_demo_buyer",
        tenantId: "tenant_sokha",
        sellerUserId: "usr_dealer_sokha",
        status: "PENDING",
        message: "Hi, I inspected the Prado yesterday. I'd like to buy it at the listed price — can we finalize this week?",
        priceUsd: 52500,
        createdAt: daysAgo(1),
      },
      {
        id: "pur_demo_crv",
        vehicleId: "veh_crv_2019",
        buyerId: "usr_demo_buyer",
        tenantId: "tenant_ppauto",
        sellerUserId: "usr_dealer_ppauto",
        status: "ACCEPTED",
        message: "Please hold the CR-V for me, my loan approval is nearly done.",
        priceUsd: 25900,
        decidedById: "usr_dealer_ppauto",
        decidedAt: daysAgo(2),
        createdAt: daysAgo(3),
      },
    ],
  });

  // Tenant lifecycle audit entries.
  const sokhaSub = await prisma.subscription.findUnique({
    where: { tenantId: "tenant_sokha" },
  });
  await prisma.auditLog.createMany({
    data: [
      {
        actorId: "usr_dealer_sokha",
        action: "TENANT_CREATED",
        entity: "Tenant",
        entityId: "tenant_sokha",
        metaJson: JSON.stringify({ name: "Sokha Motors Group", slug: "sokha-motors" }),
        createdAt: daysAgo(46),
      },
      {
        actorId: "usr_dealer_sokha",
        action: "SUBSCRIPTION_STARTED",
        entity: "Subscription",
        entityId: sokhaSub?.id ?? null,
        metaJson: JSON.stringify({
          plan: "PRO",
          billingCycle: "MONTHLY",
          priceUsd: 149,
          tenantId: "tenant_sokha",
        }),
        createdAt: daysAgo(45),
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// Vehicles
// ---------------------------------------------------------------------------

interface SeedVehicle {
  id: string;
  sellerId: string;
  slug: string;
  imgCount: number;
  make: string;
  model: string;
  variant?: string;
  year: number;
  priceUsd: number;
  mileageKm: number;
  transmission: string;
  fuel: string;
  engineCc?: number;
  drivetrain?: string;
  bodyType: string;
  exteriorColor?: string;
  city: string;
  district?: string;
  description?: string;
  descriptionKm?: string;
  status?: string;
  featured?: boolean;
  views: number;
  daysAgo: number;
  vinLast6?: string;
  plateNo?: string;
  ownershipCount?: number;
  accidentDeclared?: string;
  importOrigin?: string;
  docs: { type: string; status: string; notes?: string }[];
}

const VEHICLES: SeedVehicle[] = [
  {
    id: "veh_prado_2018",
    sellerId: "usr_dealer_sokha",
    slug: "prado",
    imgCount: 4,
    make: "Toyota",
    model: "Land Cruiser Prado",
    variant: "TX",
    year: 2018,
    priceUsd: 52500,
    mileageKm: 89000,
    transmission: "AUTOMATIC",
    fuel: "DIESEL",
    engineCc: 2800,
    drivetrain: "AWD",
    bodyType: "SUV",
    exteriorColor: "white",
    city: "Phnom Penh",
    district: "Chamkarmon",
    description:
      "Single-owner overseas unit, full service history at authorized workshop. New tires, clean interior, no repaint. Documents complete: registration book and import declaration available for inspection.",
    descriptionKm:
      "ឡានស្អាត ប្រវត្តិសកម្រងពេញលេញ កង់ថ្មី ខាងក្នុងស្អាត គ្មានសព្ទថ្ម។ ឯកសារពេញលេញ។",
    featured: true,
    views: 2140,
    daysAgo: 2,
    vinLast6: "T8H229",
    plateNo: "1KH-8823",
    ownershipCount: 2,
    accidentDeclared: "NONE_DECLARED",
    importOrigin: "DUBAI",
    docs: [
      { type: "REGISTRATION_BOOK", status: "VERIFIED" },
      { type: "IMPORT_DECLARATION", status: "VERIFIED" },
      {
        type: "SERVICE_RECORD",
        status: "PROVIDED",
        notes: "Authorized workshop records 2019-2024",
      },
    ],
  },
  {
    id: "veh_lexus_rx350",
    sellerId: "usr_dealer_sokha",
    slug: "lexus",
    imgCount: 4,
    make: "Lexus",
    model: "RX",
    variant: "350",
    year: 2015,
    priceUsd: 34900,
    mileageKm: 118000,
    transmission: "AUTOMATIC",
    fuel: "PETROL",
    engineCc: 3500,
    drivetrain: "AWD",
    bodyType: "SUV",
    exteriorColor: "pearl white",
    city: "Phnom Penh",
    district: "Toul Kork",
    description:
      "US-imported RX 350 in good condition. Minor parking-lot dent repaired on rear bumper (documented). Navigation and leather in great shape.",
    descriptionKm:
      "RX 350 នាំចូលពីអាមេរិក ស្ថានភាពល្អ។ ស្ពានក្រោយបានជួសជុលគ្រោះថ្នាក់តូច (មានឯកសារបញ្ជាក់)។ ប្រព័ន្ធនាវាចរណ៍ និងកៅអ៊ីស្បែកនៅល្អ។",
    featured: true,
    views: 1860,
    daysAgo: 6,
    vinLast6: "5T4119",
    plateNo: "2AB-1194",
    ownershipCount: 3,
    accidentDeclared: "MINOR_DECLARED",
    importOrigin: "USA",
    docs: [
      { type: "REGISTRATION_BOOK", status: "PROVIDED" },
      { type: "IMPORT_DECLARATION", status: "PROVIDED" },
      { type: "SERVICE_RECORD", status: "MISSING" },
    ],
  },
  {
    id: "veh_revo_2020",
    sellerId: "usr_priv_vireak",
    slug: "revo",
    imgCount: 4,
    make: "Toyota",
    model: "Hilux Revo",
    variant: "2.8 G",
    year: 2020,
    priceUsd: 29800,
    mileageKm: 76000,
    transmission: "MANUAL",
    fuel: "DIESEL",
    engineCc: 2800,
    drivetrain: "4WD",
    bodyType: "PICKUP",
    exteriorColor: "silver",
    city: "Phnom Penh",
    district: "Sen Sok",
    description:
      "One-owner Thai import used for both work and family. Engine and 4WD system strong on test drives. Serviced on schedule, new battery and tires.",
    descriptionKm:
      "ឡានម្ចាស់តែម្នាក់ នាំចូលពីប្រទេសថៃ។ ម៉ាស៊ីន និងប្រព័ន្ធ 4WD នៅមានកម្លាំងល្អ។ ការថែទាំទាន់ពេលវេលា ថ្ម និងកង់ថ្មី។",
    views: 940,
    daysAgo: 10,
    plateNo: "3CD-5567",
    ownershipCount: 1,
    accidentDeclared: "NONE_DECLARED",
    importOrigin: "THAILAND",
    docs: [
      { type: "REGISTRATION_BOOK", status: "PROVIDED" },
      {
        type: "IMPORT_DECLARATION",
        status: "MISSING",
        notes: "Seller to provide before sale",
      },
    ],
  },
  {
    id: "veh_crv_2019",
    sellerId: "usr_dealer_ppauto",
    slug: "crv",
    imgCount: 4,
    make: "Honda",
    model: "CR-V",
    variant: "1.5 Turbo",
    year: 2019,
    priceUsd: 25900,
    mileageKm: 95000,
    transmission: "AUTOMATIC",
    fuel: "PETROL",
    engineCc: 1500,
    drivetrain: "FWD",
    bodyType: "SUV",
    exteriorColor: "gray",
    city: "Phnom Penh",
    district: "Mean Chey",
    description:
      "Well-kept CR-V turbo: smooth CVT, excellent fuel economy, non-smoker interior. All electronics working. A great family SUV.",
    descriptionKm:
      "CR-V ទួរបូថែរក្សាល្អ បញ្ជូនរលូន សន្សំសាំង។ ខាងក្នុងស្អាត ឧបករណ៍អេឡិចត្រូនិកទាំងអស់ដំណើរការល្អ។ ល្អសម្រាប់គ្រួសារ។",
    featured: true,
    views: 1520,
    daysAgo: 14,
    vinLast6: "2HK331",
    ownershipCount: 1,
    accidentDeclared: "NONE_DECLARED",
    importOrigin: "THAILAND",
    docs: [
      { type: "REGISTRATION_BOOK", status: "VERIFIED" },
      { type: "IMPORT_DECLARATION", status: "PROVIDED" },
    ],
  },
  {
    id: "veh_camry_2018",
    sellerId: "usr_priv_sopheak",
    slug: "camry",
    imgCount: 4,
    make: "Toyota",
    model: "Camry",
    variant: "2.0 G",
    year: 2018,
    priceUsd: 21500,
    mileageKm: 124000,
    transmission: "AUTOMATIC",
    fuel: "PETROL",
    engineCc: 2000,
    drivetrain: "FWD",
    bodyType: "SEDAN",
    exteriorColor: "black",
    city: "Phnom Penh",
    district: "Chamkarmon",
    description:
      "urgent sale this week — owner relocating abroad. Daily-driver condition, engine and transmission smooth. Priced below market for a quick sale; import declaration to be provided.",
    descriptionKm:
      "លក់ប្រញាប់ក្នុងសប្តាហ៍នេះ — ម្ចាស់ត្រូវចេញដំណើរទៅបរទេស។ ឡានប្រើប្រចាំថ្ងៃ ម៉ាស៊ីន និងការបញ្ជូនដំណើរការរលូន។ តម្លៃក្រោមទីផ្សារសម្រាប់លក់រហ័ស។",
    views: 720,
    daysAgo: 18,
    plateNo: "1EF-7781",
    ownershipCount: 2,
    accidentDeclared: "UNKNOWN",
    importOrigin: "LOCAL",
    docs: [
      { type: "REGISTRATION_BOOK", status: "PROVIDED" },
      { type: "IMPORT_DECLARATION", status: "MISSING" },
      { type: "SERVICE_RECORD", status: "MISSING" },
    ],
  },
  {
    id: "veh_ranger_2019",
    sellerId: "usr_priv_vireak",
    slug: "ranger",
    imgCount: 4,
    make: "Ford",
    model: "Ranger",
    variant: "Wildtrak 2.0",
    year: 2019,
    priceUsd: 24700,
    mileageKm: 102000,
    transmission: "AUTOMATIC",
    fuel: "DIESEL",
    engineCc: 2000,
    drivetrain: "4WD",
    bodyType: "PICKUP",
    exteriorColor: "white",
    city: "Kandal",
    district: "Ta Khmau",
    description:
      "Wildtrak 2.0 with declared minor panel damage (door dent professionally repaired, documented). 4WD and towing package fully functional. New all-terrain tires.",
    descriptionKm:
      "Wildtrak មានប្រកាសគ្រោះថ្នាក់តូចតាច (ស្ពានទ្វារបានជួសជុលដោយវិជ្ជាជីវៈ មានឯកសារបញ្ជាក់)។ ប្រព័ន្ធ 4WD ដំណើរការពេញលេញ។ កង់ថ្មី។",
    views: 880,
    daysAgo: 22,
    plateNo: "3BK-2201",
    ownershipCount: 1,
    accidentDeclared: "MINOR_DECLARED",
    importOrigin: "THAILAND",
    docs: [
      { type: "REGISTRATION_BOOK", status: "PROVIDED" },
      { type: "SERVICE_RECORD", status: "PROVIDED" },
    ],
  },
  {
    id: "veh_tucson_2020",
    sellerId: "usr_dealer_ppauto",
    slug: "tucson",
    imgCount: 4,
    make: "Hyundai",
    model: "Tucson",
    variant: "2.0",
    year: 2020,
    priceUsd: 23400,
    mileageKm: 68000,
    transmission: "AUTOMATIC",
    fuel: "PETROL",
    engineCc: 2000,
    drivetrain: "FWD",
    bodyType: "SUV",
    exteriorColor: "white",
    city: "Phnom Penh",
    district: "Russey Keo",
    description:
      "Korean import with low mileage and clean body panels. Registration book platform-verified. Great-value family crossover.",
    descriptionKm:
      "Tucson នាំចូលពីកូរ៉េ ចំនួនគ.មតិច សន្លឹកខាងក្រៅស្អាត។ សៀវភៅចុះបញ្ជីបានផ្ទៀងផ្ទាត់ដោយវេទិកា។ តម្លៃល្អសម្រាប់ឡានគ្រួសារ។",
    views: 760,
    daysAgo: 26,
    vinLast6: "KMHD241",
    ownershipCount: 1,
    accidentDeclared: "NONE_DECLARED",
    importOrigin: "KOREA",
    docs: [
      { type: "REGISTRATION_BOOK", status: "VERIFIED" },
      { type: "IMPORT_DECLARATION", status: "PROVIDED" },
    ],
  },
  {
    id: "veh_carnival_2018",
    sellerId: "usr_dealer_ppauto",
    slug: "carnival",
    imgCount: 4,
    make: "Kia",
    model: "Carnival",
    variant: "2.2 D",
    year: 2018,
    priceUsd: 27300,
    mileageKm: 131000,
    transmission: "AUTOMATIC",
    fuel: "DIESEL",
    engineCc: 2200,
    drivetrain: "FWD",
    bodyType: "VAN",
    exteriorColor: "silver",
    city: "Phnom Penh",
    district: "Toul Kork",
    description:
      "Spacious 8-seat Carnival, ideal for family use or airport transfer business. Oil changed on schedule, new tires all round. Third row folds flat.",
    descriptionKm:
      "Carnival កៅអ៊ី ៨ ធំធេង ល្អសម្រាប់គ្រួសារ ឬសេវាដឹកជន។ ប្តូរប្រេងទាន់ពេល កង់ថ្មីទាំង ៤។ កៅអ៊ីជួរទី៣អាចបត់បានរាបស្មើ។",
    views: 690,
    daysAgo: 30,
    plateNo: "2GH-9014",
    ownershipCount: 3,
    accidentDeclared: "NONE_DECLARED",
    importOrigin: "KOREA",
    docs: [
      { type: "REGISTRATION_BOOK", status: "PROVIDED" },
      { type: "IMPORT_DECLARATION", status: "PROVIDED" },
      { type: "SERVICE_RECORD", status: "PROVIDED" },
    ],
  },
  {
    id: "veh_vellfire_2017",
    sellerId: "usr_dealer_sokha",
    slug: "vellfire",
    imgCount: 4,
    make: "Toyota",
    model: "Vellfire",
    variant: "2.5 Z",
    year: 2017,
    priceUsd: 49800,
    mileageKm: 92000,
    transmission: "AUTOMATIC",
    fuel: "HYBRID",
    engineCc: 2500,
    drivetrain: "FWD",
    bodyType: "VAN",
    exteriorColor: "black",
    city: "Phnom Penh",
    district: "Chamkarmon",
    description:
      "Japan-imported Vellfire 2.5 Z hybrid, full options: power doors, twin sunroof, premium audio. Immaculate garage-kept interior. Complete documents including technical inspection certificate.",
    descriptionKm:
      "Vellfire 2.5 Z Hybrid នាំចូលពីជប៉ុន បរិក្ខារពេញលេញ៖ ទ្វារអគ្គិសនី ស៊ុនរូហ្វទ្វេ ប្រព័ន្ធសំឡេងពិសេស។ ខាងក្នុងស្អាតខ្លាំង ចតក្នុងផ្ទះ។ ឯកសារពេញលេញ រួមទាំងសញ្ញាបត្រពិនិត្យបច្ចេកទេស។",
    featured: true,
    views: 1290,
    daysAgo: 34,
    vinLast6: "JTH778",
    plateNo: "1AA-3390",
    ownershipCount: 1,
    accidentDeclared: "NONE_DECLARED",
    importOrigin: "JAPAN",
    docs: [
      { type: "REGISTRATION_BOOK", status: "VERIFIED" },
      { type: "IMPORT_DECLARATION", status: "VERIFIED" },
      { type: "SERVICE_RECORD", status: "PROVIDED" },
      { type: "INSPECTION_CERT", status: "PROVIDED" },
    ],
  },
  {
    id: "veh_cclass_2016",
    sellerId: "usr_dealer_sokha",
    slug: "cclass",
    imgCount: 4,
    make: "Mercedes-Benz",
    model: "C-Class",
    variant: "C 200",
    year: 2016,
    priceUsd: 30200,
    mileageKm: 111000,
    transmission: "AUTOMATIC",
    fuel: "PETROL",
    engineCc: 2000,
    drivetrain: "RWD",
    bodyType: "SEDAN",
    exteriorColor: "silver",
    city: "Phnom Penh",
    district: "7 Makara",
    description:
      "Elegant C 200 with service stamps up to 2022. Suspension and A/C recently checked. Comes with two keys. Import declaration missing — seller is obtaining a copy.",
    descriptionKm:
      "C 200 ស្អាត កំណត់ហេតុសេវាកម្មដល់ឆ្នាំ ២០២២។ ស៊ុស និងម៉ាស៊ីនត្រជាក់ទើបពិនិត្យថ្មី។ លក់ជាមួយកូនសោ ២។ លិខិតប្រកាសនាំចូលបាត់ — អ្នកលក់កំពុងសុំចម្លង។",
    views: 1050,
    daysAgo: 38,
    plateNo: "1KL-4412",
    ownershipCount: 2,
    accidentDeclared: "UNKNOWN",
    importOrigin: "DUBAI",
    docs: [
      { type: "REGISTRATION_BOOK", status: "PROVIDED" },
      { type: "IMPORT_DECLARATION", status: "MISSING" },
    ],
  },
  {
    id: "veh_civic_2019",
    sellerId: "usr_priv_sopheak",
    slug: "civic",
    imgCount: 4,
    make: "Honda",
    model: "Civic",
    variant: "1.8 E",
    year: 2019,
    priceUsd: 19400,
    mileageKm: 88000,
    transmission: "AUTOMATIC",
    fuel: "PETROL",
    engineCc: 1800,
    drivetrain: "FWD",
    bodyType: "SEDAN",
    exteriorColor: "white",
    city: "Phnom Penh",
    district: "Sen Sok",
    description:
      "Reliable one-owner Civic 1.8 E, mostly highway kilometers. Serviced on schedule, new brakes. Clean documents ready for ownership transfer.",
    descriptionKm:
      "Civic 1.8 E អាចទុកចិត្តបាន ម្ចាស់តែម្នាក់ ប្រើផ្លូវឆ្ងាយជាចម្បង។ ម៉ាស៊ីនបានថែទាំទាន់ពេល ព្រឹលថ្មី។ ឯកសារស្អាត រួចរាល់សម្រាប់ផ្ទេរឈ្មោះ។",
    views: 980,
    daysAgo: 42,
    plateNo: "2DF-6620",
    ownershipCount: 1,
    accidentDeclared: "NONE_DECLARED",
    importOrigin: "THAILAND",
    docs: [
      { type: "REGISTRATION_BOOK", status: "PROVIDED" },
      { type: "IMPORT_DECLARATION", status: "PROVIDED" },
    ],
  },
  {
    id: "veh_fortuner_2019",
    sellerId: "usr_dealer_sokha",
    slug: "fortuner",
    imgCount: 4,
    make: "Toyota",
    model: "Fortuner",
    variant: "2.8",
    year: 2019,
    priceUsd: 37600,
    mileageKm: 97000,
    transmission: "AUTOMATIC",
    fuel: "DIESEL",
    engineCc: 2800,
    drivetrain: "4WD",
    bodyType: "SUV",
    exteriorColor: "white",
    city: "Phnom Penh",
    district: "Chbar Ampov",
    description:
      "Fortuner 2.8 diesel in excellent condition, Dubai import. Mostly city driving with occasional provincial trips. Complete documents ready for transfer.",
    descriptionKm:
      "Fortuner 2.8 ស្អាតខ្លាំង នាំចូលពីឌូបាយ។ ប្រើក្នុងក្រុងជាចម្បង មានដំណើរក្រៅក្រុងកម្រ។ ឯកសារពេញលេញ រួចរាល់សម្រាប់ផ្ទេរឈ្មោះ។",
    views: 1410,
    daysAgo: 46,
    vinLast6: "TRN881",
    plateNo: "1JH-5523",
    ownershipCount: 2,
    accidentDeclared: "NONE_DECLARED",
    importOrigin: "DUBAI",
    docs: [
      { type: "REGISTRATION_BOOK", status: "PROVIDED" },
      { type: "IMPORT_DECLARATION", status: "PROVIDED" },
      { type: "SERVICE_RECORD", status: "MISSING" },
    ],
  },
  {
    id: "veh_accent_2018",
    sellerId: "usr_priv_sopheak",
    slug: "accent",
    imgCount: 3, // SOLD listing keeps 3 photos
    make: "Hyundai",
    model: "Accent",
    variant: "1.4",
    year: 2018,
    priceUsd: 13200,
    mileageKm: 145000,
    transmission: "AUTOMATIC",
    fuel: "PETROL",
    engineCc: 1400,
    drivetrain: "FWD",
    bodyType: "SEDAN",
    exteriorColor: "silver",
    city: "Kandal",
    district: "Ta Khmau",
    description: "This car has been sold. Thank you for your interest!",
    descriptionKm:
      "ឡាននេះបានលក់រួចរាល់ហើយ។ សូមអរគុណសម្រាប់ការចាប់អារម្មណ៍!",
    status: "SOLD",
    views: 560,
    daysAgo: 50,
    plateNo: "3MK-8845",
    accidentDeclared: "UNKNOWN",
    docs: [{ type: "REGISTRATION_BOOK", status: "PROVIDED" }],
  },
  {
    id: "veh_cx5_2019",
    sellerId: "usr_dealer_ppauto",
    slug: "cx5",
    imgCount: 4,
    make: "Mazda",
    model: "CX-5",
    variant: "2.0",
    year: 2019,
    priceUsd: 24100,
    mileageKm: 84000,
    transmission: "AUTOMATIC",
    fuel: "PETROL",
    engineCc: 2000,
    drivetrain: "FWD",
    bodyType: "SUV",
    exteriorColor: "red",
    city: "Phnom Penh",
    district: "Toul Kork",
    description:
      "Listing submitted and awaiting review. 2.0 Skyactiv engine, one careful owner, service history available.",
    descriptionKm:
      "បញ្ជីលក់កំពុងរង់ចាំការត្រួតពិនិត្យ។ ម៉ាស៊ីន Skyactiv 2.0 ម្ចាស់តែម្នាក់ មានកំណត់ហេតុថែទាំ។",
    status: "PENDING_REVIEW",
    views: 260,
    daysAgo: 54,
    ownershipCount: 1,
    accidentDeclared: "UNKNOWN",
    docs: [
      { type: "REGISTRATION_BOOK", status: "PROVIDED" },
      { type: "IMPORT_DECLARATION", status: "PROVIDED" },
    ],
  },
];

async function seedVehicles() {
  for (const v of VEHICLES) {
    const createdAt = daysAgo(v.daysAgo);
    const title = `${v.year} ${v.make} ${v.model}${v.variant ? " " + v.variant : ""}`;
    await prisma.vehicle.create({
      data: {
        id: v.id,
        sellerId: v.sellerId,
        tenantId: TENANT_BY_SELLER[v.sellerId] ?? null,
        make: v.make,
        model: v.model,
        variant: v.variant ?? null,
        year: v.year,
        priceUsd: v.priceUsd,
        mileageKm: v.mileageKm,
        transmission: v.transmission,
        fuel: v.fuel,
        engineCc: v.engineCc ?? null,
        drivetrain: v.drivetrain ?? null,
        bodyType: v.bodyType,
        exteriorColor: v.exteriorColor ?? null,
        city: v.city,
        district: v.district ?? null,
        description: v.description ?? null,
        descriptionKm: v.descriptionKm ?? null,
        status: v.status ?? "PUBLISHED",
        featured: v.featured ?? false,
        views: v.views,
        vinLast6: v.vinLast6 ?? null,
        plateNo: v.plateNo ?? null,
        ownershipCount: v.ownershipCount ?? null,
        accidentDeclared: v.accidentDeclared ?? "UNKNOWN",
        importOrigin: v.importOrigin ?? null,
        createdAt,
        images: {
          create: IMG[v.slug].slice(0, v.imgCount).map((url, i) => ({
            url,
            alt: `${title} — photo ${i + 1}`,
            sortOrder: i,
          })),
        },
        documents: {
          create: v.docs.map((d) => ({
            type: d.type,
            status: d.status,
            notes: d.notes ?? null,
          })),
        },
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Pre-generated AI history reports (exact ReportCheck shape from src/lib/types.ts)
// ---------------------------------------------------------------------------

const CHECK_TITLES: Record<string, { title: string; titleKm: string }> = {
  identity: { title: "VIN & identity", titleKm: "អត្តសញ្ញាណ និងលេខសំគាល់" },
  registration: { title: "Registration book", titleKm: "សៀវភៅចុះបញ្ជី" },
  import: { title: "Import origin", titleKm: "ប្រភពនាំចូល" },
  mileage: { title: "Odometer & mileage", titleKm: "ចំនួនគីឡូម៉ែត្រ" },
  price: { title: "Price vs market", titleKm: "តម្លៃធៀបទីផ្សារ" },
  service: { title: "Service history", titleKm: "ប្រវត្តិថែទាំ" },
  photos: { title: "Photos vs description", titleKm: "រូបភាពធៀបការប្រកាស" },
  ownership: { title: "Ownership history", titleKm: "ប្រវត្តិម្ចាស់ភាព" },
  accident: { title: "Accident records", titleKm: "កំណត់ហេតុគ្រោះថ្នាក់" },
  listing: {
    title: "Listing quality & safety",
    titleKm: "គុណភាពបញ្ជី និងសុវត្ថិភាព",
  },
};

const LIMITATIONS = [
  {
    en: "This report analyzes listing information and provided documents only. It is not a physical inspection.",
    km: "របាយការណ៍នេះវិភាគតែពីព័ត៌មានបញ្ជាក់ និងឯកសារដែលផ្ដល់ជូនប៉ុណ្ណោះ។ វាមិនមែនជាការពិនិត្យរថយន្តដោយផ្ទាល់ទេ។",
  },
  {
    en: "'No records found' does not mean 'no accidents' or 'no problems'.",
    km: "'រកមិនឃើញទិន្នន័យ' មិនមែនមានន័យថា 'គ្មានគ្រោះថ្នាក់' ឬ 'គ្មានបញ្ហា' ទេ។",
  },
  {
    en: "AI observations are probabilistic and may be wrong. Always inspect the vehicle in person.",
    km: "ការវិភាគដោយ AI អាចមានកំហុស។ សូមពិនិត្យរថយន្តដោយខ្លួនឯងជានិច្ច។",
  },
  {
    en: "Report results reflect the data available at generation time and may become outdated.",
    km: "លទ្ធផលរបាយការណ៍ឆ្លុះបញ្ចាំងតែទិន្នន័យនៅពេលបង្កើតប៉ុណ្ណោះ ហើយអាចមិនទាន់សម័យនៅពេលក្រោយ។",
  },
];

function check(
  area: keyof typeof CHECK_TITLES,
  status: ReportCheck["status"],
  detail: string,
  detailKm: string,
  source: string,
  confidence: number
): ReportCheck {
  return { area, ...CHECK_TITLES[area], status, detail, detailKm, source, confidence };
}

const PRADO_CHECKS: ReportCheck[] = [
  check(
    "identity",
    "NOT_VERIFIED",
    "Chassis ending T8H229 provided in the listing matches the registration book images, but the vehicle has not been physically inspected by the platform, so identity is not independently confirmed.",
    "លេខចាប់ចុង T8H229 ក្នុងបញ្ជីលក់ត្រូវគ្នានឹងរូបសៀវភៅចុះបញ្ជី ប៉ុន្តែវេទិកាមិនបានពិនិត្យរថយន្តដោយផ្ទាល់ទេ ដូច្នេះអត្តសញ្ញាណមិនអាចបញ្ជាក់ដោយឯករាជ្យបានទេ។",
    "Listing data + Registration book (platform-verified)",
    0.6
  ),
  check(
    "registration",
    "VERIFIED",
    "Registration book reviewed and platform-verified. Plate 1KH-8823 and owner details are internally consistent.",
    "សៀវភៅចុះបញ្ជីត្រូវបានពិនិត្យនិងផ្ទៀងផ្ទាត់ដោយវេទិកា។ ស្លាកលេខ 1KH-8823 និងព័ត៌មានម្ចាស់ត្រូវគ្នា។",
    "Registration book (platform-verified)",
    0.95
  ),
  check(
    "import",
    "VERIFIED",
    "Import declaration from Dubai was verified and matches the declared import origin.",
    "លិខិតប្រកាសនាំចូលពីឌូបាយត្រូវបានផ្ទៀងផ្ទាត់ ដែលត្រូវនឹងប្រភពនាំចូលដែលបានប្រកាស។",
    "Import declaration (platform-verified)",
    0.9
  ),
  check(
    "mileage",
    "EVIDENCE_FOUND",
    "Odometer of 89,000 km is plausible for a 2018 vehicle (about 11,100 km/year) and is consistent with service records covering 2019-2024. No independent odometer database check was possible.",
    "៨៩,០០០ គ.ម មានភាពសមរម្យសម្រាប់ឡានឆ្នាំ២០១៨ (~១១,១០០ គ.ម/ឆ្នាំ) និងត្រូវគ្នានឹងកំណត់ហេតុសេវាកម្ម ២០១៩–២០២៤ ទោះបីគ្មានការពិនិត្យទិន្នន័យ odometer ដោយឯករាជ្យក៏ដោយ។",
    "Service records + Listing data",
    0.8
  ),
  check(
    "price",
    "EVIDENCE_FOUND",
    "$52,500 sits within the typical range for 2018 Prado TX diesel units in Phnom Penh ($48,000-$57,000 based on current comparable listings).",
    "៥២,៥០០ ដុល្លាស្ថិតក្នុងជួរតម្លៃទីផ្សារសម្រាប់ Prado TX ស្លាបប្រេងសាឺតឆ្នាំ២០១៨ នៅភ្នំពេញ (៤៨,០០០–៥៧,០០០ ដុល្លាតាមបញ្ជីប្រៀបធៀប)។",
    "Market comparables",
    0.8
  ),
  check(
    "service",
    "EVIDENCE_FOUND",
    "Authorized workshop service records covering 2019-2024 were provided and show regular maintenance.",
    "កំណត់ហេតុសេវាកម្មពីរោងចក្រផ្លូវការឆ្នាំ ២០១៩–២០២៤ ត្រូវបានផ្ដល់ជូន ហើយបង្ហាញការថែទាំទាន់ពេល។",
    "Service records (provided)",
    0.8
  ),
  check(
    "photos",
    "EVIDENCE_FOUND",
    "Listing photos are consistent with the described condition (new tires, clean interior); no visible mismatch with the declared color or trim.",
    "រូបភាពត្រូវគ្នានឹងការប្រកាស (កង់ថ្មី ខាងក្នុងស្អាត) ហើយគ្មានភាពមិនត្រូវគ្នាជាមួយពណ៌ ឬកម្រិតបរិក្ខារ។",
    "Listing photo analysis",
    0.75
  ),
  check(
    "ownership",
    "EVIDENCE_FOUND",
    "Registration book shows 2 registered owners, consistent with the seller's declared ownership count.",
    "សៀវភៅចុះបញ្ជីបង្ហាញម្ចាស់ចំនួន ២ នាក់ ត្រូវនឹងចំនួនដែលអ្នកលក់ប្រកាស។",
    "Registration book (platform-verified)",
    0.85
  ),
  check(
    "accident",
    "NOT_VERIFIED",
    "Seller declares no accidents. This is a declaration only — it is not independent verification, and no official accident database was checked.",
    "អ្នកលក់ប្រកាសថាគ្មានគ្រោះថ្នាក់ចរាចរ។ នេះជាការប្រកាសតែប៉ុណ្ណោះ — មិនមែនជាការផ្ទៀងផ្ទាត់ដោយឯករាជ្យ ហើយគ្មានមូលដ្ឋានទិន្នន័យគ្រោះថ្នាក់ផ្លូវការណ៍ណាមួយត្រូវបានពិនិត្យទេ។",
    "Seller declaration",
    0.45
  ),
  check(
    "listing",
    "EVIDENCE_FOUND",
    "Listing text is detailed and consistent across fields (year, mileage, documents). No scam-pattern language detected.",
    "អត្ថបទបញ្ជីលក់មានព័ត៌មានលម្អិត និងត្រូវគ្នារវាងវាលនីមួយៗ (ឆ្នាំ គ.ម ឯកសារ)។ រកមិនឃើញលក្ខណៈសញ្ញានៃការបញ្ឆោតទេ។",
    "Listing text analysis",
    0.85
  ),
];

const LEXUS_CHECKS: ReportCheck[] = [
  check(
    "identity",
    "NOT_VERIFIED",
    "Chassis ending 5T4119 from the listing could not be cross-checked against a physical inspection or an independent VIN database.",
    "លេខចាប់ចុង 5T4119 ពីបញ្ជីលក់មិនអាចផ្ទៀងផ្ទាត់ជាមួយការពិនិត្យដោយផ្ទាល់ ឬមូលដ្ឋានទិន្នន័យ VIN ឯករាជ្យបានទេ។",
    "Listing data",
    0.45
  ),
  check(
    "registration",
    "EVIDENCE_FOUND",
    "Registration book was provided and reviewed. Plate 2AB-1194 and the 3-owner history look consistent. Provided documents are reviewed but not platform-verified.",
    "សៀវភៅចុះបញ្ជីត្រូវបានផ្ដល់ជូននិងបានពិនិត្យ។ ស្លាកលេខ 2AB-1194 និងប្រវត្តិម្ចាស់ ៣ នាក់មើលទៅត្រូវគ្នា។ ឯកសារដែលផ្ដល់ជូនត្រូវបានពិនិត្យ ប៉ុន្តែមិនត្រូវបានផ្ទៀងផ្ទាត់ដោយវេទិកាទេ។",
    "Registration book (provided)",
    0.7
  ),
  check(
    "import",
    "EVIDENCE_FOUND",
    "US import declaration was provided; the declared USA origin is consistent with a left-hand-drive RX 350.",
    "លិខិតប្រកាសនាំចូលពីអាមេរិកត្រូវបានផ្ដល់ជូន ហើយប្រភព USA ត្រូវគ្នានឹង RX 350 ចង្កឹះឆ្វេង។",
    "Import declaration (provided)",
    0.7
  ),
  check(
    "mileage",
    "NOT_VERIFIED",
    "118,000 km over about 9 years (~13,100 km/year) is on the higher side for Phnom Penh but plausible. No odometer history database was available to rule out rollbacks.",
    "១១៨,០០០ គ.ម ក្នុងរយៈពេល ~៩ ឆ្នាំ (~១៣,១០០ គ.ម/ឆ្នាំ) ខ្ពស់បន្តិចសម្រាប់ភ្នំពេញ ប៉ុន្តែមានភាពអាចកើតមាន។ គ្មានទិន្នន័យ odometer ឯករាជ្យដើម្បីបញ្ជាក់ថាគ្មានការកែចំនួនគ.មទេ។",
    "Listing data",
    0.5
  ),
  check(
    "price",
    "EVIDENCE_FOUND",
    "$34,900 is within the typical market band for 2015 RX 350 imports in Phnom Penh ($32,000-$38,000).",
    "៣៤,៩០០ ដុល្លាស្ថិតក្នុងជួរទីផ្សារសម្រាប់ RX 350 ឆ្នាំ២០១៥ នៅភ្នំពេញ (៣២,០០០–៣៨,០០០ ដុល្លា)។",
    "Market comparables",
    0.75
  ),
  check(
    "service",
    "NO_DATA",
    "No service records were provided, so maintenance history could not be assessed. Missing records are common but reduce transparency.",
    "គ្មានកំណត់ហេតុសេវាកម្មត្រូវបានផ្ដល់ជូន ដូច្នេះប្រវត្តិថែទាំមិនអាចវាយតម្លៃបានទេ។ ការបាត់បង់កំណត់ហេតុគឺធម្មតា ប៉ុន្តែកាត់បន្ថយភាពច្បាស់លាស់។",
    "No documents provided",
    0.3
  ),
  check(
    "photos",
    "EVIDENCE_FOUND",
    "Photos show the described leather and navigation in good condition; the rear bumper appears repaired, consistent with the declared minor damage.",
    "រូបភាពបង្ហាញស្បែក និងប្រព័ន្ធនាវាចរណ៍ក្នុងស្ថានភាពល្អដូចការប្រកាស។ ស្ពានក្រោយដែលបានជួសជុលត្រូវគ្នានឹងការប្រកាស។",
    "Listing photo analysis",
    0.65
  ),
  check(
    "ownership",
    "EVIDENCE_FOUND",
    "Registration book indicates 3 owners, matching the declared ownership count of 3.",
    "សៀវភៅចុះបញ្ជីបង្ហាញម្ចាស់ ៣ នាក់ ត្រូវនឹងចំនួនដែលបានប្រកាស។",
    "Registration book (provided)",
    0.75
  ),
  check(
    "accident",
    "EVIDENCE_FOUND",
    "Seller declares minor rear-bumper damage; ask for repair documentation. Photos are consistent with a repaired bumper, but severity cannot be confirmed from the listing alone.",
    "អ្នកលក់ប្រកាសថាមានគ្រោះថ្នាក់តូចនៅស្ពានក្រោយ។ សូមសុំឯកសារជួសជុល។ រូបភាពត្រូវគ្នានឹងស្ពានដែលបានជួសជុល ប៉ុន្តែកម្រិតខាតបង់មិនអាចបញ្ជាក់ពីបញ្ជីតែមួយបានទេ។",
    "Seller declaration + Listing photos",
    0.6
  ),
  check(
    "listing",
    "EVIDENCE_FOUND",
    "Listing is complete and honest about prior damage, a positive trust signal. No scam-pattern language detected.",
    "បញ្ជីលក់ពេញលេញ និងត្រង់នៃការប្រកាសគ្រោះថ្នាក់ពីមុន ដែលជាសញ្ញាវិជ្ជមាន។ រកមិនឃើញលក្ខណៈសញ្ញាបញ្ឆោតទេ។",
    "Listing text analysis",
    0.75
  ),
];

async function seedReports() {
  const pradoReport = await prisma.vehicleHistoryReport.create({
    data: {
      vehicleId: "veh_prado_2018",
      checksJson: JSON.stringify(PRADO_CHECKS),
      overallConfidence: 78,
      summaryEn:
        "This 2018 Prado TX presents well: the registration book and Dubai import declaration are platform-verified, and service records from 2019-2024 support the 89,000 km odometer. The seller declares no accidents, but that remains an unverified declaration. Overall the listing is consistent and transparent for its class.",
      summaryKm:
        "ឡាន Prado TX ឆ្នាំ២០១៨ នេះមានលក្ខណៈល្អ៖ សៀវភៅចុះបញ្ជី និងលិខិតប្រកាសនាំចូលពីឌូបាយ ត្រូវបានផ្ទៀងផ្ទាត់ដោយវេទិកាហើយ ហើយកំណត់ហេតុសេវាកម្មឆ្នាំ២០១៩–២០២៤ គាំទ្រចំនួន ៨៩,០០០ គ.ម។ អ្នកលក់ប្រកាសថាគ្មានគ្រោះថ្នាក់ចរាចរ ប៉ុន្តែការប្រកាសនេះមិនទាន់បានផ្ទៀងផ្ទាត់ដោយឯករាជ្យទេ។ ជារួម បញ្ជីលក់នេះមានភាពទៀងទាត់ និងគួរឱ្យទុកចិត្ត។",
      limitationsJson: JSON.stringify(LIMITATIONS),
      status: "COMPLETE",
      createdAt: daysAgo(1),
    },
  });

  const lexusReport = await prisma.vehicleHistoryReport.create({
    data: {
      vehicleId: "veh_lexus_rx350",
      checksJson: JSON.stringify(LEXUS_CHECKS),
      overallConfidence: 62,
      summaryEn:
        "This 2015 RX 350 is honestly listed: the seller openly declares minor rear-bumper damage and provides registration and import documents that match the declared 3-owner history. However, the mileage could not be independently verified and no service records exist. A pre-purchase inspection with a trusted mechanic is strongly recommended.",
      summaryKm:
        "ឡាន RX 350 ឆ្នាំ២០១៥ នេះត្រូវបានប្រកាសដោយត្រង់៖ អ្នកលក់ប្រកាសចំហថាមានគ្រោះថ្នាក់តូចនៅស្ពានក្រោយ ហើយផ្ដល់ឯកសារចុះបញ្ជី និងនាំចូល ដែលត្រូវគ្នានឹងម្ចាស់ចំនួន ៣ នាក់។ ទោះជាយ៉ាងណា ចំនួនគ.មមិនអាចផ្ទៀងផ្ទាត់ដោយឯករាជ្យបានទេ ហើយគ្មានកំណត់ហេតុសេវាកម្មទេ។ សូមពិនិត្យឡានជាមួយគ្រូបង្គោលមុនពេលទិញ។",
      limitationsJson: JSON.stringify(LIMITATIONS),
      status: "COMPLETE",
      createdAt: daysAgo(1),
    },
  });

  return { pradoReport, lexusReport };
}

// ---------------------------------------------------------------------------
// Engagement: conversation, messages, favorites, audit log
// ---------------------------------------------------------------------------

async function seedEngagement(pradoReportId: string) {
  const convCreated = hoursAgo(47);
  await prisma.conversation.create({
    data: {
      id: "conv_demo_1",
      vehicleId: "veh_lexus_rx350",
      buyerId: "usr_demo_buyer",
      createdAt: convCreated,
    },
  });

  const sysAt = hoursAgo(47);
  const buyerAt = hoursAgo(26);
  const sellerAt = hoursAgo(20);

  await prisma.message.createMany({
    data: [
      {
        conversationId: "conv_demo_1",
        senderId: null,
        isSystem: true,
        body: "គន្លឹះសុវត្ថិភាព: កុំបង់ប្រាក់ដុនមុនពេលមើលឡាននិងឯកសារ។ ជួបកន្លែងមានគេច្រើន ហើយនាំគ្រូបង្គោលមកពិនិត្យជាមួយ។ / Safety tip: Never pay a deposit before seeing the car and documents. Meet in a public place and bring a trusted mechanic.",
        createdAt: sysAt,
      },
      {
        conversationId: "conv_demo_1",
        senderId: "usr_demo_buyer",
        isSystem: false,
        body: "សួស្តី ឡាននៅមានទេ? ចង់ដឹងថាអាចមកមើលថ្ងៃសៅរ៍បានទេ? / Hello, is the car still available? Can I come see it Saturday?",
        createdAt: buyerAt,
      },
      {
        conversationId: "conv_demo_1",
        senderId: "usr_dealer_sokha",
        isSystem: false,
        body: "សួស្តី! ឡាននៅមាន។ សូមកោះមកមើលនៅផ្លូវព្រះនុហុង ៨ព្រឹក ដល់ ៦ល្ងាច។ / Hello! Yes, still available. You're welcome to view it on Preah Norodom Blvd, 8am–6pm any day.",
        createdAt: sellerAt,
      },
    ],
  });

  await prisma.conversation.update({
    where: { id: "conv_demo_1" },
    data: { updatedAt: sellerAt },
  });

  await prisma.favorite.createMany({
    data: [
      {
        userId: "usr_demo_buyer",
        vehicleId: "veh_prado_2018",
        createdAt: daysAgo(1),
      },
      {
        userId: "usr_demo_buyer",
        vehicleId: "veh_vellfire_2017",
        createdAt: daysAgo(3),
      },
    ],
  });

  await prisma.auditLog.createMany({
    data: [
      {
        actorId: "usr_dealer_sokha",
        action: "LISTING_PUBLISHED",
        entity: "Vehicle",
        entityId: "veh_prado_2018",
        metaJson: JSON.stringify({
          make: "Toyota",
          model: "Land Cruiser Prado",
          year: 2018,
          priceUsd: 52500,
        }),
        createdAt: daysAgo(2),
      },
      {
        actorId: null,
        action: "REPORT_GENERATED",
        entity: "VehicleHistoryReport",
        entityId: pradoReportId,
        metaJson: JSON.stringify({
          vehicleId: "veh_prado_2018",
          overallConfidence: 78,
        }),
        createdAt: daysAgo(1),
      },
      {
        actorId: "usr_admin",
        action: "SEED_DATABASE",
        entity: "system",
        entityId: null,
        metaJson: JSON.stringify({
          note: "Initial KhLan demo seed",
          users: 8,
          tenants: 2,
          vehicles: 14,
          reports: 2,
        }),
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("KhLan seed: wiping existing data...");
  // Delete children before parents to respect FK constraints.
  await prisma.appointment.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.message.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.favorite.deleteMany();
  await prisma.savedSearch.deleteMany();
  await prisma.vehicleHistoryReport.deleteMany();
  await prisma.vehicleDocument.deleteMany();
  await prisma.vehicleImage.deleteMany();
  await prisma.tenantMember.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.subscriptionPayment.deleteMany();
  await prisma.purchaseRequest.deleteMany();
  await prisma.vehicle.deleteMany();
  await prisma.tenant.deleteMany();
  await prisma.sellerProfile.deleteMany();
  await prisma.reportedContent.deleteMany();
  await prisma.platformSetting.deleteMany();
  await prisma.user.deleteMany();

  console.log("Seeding users (8: buyer, 2 dealers, 2 private sellers, super admin, 2 staff)...");
  await seedUsers();

  console.log("Seeding tenants (2) with members & subscriptions...");
  await seedTenants();

  console.log("Seeding seller profiles (dealer profiles linked to tenants)...");
  await seedSellerProfiles();

  console.log("Seeding vehicles (14) with images & documents...");
  await seedVehicles();

  console.log("Seeding pre-generated AI history reports (2)...");
  const { pradoReport } = await seedReports();

  console.log("Seeding conversation, favorites & audit log...");
  await seedEngagement(pradoReport.id);

  console.log("Seeding dashboard demo data (saved searches, appointments, platform settings)...");
  await seedDashboardData();

  const counts = {
    users: await prisma.user.count(),
    sellerProfiles: await prisma.sellerProfile.count(),
    tenants: await prisma.tenant.count(),
    tenantMembers: await prisma.tenantMember.count(),
    subscriptions: await prisma.subscription.count(),
    vehicles: await prisma.vehicle.count(),
    vehicleImages: await prisma.vehicleImage.count(),
    vehicleDocuments: await prisma.vehicleDocument.count(),
    reports: await prisma.vehicleHistoryReport.count(),
    favorites: await prisma.favorite.count(),
    savedSearches: await prisma.savedSearch.count(),
    appointments: await prisma.appointment.count(),
    conversations: await prisma.conversation.count(),
    messages: await prisma.message.count(),
    platformSettings: await prisma.platformSetting.count(),
    auditLogs: await prisma.auditLog.count(),
    subscriptionPayments: await prisma.subscriptionPayment.count(),
    purchaseRequests: await prisma.purchaseRequest.count(),
  };
  console.log("Seed complete:", counts);
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
