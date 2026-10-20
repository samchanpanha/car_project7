import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { ReportCheck, ReportStatus } from "@/lib/types";

/** Vehicle row (with documents + images included) accepted by the rules engine. */
export type VehicleForChecks = Prisma.VehicleGetPayload<{
  include: { documents: true; images: true };
}>;

/** Minimal comparable-vehicle shape used by the price check. */
export type ComparableVehicle = {
  id: string;
  bodyType: string;
  year: number;
  priceUsd: number;
};

const CURRENT_YEAR = 2025; // analysis reference year per MVP spec

/** Bilingual limitations shipped with every report. */
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

const STATUS_WEIGHT: Record<ReportStatus, number> = {
  VERIFIED: 1,
  EVIDENCE_FOUND: 0.7,
  NOT_VERIFIED: 0.4,
  NO_DATA: 0.2,
  INCONSISTENT: 0,
};

/** Area titles (EN + KM) — fixed bilingual labels per area. */
const AREA_TITLES: Record<string, { title: string; titleKm: string }> = {
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

function usd(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
}

function makeCheck(
  area: keyof typeof AREA_TITLES & string,
  status: ReportStatus,
  detail: string,
  detailKm: string,
  source: string,
  confidence: number,
): ReportCheck {
  return { area, ...AREA_TITLES[area], status, detail, detailKm, source, confidence };
}

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

function findDoc(
  documents: { type: string; status: string }[],
  type: string,
): { status: string } | undefined {
  return documents.find((d) => d.type === type);
}

const SCAM_PATTERNS = [
  "deposit first",
  "western union",
  "wire transfer",
  "urgent sale",
  "pay before",
  "បង់ប្រាក់ដុន",
  "ផ្ញើប្រាក់មុន",
];

/**
 * Deterministic vehicle-history rules engine.
 * Emits exactly 10 bilingual checks and an overall confidence score (0-100).
 */
export async function runChecks(
  vehicle: VehicleForChecks,
  documents: { type: string; status: string }[],
  images: { url: string }[],
  comparables?: ComparableVehicle[],
): Promise<{ checks: ReportCheck[]; overallConfidence: number }> {
  const checks: ReportCheck[] = [];

  // ---------- 1. identity ----------
  if (vehicle.vinLast6 && vehicle.plateNo) {
    checks.push(
      makeCheck(
        "identity",
        "NOT_VERIFIED",
        `Seller-provided identifiers present (VIN last-6 •••${vehicle.vinLast6}, plate ${vehicle.plateNo}). Identity cannot be fully confirmed without document cross-check.`,
        `មានព័ត៌មានអត្តសញ្ញាណដែលម្ចាស់លក់ផ្ដល់ជូន (VIN ៦តួចុងក្រោយ •••${vehicle.vinLast6}, ស្លាកលេខ ${vehicle.plateNo})។ អត្តសញ្ញាណមិនអាចបញ្ជាក់បានពេញលេញឡើយ បើមិនឆ្លងកាត់ការត្រួតពិនិត្យឯកសារ។`,
        "Listing data",
        0.5,
      ),
    );
  } else {
    checks.push(
      makeCheck(
        "identity",
        "NO_DATA",
        "No VIN/plate provided — request registration book photos.",
        "គ្មានលេខ VIN ឬស្លាកលេខផ្ដល់ជូនទេ — សូមសុំរូបភាពសៀវភៅចុះបញ្ជី។",
        "Listing data",
        0.1,
      ),
    );
  }

  // ---------- 2. registration ----------
  const regDoc = findDoc(documents, "REGISTRATION_BOOK");
  if (regDoc?.status === "VERIFIED") {
    checks.push(
      makeCheck(
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
        "registration",
        "NO_DATA",
        "No registration book provided. Request the document before any viewing.",
        "គ្មានសៀវភៅចុះបញ្ជីផ្ដល់ជូនទេ។ សូមសុំឯកសារនេះមុននឹងទៅមើលឡាន។",
        "Registration book",
        0.05,
      ),
    );
  }

  // ---------- 3. import ----------
  const impDoc = findDoc(documents, "IMPORT_DECLARATION");
  if (impDoc?.status === "VERIFIED") {
    checks.push(
      makeCheck(
        "import",
        "VERIFIED",
        `Import declaration provided and verified by the platform.${
          vehicle.importOrigin ? ` Origin: ${vehicle.importOrigin}.` : ""
        }`,
        `សេចក្ដីជំនាន់នាំចូលត្រូវបានផ្ដល់ជូន និងបានផ្ទៀងផ្ទាត់ដោយវេទិកាហើយ។${
          vehicle.importOrigin ? ` ប្រភព៖ ${vehicle.importOrigin}។` : ""
        }`,
        "Import declaration (platform-verified)",
        0.95,
      ),
    );
  } else if (impDoc?.status === "PROVIDED") {
    checks.push(
      makeCheck(
        "import",
        "EVIDENCE_FOUND",
        `Import declaration provided${vehicle.importOrigin ? ` (origin: ${vehicle.importOrigin})` : ""}.`,
        `សេចក្ដីជំនាន់នាំចូលត្រូវបានផ្ដល់ជូន${vehicle.importOrigin ? ` (ប្រភព៖ ${vehicle.importOrigin})` : ""}។`,
        "Import declaration (provided)",
        0.6,
      ),
    );
  } else {
    checks.push(
      makeCheck(
        "import",
        "NO_DATA",
        "No import declaration provided. Common for older units — request it from the seller.",
        "គ្មានសេចក្ដីជំនាន់នាំចូលផ្ដល់ជូនទេ។ ជារឿងធម្មតាសម្រាប់ឡានចាស់ — សូមសុំវាពីម្ចាស់លក់។",
        "Import declaration",
        0.05,
      ),
    );
  }

  // ---------- 4. mileage ----------
  const ageYears = Math.max(1, CURRENT_YEAR - vehicle.year);
  const avgAnnual = vehicle.mileageKm / ageYears;
  const avgDisplay = Math.round(avgAnnual).toLocaleString("en-US");
  if (avgAnnual < 4000) {
    checks.push(
      makeCheck(
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
        "mileage",
        "NOT_VERIFIED",
        `High average annual mileage (${avgDisplay} km/year). Confirm usage with service history.`,
        `ចម្ងាយដំណើរជាមធ្យមប្រចាំឆ្នាំខ្ពស់ (${avgDisplay} គ.ម/ឆ្នាំ)។ សូមបញ្ជាក់ការប្រើប្រាស់ជាមួយប្រវត្តិសេវាថែទាំ។`,
        "Listing data + age analysis",
        0.5,
      ),
    );
  }

  // ---------- 5. price vs. market ----------
  if (vehicle.priceUsd <= 0) {
    checks.push(
      makeCheck(
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
      comps = await db.vehicle.findMany({
        where: { status: "PUBLISHED", bodyType: vehicle.bodyType, priceUsd: { gt: 0 } },
        select: { id: true, bodyType: true, year: true, priceUsd: true },
      });
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
          "price",
          "NO_DATA",
          "Not enough comparable listings to assess price.",
          "បញ្ជីលក់ឡានស្រដៀងគ្នាមិនគ្រប់គ្រាន់ ដើម្បីវាយតម្លៃតម្លៃឡាននេះ។",
          "Market comparables",
          0.1,
        ),
      );
    }
  }

  // ---------- 6. service ----------
  const svcDoc = findDoc(documents, "SERVICE_RECORD");
  if (svcDoc?.status === "VERIFIED") {
    checks.push(
      makeCheck(
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
        "service",
        "NO_DATA",
        "No service records provided. Request maintenance history.",
        "គ្មានបញ្ជីសេវាថែទាំផ្ដល់ជូនទេ។ សូមសុំប្រវត្តិការថែទាំឡាន។",
        "Service records",
        0.05,
      ),
    );
  }

  // ---------- 7. photos ----------
  const urls = images.map((i) => i.url);
  const uniqueUrls = Array.from(new Set(urls));
  const hasDuplicates = uniqueUrls.length !== urls.length;
  const nPhotos = uniqueUrls.length;
  if (hasDuplicates) {
    checks.push(
      makeCheck(
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
        "photos",
        "NO_DATA",
        "No photos provided.",
        "គ្មានរូបភាពផ្ដល់ជូនទេ។",
        "Listing photos",
        0.05,
      ),
    );
  }

  // ---------- 8. ownership ----------
  if (vehicle.ownershipCount != null) {
    checks.push(
      makeCheck(
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
        "ownership",
        "NO_DATA",
        "Ownership history unknown.",
        "ប្រវត្តិម្ចាស់មិនដឹងច្បាស់។",
        "Listing data",
        0.05,
      ),
    );
  }

  // ---------- 9. accident ----------
  switch (vehicle.accidentDeclared) {
    case "NONE_DECLARED":
      checks.push(
        makeCheck(
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
          "accident",
          "NO_DATA",
          "No accident information declared. Treat as unknown.",
          "គ្មានព័ត៌មានគ្រោះថ្នាក់ប្រកាសទេ។ សូមចាត់ទុកថាមិនទាន់ដឹង។",
          "Seller declaration",
          0.05,
        ),
      );
  }

  // ---------- 10. listing text ----------
  const text = `${vehicle.description ?? ""}\n${vehicle.descriptionKm ?? ""}`.toLowerCase();
  const matched = SCAM_PATTERNS.filter((p) => text.includes(p.toLowerCase()));
  if (matched.length > 0) {
    checks.push(
      makeCheck(
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
        "listing",
        "EVIDENCE_FOUND",
        "Listing text scan found no common scam patterns.",
        "ការវិភាគអត្ថបទបញ្ជាលក់មិនរកឃើញគំរូបញ្ឆោតធម្មតាទេ។",
        "Listing text analysis",
        0.7,
      ),
    );
  }

  // ---------- overall confidence ----------
  const meanWeight =
    checks.reduce((sum, c) => sum + (STATUS_WEIGHT[c.status] ?? 0), 0) / (checks.length || 1);
  const overallConfidence = Math.round(100 * meanWeight);

  return { checks, overallConfidence };
}
