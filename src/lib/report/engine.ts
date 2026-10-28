import type { Prisma } from "@prisma/client";
import type { ReportCheck, ReportStatus } from "@/lib/types";

/** Vehicle row (with documents + images included) accepted by the rules engine. */
export type VehicleForChecks = Prisma.VehicleGetPayload<{
  include: { documents: true; images: true };
}> & {
  seller?: {
    verified?: boolean;
    sellerProfile?: {
      shopName?: string | null;
      verified?: boolean;
      type?: string;
    } | null;
  } | null;
};

/** Minimal comparable-vehicle shape used by the price check. */
export type ComparableVehicle = {
  id: string;
  listingCategory?: string;
  bodyType?: string;
  year: number;
  priceUsd: number;
  partCategory?: string | null;
  partTarget?: string | null;
};

const CURRENT_YEAR = new Date().getFullYear(); // analysis reference year, keep aligned with calendar year

/** Default bilingual limitations (Cars). */
export const REPORT_LIMITATIONS: { en: string; km: string }[] = [
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
];

/** Category-tailored bilingual limitations shipped with every report. */
export function getReportLimitations(category?: string | null): { en: string; km: string }[] {
  if (category === "SPARE_PART") {
    return [
      {
        en: "This report evaluates part OEM numbers, compatibility fitment, and market pricing. It is not a bench test or metallurgical inspection.",
        km: "របាយការណ៍នេះវាយតម្លៃលេខកូដគ្រឿងបន្លាស់ ម៉ូដែលត្រូវគ្នា និងតម្លៃទីផ្សារ។ វាមិនមែនជាការតេស្តមន្ទីរពិសោធន៍ទេ។",
      },
      {
        en: "'Brand new' condition reflects seller declaration; inspect packaging seals, manufacturer labels, and serial barcodes upon delivery.",
        km: "ការប្រកាសជា 'ទំនិញថ្មី' ផ្អែកលើការបញ្ជាក់របស់អ្នកលក់។ សូមពិនិត្យតែមប្រអប់ ស្លាករោងចក្រ និងបាកូដពេលទទួល។",
      },
      {
        en: "Always verify exact part number fitment with your professional mechanic before unboxing or installation.",
        km: "សូមបញ្ជាក់លេខកូដគ្រឿងបន្លាស់ និងភាពត្រូវគ្នាជាមួយជាងជំនាញរបស់អ្នក មុនពេលធ្វើការតម្លើង។",
      },
    ];
  }
  if (category === "MOTOR") {
    return [
      {
        en: "This report analyzes motorcycle listing details, registration card, and engine checks. It is not a roadside mechanical inspection.",
        km: "របាយការណ៍នេះវិភាគលើព័ត៌មានលម្អិតនៃម៉ូតូ កាតគ្រី និងទិន្នន័យម៉ាស៊ីន។ វាមិនមែនជាការតេស្តបើកបរលើផ្លូវទេ។",
      },
      {
        en: "'No records found' does not guarantee absence of hidden frame bending or internal engine wear.",
        km: "'រកមិនឃើញទិន្នន័យ' មិនធានាថាគ្មានបញ្ហាតួវៀច ឬការសឹកខាងក្នុងម៉ាស៊ីននោះទេ។",
      },
      {
        en: "Always verify the motorcycle frame and engine numbers directly against the physical registration card.",
        km: "សូមផ្ទៀងផ្ទាត់លេខតួ និងលេខម៉ាស៊ីនម៉ូតូផ្ទាល់ជាមួយកាតគ្រីច្បាប់ដើមជានិច្ច។",
      },
    ];
  }
  return REPORT_LIMITATIONS;
}

const STATUS_WEIGHT: Record<ReportStatus, number> = {
  VERIFIED: 1,
  EVIDENCE_FOUND: 0.7,
  NOT_VERIFIED: 0.4,
  NO_DATA: 0.2,
  INCONSISTENT: 0,
};

/** Area titles (EN + KM) for Car listings. */
const CAR_AREA_TITLES: Record<string, { title: string; titleKm: string }> = {
  identity: { title: "Vehicle identity", titleKm: "អត្តសញ្ញាណរថយន្ត" },
  registration: { title: "Registration book", titleKm: "សៀវភៅចុះបញ្ជី" },
  import: { title: "Import documents", titleKm: "ឯកសារនាំចូល" },
  mileage: { title: "Mileage plausibility", titleKm: "ភាពសមរម្យនៃចម្ងាយដំណើរ" },
  price: { title: "Price vs. market", titleKm: "តម្លៃធៀបនឹងទីផ្សារ" },
  service: { title: "Service records", titleKm: "បញ្ជីការថែទាំ" },
  photos: { title: "Photos", titleKm: "រូបភាព" },
  ownership: { title: "Ownership history", titleKm: "ប្រវត្តិម្ចាស់" },
  accident: { title: "Accident history", titleKm: "ប្រវត្តិគ្រោះថ្នាក់" },
  listing: { title: "Listing content", titleKm: "ខ្លឹមសារការផ្សព្វផ្សាយ" },
};

/** Area titles (EN + KM) for Motorcycle listings. */
const MOTOR_AREA_TITLES: Record<string, { title: string; titleKm: string }> = {
  identity: { title: "Motorcycle identity", titleKm: "អត្តសញ្ញាណម៉ូតូ" },
  registration: { title: "Motorcycle card (កាតគ្រី)", titleKm: "កាតគ្រីម៉ូតូ" },
  import: { title: "Customs & import tax", titleKm: "ឯកសារពន្ធគយម៉ូតូ" },
  mileage: { title: "Motorcycle mileage", titleKm: "ភាពសមរម្យនៃចម្ងាយដំណើរម៉ូតូ" },
  price: { title: "Price vs. motor market", titleKm: "តម្លៃធៀបនឹងទីផ្សារម៉ូតូ" },
  service: { title: "Maintenance records", titleKm: "បញ្ជីការថែទាំនិងប្តូរប្រេង" },
  photos: { title: "Motorcycle photos", titleKm: "រូបភាពម៉ូតូ" },
  ownership: { title: "Ownership history", titleKm: "ប្រវត្តិម្ចាស់ម៉ូតូ" },
  accident: { title: "Fall & accident declaration", titleKm: "ប្រវត្តិគ្រោះថ្នាក់ឬដួល" },
  listing: { title: "Listing content", titleKm: "ខ្លឹមសារការផ្សព្វផ្សាយ" },
};

/** Area titles (EN + KM) for Spare Part listings. */
const PART_AREA_TITLES: Record<string, { title: string; titleKm: string }> = {
  identity: { title: "Part number & fitment", titleKm: "លេខកូដគ្រឿងបន្លាស់និងភាពត្រូវគ្នា" },
  registration: { title: "Invoice & purchase receipt", titleKm: "វិក្កយបត្រទិញនិងបង្កាន់ដៃ" },
  import: { title: "Origin & distributor seal", titleKm: "ប្រភពដើមនិងតែមចែកចាយ" },
  mileage: { title: "Condition & wear status", titleKm: "ស្ថានភាពនិងកម្រិតប្រើប្រាស់" },
  price: { title: "Price vs. part market", titleKm: "តម្លៃធៀបនឹងទីផ្សារគ្រឿងបន្លាស់" },
  service: { title: "Warranty & test cert", titleKm: "ការធានានិងវិញ្ញាបនបត្រតេស្ត" },
  photos: { title: "Part & label photos", titleKm: "រូបភាពគ្រឿងបន្លាស់និងស្លាកកូដ" },
  ownership: { title: "Supplier credibility", titleKm: "ភាពគួរឱ្យទុកចិត្តនៃអ្នកផ្គត់ផ្គង់" },
  accident: { title: "Defect & refurbished declaration", titleKm: "សេចក្តីប្រកាសបញ្ហានិងការខូចខាត" },
  listing: { title: "Listing & authenticity scan", titleKm: "ខ្លឹមសារការផ្សព្វផ្សាយនិងការស្កេន" },
};

function usd(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
}

function makeCheck(
  category: string,
  area: string,
  status: ReportStatus,
  detail: string,
  detailKm: string,
  source: string,
  confidence: number,
): ReportCheck {
  const titles =
    category === "SPARE_PART"
      ? PART_AREA_TITLES
      : category === "MOTOR"
      ? MOTOR_AREA_TITLES
      : CAR_AREA_TITLES;
  const def = titles[area] ?? CAR_AREA_TITLES[area] ?? { title: area, titleKm: area };
  return { area, title: def.title, titleKm: def.titleKm, status, detail, detailKm, source, confidence };
}

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

function findDoc(
  documents: { type: string; status: string }[],
  types: string | string[],
): { type: string; status: string } | undefined {
  const arr = Array.isArray(types) ? types : [types];
  return documents.find((d) => arr.includes(d.type));
}

const SCAM_PATTERNS = [
  "deposit first",
  "western union",
  "wire transfer",
  "urgent sale",
  "pay before",
  "fake",
  "counterfeit",
  "replica",
  "copy a",
  "បង់ប្រាក់ដុន",
  "ផ្ញើប្រាក់មុន",
  "ទំនិញក្លែងក្លាយ",
];

/**
 * Deterministic multi-category rules engine (Car, Motorcycle, Spare Part).
 * Emits exactly 10 bilingual checks and an overall confidence score (0-100).
 */
export async function runChecks(
  vehicle: VehicleForChecks,
  documents: { type: string; status: string }[],
  images: { url: string }[],
  comparables?: ComparableVehicle[],
): Promise<{ checks: ReportCheck[]; overallConfidence: number }> {
  const category = vehicle.listingCategory || "CAR";

  if (category === "SPARE_PART") {
    return runSparePartChecks(vehicle, documents, images, comparables);
  }
  if (category === "MOTOR") {
    return runMotorcycleChecks(vehicle, documents, images, comparables);
  }
  return runCarChecks(vehicle, documents, images, comparables);
}

// ============================================================================
// 1. CAR RULES ENGINE
// ============================================================================
async function runCarChecks(
  vehicle: VehicleForChecks,
  documents: { type: string; status: string }[],
  images: { url: string }[],
  comparables?: ComparableVehicle[],
): Promise<{ checks: ReportCheck[]; overallConfidence: number }> {
  const checks: ReportCheck[] = [];
  const cat = "CAR";

  // 1. identity
  if (vehicle.vinLast6 && vehicle.plateNo) {
    checks.push(
      makeCheck(
        cat,
        "identity",
        "NOT_VERIFIED",
        `Seller-provided identifiers present (VIN last-6 •••${vehicle.vinLast6}, plate ${vehicle.plateNo}). Identity cannot be fully confirmed without document cross-check.`,
        `មានព័ត៌មានអត្តសញ្ញាណដែលម្ចាស់លក់ផ្ដល់ជូន (VIN ៦តួចុងក្រោយ •••${vehicle.vinLast6}, ស្លាកលេខ ${vehicle.plateNo})។ អត្តសញ្ញាណមិនអាចបញ្ជាក់បានពេញលេញឡើយ បើមិនឆ្លងកាត់ការត្រួតពិនិត្យឯកសារ។`,
        "Listing data",
        0.5,
      ),
    );
  } else if (vehicle.vinLast6 || vehicle.plateNo) {
    checks.push(
      makeCheck(
        cat,
        "identity",
        "NOT_VERIFIED",
        `Partial identifiers provided (${vehicle.vinLast6 ? `VIN last-6 •••${vehicle.vinLast6}` : `plate ${vehicle.plateNo}`}). Request missing identifiers.`,
        `មានព័ត៌មានអត្តសញ្ញាណខ្លះ (${vehicle.vinLast6 ? `VIN ៦តួចុងក្រោយ •••${vehicle.vinLast6}` : `ស្លាកលេខ ${vehicle.plateNo}`})។ សូមសុំព័ត៌មានបន្ថែម។`,
        "Listing data",
        0.35,
      ),
    );
  } else {
    checks.push(
      makeCheck(
        cat,
        "identity",
        "NO_DATA",
        "No VIN/plate provided — request registration book photos.",
        "គ្មានលេខ VIN ឬស្លាកលេខផ្ដល់ជូនទេ — សូមសុំរូបភាពសៀវភៅចុះបញ្ជី។",
        "Listing data",
        0.1,
      ),
    );
  }

  // 2. registration
  const regDoc = findDoc(documents, "REGISTRATION_BOOK");
  if (regDoc?.status === "VERIFIED") {
    checks.push(
      makeCheck(
        cat,
        "registration",
        "VERIFIED",
        "Registration book provided and verified by the platform.",
        "សៀវភៅចុះបញ្ជីត្រូវបានផ្ដល់ជូន និងបានផ្ទៀងផ្ទាត់ដោយវេទិកាហើយ។",
        "Registration book (platform-verified)",
        0.95,
      ),
    );
  } else if (regDoc?.status === "PROVIDED") {
    checks.push(
      makeCheck(
        cat,
        "registration",
        "EVIDENCE_FOUND",
        "Registration book photos provided; platform verification pending.",
        "រូបភាពសៀវភៅចុះបញ្ជីត្រូវបានផ្ដល់ជូន ប៉ុន្តែការផ្ទៀងផ្ទាត់ដោយវេទិកានៅមិនទាន់ធ្វើ។",
        "Registration book (provided)",
        0.6,
      ),
    );
  } else {
    checks.push(
      makeCheck(
        cat,
        "registration",
        "NO_DATA",
        "No registration book provided. Request the document before any viewing.",
        "គ្មានសៀវភៅចុះបញ្ជីផ្ដល់ជូនទេ។ សូមសុំឯកសារនេះមុននឹងទៅមើលឡាន។",
        "Registration book",
        0.05,
      ),
    );
  }

  // 3. import
  const impDoc = findDoc(documents, "IMPORT_DECLARATION");
  if (impDoc?.status === "VERIFIED") {
    checks.push(
      makeCheck(
        cat,
        "import",
        "VERIFIED",
        `Import declaration provided and verified by the platform.${
          vehicle.importOrigin ? ` Origin: ${vehicle.importOrigin}.` : ""
        }`,
        `សេចក្ដីប្រកាសនាំចូលត្រូវបានផ្ដល់ជូន និងបានផ្ទៀងផ្ទាត់ដោយវេទិកាហើយ។${
          vehicle.importOrigin ? ` ប្រភព៖ ${vehicle.importOrigin}។` : ""
        }`,
        "Import declaration (platform-verified)",
        0.95,
      ),
    );
  } else if (impDoc?.status === "PROVIDED") {
    checks.push(
      makeCheck(
        cat,
        "import",
        "EVIDENCE_FOUND",
        `Import declaration provided${vehicle.importOrigin ? ` (origin: ${vehicle.importOrigin})` : ""}.`,
        `សេចក្ដីប្រកាសនាំចូលត្រូវបានផ្ដល់ជូន${vehicle.importOrigin ? ` (ប្រភព៖ ${vehicle.importOrigin})` : ""}។`,
        "Import declaration (provided)",
        0.6,
      ),
    );
  } else {
    checks.push(
      makeCheck(
        cat,
        "import",
        "NO_DATA",
        "No import declaration provided. Common for older units — request it from the seller.",
        "គ្មានសេចក្ដីប្រកាសនាំចូលផ្ដល់ជូនទេ។ ជារឿងធម្មតាសម្រាប់ឡានចាស់ — សូមសុំវាពីម្ចាស់លក់។",
        "Import declaration",
        0.05,
      ),
    );
  }

  // 4. mileage
  const ageYears = Math.max(1, CURRENT_YEAR - vehicle.year);
  const avgAnnual = vehicle.mileageKm / ageYears;
  const avgDisplay = Math.round(avgAnnual).toLocaleString("en-US");
  if (avgAnnual < 4000) {
    checks.push(
      makeCheck(
        cat,
        "mileage",
        "INCONSISTENT",
        `Very low average annual mileage (${avgDisplay} km/year) — possible odometer rollback. Verify with service records.`,
        `ចម្ងាយដំណើរជាមធ្យមប្រចាំឆ្នាំតិចពេក (${avgDisplay} គ.ម/ឆ្នាំ) — អាចមានការបន្លំម៉ាស៊ីនវាស់ចម្ងាយ។ សូមផ្ទៀងផ្ទាត់ជាមួយបញ្ជីសេវាកម្ម។`,
        "Listing data + age analysis",
        0.4,
      ),
    );
  } else if (avgAnnual <= 25000) {
    checks.push(
      makeCheck(
        cat,
        "mileage",
        "EVIDENCE_FOUND",
        `Average annual mileage (${avgDisplay} km/year) is plausible for the vehicle age.`,
        `ចម្ងាយដំណើរជាមធ្យមប្រចាំឆ្នាំ (${avgDisplay} គ.ម/ឆ្នាំ) សមរម្យទៅនឹងអាយុរបស់ឡាន។`,
        "Listing data + age analysis",
        0.7,
      ),
    );
  } else {
    checks.push(
      makeCheck(
        cat,
        "mileage",
        "NOT_VERIFIED",
        `High average annual mileage (${avgDisplay} km/year). Confirm usage with service history.`,
        `ចម្ងាយដំណើរជាមធ្យមប្រចាំឆ្នាំខ្ពស់ (${avgDisplay} គ.ម/ឆ្នាំ)។ សូមបញ្ជាក់ការប្រើប្រាស់ជាមួយប្រវត្តិសេវាថែទាំ។`,
        "Listing data + age analysis",
        0.5,
      ),
    );
  }

  // 5. price vs. market
  if (vehicle.priceUsd <= 0) {
    checks.push(
      makeCheck(
        cat,
        "price",
        "NO_DATA",
        "No asking price available to compare with the market.",
        "គ្មានតម្លៃលក់ដើម្បីប្រៀបធៀបនឹងទីផ្សារទេ។",
        "Market comparables",
        0.1,
      ),
    );
  } else {
    let comps = comparables;
    if (!comps) {
      comps = [];
    }
    const valid = comps.filter(
      (c) => c.id !== vehicle.id && Math.abs(c.year - vehicle.year) <= 2 && c.priceUsd > 0,
    );
    if (valid.length >= 3) {
      const med = median(valid.map((c) => c.priceUsd));
      const ratio = vehicle.priceUsd / med;
      const medDisplay = usd(med);
      const n = valid.length;
      if (ratio < 0.75) {
        checks.push(
          makeCheck(
            cat,
            "price",
            "INCONSISTENT",
            `Asking price is well below comparable listings (median ≈ ${medDisplay}) — verify condition, documents and ownership carefully.`,
            `តម្លៃលក់ទាបខ្លាំងជាងបញ្ជីលក់ឡានស្រដៀងគ្នា (តម្លៃកណ្ដាល ≈ ${medDisplay}) — សូមត្រួតពិនិត្យស្ថានភាពឡាន ឯកសារ និងប្រវត្តិម្ចាស់ឱ្យប្រុងប្រយ័ត្ន។`,
            `Market comparables (${n})`,
            0.6,
          ),
        );
      } else if (ratio <= 1.3) {
        checks.push(
          makeCheck(
            cat,
            "price",
            "EVIDENCE_FOUND",
            `Asking price ${usd(vehicle.priceUsd)} is within the typical range of comparable ${vehicle.bodyType} listings (median ≈ ${medDisplay}).`,
            `តម្លៃលក់ ${usd(vehicle.priceUsd)} ស្ថិតក្នុងចន្លោះតម្លៃធម្មតានៃបញ្ជីលក់ឡានប្រភេទ ${vehicle.bodyType} ស្រដៀងគ្នា (តម្លៃកណ្ដាល ≈ ${medDisplay})។`,
            `Market comparables (${n})`,
            0.8,
          ),
        );
      } else {
        checks.push(
          makeCheck(
            cat,
            "price",
            "NOT_VERIFIED",
            `Asking price is above the comparable range (median ≈ ${medDisplay}) — may reflect condition or low mileage.`,
            `តម្លៃលក់ខ្ពស់ជាងចន្លោះតម្លៃឡានស្រដៀងគ្នា (តម្លៃកណ្ដាល ≈ ${medDisplay}) — អាចដោយសារស្ថានភាពល្អ ឬចម្ងាយដំណើរតិច។`,
            `Market comparables (${n})`,
            0.5,
          ),
        );
      }
    } else {
      checks.push(
        makeCheck(
          cat,
          "price",
          "NO_DATA",
          "Not enough comparable listings to assess price.",
          "បញ្ជីលក់ឡានស្រដៀងគ្នាមិនគ្រប់គ្រាន់ ដើម្បីវាយតម្លៃតម្លៃឡាននេះទេ។",
          "Market comparables",
          0.1,
        ),
      );
    }
  }

  // 6. service
  const svcDoc = findDoc(documents, "SERVICE_RECORD");
  if (svcDoc?.status === "VERIFIED") {
    checks.push(
      makeCheck(
        cat,
        "service",
        "VERIFIED",
        "Service records provided and verified by the platform.",
        "បញ្ជីសេវាថែទាំត្រូវបានផ្ដល់ជូន និងបានផ្ទៀងផ្ទាត់ដោយវេទិកាហើយ។",
        "Service records (platform-verified)",
        0.9,
      ),
    );
  } else if (svcDoc?.status === "PROVIDED") {
    checks.push(
      makeCheck(
        cat,
        "service",
        "EVIDENCE_FOUND",
        "Service records provided — review stamps and dates during inspection.",
        "បញ្ជីសេវាថែទាំត្រូវបានផ្ដល់ជូន — សូមពិនិត្យមុខត្រា និងកាលបរិច្ឆេទពេលមើលឡាន។",
        "Service records (provided)",
        0.65,
      ),
    );
  } else {
    checks.push(
      makeCheck(
        cat,
        "service",
        "NO_DATA",
        "No service records provided. Request maintenance history.",
        "គ្មានបញ្ជីសេវាថែទាំផ្ដល់ជូនទេ។ សូមសុំប្រវត្តិការថែទាំឡាន។",
        "Service records",
        0.05,
      ),
    );
  }

  // 7. photos
  const urls = images.map((i) => i.url);
  const uniqueUrls = Array.from(new Set(urls));
  const hasDuplicates = uniqueUrls.length !== urls.length;
  const nPhotos = uniqueUrls.length;
  if (hasDuplicates) {
    checks.push(
      makeCheck(
        cat,
        "photos",
        "INCONSISTENT",
        "Duplicate images detected in listing.",
        "រកឃើញរូបភាពស្ទួនក្នុងបញ្ជីលក់។",
        "Listing photos",
        0.5,
      ),
    );
  } else if (nPhotos >= 3) {
    checks.push(
      makeCheck(
        cat,
        "photos",
        "EVIDENCE_FOUND",
        `${nPhotos} photos available. Photo review is an observation, not a physical inspection.`,
        `មានរូបភាព ${nPhotos} រូប។ ការពិនិត្យរូបភាពគ្រាន់តែជាការសង្កេត មិនមែនជាការពិនិត្យឡានដោយផ្ទាល់ទេ។`,
        "Listing photos",
        0.6,
      ),
    );
  } else if (nPhotos >= 1) {
    checks.push(
      makeCheck(
        cat,
        "photos",
        "NOT_VERIFIED",
        `Only ${nPhotos} photo(s). Request interior, odometer and engine-bay photos.`,
        `មានរូបភាពតែ ${nPhotos} រូបប៉ុណ្ណោះ។ សូមសុំរូបភាពខាងក្នុង ម៉ាស៊ីនវាស់ចម្ងាយ និងស្ពានម៉ាស៊ីន។`,
        "Listing photos",
        0.3,
      ),
    );
  } else {
    checks.push(
      makeCheck(
        cat,
        "photos",
        "NO_DATA",
        "No photos provided.",
        "គ្មានរូបភាពផ្ដល់ជូនទេ។",
        "Listing photos",
        0.05,
      ),
    );
  }

  // 8. ownership
  if (vehicle.ownershipCount != null) {
    checks.push(
      makeCheck(
        cat,
        "ownership",
        "EVIDENCE_FOUND",
        `Seller declares ${vehicle.ownershipCount} previous owner(s). Not independently verified.`,
        `ម្ចាស់លក់ប្រកាសថាមានម្ចាស់ចាស់មុន ${vehicle.ownershipCount} រូប។ មិនបានផ្ទៀងផ្ទាត់ដោយឯករាជ្យទេ។`,
        "Listing data",
        0.5,
      ),
    );
  } else {
    checks.push(
      makeCheck(
        cat,
        "ownership",
        "NO_DATA",
        "Ownership history unknown.",
        "ប្រវត្តិម្ចាស់មិនដឹងច្បាស់។",
        "Listing data",
        0.05,
      ),
    );
  }

  // 9. accident
  switch (vehicle.accidentDeclared) {
    case "NONE_DECLARED":
      checks.push(
        makeCheck(
          cat,
          "accident",
          "NOT_VERIFIED",
          "Seller declares no accident history. THIS IS NOT INDEPENDENT VERIFICATION — inspect the vehicle and request documents.",
          "ម្ចាស់លក់ប្រកាសថាគ្មានប្រវត្តិគ្រោះថ្នាក់ទេ។ អ្វីនេះមិនមែនជាការផ្ទៀងផ្ទាត់ដោយឯករាជ្យទេ — សូមពិនិត្យឡានដោយផ្ទាល់ និងសុំឯកសារ។",
          "Seller declaration",
          0.4,
        ),
      );
      break;
    case "MINOR_DECLARED":
      checks.push(
        makeCheck(
          cat,
          "accident",
          "EVIDENCE_FOUND",
          "Seller declares minor damage. Ask for repair documentation and inspect the repair quality.",
          "ម្ចាស់លក់ប្រកាសពីគ្រោះថ្នាក់តូចតាច។ សូមសុំឯកសារការជួសជុល និងពិនិត្យគុណភាពការជួសជុល។",
          "Seller declaration",
          0.5,
        ),
      );
      break;
    case "MAJOR_DECLARED":
      checks.push(
        makeCheck(
          cat,
          "accident",
          "EVIDENCE_FOUND",
          "Seller declares major damage. Strongly recommend a professional inspection before any offer.",
          "ម្ចាស់លក់ប្រកាសពីគ្រោះថ្នាក់ធំ។ សូមណែនាំឱ្យមានការពិនិត្យដោយអ្នកជំនាញមុននឹងសម្រេចចិត្តទិញ។",
          "Seller declaration",
          0.5,
        ),
      );
      break;
    default:
      checks.push(
        makeCheck(
          cat,
          "accident",
          "NO_DATA",
          "No accident information declared. Treat as unknown.",
          "គ្មានព័ត៌មានគ្រោះថ្នាក់ប្រកាសទេ។ សូមចាត់ទុកថាមិនទាន់ដឹង។",
          "Seller declaration",
          0.05,
        ),
      );
  }

  // 10. listing text
  const text = `${vehicle.description ?? ""}\n${vehicle.descriptionKm ?? ""}`.toLowerCase();
  const matched = SCAM_PATTERNS.filter((p) => text.includes(p.toLowerCase()));
  if (matched.length > 0) {
    checks.push(
      makeCheck(
        cat,
        "listing",
        "INCONSISTENT",
        `Listing text contains phrases often used in scams: "${matched.join(", ")}". Be cautious and never pay in advance.`,
        `អត្ថបទបញ្ជាលក់មានឃ្លាដែលជាធម្មតាត្រូវបានប្រើក្នុងការបញ្ឆោត៖ "${matched.join(", ")}"។ សូមប្រុងប្រយ័ត្ន ហើយកុំបង់ប្រាក់មុនពេលណាត់ជួប។`,
        "Listing text analysis",
        0.5,
      ),
    );
  } else {
    checks.push(
      makeCheck(
        cat,
        "listing",
        "EVIDENCE_FOUND",
        "Listing text scan found no common scam patterns.",
        "ការវិភាគអត្ថបទបញ្ជាលក់មិនរកឃើញគំរូបញ្ឆោតធម្មតាទេ។",
        "Listing text analysis",
        0.7,
      ),
    );
  }

  const meanWeight =
    checks.reduce((sum, c) => sum + (STATUS_WEIGHT[c.status] ?? 0), 0) / (checks.length || 1);
  const overallConfidence = Math.round(100 * meanWeight);

  return { checks, overallConfidence };
}

// ============================================================================
// 2. MOTORCYCLE RULES ENGINE
// ============================================================================
async function runMotorcycleChecks(
  vehicle: VehicleForChecks,
  documents: { type: string; status: string }[],
  images: { url: string }[],
  comparables?: ComparableVehicle[],
): Promise<{ checks: ReportCheck[]; overallConfidence: number }> {
  const checks: ReportCheck[] = [];
  const cat = "MOTOR";

  // 1. identity
  if (vehicle.plateNo && (vehicle.vinLast6 || vehicle.engineCc)) {
    checks.push(
      makeCheck(
        cat,
        "identity",
        "NOT_VERIFIED",
        `Motorcycle identifiers present (Plate ${vehicle.plateNo}${
          vehicle.engineCc ? `, ${vehicle.engineCc}cc` : ""
        }${vehicle.vinLast6 ? `, Frame •••${vehicle.vinLast6}` : ""}). Cross-verify with motorcycle card (កាតគ្រី).`,
        `មានព័ត៌មានអត្តសញ្ញាណម៉ូតូ (ស្លាកលេខ ${vehicle.plateNo}${
          vehicle.engineCc ? `, កម្លាំង ${vehicle.engineCc}cc` : ""
        }${vehicle.vinLast6 ? `, លេខតួ •••${vehicle.vinLast6}` : ""})។ សូមផ្ទៀងផ្ទាត់ជាមួយកាតគ្រីម៉ូតូ។`,
        "Listing data",
        0.55,
      ),
    );
  } else if (vehicle.plateNo || vehicle.vinLast6) {
    checks.push(
      makeCheck(
        cat,
        "identity",
        "NOT_VERIFIED",
        `Partial motorcycle identifiers provided (${vehicle.plateNo ? `plate ${vehicle.plateNo}` : `frame •••${vehicle.vinLast6}`}). Request complete registration card.`,
        `មានព័ត៌មានអត្តសញ្ញាណខ្លះ (${vehicle.plateNo ? `ស្លាកលេខ ${vehicle.plateNo}` : `លេខតួ •••${vehicle.vinLast6}`})។ សូមសុំរូបថតកាតគ្រីម៉ូតូ។`,
        "Listing data",
        0.35,
      ),
    );
  } else {
    checks.push(
      makeCheck(
        cat,
        "identity",
        "NO_DATA",
        "No plate or frame number provided — request motorcycle card (កាតគ្រី) photos.",
        "គ្មានស្លាកលេខ ឬលេខតួម៉ូតូផ្ដល់ជូនទេ — សូមសុំរូបថតកាតគ្រីម៉ូតូ។",
        "Listing data",
        0.1,
      ),
    );
  }

  // 2. registration
  const regDoc = findDoc(documents, ["REGISTRATION_BOOK", "INSPECTION_CERT"]);
  if (regDoc?.status === "VERIFIED") {
    checks.push(
      makeCheck(
        cat,
        "registration",
        "VERIFIED",
        "Motorcycle registration card (កាតគ្រីម៉ូតូ) provided and verified by the platform.",
        "កាតគ្រីម៉ូតូត្រូវបានផ្ដល់ជូន និងបានផ្ទៀងផ្ទាត់ដោយវេទិកាហើយ។",
        "Motorcycle card (platform-verified)",
        0.95,
      ),
    );
  } else if (regDoc?.status === "PROVIDED") {
    checks.push(
      makeCheck(
        cat,
        "registration",
        "EVIDENCE_FOUND",
        "Motorcycle registration card photos provided; platform verification pending.",
        "រូបភាពកាតគ្រីម៉ូតូត្រូវបានផ្ដល់ជូន ប៉ុន្តែការផ្ទៀងផ្ទាត់កំពុងដំណើរការ។",
        "Motorcycle card (provided)",
        0.6,
      ),
    );
  } else {
    checks.push(
      makeCheck(
        cat,
        "registration",
        "NO_DATA",
        "No motorcycle registration card provided. Request before viewing to confirm legal ownership.",
        "គ្មានកាតគ្រីម៉ូតូផ្ដល់ជូនទេ។ សូមសុំកាតគ្រីមុននឹងទៅមើលដើម្បីបញ្ជាក់កម្មសិទ្ធិស្របច្បាប់។",
        "Motorcycle card",
        0.05,
      ),
    );
  }

  // 3. import / customs
  const impDoc = findDoc(documents, "IMPORT_DECLARATION");
  if (impDoc?.status === "VERIFIED") {
    checks.push(
      makeCheck(
        cat,
        "import",
        "VERIFIED",
        `Motorcycle import customs / tax documentation verified.${
          vehicle.importOrigin ? ` Origin: ${vehicle.importOrigin}.` : ""
        }`,
        `ឯកសារពន្ធគយម៉ូតូត្រូវបានផ្ដល់ជូន និងបានផ្ទៀងផ្ទាត់ហើយ។${
          vehicle.importOrigin ? ` ប្រភព៖ ${vehicle.importOrigin}។` : ""
        }`,
        "Customs declaration (platform-verified)",
        0.95,
      ),
    );
  } else if (impDoc?.status === "PROVIDED") {
    checks.push(
      makeCheck(
        cat,
        "import",
        "EVIDENCE_FOUND",
        `Import tax documentation provided${vehicle.importOrigin ? ` (origin: ${vehicle.importOrigin})` : ""}.`,
        `ឯកសារពន្ធគយនាំចូលត្រូវបានផ្ដល់ជូន${vehicle.importOrigin ? ` (ប្រភព៖ ${vehicle.importOrigin})` : ""}។`,
        "Customs declaration (provided)",
        0.6,
      ),
    );
  } else {
    checks.push(
      makeCheck(
        cat,
        "import",
        "NO_DATA",
        "No import customs document provided. Common for locally registered bikes.",
        "គ្មានឯកសារពន្ធគយផ្ដល់ជូនទេ។ ជារឿងធម្មតាសម្រាប់ម៉ូតូចុះបញ្ជីក្នុងស្រុករួច។",
        "Customs declaration",
        0.05,
      ),
    );
  }

  // 4. mileage
  const ageYears = Math.max(1, CURRENT_YEAR - vehicle.year);
  const avgAnnual = vehicle.mileageKm / ageYears;
  const avgDisplay = Math.round(avgAnnual).toLocaleString("en-US");
  if (avgAnnual < 2000) {
    checks.push(
      makeCheck(
        cat,
        "mileage",
        "INCONSISTENT",
        `Very low annual motorcycle mileage (${avgDisplay} km/year) — check tire tread, brake wear and odometer integrity.`,
        `ចម្ងាយដំណើរប្រចាំឆ្នាំតិចខុសប្រក្រតី (${avgDisplay} គ.ម/ឆ្នាំ) — សូមពិនិត្យក្រឡាកង់ កម្រាស់ហ្វ្រាំង និងកុងទ័រ។`,
        "Listing data + age analysis",
        0.4,
      ),
    );
  } else if (avgAnnual <= 15000) {
    checks.push(
      makeCheck(
        cat,
        "mileage",
        "EVIDENCE_FOUND",
        `Average annual mileage (${avgDisplay} km/year) is typical for motorcycle commuting in Cambodia.`,
        `ចម្ងាយដំណើរជាមធ្យមប្រចាំឆ្នាំ (${avgDisplay} គ.ម/ឆ្នាំ) សមរម្យសម្រាប់ការបើកបរម៉ូតូប្រចាំថ្ងៃនៅកម្ពុជា។`,
        "Listing data + age analysis",
        0.7,
      ),
    );
  } else {
    checks.push(
      makeCheck(
        cat,
        "mileage",
        "NOT_VERIFIED",
        `High annual motorcycle mileage (${avgDisplay} km/year) — indicates heavy delivery or touring use. Check engine condition.`,
        `ចម្ងាយដំណើរប្រចាំឆ្នាំខ្ពស់ (${avgDisplay} គ.ម/ឆ្នាំ) — អាចជាម៉ូតូដឹកជញ្ជូន ឬធ្វើដំណើរឆ្ងាយ។ សូមពិនិត្យម៉ាស៊ីនឱ្យហ្មត់ចត់។`,
        "Listing data + age analysis",
        0.5,
      ),
    );
  }

  // 5. price vs. market
  if (vehicle.priceUsd <= 0) {
    checks.push(
      makeCheck(
        cat,
        "price",
        "NO_DATA",
        "No asking price available to compare with the motorcycle market.",
        "គ្មានតម្លៃលក់ដើម្បីប្រៀបធៀបនឹងទីផ្សារម៉ូតូទេ។",
        "Market comparables",
        0.1,
      ),
    );
  } else {
    let comps = comparables;
    if (!comps) {
      comps = [];
    }
    const valid = comps.filter(
      (c) => c.id !== vehicle.id && Math.abs(c.year - vehicle.year) <= 3 && c.priceUsd > 0,
    );
    if (valid.length >= 3) {
      const med = median(valid.map((c) => c.priceUsd));
      const ratio = vehicle.priceUsd / med;
      const medDisplay = usd(med);
      const n = valid.length;
      if (ratio < 0.75) {
        checks.push(
          makeCheck(
            cat,
            "price",
            "INCONSISTENT",
            `Asking price is well below comparable motorcycle listings (median ≈ ${medDisplay}) — verify condition, documents and ownership carefully.`,
            `តម្លៃលក់ទាបខ្លាំងជាងបញ្ជីលក់ម៉ូតូស្រដៀងគ្នា (តម្លៃកណ្ដាល ≈ ${medDisplay}) — សូមត្រួតពិនិត្យស្ថានភាព ឯកសារ និងប្រវត្តិម្ចាស់ឱ្យប្រុងប្រយ័ត្ន។`,
            `Market comparables (${n})`,
            0.6,
          ),
        );
      } else if (ratio <= 1.3) {
        checks.push(
          makeCheck(
            cat,
            "price",
            "EVIDENCE_FOUND",
            `Asking price ${usd(vehicle.priceUsd)} is within the typical range of comparable motorcycle listings (median ≈ ${medDisplay}).`,
            `តម្លៃលក់ ${usd(vehicle.priceUsd)} ស្ថិតក្នុងចន្លោះតម្លៃធម្មតានៃបញ្ជីលក់ម៉ូតូស្រដៀងគ្នា (តម្លៃកណ្ដាល ≈ ${medDisplay})។`,
            `Market comparables (${n})`,
            0.8,
          ),
        );
      } else {
        checks.push(
          makeCheck(
            cat,
            "price",
            "NOT_VERIFIED",
            `Asking price is above the comparable motorcycle range (median ≈ ${medDisplay}) — may reflect pristine condition or accessories.`,
            `តម្លៃលក់ខ្ពស់ជាងចន្លោះតម្លៃម៉ូតូស្រដៀងគ្នា (តម្លៃកណ្ដាល ≈ ${medDisplay}) — អាចដោយសារស្ថានភាពល្អ ឬមានគ្រឿងតុបតែងបន្ថែម។`,
            `Market comparables (${n})`,
            0.5,
          ),
        );
      }
    } else {
      checks.push(
        makeCheck(
          cat,
          "price",
          "NO_DATA",
          "Not enough comparable motorcycle listings to assess price.",
          "បញ្ជីលក់ម៉ូតូស្រដៀងគ្នាមិនគ្រប់គ្រាន់ ដើម្បីវាយតម្លៃតម្លៃនេះទេ។",
          "Market comparables",
          0.1,
        ),
      );
    }
  }

  // 6. service
  const svcDoc = findDoc(documents, "SERVICE_RECORD");
  if (svcDoc?.status === "VERIFIED") {
    checks.push(
      makeCheck(
        cat,
        "service",
        "VERIFIED",
        "Periodic service and oil change records verified by the platform.",
        "កំណត់ត្រាថែទាំនិងប្តូរប្រេងទៀងទាត់ត្រូវបានផ្ទៀងផ្ទាត់ដោយវេទិកាហើយ។",
        "Service records (platform-verified)",
        0.9,
      ),
    );
  } else if (svcDoc?.status === "PROVIDED") {
    checks.push(
      makeCheck(
        cat,
        "service",
        "EVIDENCE_FOUND",
        "Maintenance records provided — review oil change intervals and mechanical stamps.",
        "បញ្ជីការថែទាំត្រូវបានផ្ដល់ជូន — សូមពិនិត្យចន្លោះពេលប្តូរប្រេង និងត្រាជាង។",
        "Service records (provided)",
        0.65,
      ),
    );
  } else {
    checks.push(
      makeCheck(
        cat,
        "service",
        "NO_DATA",
        "No maintenance records provided. Inquire about recent oil, belt/chain and tire changes.",
        "គ្មានបញ្ជីថែទាំផ្ដល់ជូនទេ។ សូមសួរពីការប្តូរប្រេង ខ្សែពាន/ច្រវាក់ និងសម្បកកង់ថ្មីៗ។",
        "Service records",
        0.05,
      ),
    );
  }

  // 7. photos
  const urls = images.map((i) => i.url);
  const uniqueUrls = Array.from(new Set(urls));
  const hasDuplicates = uniqueUrls.length !== urls.length;
  const nPhotos = uniqueUrls.length;
  if (hasDuplicates) {
    checks.push(
      makeCheck(
        cat,
        "photos",
        "INCONSISTENT",
        "Duplicate images detected in motorcycle listing.",
        "រកឃើញរូបភាពស្ទួនក្នុងបញ្ជីលក់ម៉ូតូ។",
        "Listing photos",
        0.5,
      ),
    );
  } else if (nPhotos >= 3) {
    checks.push(
      makeCheck(
        cat,
        "photos",
        "EVIDENCE_FOUND",
        `${nPhotos} photos available. Review engine case, exhaust, fork seals, and odometer display.`,
        `មានរូបភាព ${nPhotos} រូប។ សូមពិនិត្យតួម៉ាស៊ីន បំពង់ស៊ីមាំង ជើងទ្រ និងកុងទ័រ។`,
        "Listing photos",
        0.65,
      ),
    );
  } else if (nPhotos >= 1) {
    checks.push(
      makeCheck(
        cat,
        "photos",
        "NOT_VERIFIED",
        `Only ${nPhotos} photo(s). Request clear photos of engine block, odometer, and both sides.`,
        `មានរូបភាពតែ ${nPhotos} រូបប៉ុណ្ណោះ។ សូមសុំរូបថតច្បាស់នៃម៉ាស៊ីន កុងទ័រ និងសងខាងម៉ូតូ។`,
        "Listing photos",
        0.35,
      ),
    );
  } else {
    checks.push(
      makeCheck(
        cat,
        "photos",
        "NO_DATA",
        "No photos provided.",
        "គ្មានរូបភាពផ្ដល់ជូនទេ។",
        "Listing photos",
        0.05,
      ),
    );
  }

  // 8. ownership
  if (vehicle.ownershipCount != null) {
    checks.push(
      makeCheck(
        cat,
        "ownership",
        "EVIDENCE_FOUND",
        `Seller declares ${vehicle.ownershipCount} previous owner(s). Cross-check with motorcycle card.`,
        `ម្ចាស់លក់ប្រកាសថាមានម្ចាស់ចាស់មុន ${vehicle.ownershipCount} នាក់។ សូមផ្ទៀងផ្ទាត់ជាមួយកាតគ្រី។`,
        "Listing data",
        0.5,
      ),
    );
  } else {
    checks.push(
      makeCheck(
        cat,
        "ownership",
        "NO_DATA",
        "Ownership history unknown.",
        "ប្រវត្តិម្ចាស់មិនដឹងច្បាស់។",
        "Listing data",
        0.05,
      ),
    );
  }

  // 9. accident / fall damage
  switch (vehicle.accidentDeclared) {
    case "NONE_DECLARED":
      checks.push(
        makeCheck(
          cat,
          "accident",
          "NOT_VERIFIED",
          "Seller declares no fall or collision history. THIS IS NOT INDEPENDENT VERIFICATION — check handlebar alignment and fairing scratches in person.",
          "ម្ចាស់លក់ប្រកាសថាគ្មានប្រវត្តិដួល ឬបុកទេ។ អ្វីនេះមិនមែនជាការផ្ទៀងផ្ទាត់ដោយឯករាជ្យទេ — សូមពិនិត្យដៃចង្កូត និងស្នាមឆ្កូតដោយផ្ទាល់។",
          "Seller declaration",
          0.4,
        ),
      );
      break;
    case "MINOR_DECLARED":
      checks.push(
        makeCheck(
          cat,
          "accident",
          "EVIDENCE_FOUND",
          "Seller declares minor tip-over / cosmetic scrapes. Inspect handlebar straightness and lever ends.",
          "ម្ចាស់លក់ប្រកាសពីការដួលថ្នមៗ ឬស្នាមឆ្កូតតិចតួច។ សូមពិនិត្យចង្កូត និងចុងហ្វ្រាំង។",
          "Seller declaration",
          0.5,
        ),
      );
      break;
    case "MAJOR_DECLARED":
      checks.push(
        makeCheck(
          cat,
          "accident",
          "EVIDENCE_FOUND",
          "Seller declares significant crash/frame impact. Strongly recommend a certified motorcycle workshop inspection.",
          "ម្ចាស់លក់ប្រកាសពីការបុកធ្ងន់ធ្ងរ។ សូមណែនាំឱ្យជាងជំនាញពិនិត្យតួ និងជើងទ្រមុននឹងទិញ។",
          "Seller declaration",
          0.5,
        ),
      );
      break;
    default:
      checks.push(
        makeCheck(
          cat,
          "accident",
          "NO_DATA",
          "No accident or fall history declared. Treat as unknown.",
          "គ្មានព័ត៌មានគ្រោះថ្នាក់ ឬដួលប្រកាសទេ។ សូមចាត់ទុកថាមិនទាន់ដឹង។",
          "Seller declaration",
          0.05,
        ),
      );
  }

  // 10. listing text
  const text = `${vehicle.description ?? ""}\n${vehicle.descriptionKm ?? ""}`.toLowerCase();
  const matched = SCAM_PATTERNS.filter((p) => text.includes(p.toLowerCase()));
  if (matched.length > 0) {
    checks.push(
      makeCheck(
        cat,
        "listing",
        "INCONSISTENT",
        `Listing text contains phrases often used in scams: "${matched.join(", ")}". Be cautious and never send money before meeting.`,
        `អត្ថបទបញ្ជាលក់មានឃ្លាដែលជាធម្មតាត្រូវបានប្រើក្នុងការបញ្ឆោត៖ "${matched.join(", ")}"។ សូមប្រុងប្រយ័ត្ន ហើយកុំផ្ញើប្រាក់មុនពេលជួប។`,
        "Listing text analysis",
        0.5,
      ),
    );
  } else {
    checks.push(
      makeCheck(
        cat,
        "listing",
        "EVIDENCE_FOUND",
        "Listing text scan found no common motorcycle scam patterns.",
        "ការវិភាគអត្ថបទបញ្ជាលក់មិនរកឃើញគំរូបញ្ឆោតធម្មតាទេ។",
        "Listing text analysis",
        0.7,
      ),
    );
  }

  const meanWeight =
    checks.reduce((sum, c) => sum + (STATUS_WEIGHT[c.status] ?? 0), 0) / (checks.length || 1);
  const overallConfidence = Math.round(100 * meanWeight);

  return { checks, overallConfidence };
}

// ============================================================================
// 3. SPARE PART RULES ENGINE
// ============================================================================
async function runSparePartChecks(
  vehicle: VehicleForChecks,
  documents: { type: string; status: string }[],
  images: { url: string }[],
  comparables?: ComparableVehicle[],
): Promise<{ checks: ReportCheck[]; overallConfidence: number }> {
  const checks: ReportCheck[] = [];
  const cat = "SPARE_PART";

  // 1. identity: Part Number & Compatibility Fitment
  if (vehicle.partNumber && vehicle.compatibleModels) {
    checks.push(
      makeCheck(
        cat,
        "identity",
        "EVIDENCE_FOUND",
        `Part identity established with manufacturer/OEM part number (${vehicle.partNumber}) and compatibility list (${vehicle.compatibleModels}).`,
        `អត្តសញ្ញាណគ្រឿងបន្លាស់ត្រូវបានបញ្ជាក់ជាមួយលេខកូដ OEM (${vehicle.partNumber}) និងបញ្ជីម៉ូដែលត្រូវគ្នា (${vehicle.compatibleModels})។`,
        "OEM part data",
        0.85,
      ),
    );
  } else if (vehicle.partNumber) {
    checks.push(
      makeCheck(
        cat,
        "identity",
        "NOT_VERIFIED",
        `OEM part number provided (${vehicle.partNumber}); compatible vehicle fitment not explicitly declared.`,
        `មានលេខកូដ OEM (${vehicle.partNumber}) ប៉ុន្តែមិនបានបញ្ជាក់ម៉ូដែលឡាន/ម៉ូតូត្រូវគ្នាឱ្យច្បាស់លាស់។`,
        "OEM part data",
        0.6,
      ),
    );
  } else if (vehicle.compatibleModels) {
    checks.push(
      makeCheck(
        cat,
        "identity",
        "NOT_VERIFIED",
        `Compatible models declared (${vehicle.compatibleModels}); missing manufacturer/OEM part number.`,
        `មានបញ្ជាក់ម៉ូដែលត្រូវគ្នា (${vehicle.compatibleModels}) ប៉ុន្តែខ្វះលេខកូដផលិតផល OEM។`,
        "Listing data",
        0.5,
      ),
    );
  } else {
    checks.push(
      makeCheck(
        cat,
        "identity",
        "NO_DATA",
        "No part number or compatibility fitment declared. Request packaging or manufacturer part label photos.",
        "គ្មានលេខកូដគ្រឿងបន្លាស់ ឬបញ្ជីម៉ូដែលត្រូវគ្នាទេ។ សូមសុំរូបថតស្លាកលេខកូដលើប្រអប់ផលិតផល។",
        "Listing data",
        0.1,
      ),
    );
  }

  // 2. registration: Purchase Invoice & Official Distributor Receipt
  const invDoc = findDoc(documents, ["PURCHASE_INVOICE", "REGISTRATION_BOOK", "INSPECTION_CERT"]);
  if (invDoc?.status === "VERIFIED") {
    checks.push(
      makeCheck(
        cat,
        "registration",
        "VERIFIED",
        "Authorized distributor receipt / tax invoice provided and verified by the platform.",
        "វិក្កយបត្រទិញពីតំណាងចែកចាយ ឬវិក្កយបត្រផ្លូវការត្រូវបានផ្ដល់ជូន និងបានផ្ទៀងផ្ទាត់ដោយវេទិកាហើយ។",
        "Purchase invoice (platform-verified)",
        0.95,
      ),
    );
  } else if (invDoc?.status === "PROVIDED") {
    checks.push(
      makeCheck(
        cat,
        "registration",
        "EVIDENCE_FOUND",
        "Purchase receipt / distributor invoice provided; platform verification pending.",
        "វិក្កយបត្រទិញ ឬបង្កាន់ដៃចែកចាយត្រូវបានផ្ដល់ជូន ប៉ុន្តែការផ្ទៀងផ្ទាត់កំពុងដំណើរការ។",
        "Purchase invoice (provided)",
        0.65,
      ),
    );
  } else {
    checks.push(
      makeCheck(
        cat,
        "registration",
        "NO_DATA",
        "No purchase invoice or distributor receipt provided. Request proof of purchase to ensure authenticity.",
        "គ្មានវិក្កយបត្រទិញ ឬបង្កាន់ដៃចែកចាយផ្ដល់ជូនទេ។ សូមសុំភស្ដុតាងទិញដើម្បីធានាថាជាទំនិញសុទ្ធ។",
        "Proof of purchase",
        0.1,
      ),
    );
  }

  // 3. import / origin: Distributor Channel & Import Declaration
  const impDoc = findDoc(documents, "IMPORT_DECLARATION");
  if (impDoc?.status === "VERIFIED") {
    checks.push(
      makeCheck(
        cat,
        "import",
        "VERIFIED",
        `Official customs clearance / distributor import declaration verified.${
          vehicle.importOrigin ? ` Origin: ${vehicle.importOrigin}.` : ""
        }`,
        `ឯកសារពន្ធគយ ឬសេចក្ដីប្រកាសនាំចូលរបស់តំណាងចែកចាយត្រូវបានផ្ទៀងផ្ទាត់ហើយ។${
          vehicle.importOrigin ? ` ប្រភព៖ ${vehicle.importOrigin}។` : ""
        }`,
        "Customs / distributor seal",
        0.95,
      ),
    );
  } else if (impDoc?.status === "PROVIDED" || vehicle.importOrigin) {
    checks.push(
      makeCheck(
        cat,
        "import",
        "EVIDENCE_FOUND",
        `Declared product origin: ${vehicle.importOrigin || "Imported"}. Distributor documentation provided.`,
        `ប្រភពផលិតផលដែលប្រកាស៖ ${vehicle.importOrigin || "នាំចូល"}។ មានឯកសារនាំចូលពីអ្នកចែកចាយ។`,
        "Distributor declaration",
        0.65,
      ),
    );
  } else {
    checks.push(
      makeCheck(
        cat,
        "import",
        "NO_DATA",
        "No origin or distributor import declaration provided.",
        "គ្មានសេចក្ដីប្រកាសប្រភពដើម ឬឯកសារនាំចូលផ្ដល់ជូនទេ។",
        "Distributor declaration",
        0.1,
      ),
    );
  }

  // 4. mileage: Condition & Wear Assessment
  if (vehicle.partCondition === "BRAND_NEW") {
    checks.push(
      makeCheck(
        cat,
        "mileage",
        "EVIDENCE_FOUND",
        "Declared as BRAND NEW in original packaging with zero prior wear. Inspect manufacturer factory seal upon receipt.",
        "ប្រកាសជាទំនិញថ្មីសុទ្ធ ១០០% ក្នុងប្រអប់ដើម គ្មានស្លាកស្នាមប្រើប្រាស់។ សូមពិនិត្យតែមបិទប្រអប់ពេលទទួលទំនិញ។",
        "Part condition analysis",
        0.85,
      ),
    );
  } else if (vehicle.partCondition === "USED_GENUINE") {
    checks.push(
      makeCheck(
        cat,
        "mileage",
        "EVIDENCE_FOUND",
        "Declared as USED GENUINE (OEM salvaged/take-off). Inspect for structural wear, crack lines, and remaining lifespan.",
        "ប្រកាសជាគ្រឿងបន្លាស់ហ្ស៊ីនមួយទឹក (Used Genuine)។ សូមពិនិត្យភាពសឹករិចរិល ស្នាមប្រេះ និងកម្រាស់ប្រើប្រាស់ដែលនៅសល់។",
        "Part condition analysis",
        0.65,
      ),
    );
  } else if (vehicle.partCondition === "AFTERMARKET") {
    checks.push(
      makeCheck(
        cat,
        "mileage",
        "NOT_VERIFIED",
        "Declared as AFTERMARKET replacement part. Check brand certifications and fitment tolerances before purchasing.",
        "ប្រកាសជាគ្រឿងបន្លាស់កែច្នៃ/ជំនួស (Aftermarket)។ សូមបញ្ជាក់វិញ្ញាបនបត្រគុណភាព និងកម្រិតស្តង់ដារមុននឹងទិញ។",
        "Part condition analysis",
        0.55,
      ),
    );
  } else if (vehicle.condition === "LIKE_NEW") {
    checks.push(
      makeCheck(
        cat,
        "mileage",
        "EVIDENCE_FOUND",
        "Declared like-new condition with minimal shelf or testing wear.",
        "ប្រកាសថាមានស្ថានភាពដូចថ្មី គ្មានស្លាកស្នាមសឹកកម្រិតធ្ងន់ធ្ងរ។",
        "Part condition analysis",
        0.7,
      ),
    );
  } else {
    checks.push(
      makeCheck(
        cat,
        "mileage",
        "NOT_VERIFIED",
        "Used part condition declared. Always inspect physical wear, rust and contact pins before installation.",
        "ប្រកាសជាគ្រឿងបន្លាស់មួយទឹក។ សូមពិនិត្យភាពសឹក ច្រែះ និងជើងតំណមុនពេលតម្លើង។",
        "Part condition analysis",
        0.4,
      ),
    );
  }

  // 5. price vs. spare part market
  if (vehicle.priceUsd <= 0) {
    checks.push(
      makeCheck(
        cat,
        "price",
        "NO_DATA",
        "No asking price available to compare with the spare parts market.",
        "គ្មានតម្លៃលក់ដើម្បីប្រៀបធៀបនឹងទីផ្សារគ្រឿងបន្លាស់ទេ។",
        "Market comparables",
        0.1,
      ),
    );
  } else {
    let comps = comparables;
    if (!comps) {
      comps = [];
    }
    const valid = comps.filter(
      (c) =>
        c.id !== vehicle.id &&
        c.priceUsd > 0 &&
        (!vehicle.partCategory || c.partCategory === vehicle.partCategory),
    );
    if (valid.length >= 3) {
      const med = median(valid.map((c) => c.priceUsd));
      const ratio = vehicle.priceUsd / med;
      const medDisplay = usd(med);
      const n = valid.length;
      if (ratio < 0.65) {
        checks.push(
          makeCheck(
            cat,
            "price",
            "INCONSISTENT",
            `Asking price ${usd(vehicle.priceUsd)} is well below comparable ${
              vehicle.partCategory ?? "spare part"
            } listings (median ≈ ${medDisplay}) — high risk of counterfeit replica or defective unit.`,
            `តម្លៃលក់ ${usd(vehicle.priceUsd)} ទាបខ្លាំងខុសធម្មតាធៀបនឹងគ្រឿងបន្លាស់ ${
              vehicle.partCategory ?? ""
            } ស្រដៀងគ្នា (តម្លៃកណ្ដាល ≈ ${medDisplay}) — អាចជាទំនិញក្លែងក្លាយ ឬខូចខាត។`,
            `Market comparables (${n})`,
            0.5,
          ),
        );
      } else if (ratio <= 1.35) {
        checks.push(
          makeCheck(
            cat,
            "price",
            "EVIDENCE_FOUND",
            `Asking price ${usd(vehicle.priceUsd)} aligns with comparable ${
              vehicle.partCategory ?? "spare part"
            } market prices (median ≈ ${medDisplay}).`,
            `តម្លៃលក់ ${usd(vehicle.priceUsd)} ស្ថិតក្នុងកម្រិតសមរម្យធៀបនឹងតម្លៃទីផ្សារគ្រឿងបន្លាស់ ${
              vehicle.partCategory ?? ""
            } (តម្លៃកណ្ដាល ≈ ${medDisplay})។`,
            `Market comparables (${n})`,
            0.8,
          ),
        );
      } else {
        checks.push(
          makeCheck(
            cat,
            "price",
            "NOT_VERIFIED",
            `Asking price ${usd(vehicle.priceUsd)} is above market average (median ≈ ${medDisplay}) — may indicate genuine OEM premium or rare assembly.`,
            `តម្លៃលក់ ${usd(vehicle.priceUsd)} ខ្ពស់ជាងតម្លៃមធ្យម (តម្លៃកណ្ដាល ≈ ${medDisplay}) — អាចដោយសារទំនិញហ្ស៊ីន OEM ពិសេស ឬទំនិញកម្រ។`,
            `Market comparables (${n})`,
            0.55,
          ),
        );
      }
    } else {
      checks.push(
        makeCheck(
          cat,
          "price",
          "NO_DATA",
          "Not enough comparable spare part listings to assess price.",
          "បញ្ជីលក់គ្រឿងបន្លាស់ស្រដៀងគ្នាមិនគ្រប់គ្រាន់ ដើម្បីវាយតម្លៃតម្លៃនេះទេ។",
          "Market comparables",
          0.1,
        ),
      );
    }
  }

  // 6. service: Warranty & Test Certificate
  const warDoc = findDoc(documents, ["WARRANTY_CARD", "INSPECTION_CERT", "SERVICE_RECORD"]);
  if (warDoc?.status === "VERIFIED") {
    checks.push(
      makeCheck(
        cat,
        "service",
        "VERIFIED",
        "Manufacturer/distributor warranty card or test bench certification verified.",
        "ប័ណ្ណធានារបស់រោងចក្រ/តំណាងចែកចាយ ឬវិញ្ញាបនបត្រតេស្តគុណភាពត្រូវបានផ្ទៀងផ្ទាត់ហើយ។",
        "Warranty card (platform-verified)",
        0.9,
      ),
    );
  } else if (warDoc?.status === "PROVIDED") {
    checks.push(
      makeCheck(
        cat,
        "service",
        "EVIDENCE_FOUND",
        "Warranty card or inspection test certificate provided by seller.",
        "ប័ណ្ណធានា ឬវិញ្ញាបនបត្រតេស្តគុណភាពត្រូវបានផ្ដល់ជូនដោយម្ចាស់លក់។",
        "Warranty card (provided)",
        0.65,
      ),
    );
  } else {
    checks.push(
      makeCheck(
        cat,
        "service",
        "NO_DATA",
        "No manufacturer warranty or test certificate provided. Inquire with seller about return/exchange window.",
        "គ្មានប័ណ្ណធានា ឬវិញ្ញាបនបត្រតេស្តគុណភាពទេ។ សូមសួរម្ចាស់លក់អំពីគោលការណ៍ប្តូរ/សងប្រាក់វិញ។",
        "Warranty certificate",
        0.1,
      ),
    );
  }

  // 7. photos: Packaging, Labels, Barcodes & Connectors
  const urls = images.map((i) => i.url);
  const uniqueUrls = Array.from(new Set(urls));
  const hasDuplicates = uniqueUrls.length !== urls.length;
  const nPhotos = uniqueUrls.length;
  if (hasDuplicates) {
    checks.push(
      makeCheck(
        cat,
        "photos",
        "INCONSISTENT",
        "Duplicate images detected in spare part listing.",
        "រកឃើញរូបភាពស្ទួនក្នុងបញ្ជីលក់គ្រឿងបន្លាស់។",
        "Listing photos",
        0.5,
      ),
    );
  } else if (nPhotos >= 3) {
    checks.push(
      makeCheck(
        cat,
        "photos",
        "EVIDENCE_FOUND",
        `${nPhotos} detailed photos available. Review part labels, barcodes, connectors, and mounting points.`,
        `មានរូបភាព ${nPhotos} រូប។ សូមពិនិត្យស្លាកកូដ បាកូដ ក្បាលតំណ និងចំណុចចាប់វីស។`,
        "Listing photos",
        0.65,
      ),
    );
  } else if (nPhotos >= 1) {
    checks.push(
      makeCheck(
        cat,
        "photos",
        "NOT_VERIFIED",
        `Only ${nPhotos} photo(s). Request close-up photos of manufacturer stamp, barcode, and wear surfaces.`,
        `មានរូបភាពតែ ${nPhotos} រូបប៉ុណ្ណោះ។ សូមសុំរូបថតជិតនៃត្រាកូដ បាកូដ និងផ្ទៃសឹក។`,
        "Listing photos",
        0.35,
      ),
    );
  } else {
    checks.push(
      makeCheck(
        cat,
        "photos",
        "NO_DATA",
        "No photos provided.",
        "គ្មានរូបភាពផ្ដល់ជូនទេ។",
        "Listing photos",
        0.05,
      ),
    );
  }

  // 8. ownership: Supplier & Merchant Credibility
  const isDealer =
    vehicle.seller?.sellerProfile?.type === "DEALER" ||
    vehicle.seller?.sellerProfile?.verified ||
    vehicle.seller?.verified;
  if (isDealer) {
    checks.push(
      makeCheck(
        cat,
        "ownership",
        "EVIDENCE_FOUND",
        `Sold by a platform-verified merchant or authorized dealer (${
          vehicle.seller?.sellerProfile?.shopName || "Verified Shop"
        }).`,
        `លក់ដោយអាជីវកម្ម ឬតំណាងចែកចាយដែលបានផ្ទៀងផ្ទាត់ដោយវេទិកា (${
          vehicle.seller?.sellerProfile?.shopName || "ហាងផ្ទៀងផ្ទាត់"
        })។`,
        "Merchant verification",
        0.75,
      ),
    );
  } else {
    checks.push(
      makeCheck(
        cat,
        "ownership",
        "NOT_VERIFIED",
        "Sold by an individual or unverified seller. Verify part authenticity in person before payment.",
        "លក់ដោយបុគ្គល ឬអ្នកលក់ដែលមិនទាន់ផ្ទៀងផ្ទាត់។ សូមពិនិត្យភាពសុទ្ធនៃទំនិញដោយផ្ទាល់មុននឹងបង់ប្រាក់។",
        "Seller profile",
        0.45,
      ),
    );
  }

  // 9. accident: Defect & Refurbished Declaration
  switch (vehicle.accidentDeclared) {
    case "NONE_DECLARED":
      checks.push(
        makeCheck(
          cat,
          "accident",
          "NOT_VERIFIED",
          "Seller declares no structural defects, cracks, or mechanical warping. Always inspect physical condition upon receipt.",
          "ម្ចាស់លក់ប្រកាសថាមិនមានស្នាមប្រេះ បែកបាក់ ឬកោងខូចទ្រង់ទ្រាយទេ។ សូមពិនិត្យរូបរាងជាក់ស្ដែងពេលទទួលទំនិញ។",
          "Seller defect declaration",
          0.45,
        ),
      );
      break;
    case "MINOR_DECLARED":
    case "MAJOR_DECLARED":
      checks.push(
        makeCheck(
          cat,
          "accident",
          "EVIDENCE_FOUND",
          "Seller declares cosmetic wear or refurbished condition. Verify fitment and test before permanent installation.",
          "ម្ចាស់លក់ប្រកាសពីស្នាមឆ្កូត ឬស្ថានភាពកែច្នៃឡើងវិញ។ សូមបញ្ជាក់ភាពត្រូវគ្នា និងតេស្តមុនពេលតម្លើង។",
          "Seller defect declaration",
          0.5,
        ),
      );
      break;
    default:
      checks.push(
        makeCheck(
          cat,
          "accident",
          "NO_DATA",
          "No defect declaration provided. Confirm fitment and return guarantee with seller.",
          "គ្មានសេចក្ដីប្រកាសពីបញ្ហាគ្រឿងបន្លាស់ទេ។ សូមបញ្ជាក់ភាពត្រូវគ្នា និងការធានាប្តូរជាមួយម្ចាស់លក់។",
          "Seller declaration",
          0.1,
        ),
      );
  }

  // 10. listing text & counterfeit scan
  const text = `${vehicle.description ?? ""}\n${vehicle.descriptionKm ?? ""}`.toLowerCase();
  const matched = SCAM_PATTERNS.filter((p) => text.includes(p.toLowerCase()));
  if (matched.length > 0) {
    checks.push(
      makeCheck(
        cat,
        "listing",
        "INCONSISTENT",
        `Listing text contains suspicious or replica keywords: "${matched.join(", ")}". Be cautious and verify authenticity.`,
        `អត្ថបទបញ្ជាលក់មានពាក្យសង្ស័យ ឬទំនិញចម្លង៖ "${matched.join(", ")}"។ សូមប្រុងប្រយ័ត្ន និងបញ្ជាក់ភាពសុទ្ធ។`,
        "Listing text scan",
        0.5,
      ),
    );
  } else {
    checks.push(
      makeCheck(
        cat,
        "listing",
        "EVIDENCE_FOUND",
        "Listing text scan found no counterfeit or scam patterns.",
        "ការវិភាគអត្ថបទបញ្ជាលក់មិនរកឃើញគំរូទំនិញក្លែងក្លាយ ឬបញ្ឆោតទេ។",
        "Listing text scan",
        0.7,
      ),
    );
  }

  const meanWeight =
    checks.reduce((sum, c) => sum + (STATUS_WEIGHT[c.status] ?? 0), 0) / (checks.length || 1);
  const overallConfidence = Math.round(100 * meanWeight);

  return { checks, overallConfidence };
}
