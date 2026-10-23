// KhLan shared DTO types — canonical contract between frontend and API routes.
// Backend (API subagent) must import from here; frontend consumes the same types.

export type ReportStatus =
  | "VERIFIED" // confirmed by an external source / document verification
  | "EVIDENCE_FOUND" // evidence exists and was checked, supports the claim
  | "INCONSISTENT" // conflicting or suspicious evidence
  | "NOT_VERIFIED" // claim exists but could not be independently verified
  | "NO_DATA"; // nothing available to check — must never mean "no problem"

export type SellerType = "PRIVATE" | "DEALER";
export type VehicleStatus = "DRAFT" | "PENDING_REVIEW" | "PUBLISHED" | "REJECTED" | "SOLD" | "ARCHIVED";
export type SortOption = "newest" | "price_asc" | "price_desc" | "year_desc" | "mileage_asc";

export interface SellerSummaryDTO {
  id: string; // userId
  name: string;
  shopName?: string | null;
  type: SellerType;
  verified: boolean;
  verification: "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED";
  ratingAvg: number;
  ratingCount: number;
  city: string;
}

/** Telegram growth channels a seller/dealer can attach to their profile
 *  (configured in the dashboard Telegram Hub; shown to buyers).
 *  inviteCode powers tracked invite links: /api/tg/<code>?d=DEST */
export interface SellerTelegramLinksDTO {
  tgMiniAppUrl?: string | null;
  tgChannelUrl?: string | null;
  tgGroupUrl?: string | null;
  inviteCode?: string | null;
}

export interface VehicleCardDTO {
  id: string;
  make: string;
  model: string;
  variant?: string | null;
  year: number;
  priceUsd: number;
  mileageKm: number;
  transmission: string; // AUTOMATIC | MANUAL
  fuel: string; // PETROL | DIESEL | HYBRID | ELECTRIC
  bodyType: string; // SUV | SEDAN | PICKUP | HATCHBACK | VAN | COUPE
  city: string;
  district?: string | null;
  condition: string; // LIKE_NEW | USED
  status: VehicleStatus;
  featured: boolean;
  views: number;
  createdAt: string; // ISO
  seller: SellerSummaryDTO;
  images: string[]; // urls sorted by sortOrder
  trust: {
    docsProvided: number;
    reportAvailable: boolean;
  };
  branchId?: string | null;
  branchName?: string | null;
}

export interface VehicleDocumentDTO {
  type: string; // REGISTRATION_BOOK | IMPORT_DECLARATION | SERVICE_RECORD | INSPECTION_CERT | INSURANCE
  status: string; // PROVIDED | MISSING | VERIFIED | REJECTED
  notes?: string | null;
}

export interface VehicleDetailDTO extends VehicleCardDTO {
  engineCc?: number | null;
  drivetrain?: string | null;
  exteriorColor?: string | null;
  vinLast6?: string | null;
  plateNo?: string | null;
  ownershipCount?: number | null;
  accidentDeclared: string; // NONE_DECLARED | MINOR_DECLARED | MAJOR_DECLARED | UNKNOWN
  importOrigin?: string | null;
  description?: string | null;
  descriptionKm?: string | null;
  branchAddress?: string | null;
  branchPhone?: string | null;
  updatedAt: string;
  documents: VehicleDocumentDTO[];
  sellerFull: SellerSummaryDTO & {
    bio?: string | null;
    bioKm?: string | null;
    memberSince: string;
    phone?: string | null;
    telegram?: string | null;
    responseRate: number;
  } & SellerTelegramLinksDTO;
  report?: { id: string; createdAt: string; overallConfidence: number } | null;
}

export interface ReportCheck {
  area: string; // identity|registration|import|mileage|price|service|photos|ownership|accident|listing
  title: string;
  titleKm: string;
  status: ReportStatus;
  detail: string;
  detailKm: string;
  source: string;
  confidence: number; // 0-1
}

export interface ReportDTO {
  id: string;
  vehicleId: string;
  status: string; // COMPLETE | PROCESSING | FAILED
  overallConfidence: number; // 0-100
  summaryEn?: string | null;
  summaryKm?: string | null;
  checks: ReportCheck[];
  limitations: { en: string; km: string }[];
  createdAt: string;
}

export interface MessageDTO {
  id: string;
  body: string;
  isMine: boolean;
  isSystem: boolean;
  createdAt: string;
}

export interface ConversationListItemDTO {
  id: string;
  vehicle: { id: string; make: string; model: string; year: number; priceUsd: number; thumbnail?: string | null };
  sellerName: string;
  lastMessage: { body: string; createdAt: string; isMine: boolean } | null;
  updatedAt: string;
}

export interface ConversationDetailDTO {
  id: string;
  vehicle: { id: string; make: string; model: string; year: number; priceUsd: number; thumbnail?: string | null };
  seller: SellerSummaryDTO;
  messages: MessageDTO[];
}

export interface SellerOptionDTO {
  id: string;
  name: string;
  shopName?: string | null;
  type: SellerType;
  verified: boolean;
  count: number;
}

export interface MetaDTO {
  makes: string[];
  cities: string[];
  bodyTypes: string[];
  fuelTypes: string[];
  transmissions: string[];
  priceMin: number;
  priceMax: number;
  yearMin: number;
  yearMax: number;
  sellers?: SellerOptionDTO[];
}

export interface VehiclesResponseDTO {
  items: VehicleCardDTO[];
  nextCursor: string | null;
  total: number;
}

export interface SellerPageDTO {
  seller: SellerSummaryDTO & {
    bio?: string | null;
    bioKm?: string | null;
    memberSince: string;
    phone?: string | null;
    telegram?: string | null;
    responseRate: number;
    logoUrl?: string | null;
  } & SellerTelegramLinksDTO;
  listings: VehicleCardDTO[];
}

// Query params accepted by GET /api/vehicles
export interface VehicleQuery {
  q?: string;
  make?: string;
  bodyType?: string;
  fuel?: string;
  transmission?: string;
  city?: string;
  sellerType?: SellerType | "";
  sellerVerified?: "true" | "";
  sellerId?: string;
  dealerId?: string;
  priceMin?: number;
  priceMax?: number;
  yearMin?: number;
  yearMax?: number;
  mileageMax?: number;
  sort?: SortOption;
  cursor?: string;
  limit?: number;
  page?: number;
}

