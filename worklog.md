# KhLan (ខ្លាន) — Worklog

---
Task ID: 1, 2, 2-a
Agent: Main orchestrator (Z.ai Code)
Task: Project exploration, master development plan, Prisma schema & DB setup

Work Log:
- Explored scaffold: Next.js 16 + shadcn/ui + Prisma (SQLite at db/custom.db), dev server already running on port 3000.
- Wrote `/home/z/my-project/PLAN.md` — full 20-section development plan (market research, user journeys, feature matrix, AI report architecture, UI/UX system, tech stack, Mermaid architecture + ERD, API design, security/regulatory checklist, monetization scenarios, 6-phase roadmap, testing, 90-day marketing, risk register, KPIs, 30-task backlog, first-5 tasks & week-1 plan).
- Designed Prisma schema: User, SellerProfile, Vehicle, VehicleImage, VehicleDocument, VehicleHistoryReport, Favorite, Conversation, Message, ReportedContent, AuditLog. Pushed to SQLite (`bun run db:push`) successfully.
- Sourced 56 real vehicle photos via z-ai image-search for 14 popular Cambodia-market models; saved to `prisma/seed-images.json` (slug → urls).
- Wrote canonical shared DTO contract at `src/lib/types.ts` (VehicleCardDTO, VehicleDetailDTO, ReportDTO with 5-status evidence taxonomy, ConversationDTOs, MetaDTO, query params).

Stage Summary:
- PLAN.md is the primary planning deliverable.
- Shared type contract fixed in src/lib/types.ts — API routes and frontend must import from it.
- Demo buyer user id is `usr_demo_buyer` (seeded; API falls back to create).
- Image slugs: prado, lexus, revo, crv, camry, ranger, tucson, carnival, vellfire, cclass, civic, fortuner, accent, cx5 (4 urls each).
- Next: parallel subagents 2-b (seed) and 3 (API routes); main agent builds the single-route SPA frontend.

---
Task ID: 2-b
Agent: full-stack-developer (seed)
Task: Seed database with Cambodian marketplace demo data

Work Log:
- Read worklog.md, prisma/schema.prisma, src/lib/types.ts (ReportCheck/ReportDTO contract), PLAN.md Appendix A, prisma/seed-images.json.
- Wrote prisma/seed.ts (idempotent: wipes all tables in FK-safe order, then reseeds). Loads .env fallback for DATABASE_URL; imports image URLs strictly from seed-images.json.
- Seeded 6 users with exact deterministic ids (usr_demo_buyer, usr_dealer_sokha, usr_dealer_ppauto, usr_priv_vireak, usr_priv_sopheak, usr_admin) + 4 SellerProfiles (Sokha Motors / PP Auto Trust / 2 private sellers, with bilingual bios, ratings, memberSince).
- Seeded 14 vehicles with exact ids, plausible Cambodia-market prices/mileage, Phnom Penh/Kandal districts, mixed transmission/fuel/drivetrain (4WD used for pickups/Fortuner per spec), import origins, vinLast6/plateNo/ownershipCount/accidentDeclared; createdAt spread 2-54 days ago in spec order (newest-sort friendly); views 260-2140. Statuses: 12 PUBLISHED, accent SOLD (3 images), cx5 PENDING_REVIEW. Featured: prado, lexus, crv, vellfire. Camry EN description includes the literal phrase "urgent sale this week" for listing-risk detection demo.
- Seeded 55 vehicle images (14 slugs, 4 each; accent 3) + 34 vehicle documents per spec matrix (VERIFIED/PROVIDED/MISSING + notes).
- Pre-generated 2 COMPLETE VehicleHistoryReports (veh_prado_2018 conf 78, veh_lexus_rx350 conf 62) with checksJson = JSON array of exact ReportCheck shape (area/title/titleKm/status/detail/detailKm/source/confidence 0-1), all 10 areas each, bilingual details; accident checks worded per spec (Prado: NOT_VERIFIED "declaration only, not independent verification"; Lexus: EVIDENCE_FOUND "Seller declares minor rear-bumper damage; ask for repair documentation."). limitationsJson = array of {en,km} with the 3 mandated limitations + 1 extra (data-at-generation-time).
- Seeded conv_demo_1 (buyer usr_demo_buyer ↔ Lexus RX 350, seller usr_dealer_sokha) with system safety tip + 2 bilingual messages at 47h/26h/20h ago; conversation.updatedAt = last message.
- Seeded 2 favorites for demo buyer (prado, vellfire) and 3 AuditLog entries (LISTING_PUBLISHED, REPORT_GENERATED, SEED_DATABASE).
- Wrote prisma/verify-seed.ts helper; ran `bun prisma/seed.ts` then verification twice (fixed camry phrase casing to exact "urgent sale this week" and reseeded).

Stage Summary:
- Seed runs cleanly via `bun prisma/seed.ts` (re-runnable). Row counts: users 6, sellerProfiles 4, vehicles 14, vehicleImages 55, vehicleDocuments 34, vehicleHistoryReports 2 (COMPLETE, 10 checks each), favorites 2, conversations 1, messages 3, auditLogs 3, reportedContent 0.
- Verified: statuses 12 PUBLISHED / 1 SOLD / 1 PENDING_REVIEW; all image URLs come only from seed-images.json; conv_demo_1 has 3 messages; report JSON shapes match src/lib/types.ts (checks array of ReportCheck, limitations array of {en,km}).
- API agent (Task 3) can reference exact ids: usr_demo_buyer, usr_dealer_sokha, veh_prado_2018, veh_lexus_rx350, conv_demo_1, etc.

---
Task ID: 3
Agent: full-stack-developer (API)
Task: Backend REST API routes for KhLan MVP

Work Log:
- Read worklog, PLAN.md §11, prisma/schema.prisma, src/lib/types.ts (canonical DTOs imported everywhere; never redefined).
- Created src/lib/session.ts — getDemoUser(): resolves demo buyer by id `usr_demo_buyer` → phone `+85511998877` → creates it (BUYER, locale km, phoneVerified) + auto-creates a PRIVATE SellerProfile. Verified live: demo user + private profile were auto-created on first POST.
- Created src/lib/api/mappers.ts — shared toCardDTO / toDetailDTO / toSellerSummary / toSellerFullDTO + vehicleCardInclude (images, documents, seller+profile, reports select) so every route emits identical shapes. VehicleCardDTO.createdAt is ISO; images sorted by sortOrder; trust.docsProvided counts PROVIDED|VERIFIED docs; trust.reportAvailable = has COMPLETE report.
- Created src/lib/report/engine.ts — deterministic 10-check rules engine (identity, registration, import, mileage, price, service, photos, ownership, accident, listing) with EXACT statuses/details/confidences/sources per spec, all details bilingual (EN + natural Khmer), bilingual area titles, price check uses market comparables (same bodyType, |Δyear|≤2, median, ratio 0.75–1.3 band), listing scan for 7 scam phrases (EN+KM, case-insensitive), photos duplicate-URL detection, overallConfidence = round(100 × mean(status weights: VERIFIED 1 / EVIDENCE_FOUND 0.7 / NOT_VERIFIED 0.4 / NO_DATA 0.2 / INCONSISTENT 0)). Exports REPORT_LIMITATIONS (3 bilingual items per seed spec).
- Created src/lib/report/summarizer.ts — summarizeReport(): z-ai-web-dev-sdk chat completion (thinking disabled), 30s Promise.race timeout, defensive JSON parse (strip ``` fences, slice first { … last }), falls back to deterministic bilingual template (status counts + top-3 NO_DATA/INCONSISTENT areas) on any failure.
- Routes (all with `export const dynamic = "force-dynamic"`, zod-validated bodies, `{ error }` JSON errors):
  - GET /api/meta (distinct makes/cities from PUBLISHED + aggregates; defaults 1000/100000/2000/2025 when empty)
  - GET /api/vehicles (11 filters incl. sellerType/sellerVerified via seller.sellerProfile; q case-insensitive in JS because SQLite+Prisma `contains` is case-sensitive; 5 sorts; limit default 12 max 48; 0-based page cursor; total ignores pagination) + POST /api/vehicles (zod, status PUBLISHED, featured false, VehicleImage rows with sortOrder index → { vehicle: { id } } 201)
  - GET /api/vehicles/[id] (view increment, documents, sellerFull, latest COMPLETE report ref, ≤4 similar by bodyType|make; 404 for missing/DRAFT/REJECTED)
  - GET+POST /api/vehicles/[id]/report (GET latest COMPLETE → ReportDTO|null; POST regenerates: delete previous → engine → LLM summary → save COMPLETE with requestedBy=demo user)
  - GET/POST/DELETE /api/favorites (upsert / deleteMany by ?vehicleId=, 404 unknown vehicle)
  - GET+POST /api/conversations (find-or-create per buyer+vehicle; system safety-tip message on create; buyer message; ONE canned seller auto-reply → { conversationId } 201; list with thumbnail/shopName/lastMessage)
  - GET /api/conversations/[id] (404 unless owned by demo buyer; messages asc, isMine flags) + POST .../messages (ownership check; canned seller reply only while seller messages < 2; conversation updatedAt touched)
  - POST /api/reports/abuse (zod reason enum → ReportedContent + AuditLog CONTENT_REPORTED with metaJson → { ok: true } 201)
  - GET /api/sellers/[id] (user+profile 404 if none; listings = PUBLISHED+SOLD newest-first as VehicleCardDTO)
- Tested on running dev server (hot reload): meta, list+filters (make/bodyType/sellerVerified/q lowercase), pagination cursor, detail (views increment + similar + report ref), favorites POST/DELETE, conversations POST→detail→messages POST, abuse POST, vehicle POST (201 + validation 400), seller pages (dealer + private + 404).
- LLM report confirmed: POST /api/vehicles/veh_lexus_rx350/report → COMPLETE, 10 checks (identity NOT_VERIFIED, registration/import/mileage/photos/ownership/accident/listing EVIDENCE_FOUND, price NO_DATA, service NO_DATA), overallConfidence 57, real LLM bilingual summary (~5s), 3 limitations; regeneration returns a new report id with old ones deleted.
- Housekeeping: my API-test vehicle (fake example.com images) deleted; accidentally-matched seeded veh_cx5_2019 (PENDING_REVIEW) restored 1:1 from seed.ts (fields, 4 cx5 images, 2 docs, createdAt 54d ago). DB back to seeded state (12 PUBLISHED + 1 PENDING_REVIEW + 1 SOLD).
- `bun run lint` exit 0; `tsc --noEmit` clean for all my files (remaining errors are pre-existing in examples/, skills/, prisma/seed.ts — not touched).

Stage Summary:
- 12 endpoints live under /api: meta, vehicles (GET/POST), vehicles/[id], vehicles/[id]/report (GET/POST), favorites (GET/POST/DELETE), conversations (GET/POST), conversations/[id], conversations/[id]/messages, reports/abuse, sellers/[id]. Item 7 (/view) intentionally skipped — views increment inside detail GET.
- Report pipeline: rules engine → LLM bilingual summary (30s timeout, deterministic fallback) → VehicleHistoryReport COMPLETE. Statuses never fabricated: VERIFIED only from platform-verified docs; NO_DATA never implies "no problem"; 3 canonical bilingual limitations always attached.
- Deviations: (1) q filter applied in JS post-fetch (SQLite lacks Prisma case-insensitive contains) — fine at MVP scale, DB-level structured filters + total count preserved; (2) engine takes optional 4th `comparables` arg (route loads them per spec step a; engine self-queries if omitted); (3) no-report GET returns { report: null } 200; report POST returns 200 (replacement semantics, old reports deleted); (4) DRAFT/REJECTED hidden from detail + report routes; other statuses visible.
- Next: frontend (main agent) can consume these DTOs as-is from src/lib/types.ts.

---
Task ID: 4, 6
Agent: Main orchestrator (Z.ai Code)
Task: Frontend SPA build + browser verification

Work Log:
- Built single-route SPA (src/app/page.tsx) with state-driven views: home, browse, detail, report, sell, messages, favorites, seller storefront, compare — per sandbox constraint (only / route is user-visible).
- i18n: full KH/EN dictionary (src/lib/i18n.ts), Kantumruy Pro (Khmer) + Inter fonts in layout.tsx, .font-khmer class with 1.75 line-height for Khmer diacritics; language toggle switches document lang + all UI strings.
- Components: Header (sticky, search, badges), Footer (mt-auto sticky), MobileNav (fixed bottom bar + floating compare pill), VehicleCard (favorite/compare toggles), StatusBadge + 5-status legend, ContactDialog, 9 view files.
- Report view: SVG confidence ring, bilingual summary, 5-status legend, 10 evidence checks with source + confidence bars, limitations panel, dispute button.
- Sell flow: 3-step form (details → photos/condition → price/contact) with per-step validation, sample photo picker, POST /api/vehicles → navigates to new detail page.
- Fixed 3 lint errors (refs-in-render, setState-in-effect ×2, missing icon import); final lint: 0 errors 0 warnings.
- Agent-browser E2E verification: home render ✓, card grid with real photos ✓, Prado detail ✓, seeded AI report (78%, honest summary) ✓, KH toggle renders Kantumruy Pro correctly ✓, browse SUV filter (5 cars) ✓, contact seller → thread + auto-reply ✓, 3-step publish → new listing detail ✓, live AI report generation on new listing (40% confidence, NO_DATA statuses, honest LLM summary, 23.8s incl. LLM) ✓, favorites/compare ✓, mobile 390px layout + bottom nav ✓, footer sticks at viewport bottom on long pages and pushes naturally on short ones ✓, zero console/page errors, dev.log clean (all 200/201).

Stage Summary:
- KhLan MVP is fully functional and browser-verified end-to-end.
- Key files: src/app/page.tsx, src/app/layout.tsx, src/components/marketplace/**, src/lib/{types,i18n,format,store,client-hooks}.ts.
- Demo persona: buyer "Dara" (usr_demo_buyer); seeded inventory 14 vehicles, 2 dealers, 2 reports.

---
Task ID: fix-hydration-001
Agent: Z.ai Code (main)
Task: Fix Next.js hydration mismatch error on <body> element

Work Log:
- Diagnosed error: Grammarly browser extension injected data-new-gr-c-s-check-loaded / data-gr-ext-installed attributes onto <body> before React hydration (not a code bug)
- Added suppressHydrationWarning to <body> in src/app/layout.tsx (html already had it), with explanatory comment
- Ran bun run lint — clean
- Verified via agent-browser: page loads, zero console errors, zero hydration warnings, content renders with live API data
- Verified mobile viewport 390x844: footer behaves correctly (pushed down naturally on long page, no gap/overlap)

Stage Summary:
- Hydration false-positives from browser extensions are now suppressed at <body> level only (does not mask real hydration errors deeper in the tree)
- No changes to app logic; layout.tsx is the only file touched

---
Task ID: 5-a
Agent: full-stack-developer (seed extension)
Task: Extend prisma/seed.ts with multi-tenant dashboard demo data (tenants, members, subscriptions, saved searches, appointments, platform settings)

Work Log:
- Read worklog.md (2-b, 3), prisma/schema.prisma (new models), src/lib/dashboard-types.ts (PlanDTO/SubscriptionDTO/AppointmentDTO contracts), prisma/seed.ts.
- Regenerated Prisma client (`bunx prisma generate`) to pick up new models; schema had already been pushed by orchestrator.
- Users: usr_admin role ADMIN→"SUPER_ADMIN", name→"Nita Meng"; added usr_staff_chan (+85511223344, Chan Rithy, DEALER, phoneVerified) and usr_staff_sophea (+85511556677, Sophea Tep, DEALER, phoneVerified) — no SellerProfiles for staff (staff don't sell personally).
- Split sellerProfile.createMany out of seedUsers into seedSellerProfiles so dealer profiles can reference tenants: usr_dealer_sokha profile → tenant_sokha, usr_dealer_ppauto profile → tenant_ppauto; private profiles stay tenantId null. All other profile data unchanged.
- seedTenants(): tenant_sokha "Sokha Motors Group" (slug sokha-motors, St. 271 Toul Kork, +85511777888, @sokhamotors, VERIFIED/verified, ACTIVE, bilingual bio) and tenant_ppauto "PP Auto Trust" (slug pp-auto-trust, Russian Blvd 110, +85512444555, PENDING/unverified, ACTIVE, short bilingual bio). TenantMembers: sokha OWNER + usr_staff_chan SALES_STAFF + usr_staff_sophea INVENTORY_MANAGER @ tenant_sokha; usr_dealer_ppauto OWNER @ tenant_ppauto. Subscriptions per PlanDTO tiers: tenant_sokha PRO MONTHLY $149, 50 listings, 10 featured, 8 seats, started 45d ago, period ends +15d; tenant_ppauto BASIC MONTHLY $49, 15/3/3, started 20d ago, ends +10d.
- Vehicles: seedVehicles now sets tenantId via TENANT_BY_SELLER map (usr_dealer_sokha→tenant_sokha 5 vehicles, usr_dealer_ppauto→tenant_ppauto 4 vehicles; 5 private vehicles stay null). Vehicle data rows untouched.
- seedDashboardData(): 2 SavedSearches for usr_demo_buyer ("SUVs under $30k" alerts on, queryJson {bodyType:SUV,priceMax:30000,sort:newest}; "Toyota latest" alerts off, {make:Toyota,sort:newest}); 3 Appointments (REQUESTED veh_prado_2018 +3d @10:00 notes "Want to inspect and test drive on weekend."; CONFIRMED veh_lexus_rx350 +2d @14:00 notes "Please prepare service records."; COMPLETED veh_crv_2019 6d ago notes null) each with buyerId usr_demo_buyer, sellerId/tenantId mirroring the vehicle's owner; PlatformSettings commissionPct "2.5", featuredListingPriceUsd "25", autoApproveListings "false", maintenanceMode "false" (valueJson = JSON.stringify of raw value).
- Audit logs: +2 entries — TENANT_CREATED (Tenant/tenant_sokha, actor usr_dealer_sokha, 46d ago) and SUBSCRIPTION_STARTED (entity Subscription with the real subscription id as entityId, metaJson plan PRO + billingCycle/priceUsd/tenantId, 45d ago). Updated SEED_DATABASE meta to users 8 / tenants 2 (was users 6).
- FK-safe wipe order extended: appointments → auditLog → messages → conversations → favorites → savedSearches → reports → documents → images → tenantMembers → subscriptions → vehicles → tenants → sellerProfiles → reportedContent → platformSettings → users.
- Ran `bun prisma/seed.ts` twice (idempotency confirmed) + throwaway verify script (37 assertions: ids, fields, tenant links, subscription windows, appointment hours, settings values, existing rows intact 14/55/34/2/2/1/3) — ALL PASSED; script deleted after verification.
- `bun run lint`: prisma/seed.ts clean. NOTE: one PRE-EXISTING error in src/lib/dashboard-types.ts:177 (empty interface TenantVehicleRowDTO extends VehicleCardDTO) — not touched per task rules (src/ off-limits); dashboard agents should drop the empty interface or add a member.

Stage Summary:
- Full reseed now yields: users 8, sellerProfiles 4, tenants 2, tenantMembers 4, subscriptions 2, vehicles 14 (5 sokha / 4 ppauto tenant-scoped), images 55, docs 34, reports 2, favorites 2, savedSearches 2, appointments 3, conversations 1, messages 3, platformSettings 4, auditLogs 5.
- New deterministic ids: tenant_sokha, tenant_ppauto, usr_staff_chan, usr_staff_sophea (+ appointments apt_demo_prado / apt_demo_lexus / apt_demo_crv for stable PATCH testing). MRR demo value: $149 + $49 = $198.
- Deviations: (1) sellerProfile creation split into its own function (same rows + tenantId); (2) fixed ids also given to the 3 appointments; (3) SEED_DATABASE audit meta counts updated to 8 users / 2 tenants; (4) SUBSCRIPTION_STARTED entityId = actual subscription cuid (fetched post-insert).
- Dashboard agents (5-b/5-c): use /api/tenant/* with usr_dealer_sokha (OWNER, PRO plan) or usr_staff_* for role-based UI; usr_admin is the SUPER_ADMIN; usr_demo_buyer owns saved searches + appointments.

---
Task ID: 5-b
Agent: full-stack-developer (APIs) — completed by main orchestrator after tool-timeout
Task: Session/persona APIs + Super Admin / Tenant / Account dashboard APIs + advanced vehicle filters

Work Log:
- NOTE: agent's final report + worklog append were lost to a Task-tool timeout, but file work was ~complete. Orchestrator audited every route file, fixed one truncated artifact, and verified everything below via curl.
- src/lib/session.ts: added getCurrentUser() (cookie `khlan_persona` → validated against 8 ALLOWED_PERSONA_IDS → fallback getDemoUser) + GET/POST /api/session (SessionDTO with bilingual PersonaDTO list; POST sets 1y cookie, 400 on unknown id).
- Migrated buyer-flow routes (favorites, conversations, conversations/[id], messages, reports/abuse) from getDemoUser to getCurrentUser. Conversation access relaxed: buyer OR ACTIVE member of the vehicle's tenant; canned seller auto-reply only for buyer senders.
- src/lib/api/guards.ts: HttpError + toErrorResponse + requireAdmin() + requireTenantMember() + canWriteTenant/canManageTenant + parseMetaJson. src/lib/api/plans.ts: FREE/BASIC/PRO/ENTERPRISE catalog (0/49/149/399 monthly; yearly = 10×; bilingual features).
- Admin: overview (KPIs incl mrrUsd=198, 6-week signupTrend, topTenants, recentAudit), tenants list + PATCH (verification/status + audit), vehicles queue (status/q filters, sellerName) + PATCH (approve/reject/feature + audit), users list + PATCH role (+audit), ai stats (per-check statusBreakdown across checksJson), settings GET/PUT (PlatformSetting KV), audit list.
- Tenant: me (tenant+myRole+subscription+members+4 plans+8 stats), profile PATCH, inventory GET (all statuses)/PATCH (status/price/featured with subscription featuredLimit enforcement), leads, appointments GET/PATCH, staff GET/POST (phone upsert, cross-tenant rejection, owner protection)/PATCH.
- Account: overview (counts + recentReports), saved-searches GET/POST(≤20)/DELETE/run (shared filter builder), appointments GET/POST (future date, PUBLISHED vehicles, duplicate-active guard)/PATCH cancel.
- src/lib/api/vehicle-filters.ts: shared where-builder; GET /api/vehicles extended backward-compatibly with multi-value fuel/transmission/drivetrain/bodyType (CSV), condition, featured, hasReport, mileageMin, yearMax.
- Orchestrator fixes: recreated truncated src/app/api/tenant/staff/[memberId]/route.ts (PATCH: role/status, blocks OWNER edits, audit logs) after the agent's write was cut off mid-file.
- curl-verified: persona switch (admin sees admin APIs; buyer 403), overview mrrUsd 198, tenants (PRO 149 VERIFIED / BASIC 49 PENDING), pending queue (CX-5), ai avgConfidence 70, settings PUT, tenant me/inventory(5)/leads(1)/appointments(2)/staff, subscription plans, account overview, saved-search run (SUV<30k → 2), appointments POST guard, vehicles: fuel=DIESEL,HYBRID→6, hasReport→2, featured→4, AWD/4WD+price+year combo→1.
- Cleaned test residue: deleted 2 test users ("Test Staff", "PP Owner") + memberships; DB back to seeded state (users 8).

Stage Summary:
- 30 new endpoints live: /api/session (GET/POST), /api/admin/* (overview, tenants, tenants/[id], vehicles, vehicles/[id], users, users/[id], ai, settings, audit), /api/tenant/* (me, profile, inventory, inventory/[id], leads, appointments, appointments/[id], staff, staff/[memberId], subscription GET/POST), /api/account/* (overview, saved-searches CRUD+run, appointments CRUD).
- Enhanced /api/vehicles fully backward compatible. Role matrix enforced server-side (SALES_STAFF read-only; INVENTORY_MANAGER no staff/subscription; OWNER/MANAGER full; admin-only platform APIs).

---
Task ID: 5-c
Agent: full-stack-developer (frontend) — completed by main orchestrator after tool-timeout
Task: Role-aware dashboard SPA (Admin/Dealer/Customer), persona switcher, advanced filters, test-drive appointments

Work Log:
- NOTE: agent's final report + worklog append were lost to a Task-tool timeout; orchestrator verified the built UI end-to-end via agent-browser and fixed one defect.
- src/lib/store.ts: View + {name:"dashboard",tab?}; session state me/setMe. page.tsx: SessionBoot + DashboardView routing.
- Dashboard components (src/components/marketplace/dashboard/): shell.tsx (sidebar md+ / scrollable tab bar mobile), bits.tsx (StatCard/EmptyState/MiniBarChart/ConfidenceRing shared), admin-dashboard.tsx (7 tabs: Overview KPIs+trend+top dealers, Dealers verify/suspend, Listings moderation queue with Approve/Reject/Feature, Users role change, AI reports stats+ring, Settings form, Audit log), dealer-dashboard.tsx (7 tabs: Overview+plan usage, Inventory actions Publish/Sold/Archive/Feature/Edit price, Leads open-chat, Appointments confirm/complete/cancel, Staff invite+role+suspend, Subscription plan cards monthly/yearly switch, Settings profile form), customer-dashboard.tsx (5 tabs: Overview stat cards+upcoming appointment, Favorites grid, Saved searches run-in-dialog/delete, Appointments cancel, My reports with confidence rings), dashboard-view.tsx (role router SUPER_ADMIN→admin, tenant→dealer, else customer).
- header.tsx: PersonaMenu dropdown (8 demo personas, bilingual labels, sessionStorage toast after reload) + Dashboard button. mobile-nav.tsx: Dashboard entry. i18n.ts: dashboard key section EN+KM.
- browse-view.tsx: Advanced filters panel (price/year/mileage ranges, fuel/transmission/drivetrain/bodyType multi-checkbox, condition, verified/featured/hasReport toggles), active-filter chips with remove + clear-all, Save search dialog (POST saved-searches with current params), multi-value CSV serialization.
- detail-view.tsx: Request test drive dialog (datetime-local min now+1h, notes) → POST /api/account/appointments with duplicate-guard error toast.
- Orchestrator fixes: header mobile overflow (439px→390px at 390vw) — Sell button icon-only on mobile (removed duplicated always-visible span), compact LangToggle, persona trigger chevron hidden <sm.
- agent-browser E2E: persona switch buyer→admin→dealer→buyer all reload + header updates; Admin dashboard 7 tabs + tenants actions + moderation queue (CX-5 pending); Dealer dashboard 7 tabs + inventory rows + staff management; Customer dashboard tabs + saved search "Run" dialog (2 matching SUVs); advanced filters applied (Diesel+Hybrid, year≥2017) with chips + correct results; Save search E2E (toast + API shows {fuel:"DIESEL,HYBRID", yearMin:2017}); KH locale renders (រុករកឡាន); mobile 390px + desktop 1280px zero horizontal overflow on home/browse/dashboard; footer sticky OK; zero console/page errors.
- Cleanup: E2E-created saved search deleted; DB returned to seeded state.

Stage Summary:
- Dashboard architecture shipped on the single-route SPA: role-aware shells for Super Admin (platform control), Tenant/Dealer (company ops), Customer (favorites/saved searches/appointments/reports) + role-based staff access via persona switcher.
- Advanced vehicle filtering + save-search round-trip complete. All strings bilingual EN/KM. lint 0 errors; tsc clean; dev.log clean.
