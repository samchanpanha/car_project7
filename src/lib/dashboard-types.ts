// KhLan dashboard architecture — canonical DTO contract for:
//   Session/persona switcher, Super Admin dashboard, Tenant (Dealer) dashboard,
//   Customer dashboard, Appointments, Saved searches, Advanced vehicle filters.
// API routes import these types; frontend consumes the exact same shapes.

import type { VehicleCardDTO, VehicleStatus, SellerType } from "./types";

// ---------- Roles & Session ----------

export type TenantRole = "OWNER" | "MANAGER" | "SALES_STAFF" | "INVENTORY_MANAGER";
export type UserRole = "BUYER" | "SELLER" | "DEALER" | "ADMIN" | "SUPER_ADMIN";

export interface PersonaDTO {
  id: string;
  name: string;
  role: UserRole;
  /** demo label shown in the switcher */
  label: { en: string; km: string };
  tag: "buyer" | "dealer-owner" | "sales-staff" | "inventory-manager" | "private-seller" | "admin";
}

export interface SessionDTO {
  user: { id: string; name: string; role: UserRole; locale: string; avatarUrl?: string | null; phone: string };
  sellerType: SellerType | null;
  tenant: { id: string; name: string; slug: string; logoUrl?: string | null; myRole: TenantRole } | null;
  /** true when the user is really logged in (password/OTP/Telegram) — not a demo persona */
  authed: boolean;
  /** Telegram account linked to the current user */
  telegramLinked: boolean;
  /** present only when authed (phone verification state for profile settings) */
  phoneVerified?: boolean;
  personas: PersonaDTO[];
}

// ---------- Shared bits ----------

export interface AuditEntryDTO {
  id: string;
  action: string;
  entity: string;
  entityId?: string | null;
  actorName?: string | null;
  createdAt: string;
  meta?: Record<string, unknown> | null;
}

export interface PlanDTO {
  plan: "FREE" | "BASIC" | "PRO" | "ENTERPRISE";
  name: string;
  priceUsdMonthly: number;
  priceUsdYearly: number;
  listingsLimit: number;
  featuredLimit: number;
  seats: number;
  features: { en: string; km: string }[];
}

export interface SubscriptionDTO {
  id: string;
  plan: PlanDTO["plan"];
  /** EXPIRED added by the payments milestone — set automatically when currentPeriodEnd passes */
  status: "ACTIVE" | "CANCELLED" | "PAST_DUE" | "EXPIRED";
  billingCycle: "MONTHLY" | "YEARLY";
  priceUsd: number;
  listingsLimit: number;
  featuredLimit: number;
  seats: number;
  startedAt: string;
  currentPeriodEnd: string;
}

export interface TenantMemberDTO {
  id: string;
  userId: string;
  name: string;
  phone: string;
  role: TenantRole;
  status: "ACTIVE" | "SUSPENDED";
  createdAt: string;
}

// ---------- Super Admin ----------

export interface AdminOverviewDTO {
  kpis: {
    users: number;
    tenants: number;
    listingsPublished: number;
    listingsPending: number;
    reportsGenerated: number;
    conversations: number;
    favorites: number;
    appointments: number;
    mrrUsd: number; // sum of active subscription prices normalized to monthly
  };
  listingsByStatus: Record<VehicleStatus, number>;
  /** last 6 weeks, oldest → newest */
  signupTrend: { label: string; users: number; listings: number }[];
  topTenants: { id: string; name: string; plan: string; listings: number; views: number }[];
  recentAudit: AuditEntryDTO[];
}

export interface AdminTenantDTO {
  id: string;
  name: string;
  slug: string;
  city: string;
  verification: "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED";
  status: "ACTIVE" | "SUSPENDED";
  memberCount: number;
  listingCount: number;
  plan: PlanDTO["plan"] | null;
  subscriptionStatus: SubscriptionDTO["status"] | null;
  mrrUsd: number;
  createdAt: string;
}

export interface AdminVehicleRowDTO extends VehicleCardDTO {
  sellerName: string;
}

export interface AdminUserDTO {
  id: string;
  name: string;
  phone: string;
  role: UserRole;
  locale: string;
  phoneVerified: boolean;
  createdAt: string;
  listingCount: number;
  favoriteCount: number;
  tenantName?: string | null;
}

export interface AiStatsDTO {
  totalReports: number;
  completeReports: number;
  avgConfidence: number; // 0-100 rounded
  statusBreakdown: Record<string, number>; // VERIFIED / EVIDENCE_FOUND / NOT_VERIFIED / NO_DATA / INCONSISTENT
  recent: { id: string; vehicleLabel: string; confidence: number; createdAt: string }[];
}

export interface PlatformSettingsDTO {
  commissionPct: number;
  featuredListingPriceUsd: number;
  autoApproveListings: boolean;
  maintenanceMode: boolean;
}

// ---------- Tenant / Dealer ----------

export interface TenantDashboardDTO {
  tenant: {
    id: string;
    name: string;
    slug: string;
    logoUrl?: string | null;
    bio?: string | null;
    bioKm?: string | null;
    city: string;
    address?: string | null;
    phone?: string | null;
    telegram?: string | null;
    verification: "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED";
    status: "ACTIVE" | "SUSPENDED";
    memberSince: string;
  };
  myRole: TenantRole;
  subscription: SubscriptionDTO | null;
  members: TenantMemberDTO[];
  plans: PlanDTO[];
  stats: {
    published: number;
    pending: number;
    sold: number;
    draft: number;
    totalViews: number;
    totalLeads: number;
    activeFavorites: number;
    appointmentsRequested: number;
  };
}

export type TenantVehicleRowDTO = VehicleCardDTO;

export interface TenantLeadDTO {
  conversationId: string;
  vehicle: { id: string; make: string; model: string; year: number; priceUsd: number; thumbnail?: string | null };
  buyer: { id: string; name: string };
  lastMessage: { body: string; createdAt: string; isMine: boolean } | null;
  messageCount: number;
  updatedAt: string;
}

export type AppointmentStatus = "REQUESTED" | "CONFIRMED" | "COMPLETED" | "CANCELLED";

export interface TenantAppointmentDTO {
  id: string;
  vehicle: { id: string; make: string; model: string; year: number };
  buyer: { id: string; name: string };
  scheduledAt: string;
  status: AppointmentStatus;
  notes?: string | null;
  createdAt: string;
}

// ---------- Customer Account ----------

export interface AccountOverviewDTO {
  favorites: number;
  savedSearches: number;
  appointments: number;
  reportsGenerated: number; // reports requested by me platform-wide
  messagesCount: number; // conversations I am part of
  recentReports: { id: string; vehicleId: string; vehicleLabel: string; confidence: number; createdAt: string }[];
}

export interface SavedSearchDTO {
  id: string;
  name: string;
  query: Record<string, string | number>;
  alertsEnabled: boolean;
  createdAt: string;
  resultCount?: number;
}

export interface AppointmentDTO {
  id: string;
  vehicle: { id: string; make: string; model: string; year: number; priceUsd: number; thumbnail?: string | null };
  sellerName: string;
  scheduledAt: string;
  status: AppointmentStatus;
  notes?: string | null;
  createdAt: string;
}

// ---------- API endpoint map (implement exactly) ----------
//
// GET    /api/session                          → SessionDTO
// POST   /api/session            { userId }    → SessionDTO (sets persona cookie)
//
// GET    /api/admin/overview                   → AdminOverviewDTO
// GET    /api/admin/tenants                    → AdminTenantDTO[]
// PATCH  /api/admin/tenants/[id] { verification?, status? } → { ok: true }
// GET    /api/admin/vehicles?status=&q=        → AdminVehicleRowDTO[]
// PATCH  /api/admin/vehicles/[id] { status?, featured? }   → { ok: true }
// GET    /api/admin/users                      → AdminUserDTO[]
// PATCH  /api/admin/users/[id]   { role }      → { ok: true }
// GET    /api/admin/ai                         → AiStatsDTO
// GET    /api/admin/settings                   → PlatformSettingsDTO
// PUT    /api/admin/settings     (same shape)  → PlatformSettingsDTO
// GET    /api/admin/audit?limit=               → AuditEntryDTO[]
//
// GET    /api/tenant/me                        → TenantDashboardDTO
// PATCH  /api/tenant/profile    { name?, bio?, bioKm?, city?, address?, phone?, telegram?, logoUrl? } → { ok: true }
// GET    /api/tenant/inventory?status=         → TenantVehicleRowDTO[]
// PATCH  /api/tenant/inventory/[id] { status?, priceUsd?, featured? } → { ok: true }
// GET    /api/tenant/leads                     → TenantLeadDTO[]
// GET    /api/tenant/appointments              → TenantAppointmentDTO[]
// PATCH  /api/tenant/appointments/[id] { status } → { ok: true }   // CONFIRMED|COMPLETED|CANCELLED
// GET    /api/tenant/staff                     → TenantMemberDTO[]
// POST   /api/tenant/staff      { name, phone, role } → TenantMemberDTO
// PATCH  /api/tenant/staff/[memberId] { role?, status? } → { ok: true }
// GET    /api/tenant/subscription              → { subscription: SubscriptionDTO | null, plans: PlanDTO[] }
// POST   /api/tenant/subscription { plan, billingCycle } → { subscription: SubscriptionDTO }
//
// GET    /api/account/overview                 → AccountOverviewDTO
// GET    /api/account/saved-searches           → SavedSearchDTO[]
// POST   /api/account/saved-searches { name, query, alertsEnabled? } → SavedSearchDTO
// DELETE /api/account/saved-searches/[id]      → { ok: true }
// POST   /api/account/saved-searches/[id]/run  → { total: number, vehicles: VehicleCardDTO[] }
// GET    /api/account/appointments             → AppointmentDTO[]
// POST   /api/account/appointments { vehicleId, scheduledAt, notes? } → AppointmentDTO
// PATCH  /api/account/appointments/[id] { status: "CANCELLED" } → { ok: true }
//
// GET /api/vehicles ADDITIONAL advanced-filter params (all optional, backward compatible):
//   priceMin, priceMax, yearMin, yearMax, mileageMin, mileageMax (numbers)
//   fuel, transmission, drivetrain, bodyType: comma-separated multi-values (e.g. fuel=DIESEL,HYBRID)
//   condition=LIKE_NEW|USED, sellerType=PRIVATE|DEALER, sellerVerified=true,
//   featured=true, hasReport=true, city, make, q, sort, cursor, limit
//   → { items, nextCursor, total } (unchanged shape)
