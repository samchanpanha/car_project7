// KhLan — Complete Demo Seed Script (Cambodia AI Vehicle Marketplace)
import "dotenv/config";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import type { ReportCheck } from "../src/lib/types";
import { importCatalogModels } from "../scripts/import-vehicle-models";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const seedImages = JSON.parse(
  fs.readFileSync(path.join(scriptDirectory, "seed-images.json"), "utf8")
) as Record<string, string[]>;

if (!process.env.DATABASE_URL) {
  const envFile = path.resolve(scriptDirectory, "..", ".env");
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
const daysFromNowAt = (d: number, hour: number) => {
  const dt = daysFromNow(d);
  dt.setHours(hour, 0, 0, 0);
  return dt;
};

const TENANT_BY_SELLER: Record<string, string> = {
  usr_dealer_sokha: "tenant_sokha",
  usr_dealer_ppauto: "tenant_ppauto",
  usr_priv_vireak: "tenant_vireak",
  usr_priv_sopheak: "tenant_sopheak",
};

const IMG = seedImages;

// ---------------------------------------------------------------------------
// 1. Users
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

  const salt = crypto.randomBytes(16).toString("hex");
  const demoHash = `${salt}:${crypto.scryptSync("khlan123", salt, 64).toString("hex")}`;
  await prisma.user.updateMany({
    where: {
      id: {
        in: [
          "usr_demo_buyer", "usr_dealer_sokha", "usr_staff_chan", "usr_staff_sophea",
          "usr_dealer_ppauto", "usr_priv_vireak", "usr_priv_sopheak", "usr_admin"
        ],
      },
    },
    data: { passwordHash: demoHash },
  });

  await prisma.user.update({
    where: { id: "usr_demo_buyer" },
    data: { telegramId: "77700001", telegramUsername: "dara_khlan" },
  });
}

// ---------------------------------------------------------------------------
// 2. Tenants, Branches, Members & Subscriptions
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
        bio: "Sokha Motors Group is a premier automotive dealer in Phnom Penh with showrooms in Toul Kork and BKK1. All vehicles inspected with AI history reports.",
        bioKm: "ក្រុមហ៊ុន Sokha Motors Group ជាក្រុមអាជីវកម្មលក់ឡានឈានមុខនៅភ្នំពេញ មានសាខា Toul Kork និង BKK1។",
      },
      {
        id: "tenant_ppauto",
        name: "PP Auto Trust",
        slug: "pp-auto-trust",
        city: "Phnom Penh",
        address: "Russian Blvd 110, Sen Sok",
        phone: "+85512444555",
        verified: true,
        verification: "VERIFIED",
        status: "ACTIVE",
        bio: "Family-run dealership on Russian Blvd focusing on reliable family SUVs, crossovers, and verified motorcycles.",
        bioKm: "ក្រុមហ៊ុនលក់ឡានគ្រួសារនៅមហាវិថីសហព័ន្ធរុស្ស៊ី ផ្តោតលើឡានគ្រួសារ និងម៉ូតូដែលមានការធានា។",
      },
      {
        id: "tenant_vireak",
        name: "Vireak Tan (Private Seller)",
        slug: "vireak-tan",
        city: "Phnom Penh",
        status: "ACTIVE",
      },
      {
        id: "tenant_sopheak",
        name: "Sopheak Ngin (Private Seller)",
        slug: "sopheak-ngin",
        city: "Kandal",
        status: "ACTIVE",
      },
    ],
  });

  // Dealership Branches (Showrooms)
  await prisma.tenantBranch.createMany({
    data: [
      {
        id: "branch_sokha_main",
        tenantId: "tenant_sokha",
        name: "Toul Kork Main Showroom",
        nameKm: "សាខាចម្បងទួលគោក",
        city: "Phnom Penh",
        district: "Toul Kork",
        address: "St. 271, Sangkat Teuk Laak 3, Khan Toul Kork",
        phone: "+85511777888",
        telegram: "@sokhamotors",
        isMain: true,
        status: "ACTIVE",
        openingHours: "Mon-Sun: 08:00 - 18:00",
      },
      {
        id: "branch_sokha_bkk",
        tenantId: "tenant_sokha",
        name: "BKK1 Luxury Showroom",
        nameKm: "សាខាបឹងកេងកង ១",
        city: "Phnom Penh",
        district: "Boeung Keng Kang",
        address: "St. 51 corner St. 302, BKK1",
        phone: "+85512777999",
        telegram: "@sokha_bkk",
        isMain: false,
        status: "ACTIVE",
        openingHours: "Mon-Sat: 08:30 - 19:00",
      },
      {
        id: "branch_ppauto_main",
        tenantId: "tenant_ppauto",
        name: "Russian Blvd Showroom",
        nameKm: "សាខាមហាវិថីរុស្ស៊ី",
        city: "Phnom Penh",
        district: "Sen Sok",
        address: "Russian Blvd 110, Sangkat Toek Thla",
        phone: "+85512444555",
        isMain: true,
        status: "ACTIVE",
        openingHours: "Mon-Sun: 08:00 - 17:30",
      },
    ],
  });

  // Staff Members
  await prisma.tenantMember.createMany({
    data: [
      { tenantId: "tenant_sokha", userId: "usr_dealer_sokha", role: "OWNER" },
      { tenantId: "tenant_sokha", userId: "usr_staff_chan", role: "MANAGER" },
      { tenantId: "tenant_sokha", userId: "usr_staff_sophea", role: "INVENTORY_MANAGER" },
      { tenantId: "tenant_ppauto", userId: "usr_dealer_ppauto", role: "OWNER" },
      { tenantId: "tenant_vireak", userId: "usr_priv_vireak", role: "OWNER" },
      { tenantId: "tenant_sopheak", userId: "usr_priv_sopheak", role: "OWNER" },
    ],
  });

  // Subscriptions
  await prisma.subscription.createMany({
    data: [
      {
        tenantId: "tenant_sokha",
        plan: "PRO",
        status: "ACTIVE",
        billingCycle: "MONTHLY",
        priceUsd: 59,
        listingsLimit: 100,
        featuredLimit: 20,
        seats: 5,
        startedAt: daysAgo(45),
        currentPeriodEnd: daysFromNow(45),
      },
      {
        tenantId: "tenant_ppauto",
        plan: "BASIC",
        status: "ACTIVE",
        billingCycle: "MONTHLY",
        priceUsd: 29,
        listingsLimit: 30,
        featuredLimit: 5,
        seats: 2,
        startedAt: daysAgo(20),
        currentPeriodEnd: daysFromNow(20),
      },
      {
        tenantId: "tenant_vireak",
        plan: "FREE",
        status: "ACTIVE",
        billingCycle: "MONTHLY",
        priceUsd: 0,
        listingsLimit: 5,
        featuredLimit: 1,
        seats: 1,
        startedAt: daysAgo(30),
        currentPeriodEnd: daysFromNow(30),
      },
      {
        tenantId: "tenant_sopheak",
        plan: "FREE",
        status: "ACTIVE",
        billingCycle: "MONTHLY",
        priceUsd: 0,
        listingsLimit: 5,
        featuredLimit: 1,
        seats: 1,
        startedAt: daysAgo(10),
        currentPeriodEnd: daysFromNow(20),
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// 3. Seller Profiles
// ---------------------------------------------------------------------------

async function seedSellerProfiles() {
  await prisma.sellerProfile.createMany({
    data: [
      {
        userId: "usr_dealer_sokha",
        type: "DEALER",
        shopName: "Sokha Motors Group",
        tenantId: "tenant_sokha",
        city: "Phnom Penh",
        verified: true,
        verification: "VERIFIED",
        responseRate: 98,
        ratingAvg: 4.8,
        ratingCount: 142,
        memberSince: new Date("2021-03-15T00:00:00Z"),
        bio: "Trusted dealer of premium Japanese and luxury SUVs, MPVs, and genuine OEM auto parts.",
        bioKm: "ពាណិជ្ជករទំនុកចិត្ត លក់ឡានត្រកូលជប៉ុន និងឡានប្រណីតពីឆ្នាំ២០១៥។",
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
        responseRate: 92,
        ratingAvg: 4.5,
        ratingCount: 78,
        memberSince: new Date("2022-07-01T00:00:00Z"),
        bio: "Well-maintained family SUVs, crossovers, and authentic motorcycle inventory.",
        bioKm: "ក្រុមហ៊ុនលក់ឡានគ្រួសារដែលថែរក្សាល្អ និងម៉ូតូទំនុកចិត្ត។",
      },
      {
        userId: "usr_priv_vireak",
        type: "PRIVATE",
        tenantId: "tenant_vireak",
        city: "Phnom Penh",
        verified: false,
        verification: "UNVERIFIED",
        responseRate: 75,
        ratingAvg: 4.2,
        ratingCount: 9,
        memberSince: new Date("2024-02-10T00:00:00Z"),
      },
      {
        userId: "usr_priv_sopheak",
        type: "PRIVATE",
        tenantId: "tenant_sopheak",
        city: "Kandal",
        verified: false,
        verification: "UNVERIFIED",
        responseRate: 68,
        ratingAvg: 4.0,
        ratingCount: 5,
        memberSince: new Date("2024-09-22T00:00:00Z"),
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// 4. Flexible Pricing Tiers (8 Price Types)
// ---------------------------------------------------------------------------

const PRICE_TYPES = [
  { id: "pt_hot_price", code: "HOT_PRICE", label: "Hot Price", mode: "FIXED", badgeColor: "#EF4444", priority: 100, stackable: false, active: true },
  { id: "pt_promote_price", code: "PROMOTE_PRICE", label: "Promote Price", mode: "PERCENT", badgeColor: "#F59E0B", priority: 80, stackable: false, active: true },
  { id: "pt_clearance", code: "CLEARANCE", label: "Clearance", mode: "FIXED", badgeColor: "#8B5CF6", priority: 70, stackable: false, active: true },
  { id: "pt_flash_sale", code: "FLASH_SALE", label: "Flash Sale", mode: "PERCENT", badgeColor: "#F97316", priority: 60, stackable: false, active: true },
  { id: "pt_discount_price", code: "DISCOUNT_PRICE", label: "Discount Price", mode: "PERCENT", badgeColor: "#10B981", priority: 50, stackable: false, active: true },
  { id: "pt_wholesale", code: "WHOLESALE", label: "Wholesale", mode: "PERCENT", badgeColor: "#3B82F6", priority: 40, stackable: false, active: true },
  { id: "pt_member", code: "MEMBER", label: "Member Special", mode: "PERCENT", badgeColor: "#6366F1", priority: 30, stackable: false, active: true },
  { id: "pt_bundle", code: "BUNDLE", label: "Bundle Deal", mode: "FIXED", badgeColor: "#06B6D4", priority: 20, stackable: false, active: true },
];

async function seedPriceTypes() {
  await prisma.priceType.createMany({
    data: PRICE_TYPES,
  });
}

// ---------------------------------------------------------------------------
// 5. Vehicles (34 Listings: 18 Cars, 8 Motorcycles, 8 Spare Parts)
// ---------------------------------------------------------------------------

interface SeedVehicleDef {
  id: string;
  sellerId: string;
  branchId?: string;
  listingCategory: "CAR" | "MOTOR" | "SPARE_PART";
  make: string;
  model: string;
  variant?: string;
  year: number;
  priceUsd: number;
  floorPriceUsd?: number;
  stockNo: string;
  chassisNo?: string;
  steering?: string;
  doors?: number;
  seats?: number;
  mileageKm: number;
  transmission: string;
  fuel: string;
  engineCc?: number;
  drivetrain?: string;
  bodyType: string;
  exteriorColor?: string;
  city: string;
  district?: string;
  importOrigin?: string;
  locationPort?: string;
  condition?: string;
  accidentDeclared?: string;
  ownershipCount?: number;
  vinLast6?: string;
  plateNo?: string;
  description: string;
  descriptionKm: string;
  featured?: boolean;
  views: number;
  daysAgo: number;
  images: string[];
  docs: { type: string; status: string; notes?: string }[];
  // Category-specific specs
  motorType?: string;
  hasAbs?: boolean;
  startType?: string;
  partCategory?: string;
  partCondition?: string;
  partTarget?: string;
  partNumber?: string;
  oemBrand?: string;
  isOem?: boolean;
  position?: string;
  compatibleModels?: string;
  compatibleMake?: string;
  compatibleModel?: string;
  // Promotion rule (optional)
  promo?: {
    priceTypeId: string;
    value: number;
    startDate?: Date | null;
    endDate?: Date | null;
  };
}

const VEHICLES: SeedVehicleDef[] = [
  // ================= CARS (18) =================
  {
    id: "veh_prado_alphard",
    sellerId: "usr_dealer_sokha",
    branchId: "branch_sokha_bkk",
    listingCategory: "CAR",
    make: "Toyota",
    model: "Alphard",
    variant: "Executive Lounge VIP",
    year: 2022,
    priceUsd: 118000,
    floorPriceUsd: 105000, // Floor clamp test: 20% off = 94,400 -> Clamped to 105,000!
    stockNo: "STK-SK-001",
    chassisNo: "AGH30-019823",
    steering: "LEFT",
    doors: 5,
    seats: 7,
    mileageKm: 28000,
    transmission: "AUTOMATIC",
    fuel: "HYBRID",
    engineCc: 2500,
    drivetrain: "AWD",
    bodyType: "VAN",
    exteriorColor: "White Pearl",
    city: "Phnom Penh",
    district: "Boeung Keng Kang",
    importOrigin: "JAPAN",
    locationPort: "PAS Sihanoukville",
    condition: "LIKE_NEW",
    accidentDeclared: "NONE_DECLARED",
    ownershipCount: 1,
    vinLast6: "019823",
    plateNo: "2BX-1122",
    description: "Toyota Alphard Executive Lounge 2022 Hybrid. Ottoman VIP seats, JBL surround sound, dual sunroof, full 360 camera.",
    descriptionKm: "Toyota Alphard 2022 Executive Lounge VIP កៅអីម៉ាស្សា កាមេរ៉ា៣៦០ សម្លេង JBL ស្ថានភាពស្អាតដូចថ្មី។",
    featured: true,
    views: 412,
    daysAgo: 2,
    images: IMG.vellfire || IMG.prado,
    docs: [{ type: "REGISTRATION_CARD", status: "VERIFIED", notes: "Genuine 1-owner book" }],
    promo: {
      priceTypeId: "pt_promote_price",
      value: 20, // 20% off -> Clamps to floor $105,000
    },
  },
  {
    id: "veh_lx570",
    sellerId: "usr_dealer_sokha",
    branchId: "branch_sokha_bkk",
    listingCategory: "CAR",
    make: "Lexus",
    model: "LX",
    variant: "570 Super Sport",
    year: 2019,
    priceUsd: 115000,
    floorPriceUsd: 102000, // Floor clamp test: $95,000 promo clamped to $102,000!
    stockNo: "STK-SK-002",
    chassisNo: "URJ201-882310",
    steering: "LEFT",
    doors: 5,
    seats: 7,
    mileageKm: 62000,
    transmission: "AUTOMATIC",
    fuel: "PETROL",
    engineCc: 5700,
    drivetrain: "4WD",
    bodyType: "SUV",
    exteriorColor: "Black",
    city: "Phnom Penh",
    district: "Boeung Keng Kang",
    importOrigin: "DUBAI",
    locationPort: "PAS Sihanoukville",
    condition: "USED",
    accidentDeclared: "NONE_DECLARED",
    ownershipCount: 1,
    vinLast6: "882310",
    plateNo: "2BW-8899",
    description: "Lexus LX570 Super Sport 2019 Dubai full options. Red leather interior, Mark Levinson audio, hydraulic suspension.",
    descriptionKm: "Lexus LX570 Super Sport 2019 កៅអីក្រហម ម៉ាស៊ីន Mark Levinson បូមឡើងចុះ នាំចូលពីឌូបៃ។",
    featured: true,
    views: 520,
    daysAgo: 3,
    images: IMG.lexus,
    docs: [{ type: "IMPORT_DECLARATION", status: "VERIFIED" }],
    promo: {
      priceTypeId: "pt_hot_price",
      value: 95000, // Target $95,000 -> Clamps to floor $102,000
    },
  },
  {
    id: "veh_prado_2018",
    sellerId: "usr_dealer_sokha",
    branchId: "branch_sokha_main",
    listingCategory: "CAR",
    make: "Toyota",
    model: "Land Cruiser Prado",
    variant: "TX-L Diesel",
    year: 2018,
    priceUsd: 72000,
    floorPriceUsd: 64000,
    stockNo: "STK-SK-003",
    chassisNo: "TRJ150-554122",
    steering: "LEFT",
    doors: 5,
    seats: 7,
    mileageKm: 89000,
    transmission: "AUTOMATIC",
    fuel: "DIESEL",
    engineCc: 2800,
    drivetrain: "4WD",
    bodyType: "SUV",
    exteriorColor: "Pearl White",
    city: "Phnom Penh",
    district: "Toul Kork",
    importOrigin: "DUBAI",
    locationPort: "PAS Sihanoukville",
    condition: "USED",
    accidentDeclared: "NONE_DECLARED",
    ownershipCount: 1,
    vinLast6: "554122",
    plateNo: "1KH-8823",
    description: "2018 Toyota Land Cruiser Prado TX-L 2.8L turbo diesel. Full service records at Toyota Cambodia. Excellent suspension.",
    descriptionKm: "Toyota Land Cruiser Prado TX-L ឆ្នាំ២០១៨ ម៉ាស៊ូត ២.៨L ថែទាំនៅក្រុមហ៊ុនតូយ៉ូតាផ្ទាល់។",
    featured: true,
    views: 890,
    daysAgo: 4,
    images: IMG.prado,
    docs: [
      { type: "REGISTRATION_CARD", status: "VERIFIED" },
      { type: "IMPORT_DECLARATION", status: "VERIFIED" },
      { type: "SERVICE_RECORD", status: "PROVIDED" },
    ],
    promo: {
      priceTypeId: "pt_hot_price",
      value: 66000, // Hot Price $66,000
    },
  },
  {
    id: "veh_rx350",
    sellerId: "usr_dealer_sokha",
    branchId: "branch_sokha_main",
    listingCategory: "CAR",
    make: "Lexus",
    model: "RX",
    variant: "350 F-Sport AWD",
    year: 2020,
    priceUsd: 68000,
    floorPriceUsd: 60000,
    stockNo: "STK-SK-004",
    chassisNo: "2T2BZMCA-5819",
    steering: "LEFT",
    doors: 5,
    seats: 5,
    mileageKm: 52000,
    transmission: "AUTOMATIC",
    fuel: "PETROL",
    engineCc: 3500,
    drivetrain: "AWD",
    bodyType: "SUV",
    exteriorColor: "Sonic Titanium",
    city: "Phnom Penh",
    district: "Toul Kork",
    importOrigin: "USA",
    locationPort: "PPAP Phnom Penh",
    condition: "LIKE_NEW",
    accidentDeclared: "NONE_DECLARED",
    ownershipCount: 1,
    vinLast6: "CA5819",
    plateNo: "2BL-3399",
    description: "Lexus RX350 F-Sport 2020 imported from California. Head-up display, panoramic roof, wireless charger.",
    descriptionKm: "Lexus RX350 F-Sport 2020 ក្រដាសពន្ធ USA កុងទ័រ HUD ដំបូលកញ្ចក់បើកបាន ឡានស្អាតគ្មានកន្លែងទាស់។",
    featured: true,
    views: 630,
    daysAgo: 5,
    images: IMG.lexus,
    docs: [{ type: "REGISTRATION_CARD", status: "VERIFIED" }],
    promo: {
      priceTypeId: "pt_promote_price",
      value: 10, // 10% off -> $61,200
    },
  },
  {
    id: "veh_revo_2021",
    sellerId: "usr_dealer_sokha",
    branchId: "branch_sokha_main",
    listingCategory: "CAR",
    make: "Toyota",
    model: "Hilux",
    variant: "Revo Rocco 4x4",
    year: 2021,
    priceUsd: 39500,
    floorPriceUsd: 35000,
    stockNo: "STK-SK-005",
    chassisNo: "GUN125-998124",
    steering: "RIGHT", // Authentic RHD Thailand import
    doors: 4,
    seats: 5,
    mileageKm: 48000,
    transmission: "AUTOMATIC",
    fuel: "DIESEL",
    engineCc: 2800,
    drivetrain: "4WD",
    bodyType: "PICKUP",
    exteriorColor: "Crimson Red",
    city: "Phnom Penh",
    district: "Toul Kork",
    importOrigin: "THAILAND",
    locationPort: "PAS Sihanoukville",
    condition: "USED",
    accidentDeclared: "NONE_DECLARED",
    ownershipCount: 1,
    vinLast6: "998124",
    plateNo: "2BN-5566",
    description: "Hilux Revo Rocco 2021 top spec 2.8L 4x4. Right-hand drive Thailand direct import. Off-road bar and roller lid installed.",
    descriptionKm: "Hilux Revo Rocco 2021 កំពូល Option ចង្កូតស្តាំនាំចូលពីថៃផ្ទាល់ ម៉ាស៊ីនខ្លាំង ស៊ីប្រេងតិច។",
    views: 410,
    daysAgo: 6,
    images: IMG.revo,
    docs: [{ type: "IMPORT_DECLARATION", status: "VERIFIED" }],
  },
  {
    id: "veh_raptor_2023",
    sellerId: "usr_dealer_sokha",
    branchId: "branch_sokha_main",
    listingCategory: "CAR",
    make: "Ford",
    model: "Ranger",
    variant: "Raptor 3.0L V6 Twin-Turbo",
    year: 2023,
    priceUsd: 69000,
    floorPriceUsd: 60000,
    stockNo: "STK-SK-006",
    chassisNo: "MNBMS-771239",
    steering: "LEFT",
    doors: 4,
    seats: 5,
    mileageKm: 21000,
    transmission: "AUTOMATIC",
    fuel: "PETROL",
    engineCc: 3000,
    drivetrain: "4WD",
    bodyType: "PICKUP",
    exteriorColor: "Code Orange",
    city: "Phnom Penh",
    district: "Toul Kork",
    importOrigin: "THAILAND",
    locationPort: "PAS Sihanoukville",
    condition: "LIKE_NEW",
    accidentDeclared: "NONE_DECLARED",
    ownershipCount: 1,
    vinLast6: "771239",
    plateNo: "2CA-8877",
    description: "Next-Gen Ranger Raptor 2023 V6 EcoBoost twin turbo. Fox Live Valve 2.5 shocks, 10-speed auto, sports exhaust mode.",
    descriptionKm: "Ford Ranger Raptor 2023 ម៉ាស៊ីនសាំង 3.0L V6 Twin Turbo បូម FOX Live Valve សម្លេងស្ព័រពីរោងចក្រ។",
    featured: true,
    views: 740,
    daysAgo: 1,
    images: IMG.ranger,
    docs: [{ type: "REGISTRATION_CARD", status: "VERIFIED" }],
    promo: {
      priceTypeId: "pt_flash_sale",
      value: 10, // 10% off -> $62,100
      startDate: daysAgo(1),
      endDate: daysFromNow(3), // Flash Sale expires in 3 days!
    },
  },
  {
    id: "veh_camry_2021",
    sellerId: "usr_dealer_sokha",
    branchId: "branch_sokha_bkk",
    listingCategory: "CAR",
    make: "Toyota",
    model: "Camry",
    variant: "Hybrid XLE",
    year: 2021,
    priceUsd: 38000,
    floorPriceUsd: 34000,
    stockNo: "STK-SK-007",
    chassisNo: "4T1B11-662194",
    steering: "LEFT",
    doors: 4,
    seats: 5,
    mileageKm: 39000,
    transmission: "AUTOMATIC",
    fuel: "HYBRID",
    engineCc: 2500,
    drivetrain: "FWD",
    bodyType: "SEDAN",
    exteriorColor: "Midnight Black",
    city: "Phnom Penh",
    district: "Boeung Keng Kang",
    importOrigin: "USA",
    locationPort: "PPAP Phnom Penh",
    condition: "USED",
    accidentDeclared: "NONE_DECLARED",
    ownershipCount: 1,
    vinLast6: "662194",
    plateNo: "2BM-1188",
    description: "Toyota Camry XLE Hybrid 2021. Fuel consumption 4.5L/100km, JBL premium audio, heated leather seats, blind spot monitor.",
    descriptionKm: "Camry Hybrid 2021 XLE ស៊ីសាំងតិច ៤.៥លីត្រ/១០០គ.ម គ្រឿងក្នុងប្រណីត បំពាក់ឧបករណ៍ជំនួយសុវត្ថិភាពពេញលេញ។",
    views: 380,
    daysAgo: 7,
    images: IMG.camry,
    docs: [{ type: "REGISTRATION_CARD", status: "VERIFIED" }],
  },
  {
    id: "veh_santafe_2022",
    sellerId: "usr_dealer_sokha",
    branchId: "branch_sokha_main",
    listingCategory: "CAR",
    make: "Hyundai",
    model: "Santa Fe",
    variant: "Calligraphy HTRAC",
    year: 2022,
    priceUsd: 42000,
    floorPriceUsd: 37000,
    stockNo: "STK-SK-008",
    chassisNo: "KM8SM-331902",
    steering: "LEFT",
    doors: 5,
    seats: 7,
    mileageKm: 31000,
    transmission: "AUTOMATIC",
    fuel: "DIESEL",
    engineCc: 2200,
    drivetrain: "AWD",
    bodyType: "SUV",
    exteriorColor: "Magnetic Force Grey",
    city: "Phnom Penh",
    district: "Toul Kork",
    importOrigin: "KOREA",
    locationPort: "PAS Sihanoukville",
    condition: "LIKE_NEW",
    accidentDeclared: "NONE_DECLARED",
    ownershipCount: 1,
    vinLast6: "331902",
    plateNo: "2BK-9911",
    description: "Hyundai Santa Fe 2022 Calligraphy Korea import. Nappa leather, 360 blind view camera, remote smart parking assist.",
    descriptionKm: "Hyundai Santa Fe 2022 Calligraphy ម៉ាស៊ូត កៅអីស្បែក Nappa បញ្ជាចតពីចម្ងាយដោយតេឡេ។",
    views: 290,
    daysAgo: 8,
    images: IMG.tucson,
    docs: [{ type: "IMPORT_DECLARATION", status: "VERIFIED" }],
    promo: {
      priceTypeId: "pt_discount_price",
      value: 10, // 10% off -> $37,800
    },
  },
  {
    id: "veh_c200_2020",
    sellerId: "usr_dealer_sokha",
    branchId: "branch_sokha_bkk",
    listingCategory: "CAR",
    make: "Mercedes-Benz",
    model: "C-Class",
    variant: "C200 AMG Dynamic",
    year: 2020,
    priceUsd: 46000,
    floorPriceUsd: 40000,
    stockNo: "STK-SK-009",
    chassisNo: "WDD205-001928",
    steering: "LEFT",
    doors: 4,
    seats: 5,
    mileageKm: 42000,
    transmission: "AUTOMATIC",
    fuel: "PETROL",
    engineCc: 2000,
    drivetrain: "RWD",
    bodyType: "SEDAN",
    exteriorColor: "Polar White",
    city: "Phnom Penh",
    district: "Boeung Keng Kang",
    importOrigin: "LOCAL",
    condition: "USED",
    accidentDeclared: "NONE_DECLARED",
    ownershipCount: 1,
    vinLast6: "001928",
    plateNo: "2BH-7722",
    description: "Mercedes-Benz C200 AMG 2020. Local Star Auto Cambodia official purchase. Digital cockpit, 64-color ambient lighting.",
    descriptionKm: "Mercedes-Benz C200 AMG ឆ្នាំ២០២០ ឡានក្រុមហ៊ុនផ្លូវការ Star Auto Cambodia មានកុងទ័រឌីជីថល អំពូល ៦៤ ពណ៌។",
    views: 310,
    daysAgo: 9,
    images: IMG.cclass,
    docs: [{ type: "REGISTRATION_CARD", status: "VERIFIED" }],
  },
  {
    id: "veh_carnival_2022",
    sellerId: "usr_dealer_sokha",
    branchId: "branch_sokha_main",
    listingCategory: "CAR",
    make: "Kia",
    model: "Carnival",
    variant: "Signature 7-Seater",
    year: 2022,
    priceUsd: 51000,
    floorPriceUsd: 45000,
    stockNo: "STK-SK-010",
    chassisNo: "KNDMA-884129",
    steering: "LEFT",
    doors: 5,
    seats: 7,
    mileageKm: 34000,
    transmission: "AUTOMATIC",
    fuel: "DIESEL",
    engineCc: 2200,
    drivetrain: "FWD",
    bodyType: "VAN",
    exteriorColor: "Snow White Pearl",
    city: "Phnom Penh",
    district: "Toul Kork",
    importOrigin: "KOREA",
    locationPort: "PAS Sihanoukville",
    condition: "LIKE_NEW",
    accidentDeclared: "NONE_DECLARED",
    ownershipCount: 1,
    vinLast6: "884129",
    plateNo: "2BP-4411",
    description: "Kia Carnival 2022 Signature VIP 7-seater diesel. Relaxation captain seats, twin sunroof, dual 12.3-inch displays.",
    descriptionKm: "Kia Carnival 2022 Signature VIP ៧កៅអី ម៉ាស៊ីនម៉ាស៊ូត កៅអីកាពីតែន ដំបូលកញ្ចក់ភ្លោះ។",
    views: 450,
    daysAgo: 3,
    images: IMG.carnival,
    docs: [{ type: "REGISTRATION_CARD", status: "VERIFIED" }],
    promo: {
      priceTypeId: "pt_clearance",
      value: 47000, // Clearance target $47,000
    },
  },
  {
    id: "veh_crv_2021",
    sellerId: "usr_dealer_ppauto",
    branchId: "branch_ppauto_main",
    listingCategory: "CAR",
    make: "Honda",
    model: "CR-V",
    variant: "Prestige Turbo",
    year: 2021,
    priceUsd: 36500,
    floorPriceUsd: 32000,
    stockNo: "STK-PP-001",
    chassisNo: "RW1-119284",
    steering: "LEFT",
    doors: 5,
    seats: 7,
    mileageKm: 38000,
    transmission: "AUTOMATIC",
    fuel: "PETROL",
    engineCc: 1500,
    drivetrain: "AWD",
    bodyType: "SUV",
    exteriorColor: "Modern Steel Metallic",
    city: "Phnom Penh",
    district: "Sen Sok",
    importOrigin: "LOCAL",
    condition: "USED",
    accidentDeclared: "NONE_DECLARED",
    ownershipCount: 1,
    vinLast6: "119284",
    plateNo: "2BI-6688",
    description: "Honda CR-V 2021 Turbo 7-seater. Honda Sensing safety suite, hands-free power tailgate, panoramic roof.",
    descriptionKm: "Honda CR-V 2021 ម៉ាស៊ីន Turbo ៧កៅអី មានប្រព័ន្ធសុវត្ថិភាព Honda Sensing និងទ្វារក្រោយអូតូ។",
    views: 420,
    daysAgo: 4,
    images: IMG.crv,
    docs: [{ type: "REGISTRATION_CARD", status: "VERIFIED" }],
    promo: {
      priceTypeId: "pt_hot_price",
      value: 33500, // Hot Price $33,500
    },
  },
  {
    id: "veh_cx5_2023",
    sellerId: "usr_dealer_ppauto",
    branchId: "branch_ppauto_main",
    listingCategory: "CAR",
    make: "Mazda",
    model: "CX-5",
    variant: "2.5L AWD Exclusive",
    year: 2023,
    priceUsd: 33000,
    floorPriceUsd: 29000,
    stockNo: "STK-PP-002",
    chassisNo: "KF2P-441920",
    steering: "LEFT",
    doors: 5,
    seats: 5,
    mileageKm: 19000,
    transmission: "AUTOMATIC",
    fuel: "PETROL",
    engineCc: 2500,
    drivetrain: "AWD",
    bodyType: "SUV",
    exteriorColor: "Soul Red Crystal",
    city: "Phnom Penh",
    district: "Sen Sok",
    importOrigin: "JAPAN",
    locationPort: "PAS Sihanoukville",
    condition: "LIKE_NEW",
    accidentDeclared: "NONE_DECLARED",
    ownershipCount: 1,
    vinLast6: "441920",
    plateNo: "2BZ-9922",
    description: "Mazda CX-5 2023 Exclusive AWD. Bose 10-speaker sound, ventilated seats, wireless Apple CarPlay, 360 view.",
    descriptionKm: "Mazda CX-5 2023 ពណ៌ក្រហមគ្រីស្តាល់ កៅអីខ្យល់ត្រជាក់ សម្លេង Bose ១០គ្រាប់។",
    views: 390,
    daysAgo: 5,
    images: IMG.cx5,
    docs: [{ type: "REGISTRATION_CARD", status: "VERIFIED" }],
    // Future scheduled campaign (starts in 7 days -> currently resolves to base price $33,000!)
    promo: {
      priceTypeId: "pt_flash_sale",
      value: 15,
      startDate: daysFromNow(7),
      endDate: daysFromNow(21),
    },
  },
  {
    id: "veh_prius_2017",
    sellerId: "usr_dealer_ppauto",
    branchId: "branch_ppauto_main",
    listingCategory: "CAR",
    make: "Toyota",
    model: "Prius",
    variant: "Four Touring",
    year: 2017,
    priceUsd: 21500,
    floorPriceUsd: 18500,
    stockNo: "STK-PP-003",
    chassisNo: "JTDKN-771239",
    steering: "LEFT",
    doors: 5,
    seats: 5,
    mileageKm: 76000,
    transmission: "AUTOMATIC",
    fuel: "HYBRID",
    engineCc: 1800,
    drivetrain: "FWD",
    bodyType: "HATCHBACK",
    exteriorColor: "Sea Glass Pearl",
    city: "Phnom Penh",
    district: "Sen Sok",
    importOrigin: "USA",
    locationPort: "PPAP Phnom Penh",
    condition: "USED",
    accidentDeclared: "NONE_DECLARED",
    ownershipCount: 1,
    vinLast6: "771239",
    plateNo: "2AX-4433",
    description: "Toyota Prius 2017 Four Touring. Excellent hybrid battery health, leather interior, lane keep assist, heads-up display.",
    descriptionKm: "Toyota Prius 2017 Four Touring អាគុយហាយប្រ៊ីដនៅល្អណាស់ គ្រឿងក្នុងស្បែក សន្សំសំចៃខ្ពស់។",
    views: 340,
    daysAgo: 8,
    images: IMG.civic, // representative compact sedan/hatchback
    docs: [{ type: "REGISTRATION_CARD", status: "VERIFIED" }],
    promo: {
      priceTypeId: "pt_clearance",
      value: 19500, // Clearance $19,500
    },
  },
  {
    id: "veh_everest_2022",
    sellerId: "usr_dealer_ppauto",
    branchId: "branch_ppauto_main",
    listingCategory: "CAR",
    make: "Ford",
    model: "Everest",
    variant: "Titanium+ 4x4",
    year: 2022,
    priceUsd: 52000,
    floorPriceUsd: 46000,
    stockNo: "STK-PP-004",
    chassisNo: "MPB11-884192",
    steering: "LEFT",
    doors: 5,
    seats: 7,
    mileageKm: 37000,
    transmission: "AUTOMATIC",
    fuel: "DIESEL",
    engineCc: 2000,
    drivetrain: "4WD",
    bodyType: "SUV",
    exteriorColor: "Alabaster White",
    city: "Phnom Penh",
    district: "Sen Sok",
    importOrigin: "THAILAND",
    locationPort: "PAS Sihanoukville",
    condition: "USED",
    accidentDeclared: "NONE_DECLARED",
    ownershipCount: 1,
    vinLast6: "884192",
    plateNo: "2BW-3311",
    description: "Next-Gen Ford Everest Titanium+ 4x4 Bi-Turbo. Panoramic sunroof, 12-inch vertical screen, terrain management.",
    descriptionKm: "Ford Everest 2022 Titanium+ 4x4 Bi-Turbo ដំបូលកញ្ចក់បើកបាន អេក្រង់ធំ១២អ៊ីញ ៧កៅអី។",
    views: 480,
    daysAgo: 4,
    images: IMG.fortuner,
    docs: [{ type: "REGISTRATION_CARD", status: "VERIFIED" }],
  },
  {
    id: "veh_pajero_2020",
    sellerId: "usr_dealer_ppauto",
    branchId: "branch_ppauto_main",
    listingCategory: "CAR",
    make: "Mitsubishi",
    model: "Pajero Sport",
    variant: "GT-Premium 4WD",
    year: 2020,
    priceUsd: 35000,
    floorPriceUsd: 31000,
    stockNo: "STK-PP-005",
    chassisNo: "KR1W-009281",
    steering: "RIGHT", // Authentic RHD Thailand import
    doors: 5,
    seats: 7,
    mileageKm: 58000,
    transmission: "AUTOMATIC",
    fuel: "DIESEL",
    engineCc: 2400,
    drivetrain: "4WD",
    bodyType: "SUV",
    exteriorColor: "Deep Bronze Metallic",
    city: "Phnom Penh",
    district: "Sen Sok",
    importOrigin: "THAILAND",
    locationPort: "PAS Sihanoukville",
    condition: "USED",
    accidentDeclared: "NONE_DECLARED",
    ownershipCount: 1,
    vinLast6: "009281",
    plateNo: "2BA-8822",
    description: "Mitsubishi Pajero Sport GT-Premium 2020. 8-speed automatic with Super Select 4WD-II. Right-hand drive.",
    descriptionKm: "Mitsubishi Pajero Sport 2020 GT-Premium ចង្កូតស្តាំនាំចូលពីថៃ ប្រអប់លេខ ៨វគ្គ កម្លាំងខ្លាំង។",
    views: 260,
    daysAgo: 10,
    images: IMG.fortuner,
    docs: [{ type: "IMPORT_DECLARATION", status: "VERIFIED" }],
  },
  {
    id: "veh_prius_2012",
    sellerId: "usr_priv_vireak",
    listingCategory: "CAR",
    make: "Toyota",
    model: "Prius",
    variant: "Option 5 Full",
    year: 2012,
    priceUsd: 12500,
    floorPriceUsd: 10500,
    stockNo: "STK-VR-001",
    chassisNo: "JTDKN-119284",
    steering: "LEFT",
    doors: 5,
    seats: 5,
    mileageKm: 145000,
    transmission: "AUTOMATIC",
    fuel: "HYBRID",
    engineCc: 1800,
    drivetrain: "FWD",
    bodyType: "HATCHBACK",
    exteriorColor: "Classic Silver",
    city: "Phnom Penh",
    district: "Toul Kork",
    importOrigin: "USA",
    condition: "USED",
    accidentDeclared: "MINOR_DECLARED",
    ownershipCount: 2,
    vinLast6: "119284",
    plateNo: "2V-1190",
    description: "Toyota Prius 2012 Option 5. Solar sunroof, radar cruise control, leather seats, upgraded ABS pump.",
    descriptionKm: "Toyota Prius 2012 Option 5 មានដំបូលសូឡា រ៉ាដាចាប់ល្បឿន ម៉ាស៊ីនត្រជាក់និងអាគុយនៅដំណើរការល្អ។",
    views: 520,
    daysAgo: 12,
    images: IMG.civic,
    docs: [{ type: "REGISTRATION_CARD", status: "VERIFIED" }],
    // Expired campaign (ended 5 days ago -> automatically reverts to base price $12,500!)
    promo: {
      priceTypeId: "pt_hot_price",
      value: 10800,
      startDate: daysAgo(30),
      endDate: daysAgo(5),
    },
  },
  {
    id: "veh_corolla_2015",
    sellerId: "usr_priv_vireak",
    listingCategory: "CAR",
    make: "Toyota",
    model: "Corolla",
    variant: "LE Sedan",
    year: 2015,
    priceUsd: 16800,
    floorPriceUsd: 15000,
    stockNo: "STK-VR-002",
    chassisNo: "2T1BUR-991204",
    steering: "LEFT",
    doors: 4,
    seats: 5,
    mileageKm: 98000,
    transmission: "AUTOMATIC",
    fuel: "PETROL",
    engineCc: 1800,
    drivetrain: "FWD",
    bodyType: "SEDAN",
    exteriorColor: "Slate Grey",
    city: "Phnom Penh",
    district: "Toul Kork",
    importOrigin: "USA",
    condition: "USED",
    accidentDeclared: "NONE_DECLARED",
    ownershipCount: 1,
    vinLast6: "991204",
    plateNo: "2AI-7744",
    description: "Toyota Corolla 2015 LE. Touchscreen display, rear camera, brand new Yokohama tires, pristine condition.",
    descriptionKm: "Toyota Corolla 2015 LE ឡានស្អាត ទឹកថ្នាំហ្ស៊ីនច្រើន សំបកកង់ Yokohama ថ្មីទាំង៤គ្រាប់។",
    views: 290,
    daysAgo: 14,
    images: IMG.camry,
    docs: [{ type: "REGISTRATION_CARD", status: "VERIFIED" }],
  },
  {
    id: "veh_nx200t_2016",
    sellerId: "usr_priv_sopheak",
    listingCategory: "CAR",
    make: "Lexus",
    model: "NX",
    variant: "200t F-Sport",
    year: 2016,
    priceUsd: 34500,
    floorPriceUsd: 30000,
    stockNo: "STK-SP-001",
    chassisNo: "JTJHA-551928",
    steering: "LEFT",
    doors: 5,
    seats: 5,
    mileageKm: 81000,
    transmission: "AUTOMATIC",
    fuel: "PETROL",
    engineCc: 2000,
    drivetrain: "AWD",
    bodyType: "SUV",
    exteriorColor: "Obsidian Black",
    city: "Kandal",
    district: "Ta Khmau",
    importOrigin: "USA",
    condition: "USED",
    accidentDeclared: "NONE_DECLARED",
    ownershipCount: 1,
    vinLast6: "551928",
    plateNo: "2AK-8833",
    description: "Lexus NX200t F-Sport 2016. Red sport leather, power tailgate, wireless phone charger, eco/sport mode.",
    descriptionKm: "Lexus NX200t F-Sport 2016 កៅអីក្រហមស្ព័រ ទ្វារក្រោយអូតូ ម៉ាស៊ីន Turbo ស្ទុះខ្លាំង។",
    views: 380,
    daysAgo: 6,
    images: IMG.lexus,
    docs: [{ type: "REGISTRATION_CARD", status: "VERIFIED" }],
    promo: {
      priceTypeId: "pt_discount_price",
      value: 8, // 8% off -> $31,740
    },
  },

  // ================= MOTORCYCLES (8) =================
  {
    id: "veh_honda_dream_2023",
    sellerId: "usr_dealer_sokha",
    branchId: "branch_sokha_main",
    listingCategory: "MOTOR",
    make: "Honda",
    model: "Dream 125",
    variant: "NCX Grand",
    year: 2024,
    priceUsd: 2650,
    floorPriceUsd: 2350,
    stockNo: "MOT-SK-001",
    engineCc: 125,
    transmission: "MANUAL",
    fuel: "PETROL",
    bodyType: "CUB",
    motorType: "CUB",
    hasAbs: false,
    startType: "BOTH",
    mileageKm: 3200,
    exteriorColor: "Glossy Black",
    city: "Phnom Penh",
    district: "Toul Kork",
    condition: "LIKE_NEW",
    accidentDeclared: "NONE_DECLARED",
    ownershipCount: 1,
    plateNo: "1KB-8899",
    description: "2024 Honda Dream 125 NCX authentic Cambodia assembly. Gold emblem, crystal headlight, like-new engine.",
    descriptionKm: "Honda Dream 125 ស៊េរីឆ្នាំ២០២៤ ស្លាកលេខភ្នំពេញ 1KB-8899 តែមមាស ខ្មៅរលោង ម៉ាស៊ីនស្ងាត់ដូចថ្មី។",
    featured: true,
    views: 650,
    daysAgo: 2,
    images: IMG.honda_dream || IMG.revo,
    docs: [{ type: "REGISTRATION_CARD", status: "VERIFIED" }],
    promo: {
      priceTypeId: "pt_hot_price",
      value: 2450, // Hot Price $2,450
    },
  },
  {
    id: "veh_scoopy_2023",
    sellerId: "usr_dealer_ppauto",
    branchId: "branch_ppauto_main",
    listingCategory: "MOTOR",
    make: "Honda",
    model: "Scoopy",
    variant: "Prestige Smartkey",
    year: 2023,
    priceUsd: 2300,
    floorPriceUsd: 2050,
    stockNo: "MOT-PP-001",
    engineCc: 110,
    transmission: "AUTOMATIC",
    fuel: "PETROL",
    bodyType: "SCOOTER",
    motorType: "SCOOTER",
    hasAbs: false,
    startType: "ELECTRIC",
    mileageKm: 7800,
    exteriorColor: "Matte White",
    city: "Phnom Penh",
    district: "Sen Sok",
    condition: "USED",
    accidentDeclared: "NONE_DECLARED",
    ownershipCount: 1,
    plateNo: "1KC-4412",
    description: "Honda Scoopy 2023 Prestige Smart Key. Idling stop system, USB phone charger, very stylish scooter.",
    descriptionKm: "Honda Scoopy 2023 Smart Key សោវៃឆ្លាត ពណ៌សស្អាត ម៉ាស៊ីនស្ទុះ ជិះស្រួលក្នុងក្រុង។",
    views: 370,
    daysAgo: 5,
    images: IMG.honda_scoopy || IMG.civic,
    docs: [{ type: "REGISTRATION_CARD", status: "VERIFIED" }],
  },
  {
    id: "veh_pcx_2024",
    sellerId: "usr_dealer_sokha",
    branchId: "branch_sokha_bkk",
    listingCategory: "MOTOR",
    make: "Honda",
    model: "PCX 160",
    variant: "e:HEV ABS",
    year: 2024,
    priceUsd: 3850,
    floorPriceUsd: 3400,
    stockNo: "MOT-SK-002",
    engineCc: 160,
    transmission: "AUTOMATIC",
    fuel: "PETROL",
    bodyType: "SCOOTER",
    motorType: "SCOOTER",
    hasAbs: true,
    startType: "ELECTRIC",
    mileageKm: 4100,
    exteriorColor: "Matte Gunpowder Black",
    city: "Phnom Penh",
    district: "Boeung Keng Kang",
    condition: "LIKE_NEW",
    accidentDeclared: "NONE_DECLARED",
    ownershipCount: 1,
    plateNo: "1KD-2288",
    description: "Honda PCX 160 ABS 2024. Honda Selectable Torque Control (HSTC), front disc ABS, 30L under-seat storage.",
    descriptionKm: "Honda PCX 160 ABS 2024 ហ្វ្រាំង ABS ប្រព័ន្ធទប់លំនឹង HSTC ឃ្លុបធំទូលាយ ជិះស្រួលណាស់។",
    featured: true,
    views: 490,
    daysAgo: 3,
    images: IMG.honda_scoopy || IMG.crv,
    docs: [{ type: "REGISTRATION_CARD", status: "VERIFIED" }],
    promo: {
      priceTypeId: "pt_promote_price",
      value: 9, // 9% off -> $3,503 (~$3,500)
    },
  },
  {
    id: "veh_xmax_2023",
    sellerId: "usr_dealer_ppauto",
    branchId: "branch_ppauto_main",
    listingCategory: "MOTOR",
    make: "Yamaha",
    model: "XMAX",
    variant: "300 Tech MAX",
    year: 2023,
    priceUsd: 6200,
    floorPriceUsd: 5500,
    stockNo: "MOT-PP-002",
    engineCc: 292,
    transmission: "AUTOMATIC",
    fuel: "PETROL",
    bodyType: "SPORT",
    motorType: "SPORT",
    hasAbs: true,
    startType: "ELECTRIC",
    mileageKm: 6500,
    exteriorColor: "Dark Petrol",
    city: "Phnom Penh",
    district: "Sen Sok",
    condition: "USED",
    accidentDeclared: "NONE_DECLARED",
    ownershipCount: 1,
    plateNo: "1JZ-9911",
    description: "Yamaha XMAX 300 Tech MAX 2023. Dual TFT screens with Garmin navigation, traction control, ABS disc brakes.",
    descriptionKm: "Yamaha XMAX 300 Tech MAX 2023 ម៉ូតូស្ព័រធំ អេក្រង់ភ្លោះ TFT ប្រព័ន្ធហ្វ្រាំង ABS មុខក្រោយ។",
    views: 580,
    daysAgo: 4,
    images: IMG.honda_dream || IMG.cclass,
    docs: [{ type: "REGISTRATION_CARD", status: "VERIFIED" }],
    promo: {
      priceTypeId: "pt_flash_sale",
      value: 8, // 8% off -> $5,704
      startDate: daysAgo(1),
      endDate: daysFromNow(4),
    },
  },
  {
    id: "veh_adv_2024",
    sellerId: "usr_dealer_ppauto",
    branchId: "branch_ppauto_main",
    listingCategory: "MOTOR",
    make: "Honda",
    model: "ADV 160",
    variant: "ABS Adventure",
    year: 2024,
    priceUsd: 4100,
    floorPriceUsd: 3700,
    stockNo: "MOT-PP-003",
    engineCc: 160,
    transmission: "AUTOMATIC",
    fuel: "PETROL",
    bodyType: "SCOOTER",
    motorType: "SCOOTER",
    hasAbs: true,
    startType: "ELECTRIC",
    mileageKm: 2900,
    exteriorColor: "Dynamic Red",
    city: "Phnom Penh",
    district: "Sen Sok",
    condition: "LIKE_NEW",
    accidentDeclared: "NONE_DECLARED",
    ownershipCount: 1,
    plateNo: "1KD-7733",
    description: "Honda ADV 160 ABS 2024 adventure scooter. Showa twin sub-tank rear suspension, tapered handlebar, emergency stop signal.",
    descriptionKm: "Honda ADV 160 ABS 2024 បូម Showa កំប៉ុងភ្លោះ កង់ធំជិះផ្លូវឆ្ងាយស្រួល ស្ថានភាពថ្មី ៩៩%។",
    views: 430,
    daysAgo: 6,
    images: IMG.honda_scoopy || IMG.tucson,
    docs: [{ type: "REGISTRATION_CARD", status: "VERIFIED" }],
  },
  {
    id: "veh_vespa_2023",
    sellerId: "usr_dealer_sokha",
    branchId: "branch_sokha_bkk",
    listingCategory: "MOTOR",
    make: "Vespa",
    model: "Sprint",
    variant: "S 150 i-Get ABS",
    year: 2023,
    priceUsd: 4600,
    floorPriceUsd: 4000,
    stockNo: "MOT-SK-003",
    engineCc: 150,
    transmission: "AUTOMATIC",
    fuel: "PETROL",
    bodyType: "SCOOTER",
    motorType: "SCOOTER",
    hasAbs: true,
    startType: "ELECTRIC",
    mileageKm: 5200,
    exteriorColor: "Audace Orange",
    city: "Phnom Penh",
    district: "Boeung Keng Kang",
    condition: "LIKE_NEW",
    accidentDeclared: "NONE_DECLARED",
    ownershipCount: 1,
    plateNo: "1KC-1100",
    description: "Vespa Sprint S 150 i-Get ABS 2023 Italian design. Full LED lighting, black details, genuine front rack accessory.",
    descriptionKm: "Vespa Sprint S 150 ឆ្នាំ២០២៣ ពណ៌ទឹកក្រូចស្អាតទាក់ទាញ ម៉ាស៊ីន i-Get ស៊ីប្រេងតិច មានហ្វ្រាំង ABS។",
    views: 390,
    daysAgo: 7,
    images: IMG.honda_scoopy || IMG.cx5,
    docs: [{ type: "REGISTRATION_CARD", status: "VERIFIED" }],
    promo: {
      priceTypeId: "pt_member",
      value: 8, // 8% off -> $4,232
    },
  },
  {
    id: "veh_klx_2022",
    sellerId: "usr_priv_vireak",
    listingCategory: "MOTOR",
    make: "Kawasaki",
    model: "KLX 150",
    variant: "KLX 230 S Dual-Sport",
    year: 2022,
    priceUsd: 3900,
    floorPriceUsd: 3400,
    stockNo: "MOT-VR-001",
    engineCc: 233,
    transmission: "MANUAL",
    fuel: "PETROL",
    bodyType: "DIRT",
    motorType: "DIRT",
    hasAbs: false,
    startType: "ELECTRIC",
    mileageKm: 9800,
    exteriorColor: "Lime Green",
    city: "Phnom Penh",
    district: "Toul Kork",
    condition: "USED",
    accidentDeclared: "NONE_DECLARED",
    ownershipCount: 1,
    plateNo: "1JB-6622",
    description: "Kawasaki KLX 230 S 2022 off-road dual sport. Long travel suspension, aluminum rims, lightweight trail machine.",
    descriptionKm: "Kawasaki KLX 230 S ឆ្នាំ២០២២ ម៉ូតូស្ព័រឡើងភ្នំ បូមវែង កង់មុខ២១អ៊ីញ ម៉ាស៊ីនខ្លាំង។",
    views: 320,
    daysAgo: 9,
    images: IMG.honda_dream || IMG.ranger,
    docs: [{ type: "REGISTRATION_CARD", status: "VERIFIED" }],
  },
  {
    id: "veh_wave_2023",
    sellerId: "usr_priv_sopheak",
    listingCategory: "MOTOR",
    make: "Honda",
    model: "Wave 110",
    variant: "110i Cast Wheels",
    year: 2023,
    priceUsd: 1650,
    floorPriceUsd: 1450,
    stockNo: "MOT-SP-001",
    engineCc: 110,
    transmission: "MANUAL",
    fuel: "PETROL",
    bodyType: "CUB",
    motorType: "CUB",
    hasAbs: false,
    startType: "BOTH",
    mileageKm: 8900,
    exteriorColor: "Red / Black",
    city: "Kandal",
    district: "Ta Khmau",
    condition: "USED",
    accidentDeclared: "NONE_DECLARED",
    ownershipCount: 1,
    plateNo: "1KB-3388",
    description: "Honda Wave 110i 2023 fuel injection PGM-FI. Extremely fuel efficient (1.8L/100km), very durable and cheap to maintain.",
    descriptionKm: "Honda Wave 110i ឆ្នាំ២០២៣ ប៊ិចសាំង PGM-FI សន្សំសំចៃខ្ពស់ ម៉ាស៊ីនធន់ ងាយស្រួលថែទាំ។",
    views: 240,
    daysAgo: 11,
    images: IMG.honda_dream || IMG.accent,
    docs: [{ type: "REGISTRATION_CARD", status: "VERIFIED" }],
  },

  // ================= SPARE PARTS (8) =================
  {
    id: "veh_part_brembo_caliper",
    sellerId: "usr_dealer_sokha",
    branchId: "branch_sokha_main",
    listingCategory: "SPARE_PART",
    make: "Brembo",
    model: "Brake Caliper",
    variant: "GT 4-Piston Caliper Kit",
    year: 2024,
    priceUsd: 480,
    floorPriceUsd: 390,
    stockNo: "PRT-SK-001",
    mileageKm: 0,
    transmission: "AUTOMATIC",
    fuel: "PETROL",
    bodyType: "PART",
    partCategory: "BRAKES_SUSPENSION",
    partTarget: "CAR",
    partCondition: "BRAND_NEW",
    partNumber: "BRM-GT4P-FR",
    oemBrand: "Brembo",
    isOem: false,
    position: "FRONT",
    compatibleModels: "Toyota Land Cruiser Prado, Hilux Revo, Fortuner",
    compatibleMake: "Toyota",
    compatibleModel: "Land Cruiser Prado",
    city: "Phnom Penh",
    district: "Toul Kork",
    description: "Genuine Brembo GT 4-Piston front brake calipers with ceramic high-friction pads and mounting brackets.",
    descriptionKm: "ដុំកៀបហ្វ្រាំងមុខ Brembo GT ៤ពីស្តុងសុទ្ធ ១០០% សម្រាប់ Prado, Revo, Fortuner ហ្វ្រាំងស៊ីខ្លាំង។",
    featured: true,
    views: 520,
    daysAgo: 3,
    images: IMG.oem_brake_pads || IMG.prado,
    docs: [{ type: "PURCHASE_INVOICE", status: "VERIFIED" }],
    promo: {
      priceTypeId: "pt_wholesale",
      value: 15, // 15% wholesale -> $408
    },
  },
  {
    id: "veh_part_michelin_tires",
    sellerId: "usr_dealer_ppauto",
    branchId: "branch_ppauto_main",
    listingCategory: "SPARE_PART",
    make: "Michelin",
    model: "Primacy 4",
    variant: "265/65R17 SUV 112H",
    year: 2024,
    priceUsd: 620,
    floorPriceUsd: 530,
    stockNo: "PRT-PP-001",
    mileageKm: 0,
    transmission: "AUTOMATIC",
    fuel: "PETROL",
    bodyType: "PART",
    partCategory: "TIRES_WHEELS",
    partTarget: "CAR",
    partCondition: "BRAND_NEW",
    partNumber: "MICH-PR4-265",
    oemBrand: "Michelin",
    isOem: false,
    position: "UNIVERSAL",
    compatibleModels: "Prado 150, Hilux Revo, Ford Ranger, Pajero Sport",
    compatibleMake: "Toyota",
    compatibleModel: "Hilux",
    city: "Phnom Penh",
    district: "Sen Sok",
    description: "Set of 4 Michelin Primacy 4 SUV tires 265/65R17. Manufactured in 2024 in Thailand. Unmatched wet grip and quiet ride.",
    descriptionKm: "សំបកកង់ Michelin Primacy 4 SUV ១ឈុត ៤គ្រាប់ ទំហំ 265/65R17 ផលិតឆ្នាំ២០២៤ ស្ងាត់ ជាប់ផ្លូវល្អ។",
    views: 430,
    daysAgo: 4,
    images: IMG.motorcycle_parts_kit || IMG.revo,
    docs: [{ type: "PURCHASE_INVOICE", status: "VERIFIED" }],
    promo: {
      priceTypeId: "pt_bundle",
      value: 550, // Bundle Deal $550
    },
  },
  {
    id: "part_toyota_brake_pads",
    sellerId: "usr_dealer_sokha",
    branchId: "branch_sokha_main",
    listingCategory: "SPARE_PART",
    make: "Toyota",
    model: "Brake Pads",
    variant: "Front Ceramic OEM",
    year: 2024,
    priceUsd: 75,
    floorPriceUsd: 55,
    stockNo: "PRT-SK-002",
    mileageKm: 0,
    transmission: "AUTOMATIC",
    fuel: "PETROL",
    bodyType: "PART",
    partCategory: "BRAKES_SUSPENSION",
    partTarget: "CAR",
    partCondition: "BRAND_NEW",
    partNumber: "04465-47060",
    oemBrand: "Toyota",
    isOem: true,
    position: "FRONT",
    compatibleModels: "Toyota Prius 2004-2015, Corolla 2009-2019",
    compatibleMake: "Toyota",
    compatibleModel: "Prius",
    city: "Phnom Penh",
    district: "Toul Kork",
    description: "Toyota Genuine OEM Ceramic front brake pad set. Part number 04465-47060 in original sealed box.",
    descriptionKm: "ស្បែកហ្វ្រាំងមុខ Toyota សុទ្ធ OEM កូដ 04465-47060 ក្នុងប្រអប់ដើម សម្រាប់ Prius និង Corolla។",
    views: 610,
    daysAgo: 5,
    images: IMG.oem_brake_pads || IMG.camry,
    docs: [
      { type: "PURCHASE_INVOICE", status: "VERIFIED" },
      { type: "IMPORT_DECLARATION", status: "VERIFIED" },
    ],
    promo: {
      priceTypeId: "pt_wholesale",
      value: 20, // 20% off -> $60
    },
  },
  {
    id: "veh_part_denso_plugs",
    sellerId: "usr_dealer_ppauto",
    branchId: "branch_ppauto_main",
    listingCategory: "SPARE_PART",
    make: "Denso",
    model: "Spark Plug Iridium",
    variant: "SK20R11 Set of 4",
    year: 2024,
    priceUsd: 48,
    floorPriceUsd: 38,
    stockNo: "PRT-PP-002",
    mileageKm: 0,
    transmission: "AUTOMATIC",
    fuel: "PETROL",
    bodyType: "PART",
    partCategory: "BATTERY_ELECTRICAL",
    partTarget: "CAR",
    partCondition: "BRAND_NEW",
    partNumber: "SK20R11",
    oemBrand: "Denso",
    isOem: true,
    position: "UNIVERSAL",
    compatibleModels: "Camry 2.4L/2.5L, RAV4, Highlander, Lexus RX350",
    compatibleMake: "Toyota",
    compatibleModel: "Camry",
    city: "Phnom Penh",
    district: "Sen Sok",
    description: "Denso Iridium Long Life spark plugs set of 4. High durability 100,000 km replacement interval.",
    descriptionKm: "ប៊ូស៊ីភ្លើង Denso Iridium សុទ្ធ ១ឈុត ៤គ្រាប់ កូដ SK20R11 ប្រើប្រាស់បានយូររហូតដល់ ១០ម៉ឺនគ.ម។",
    views: 310,
    daysAgo: 8,
    images: IMG.motorcycle_parts_kit || IMG.civic,
    docs: [{ type: "PURCHASE_INVOICE", status: "VERIFIED" }],
  },
  {
    id: "veh_part_prado_headlight",
    sellerId: "usr_dealer_sokha",
    branchId: "branch_sokha_main",
    listingCategory: "SPARE_PART",
    make: "Toyota",
    model: "Land Cruiser Prado",
    variant: "LED Projector Headlight Pair",
    year: 2023,
    priceUsd: 780,
    floorPriceUsd: 650,
    stockNo: "PRT-SK-003",
    mileageKm: 0,
    transmission: "AUTOMATIC",
    fuel: "PETROL",
    bodyType: "PART",
    partCategory: "LIGHTS_BULBS",
    partTarget: "CAR",
    partCondition: "BRAND_NEW",
    partNumber: "81110-60M50",
    oemBrand: "Toyota",
    isOem: true,
    position: "FRONT",
    compatibleModels: "Land Cruiser Prado 2018-2023 (TRJ150, GDJ150)",
    compatibleMake: "Toyota",
    compatibleModel: "Land Cruiser Prado",
    city: "Phnom Penh",
    district: "Toul Kork",
    description: "Pair of genuine Toyota LED projector headlight assemblies for 2018-2023 Prado with daytime running lights.",
    descriptionKm: "ចង្កៀងមុខ LED Projector Toyota Prado 2018–2023 មួយគូឆ្វេងស្តាំ ភ្លឺច្បាស់ខ្លាំង។",
    views: 480,
    daysAgo: 6,
    images: IMG.prado,
    docs: [{ type: "IMPORT_DECLARATION", status: "VERIFIED" }],
    promo: {
      priceTypeId: "pt_clearance",
      value: 680, // Clearance $680
    },
  },
  {
    id: "veh_part_revo_suspension",
    sellerId: "usr_dealer_ppauto",
    branchId: "branch_ppauto_main",
    listingCategory: "SPARE_PART",
    make: "Genuine Parts",
    model: "Standard / Universal",
    variant: "Ironman 4x4 Foam Cell Pro 2-Inch Lift",
    year: 2024,
    priceUsd: 1450,
    floorPriceUsd: 1250,
    stockNo: "PRT-PP-003",
    mileageKm: 0,
    transmission: "AUTOMATIC",
    fuel: "PETROL",
    bodyType: "PART",
    partCategory: "BRAKES_SUSPENSION",
    partTarget: "CAR",
    partCondition: "BRAND_NEW",
    partNumber: "TOY065CKP",
    oemBrand: "Ironman 4x4",
    isOem: false,
    position: "UNIVERSAL",
    compatibleModels: "Toyota Hilux Revo / Rocco 2015-2024",
    compatibleMake: "Toyota",
    compatibleModel: "Hilux",
    city: "Phnom Penh",
    district: "Sen Sok",
    description: "Ironman 4x4 Foam Cell Pro 2-inch suspension lift kit complete with front struts, rear shocks, and leaf springs.",
    descriptionKm: "ឈុតបូមលើកកម្ពស់ Ironman 4x4 Foam Cell Pro ២អ៊ីញ សម្រាប់ Hilux Revo ជិះទន់ស្រួល មិនរលាក់។",
    views: 390,
    daysAgo: 7,
    images: IMG.revo,
    docs: [{ type: "PURCHASE_INVOICE", status: "VERIFIED" }],
  },
  {
    id: "veh_part_motul_oil",
    sellerId: "usr_dealer_sokha",
    branchId: "branch_sokha_bkk",
    listingCategory: "SPARE_PART",
    make: "Motul",
    model: "300V Factory Line",
    variant: "5W-40 100% Synthetic 4L",
    year: 2024,
    priceUsd: 65,
    floorPriceUsd: 50,
    stockNo: "PRT-SK-004",
    mileageKm: 0,
    transmission: "AUTOMATIC",
    fuel: "PETROL",
    bodyType: "PART",
    partCategory: "OILS_LUBRICANTS",
    partTarget: "CAR",
    partCondition: "BRAND_NEW",
    partNumber: "104242",
    oemBrand: "Motul",
    isOem: false,
    position: "UNIVERSAL",
    compatibleModels: "Universal Performance Cars, European & Japanese Turbo engines",
    city: "Phnom Penh",
    district: "Boeung Keng Kang",
    description: "Motul 300V Power 5W-40 4L 100% synthetic racing motor oil with Ester Core technology. Maximum power output.",
    descriptionKm: "ប្រេងម៉ាស៊ីន Motul 300V 5W-40 កាន ៤លីត្រ សំយោគ ១០០% បច្ចេកវិទ្យា Ester Core ការពារម៉ាស៊ីនបានល្អបំផុត។",
    views: 540,
    daysAgo: 4,
    images: IMG.motorcycle_parts_kit || IMG.lexus,
    docs: [{ type: "PURCHASE_INVOICE", status: "VERIFIED" }],
    promo: {
      priceTypeId: "pt_hot_price",
      value: 55, // Hot Price $55
    },
  },
  {
    id: "veh_part_alphard_mats",
    sellerId: "usr_dealer_sokha",
    branchId: "branch_sokha_bkk",
    listingCategory: "SPARE_PART",
    make: "Toyota",
    model: "Alphard",
    variant: "VIP Executive Floor Mat 5D Set",
    year: 2024,
    priceUsd: 190,
    floorPriceUsd: 160,
    stockNo: "PRT-SK-005",
    mileageKm: 0,
    transmission: "AUTOMATIC",
    fuel: "PETROL",
    bodyType: "PART",
    partCategory: "ACCESSORIES",
    partTarget: "CAR",
    partCondition: "BRAND_NEW",
    partNumber: "ALP-MAT-5D",
    oemBrand: "Toyota",
    isOem: false,
    position: "UNIVERSAL",
    compatibleModels: "Toyota Alphard / Vellfire 30 & 40 Series",
    compatibleMake: "Toyota",
    compatibleModel: "Alphard",
    city: "Phnom Penh",
    district: "Boeung Keng Kang",
    description: "5D luxury full-coverage floor mat set for Toyota Alphard / Vellfire. Waterproof, odorless, high-density leather.",
    descriptionKm: "កម្រាលជើង 5D VIP ពេញមួយឡាន Toyota Alphard / Vellfire មិនជ្រាបទឹក គ្មានក្លិន ស្អាតប្រណីត។",
    views: 310,
    daysAgo: 5,
    images: IMG.vellfire || IMG.cclass,
    docs: [{ type: "PURCHASE_INVOICE", status: "VERIFIED" }],
  },
];

async function seedVehicles() {
  for (const v of VEHICLES) {
    const createdAt = daysAgo(v.daysAgo);
    await prisma.vehicle.create({
      data: {
        id: v.id,
        sellerId: v.sellerId,
        tenantId: TENANT_BY_SELLER[v.sellerId] ?? null,
        branchId: v.branchId ?? null,
        createdById: v.sellerId,
        listingCategory: v.listingCategory,
        make: v.make,
        model: v.model,
        variant: v.variant ?? null,
        year: v.year,
        priceUsd: v.priceUsd,
        floorPriceUsd: v.floorPriceUsd ?? null,
        stockNo: v.stockNo,
        chassisNo: v.chassisNo ?? null,
        steering: v.steering ?? "LEFT",
        doors: v.doors ?? null,
        seats: v.seats ?? null,
        mileageKm: v.mileageKm,
        transmission: v.transmission,
        fuel: v.fuel,
        engineCc: v.engineCc ?? null,
        drivetrain: v.drivetrain ?? null,
        bodyType: v.bodyType,
        exteriorColor: v.exteriorColor ?? null,
        city: v.city,
        district: v.district ?? null,
        importOrigin: v.importOrigin ?? null,
        locationPort: v.locationPort ?? null,
        condition: v.condition ?? "USED",
        accidentDeclared: v.accidentDeclared ?? "NONE_DECLARED",
        ownershipCount: v.ownershipCount ?? 1,
        vinLast6: v.vinLast6 ?? null,
        plateNo: v.plateNo ?? null,
        description: v.description,
        descriptionKm: v.descriptionKm,
        status: "PUBLISHED",
        featured: v.featured ?? false,
        views: v.views,
        createdAt,
        motorType: v.motorType ?? null,
        hasAbs: v.hasAbs ?? false,
        startType: v.startType ?? null,
        partCategory: v.partCategory ?? null,
        partCondition: v.partCondition ?? null,
        partTarget: v.partTarget ?? null,
        partNumber: v.partNumber ?? null,
        oemBrand: v.oemBrand ?? null,
        isOem: v.isOem ?? true,
        position: v.position ?? null,
        compatibleModels: v.compatibleModels ?? null,
        compatibleMake: v.compatibleMake ?? null,
        compatibleModel: v.compatibleModel ?? null,
        images: {
          create: v.images.map((url, idx) => ({
            url,
            sortOrder: idx,
          })),
        },
        documents: {
          create: v.docs.map((d) => ({
            type: d.type,
            status: d.status,
            notes: d.notes ?? null,
            fileUrl: v.images[0] ?? null,
          })),
        },
      },
    });

    // Attach promotional rule if defined
    if (v.promo) {
      const startDate = v.promo.startDate ?? daysAgo(5);
      const endDate = v.promo.endDate ?? daysFromNow(25);
      await prisma.itemPrice.create({
        data: {
          vehicleId: v.id,
          priceTypeId: v.promo.priceTypeId,
          value: v.promo.value,
          currency: "USD",
          startDate,
          endDate,
          active: true,
        },
      });
    }
  }
}

// ---------------------------------------------------------------------------
// 6. Pre-Generated AI History Reports (Linked to Seeded Vehicles)
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
  listing: { title: "Listing quality & safety", titleKm: "គុណភាពបញ្ជី និងសុវត្ថិភាព" },
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
    "VERIFIED",
    "Chassis TRJ150-554122 matches registration book and Dubai customs documentation.",
    "លេខតួ TRJ150-554122 ត្រូវគ្នានឹងសៀវភៅចុះបញ្ជី និងលិខិតគយឌូបាយ។",
    "Registration book + Import declaration",
    0.95
  ),
  check(
    "registration",
    "VERIFIED",
    "Registration book reviewed and platform-verified. Plate 1KH-8823 confirmed active.",
    "សៀវភៅចុះបញ្ជីត្រូវបានពិនិត្យនិងផ្ទៀងផ្ទាត់ដោយវេទិកា។ ស្លាកលេខ 1KH-8823 ត្រឹមត្រូវ។",
    "Registration book (platform-verified)",
    0.95
  ),
  check(
    "mileage",
    "EVIDENCE_FOUND",
    "Odometer of 89,000 km is consistent with service records covering 2019-2024.",
    "៨៩,០០០ គ.ម ត្រូវគ្នានឹងកំណត់ហេតុសេវាកម្ម ២០១៩–២០២៤។",
    "Service records + Listing data",
    0.85
  ),
];

const RX350_CHECKS: ReportCheck[] = [
  check(
    "identity",
    "VERIFIED",
    "Chassis 2T2BZMCA-5819 matches US title export documentation and Phnom Penh port registration.",
    "លេខតួ 2T2BZMCA-5819 ត្រូវគ្នានឹងឯកសារនាំចេញពីអាមេរិក និងការចុះបញ្ជីនៅភ្នំពេញ។",
    "US export certificate",
    0.95
  ),
  check(
    "registration",
    "VERIFIED",
    "Single owner registration book verified.",
    "សៀវភៅចុះបញ្ជីម្ចាស់ដើមត្រូវបានផ្ទៀងផ្ទាត់។",
    "Registration book",
    0.9
  ),
];

async function seedReports() {
  const pradoReport = await prisma.vehicleHistoryReport.create({
    data: {
      vehicleId: "veh_prado_2018",
      checksJson: JSON.stringify(PRADO_CHECKS),
      overallConfidence: 85,
      summaryEn: "This 2018 Prado TX presents well: verified documents, confirmed Dubai import, consistent service history.",
      summaryKm: "ឡាន Prado TX ឆ្នាំ២០១៨ នេះមានលក្ខណៈល្អ៖ ឯកសារបានផ្ទៀងផ្ទាត់ នាំចូលពីឌូបាយ មានកំណត់ហេតុថែទាំទៀងទាត់។",
      limitationsJson: JSON.stringify(LIMITATIONS),
      status: "COMPLETE",
      createdAt: daysAgo(1),
    },
  });

  const rx350Report = await prisma.vehicleHistoryReport.create({
    data: {
      vehicleId: "veh_rx350",
      checksJson: JSON.stringify(RX350_CHECKS),
      overallConfidence: 88,
      summaryEn: "Lexus RX350 F-Sport: genuine US title verified, clean registration and low mileage.",
      summaryKm: "Lexus RX350 F-Sport: ក្រដាសពន្ធ USA ផ្ទៀងផ្ទាត់រួច គីឡូទាប ស្ថានភាពល្អឥតខ្ចោះ។",
      limitationsJson: JSON.stringify(LIMITATIONS),
      status: "COMPLETE",
      createdAt: daysAgo(2),
    },
  });

  return { pradoReport, rx350Report };
}

// ---------------------------------------------------------------------------
// 7. Engagement & Dashboard Demo Data
// ---------------------------------------------------------------------------

async function seedEngagement(pradoReportId: string) {
  const convCreated = hoursAgo(47);
  await prisma.conversation.create({
    data: {
      id: "conv_demo_1",
      vehicleId: "veh_rx350",
      buyerId: "usr_demo_buyer",
      createdAt: convCreated,
    },
  });

  await prisma.message.createMany({
    data: [
      {
        conversationId: "conv_demo_1",
        senderId: null,
        isSystem: true,
        body: "គន្លឹះសុវត្ថិភាព: កុំបង់ប្រាក់កក់មុនពេលមើលឡាននិងឯកសារផ្ទាល់។ / Safety tip: Never pay a deposit before inspecting the vehicle.",
        createdAt: hoursAgo(47),
      },
      {
        conversationId: "conv_demo_1",
        senderId: "usr_demo_buyer",
        isSystem: false,
        body: "សួស្តី! Lexus RX350 នេះនៅមានទេ? តើខ្ញុំអាចណាត់មើលថ្ងៃសៅរ៍នៅសាខាទួលគោកបានទេ? / Hello! Is this RX350 still available to view this Saturday at Toul Kork?",
        createdAt: hoursAgo(24),
      },
      {
        conversationId: "conv_demo_1",
        senderId: "usr_dealer_sokha",
        isSystem: false,
        body: "សួស្តីបង! ឡាននៅមាន។ សូមអញ្ជើញមកមើលបាននៅសាលបង្ហាញទួលគោក ម៉ោង ៨ព្រឹក ដល់ ៦ល្ងាច។ / Hello! Yes, it's ready for test drive anytime 8am-6pm.",
        createdAt: hoursAgo(20),
      },
    ],
  });

  await prisma.favorite.createMany({
    data: [
      { userId: "usr_demo_buyer", vehicleId: "veh_prado_alphard", createdAt: daysAgo(1) },
      { userId: "usr_demo_buyer", vehicleId: "veh_prado_2018", createdAt: daysAgo(2) },
      { userId: "usr_demo_buyer", vehicleId: "veh_raptor_2023", createdAt: daysAgo(3) },
    ],
  });

  await prisma.auditLog.createMany({
    data: [
      {
        actorId: "usr_dealer_sokha",
        action: "LISTING_PUBLISHED",
        entity: "Vehicle",
        entityId: "veh_prado_alphard",
        metaJson: JSON.stringify({ make: "Toyota", model: "Alphard", year: 2022, priceUsd: 118000 }),
        createdAt: daysAgo(2),
      },
      {
        actorId: null,
        action: "REPORT_GENERATED",
        entity: "VehicleHistoryReport",
        entityId: pradoReportId,
        metaJson: JSON.stringify({ vehicleId: "veh_prado_2018", overallConfidence: 85 }),
        createdAt: daysAgo(1),
      },
    ],
  });
}

async function seedDashboardData() {
  await prisma.savedSearch.createMany({
    data: [
      {
        userId: "usr_demo_buyer",
        name: "Toyota SUVs with Hot Price",
        queryJson: JSON.stringify({ make: "Toyota", bodyType: "SUV", onSale: true, sort: "newest" }),
        alertsEnabled: true,
      },
      {
        userId: "usr_demo_buyer",
        name: "Motorcycles 125cc-160cc with ABS",
        queryJson: JSON.stringify({ listingCategory: "MOTOR", hasAbs: true, sort: "newest" }),
        alertsEnabled: false,
      },
    ],
  });

  await prisma.appointment.createMany({
    data: [
      {
        id: "apt_demo_prado",
        vehicleId: "veh_prado_2018",
        buyerId: "usr_demo_buyer",
        sellerId: "usr_dealer_sokha",
        tenantId: "tenant_sokha",
        scheduledAt: daysFromNowAt(2, 10),
        status: "CONFIRMED",
        notes: "Buyer requesting inspection of Dubai import documents at Toul Kork branch.",
        createdAt: daysAgo(1),
      },
      {
        id: "apt_demo_alphard",
        vehicleId: "veh_prado_alphard",
        buyerId: "usr_demo_buyer",
        sellerId: "usr_dealer_sokha",
        tenantId: "tenant_sokha",
        scheduledAt: daysFromNowAt(4, 15),
        status: "REQUESTED",
        notes: "Viewing appointment at BKK1 luxury showroom.",
        createdAt: hoursAgo(12),
      },
    ],
  });

  await prisma.platformSetting.createMany({
    data: [
      { key: "commissionPct", valueJson: JSON.stringify(2.5) },
      { key: "featuredListingPriceUsd", valueJson: JSON.stringify(25) },
      { key: "autoApproveListings", valueJson: JSON.stringify(false) },
      { key: "maintenanceMode", valueJson: JSON.stringify(false) },
      { key: "demoModeEnabled", valueJson: JSON.stringify(true) },
      { key: "adminOnlyLogin", valueJson: JSON.stringify(false) },
      {
        key: "payments.manualConfig",
        valueJson: JSON.stringify({
          enabled: true,
          accountName: "KhLan Payments (Sokha Chan)",
          khqrPayload: null,
          khqrImageUrl: null,
          instructionsEn: "1. Scan the KHQR\n2. Include payment reference\n3. Proof sent via Telegram @khlan_admin",
          instructionsKm: "១. ស្កេន KHQR\n២. ដាក់លេខយោង\n៣. ផ្ញើភស្តុតាងតាម Telegram @khlan_admin",
          telegram: "@khlan_admin",
          freePlan: { enabled: true, listingsLimit: 5, featuredLimit: 1, seats: 1 },
        }),
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// 8. Main Execution
// ---------------------------------------------------------------------------

async function main() {
  console.log("=================================================");
  console.log("KhLan Marketplace: Generating Full Demo Seed...");
  console.log("=================================================");

  // 1. Clean Wipe in correct foreign key order
  console.log("\n[1/8] Cleaning existing demo records...");
  await prisma.itemPrice.deleteMany();
  await prisma.priceType.deleteMany();
  await prisma.vehicleModel.deleteMany();
  await prisma.vehicleMake.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.message.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.favorite.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.savedSearch.deleteMany();
  await prisma.vehicleHistoryReport.deleteMany();
  await prisma.vehicleDocument.deleteMany();
  await prisma.vehicleImage.deleteMany();
  await prisma.purchaseRequest.deleteMany();
  await prisma.subscriptionPayment.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.vehicle.deleteMany();
  await prisma.tenantBranch.deleteMany();
  await prisma.tenantMember.deleteMany();
  await prisma.tenant.deleteMany();
  await prisma.sellerProfile.deleteMany();
  await prisma.reportedContent.deleteMany();
  await prisma.platformSetting.deleteMany();
  await prisma.user.deleteMany();

  // 2. Seed Users
  console.log("[2/8] Seeding 8 deterministic user personas (password: khlan123)...");
  await seedUsers();

  // 3. Seed Tenants & Showroom Branches
  console.log("[3/8] Seeding dealerships with multi-branch showrooms...");
  await seedTenants();

  // 4. Seed Seller Profiles
  console.log("[4/8] Seeding seller profiles...");
  await seedSellerProfiles();

  // 5. Seed Flexible Pricing Tiers
  console.log("[5/8] Seeding 8 core flexible pricing promotional tiers...");
  await seedPriceTypes();

  // 6. Seed Vehicle Models Catalog (48 makes, 3,896 models)
  console.log("[6/8] Seeding vehicle catalog (Cars, Motors, Spare Parts)...");
  await importCatalogModels({ category: "ALL", dryRun: false, verbose: false });

  // 7. Seed 34 Detailed Vehicles with Promotions
  console.log("[7/8] Seeding 34 showcase listings (18 Cars, 8 Motors, 8 Parts) with pricing tiers...");
  await seedVehicles();

  // 8. Seed Reports, Engagement & Dashboard Data
  console.log("[8/8] Seeding AI reports, appointments, messages & platform settings...");
  const { pradoReport } = await seedReports();
  await seedEngagement(pradoReport.id);
  await seedDashboardData();

  const counts = {
    users: await prisma.user.count(),
    tenants: await prisma.tenant.count(),
    tenantBranches: await prisma.tenantBranch.count(),
    priceTypes: await prisma.priceType.count(),
    vehicleMakes: await prisma.vehicleMake.count(),
    vehicleModels: await prisma.vehicleModel.count(),
    vehicles: await prisma.vehicle.count(),
    itemPrices: await prisma.itemPrice.count(),
    vehicleImages: await prisma.vehicleImage.count(),
    vehicleDocuments: await prisma.vehicleDocument.count(),
    reports: await prisma.vehicleHistoryReport.count(),
    appointments: await prisma.appointment.count(),
    conversations: await prisma.conversation.count(),
  };

  console.log("\n=================================================");
  console.log("🎉 FULL DEMO SEED COMPLETE! Verification counts:");
  console.log(counts);
  console.log("=================================================");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("Seed execution failed:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
