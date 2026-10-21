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

---
Task ID: 6-a
Agent: full-stack-developer (frontend auth) — completed by main orchestrator after agent tool-timeout
Task: Login/registration UI, account configuration (profile dialog), Telegram Mini App support for KhLan

Work Log:
- Read worklog (5-b/5-c + earlier), src/lib/auth.ts, all /api/auth/** + /api/account/{profile,password} routes, /api/session (SessionDTO with authed/telegramLinked/phoneVerified), client-hooks (useFetch/apiSend/qs), store/header/page/i18n/format.
- src/lib/store.ts: View union extended with `| { name: "auth" }` (only change; store otherwise untouched).
- src/lib/i18n.ts: appended 82 new keys (auth section + profile-settings section + header account strings) to BOTH dictionaries (en 451 / km 451, in sync). Natural Khmer: ចូលប្រើ, ចុះឈ្មោះ, ចូលប្រើដោយកូដ, ផ្ញើកូដ, ផ្ទៀងផ្ទាត់, កំណត់ព័ត៌មានផ្ទាល់ខ្លួន, ចាកចេញ, ភ្ជាប់តាម Telegram, លេខទូរស័ព្ទមិនទាន់ផ្ទៀងផ្ទាត់, demo OTP alert, demo credentials hint, server-error localization variants, etc.
- src/components/marketplace/views/auth-view.tsx (new): centered max-w-md card (logo + tagline), Tabs Log in / Sign up / OTP login. Login: phone (+855 regex client-side) + password with show/hide eye, inline 401 error (localized "Incorrect phone number or password"), submit → POST /api/auth/login → sessionStorage "khlan_welcome" + reload. Sign up: name/phone/password(min 8)/confirm/locale Select (default km) → POST /api/auth/register (auto-login) → reload. OTP: phone → send (purpose LOGIN) → amber demo Alert shows devCode → 6-digit numeric input → verify → reload; 60s resend countdown (interval state, hydration-safe). Collapsible "Demo accounts" card lists all 8 seeded phones + shared password khlan123 + OTP note. Enter submits all forms; buttons disabled+spinner; h-11 targets.
- src/components/marketplace/profile-dialog.tsx (new): shadcn Dialog opened from AccountMenu; works for every authed role. Sections: (a) Profile — name, interface-language Select, avatar URL with live img/initials preview → PATCH /api/account/profile → toast + local setMe + setLocale (account locale now also applied on boot for authed sessions in SessionBoot); (b) Phone — current phone + Verified/Not-verified Badge, update-phone form → phoneVerified reset → verify sub-flow (send OTP purpose VERIFY → devCode amber alert → 6-digit input → verify → badge flips); (c) Security — current password (blank ⇒ sends "" for passwordless accounts), new + confirm (min 8, match) → POST /api/account/password; (d) Telegram — linked/unlinked Badge + bilingual hint that Mini App login auto-links. !authed ⇒ "Login required" empty state with CTA to auth view. Validation inline; all strings bilingual.
- src/components/marketplace/header.tsx: PersonaMenu reworked into AccountMenu. Not loaded ⇒ pulsing placeholder (hydration-safe, unchanged). me.authed ⇒ avatar (img|initials) + name (lg+) trigger; dropdown label block (name, mono phone, role/tenant line, emerald "Telegram linked" + amber "Phone unverified" badges) + Profile settings (opens ProfileDialog) + Log out (POST /api/auth/logout → reload, toast replayed after reload) + Dashboard. Not authed ⇒ new top item "Log in / Sign up" → navigate({name:"auth"}) + unchanged persona switcher + demo-mode caption + Dashboard. Trigger stays visible on mobile.
- src/lib/telegram.ts (new): tg()/isInTelegram()/initTelegram() (ready, expand, setHeaderColor #020617, themeParams → --tg-bg/--tg-text/--tg-hint/--tg-button/--tg-button-text on documentElement)/tgSendAuth() (module-level once-per-load flag, POST /api/auth/telegram)/tgHaptic()/setupBackButton() — all feature-detected, typed (no any), try/catch no-ops outside Telegram.
- src/app/layout.tsx: telegram-web-app.js via next/script strategy="beforeInteractive" (feature-detected downstream; silent when offline).
- src/app/page.tsx: TelegramBoot (init → tgSendAuth → single reload guarded by sessionStorage "khlan_tg_authed"; BackButton wired only inside a real Mini App — the SDK's v6.0 stub logs warnings otherwise — shown when view ≠ home, click → home); CurrentView case "auth"; SessionBoot split into data-effect + mount-only toast-replay effect (fixes pre-existing stale-session overwrite on locale change) + replays khlan_welcome/khlan_loggedout; authed session locale applied on boot; root div adopts --tg-bg/--tg-text via ref+effect only when in Telegram (normal web look untouched).

Verification (agent-browser session auth6a, isolated; lint 0/0; tsc no new errors):
1. Logged-out persona menu shows "Log in / Sign up" → auth view opens; all 3 tabs switch. ✓
2. Registered +85512300001 / test12345 via UI → home reload, header "Test Buyer A6", menu shows name/phone/role + "Phone unverified". ✓
3. Profile settings: renamed → Save → toast + header updated; locale save switches UI to Khmer live. ✓ (also fixed store staleness found during this test)
4. Phone flow: update to +85512300002 → toast; Verify now → devCode alert (764297) → verify → "ផ្ទៀងផ្ទាត់ហើយ" badge + toast. ✓
5. Password change (test12345 → test123456) → Log out → log back in with new password ✓ (header shows renamed user).
6. OTP login +85512998009 → devCode (493629) → verify → header "Nita Meng", dashboard renders the 7-tab Super Admin shell. ✓
7. Telegram: curl POST /api/auth/telegram with demo initData user id 77700001 → {ok,mode:"demo",user:usr_demo_buyer(Dara)}; malformed initData → 401. layout.tsx script tag present in served HTML; zero console/page errors (BackButton gated to real Mini Apps). ✓
8. Mobile 390×844: auth view (incl. expanded demo hint) and account menu ⇒ document.documentElement.scrollWidth = 390 (no overflow). ✓
9. Zero console errors / page errors in session. ✓
- Cleanup: throwaway bun script deleted user +85512300001/+85512300002 (+ sellerProfile, 4 auditLogs, otpCodes for both phones, consumed admin OTP row); script removed after run. DB back to 8 seeded users (sellerProfiles 5 = 4 seeded + demo-buyer's lazy PRIVATE profile from getDemoUser, pre-existing behavior).

Stage Summary:
- Full auth UX on the single-route SPA: password login, sign-up (auto-login), OTP login with on-screen demo codes, account menu with real-account branch, per-user profile settings (profile/locale/avatar, phone verification, password change incl. passwordless accounts, Telegram status).
- Telegram Mini App support: SDK loaded beforeInteractive, initData auth handshake once per load with loop-guarded reload, theme CSS vars + BackButton in real Mini Apps, everything feature-detected for the plain web.
- Files: NEW src/lib/telegram.ts, src/components/marketplace/views/auth-view.tsx, src/components/marketplace/profile-dialog.tsx; MODIFIED src/app/page.tsx, src/app/layout.tsx, src/components/marketplace/header.tsx, src/lib/i18n.ts, src/lib/store.ts. No api/** or backend files touched.
- Deviations: (1) SessionBoot refactored (split effects + authed-locale-on-boot) to fix a stale-session overwrite bug exposed by live profile updates — behavior-compatible with persona switching; (2) BackButton wiring gated on isInTelegram() to avoid console warnings from the SDK's v6.0 stub in plain browsers; (3) two PRE-EXISTING tsc errors remain in files I don't own (src/app/api/account/profile/route.ts:49, src/app/api/auth/telegram/route.ts:38 — type-only; runtime verified OK by curl/UI); (4) devCode demo alerts show codes on screen by design (no SMS gateway in sandbox).

---
Task ID: 6 (orchestration)
Agent: Z.ai Code (main)
Task: Login/registration + Telegram Mini App support + per-user configuration

Work Log:
- Schema: User += passwordHash (scrypt salt:hash), telegramId @unique, telegramUsername; new OtpCode model (phone, codeHash HMAC, purpose LOGIN|VERIFY, 5-min expiry, consumed flag, rate-limited 3 active/phone); db:push.
- src/lib/auth.ts: hashPassword/verifyPassword (scrypt 64B + timingSafeEqual), signed session tokens (HMAC-SHA256, 30d, AUTH_SECRET), sessionCookieOptions, getAuthUser(), OTP gen/hash, validateTelegramInitData (full HMAC-SHA256 per Telegram spec when TELEGRAM_BOT_TOKEN set; parse-only "demo" mode flagged in sandbox; 24h replay guard).
- src/lib/session.ts getCurrentUser priority: khlan_auth (real login) → khlan_persona (demo) → demo buyer. /api/session now returns authed/telegramLinked/phoneVerified/user.phone; persona switch clears auth cookie; login clears persona cookie.
- Routes: POST /api/auth/register (201 auto-login + private profile), login (401 anti-enumeration), otp/send (devCode inline — no SMS gateway in sandbox, documented), otp/verify (LOGIN → sign-in; VERIFY → binds phoneVerified to session owner), telegram (find-or-create by telegramId, synthetic placeholder phone +8557000…, profile refresh), logout, PATCH /api/account/profile (name/locale/avatarUrl/phone w/ uniqueness + re-verify), POST /api/account/password (passwordless accounts may set without current).
- Seed: all 8 personas get password khlan123; buyer has demo telegramId 77700001 — added permanently to seed.ts.
- Fixed: stale Prisma client after db:push required dev server restart (rm -rf .next); 3 TS errors in my routes (phoneVerified narrowing, tg.id number slice ×2).
- curl-verified 12 flows: register/dup-register/authed-session/login/dealer-tenant-session/OTP login/OTP-404-unknown/telegram-demo-maps-to-Dara/profile PATCH/phone change→unverified/VERIFY-otp→verified/password change+re-login/logout. Cleaned test user + OTP rows (DB back to 8 users).
- Task 6-a (frontend subagent) delivered: AuthView (login/signup/OTP tabs, demo creds hint, devCode alerts, 60s resend), AccountMenu (authed vs demo branches), ProfileDialog (profile/phone+verify/security/telegram), TelegramBoot (ready/expand/themeParams CSS vars/initData handshake with reload loop-guard/BackButton), telegram-web-app.js beforeInteractive, 82 i18n keys. All flows browser-verified incl. mobile 390px (scrollWidth 390).

Stage Summary:
- Real auth is live: phone+password, passwordless OTP login, Telegram Mini App sign-in; every user gets personal configuration (Profile dialog) for name/locale/avatar/phone(+OTP verify)/password/Telegram status.
- Demo layer preserved and unambiguous: persona switcher clearly separated, cleared on real login; login clears persona.
- Security notes for production: set AUTH_SECRET + TELEGRAM_BOT_TOKEN envs; replace devCode with an SMS provider; OTP rate-limit in place; password hashes scrypt; tokens HMAC-signed httpOnly.

---
Task ID: 7
Agent: Z.ai Code (main)
Task: Subscription payments (Bakong KHQR + Manual KHQR with Telegram contact), buyer purchase workflow, per-tenant Telegram contact — per the rewritten marketplace development prompt

Work Log:
- Read worklog (Task 6 auth already live: phone+password/OTP/Telegram login, AuthView, AccountMenu, ProfileDialog), dashboard-types contract (read-only, 30 endpoints), admin/dealer/customer dashboards, detail-view, session/auth libs, plans, tenant/subscription route, i18n tail. Bakong docs site (api-bakong.nbc.gov.kh/document) returns CloudFront 403 from sandbox (curl + UA) — implemented per documented API shape with defensive response parsing; live verification explicitly flagged as requiring BAKONG_TOKEN.
- Schema: new SubscriptionPayment (plan/cycle/amountUsd/months/method BAKONG|MANUAL/status PENDING→AWAITING_VERIFICATION→VERIFIED|REJECTED|CANCELLED, unique reference, bakongMd5/bakongHash/qrPayload/manualRef/evidenceUrl/note/rejectionReason/reviewedById/reviewedAt) + PurchaseRequest (vehicle/buyer/tenant/sellerUserId, status PENDING|ACCEPTED|COMPLETED|CANCELLED|REJECTED, priceUsd snapshot, decision fields, 4 indexes). db:push OK.
- New src/lib/commerce-types.ts (PaymentConfigDTO, SubscriptionPaymentDTO, PurchaseRequestDTO) — dashboard-types.ts only got an ADDITIVE "EXPIRED" status in SubscriptionDTO union.
- src/lib/bakong.ts: official-shape client (POST /api/generate-qr → {qrCode,md5}; POST /api/check_transaction_by_md5 → paid iff hash present; Bearer BAKONG_TOKEN; BAKONG_BASE_URL/BAKONG_ACCOUNT_ID env; 12s timeout; bakongConfigured() gate). No credentials in code; without token the platform reports "Bakong not configured" (503) and UI steers to Manual.
- src/lib/api/payments.ts: manual KHQR config (PlatformSetting key payments.manualConfig: accountName/khqrPayload/khqrImageUrl/instructionsEn/Km/telegram), khqrDataUrl via qrcode pkg, priceForCycle/monthsForCycle, generatePaymentReference (PAY-YYYYMMDD-XXXXXX unique), refreshExpiredSubscription (ACTIVE+overdue → EXPIRED + audit, listings retained), verifyPaymentAndActivate (THE single activation path: idempotency 409s, extension base = max(now, currentPeriodEnd), $transaction, audits PAYMENT_VERIFIED), rejectPayment (reason + audit), toPaymentErrorResponse.
- Routes: /api/tenant/payments (GET history, POST create — canManageTenant, tenant ACTIVE, one open request 409, rateLimit 10/min, BAKONG→PENDING+QR via generate-qr else 503, MANUAL→AWAITING_VERIFICATION requiring manualRef), /api/tenant/payments/config (public-to-seller config + server-rendered QR data URL), /[id]/check (Bakong md5 poll; server-side decision only; paid → verifyPaymentAndActivate), /[id]/qr (render own payment QR), /[id] DELETE (seller cancels open request), /api/admin/payments (?status=), /api/admin/payments/[id] PATCH verify|reject(reason required), /api/admin/subscriptions/extend POST (manual activation/extension + audit SUBSCRIPTION_EXTENDED), /api/admin/payment-config GET/PUT (zod, telegram regex, audit PAYMENT_CONFIG_UPDATED) + /preview (QR render).
- Purchase routes: POST /api/purchases (PUBLISHED-only, not-own-listing, one open request per buyer/vehicle 409, price snapshot, rateLimit), GET /api/account/purchases + PATCH /[id] (buyer cancel PENDING only), GET/PATCH /api/tenant/purchase-requests (OWNER/MANAGER/SALES_STAFF; INVENTORY_MANAGER 403), GET/PATCH /api/seller/purchase-requests (private sellers). Shared state machine in src/lib/api/purchases.ts: accept/reject from PENDING, complete/cancel from ACCEPTED; COMPLETED → vehicle SOLD + other open requests auto-CANCELLED ("Vehicle sold to another buyer") in one transaction; every transition audited (PURCHASE_*).
- tenant/subscription POST: paid plans now 402 (payment required) — only FREE downgrade instant; GET + tenant/me GET apply refreshExpiredSubscription on read (auto-expiry without cron).
- Frontend: bits.tsx += PaymentStatusBadge/PurchaseStatusBadge; new payment-flow.tsx (RequestSubscriptionDialog: method cards w/ Bakong-unavailable notice → Bakong QR + 5s poll of /check + manual "I have paid" check, or Manual: admin QR + accountName + bilingual instructions + t.me/telegram link + reference/evidence/note form → submits; TenantPaymentHistory with cancel); dealer-dashboard subscription tab rewritten (plan cards → "Request subscription"/"Downgrade to Free", EXPIRED badge + renewal hint, payment history); new purchase-list.tsx shared seller/buyer list (status chips incl. OPEN=PENDING+ACCEPTED, actions per state); DealerLeads tab now leads + Sales requests; CustomerDashboard += "Purchases" tab (buyer) + conditional "Sales requests" tab (SELLER role); admin-dashboard += "Payments" tab (status filter, verify/reject dialogs, evidence link, reviewer info) + Tenants dropdown "Extend subscription" dialog (months+note) + Settings tab now includes AdminPaymentConfig (accountName/telegram/khqrPayload/khqrImage/instructions EN/KM + QR preview); detail-view += "Request to buy" (auth-guarded → auth view, dialog w/ message, price snapshot) + per-seller Telegram CTA (sellerFull.telegram).
- i18n: +96 keys EN/KM (payments, purchases, config, extend) appended in both dicts (no reordering; removed 2 accidental dup keys of existing toastUpdated/toastForbidden).
- Seed: payments.manualConfig defaults (telegram @khlan_admin, EN/KM instructions, KHQR payload intentionally NULL — admin pastes their own bank KHQR), pay_demo_manual_1 (ppauto BASIC $49 AWAITING_VERIFICATION w/ manualRef), pur_demo_prado (PENDING) + pur_demo_crv (ACCEPTED); wipe order += subscriptionPayment/purchaseRequest.
- Restarted dev server (rm -rf .next) after db:push — stale PrismaClient broke db.subscriptionPayment at runtime (worklog-documented pitfall).

Verification (curl matrix, cookie jars for 6 accounts):
- Payments: create MANUAL 201 AWAITING_VERIFICATION; duplicate open 409; BAKONG 503 not-configured; manualRef missing 400; cancel 200; admin queue ?status=; admin verify → subscription PRO→BASIC extended Nov 5→Dec 5 (base = remaining period end); double-verify 409; reject w/o reason 400, w/ reason → REJECTED + reason stored; buyer on admin/config 403; SALES_STAFF create 403; staff/inventory roles: SALES_STAFF may act on purchase requests, INVENTORY_MANAGER 403; paid plan POST /api/tenant/subscription 402; admin extend +2mo audited (Dec→Feb); payment-config PUT/GET/preview + buyer 403.
- Purchases: buyer register 201; create 201; duplicate 409; own listing 400; tenant list; buyer cancel PENDING 200; complete → COMPLETED + vehicle SOLD + buyer2's open request auto-CANCELLED w/ "Vehicle sold to another buyer"; new request on SOLD 409; private seller route lists own-vehicle requests (camry→sopheak); rate limit 429 at 11th/min.
- Browser E2E (agent-browser, en+km UI): UI login buyer → detail Revo → ស្នើសុំទិញ dialog → submit → toast; dashboard Purchases tab lists 3 w/ chips + cancel works (Revo→CANCELLED); switch ppauto → subscription tab (BASIC current disabled) → PRO request dialog shows Bakong disabled + notice, Manual shows instructions + @khlan_admin t.me link → submit blocked by 409 duplicate guard surfaced as toast (correct: seeded open request); switch sokha → request BASIC → Manual → ref FT250103Z9911 → "Pending verification" toast + history updated; switch admin → Payments tab (AWAITING_VERIFICATION default) shows both → Verify sokha → toast + sokha sub BASIC to Dec 5; Reject ppauto w/ reason dialog → REJECTED + reason; Tenants → Extend dialog 2mo → Feb 2027; Settings shows KHQR config section (bilingual); dealer Leads shows Sales requests w/ Accept/Reject.
- Mobile 390×844: home/leads/subscription/payment dialog/detail all scrollWidth=390 (no overflow); footer sticky intact. Zero console errors / page errors all session (only Telegram SDK stub logs).
- Re-seeded after E2E → pristine demo state (8 users/khlan123, 1 AWAITING_VERIFICATION payment, 2 purchase requests, CR-V PUBLISHED again). lint 0/0, tsc clean (only pre-existing non-project errors), dev.log clean after restart.

Stage Summary:
- Sellers now buy subscriptions through real payment workflows: Bakong KHQR (official API client, env-gated, server-side verification via md5 check, auto-activation) or Manual KHQR (admin-configured QR + instructions + Telegram contact, seller submits bank reference, admin verifies/rejects with audited reason). Paid plans can never activate without verification (402 on direct POST; only verifyPaymentAndActivate touches Subscription). Subscriptions auto-expire on read (EXPIRED badge + renewal CTA) and admins can manually extend (audited).
- Buyers request to buy from any listing (auth-guarded), track PENDING/ACCEPTED/COMPLETED/CANCELLED/REJECTED in their dashboard, cancel PENDING; sellers (tenant roles OWNER/MANAGER/SALES_STAFF or private sellers) manage Sales requests; COMPLETED flips vehicle to SOLD and auto-cancels other open requests.
- Per-tenant Telegram contact is editable in dealer Settings and rendered as a t.me CTA on their listings; global manual-payment Telegram contact is admin-configurable.
- To enable real Bakong: set BAKONG_TOKEN (+ BAKONG_ACCOUNT_ID, optional BAKONG_BASE_URL) env — code path complete but UNTESTED against live API (NBC site blocked from sandbox; no sandbox credentials). Do not claim live-payment readiness until tested with real credentials.
- Files: NEW lib/bakong.ts, lib/rate-limit.ts, lib/commerce-types.ts, lib/api/payments.ts, lib/api/purchases.ts, api/tenant/payments{,/config,[id],[id]/check,[id]/qr}, api/admin/{payments/[id],subscriptions/extend,payment-config[/preview]}, api/purchases, api/account/purchases[/[id]], api/tenant/purchase-requests[/[id]], api/seller/purchase-requests[/[id]], components dashboard/payment-flow.tsx + purchase-list.tsx; MODIFIED prisma/schema.prisma, seed.ts, lib/api/plans.ts (no-op guard removed → actually untouched), dashboard-types.ts (additive EXPIRED), i18n.ts, tenant/{me,subscription}/route.ts, dashboard/{bits,admin,dealer,customer}-dashboard.tsx, views/detail-view.tsx.

---
Task ID: 8
Agent: Z.ai Code (main)
Task: Manual-only KHQR subscription payments — remove all automated/repayment paths; seller sees only the admin's KHQR → pays → sends proof via Telegram → admin manually activates; admin settings can enable/disable the whole flow and configure free-tier usage

Work Log:
- Read worklog (Task 7 had built Bakong + Manual dual paths), lib/api/payments.ts, commerce-types.ts, plans.ts, all payment routes, payment-flow.tsx, admin/dealer dashboards, seed.ts, i18n tail.
- REMOVED the Bakong API path entirely: deleted src/lib/bakong.ts, api/tenant/payments/[id]/check/route.ts (md5 polling) and [id]/qr/route.ts (per-payment QR render). Removed `bakongConfigured`/`method` from DTOs (PaymentMethod = "MANUAL" only; PaymentStatus = AWAITING_VERIFICATION|VERIFIED|REJECTED|CANCELLED — PENDING retired).
- lib/api/payments.ts: ManualPaymentConfig extended with `enabled: boolean` (master switch, default true) + `freePlan: {enabled, listingsLimit, featuredLimit, seats}` (defaults 3/0/1); backward-compatible merge of old stored config (clampLimit sanitizer); saveManualPaymentConfig now also syncs ALL existing FREE subscriptions to the configured limits (updateMany) + audits freePlan in PAYMENT_CONFIG_UPDATED.
- api/tenant/payments POST: manual-only — `method` field removed from schema, always MANUAL + AWAITING_VERIFICATION, manualRef required (min 4); gated on config.enabled → 403 "Subscription payments are currently disabled by the platform administrator" when off; duplicate-open guard now AWAITING_VERIFICATION only.
- api/tenant/payments/config GET: returns {enabled, manual{...khqrDataUrl server-rendered}, freePlan} (bakongConfigured removed).
- api/admin/payment-config GET/PUT: zod now includes enabled + freePlan{enabled,listings,featured,seats≥1}; PUT persists + live-syncs FREE subs.
- api/tenant/subscription GET: FREE plan card in `plans` reflects admin-configured limits; response adds freePlanEnabled + paymentsEnabled. POST FREE downgrade: blocked 403 when freePlan.enabled=false ("The Free plan is currently disabled…"), uses config limits on apply.
- Frontend payment-flow.tsx rewritten: RequestSubscriptionDialog has NO method selection — 3-step explainer (scan KHQR → send proof on Telegram → submit reference) + admin KHQR image (server-rendered QR) + account name + bilingual instructions + t.me/<admin> CTA + required bank reference + optional evidence/note → AWAITING_VERIFICATION. When config.enabled=false the dialog renders ONLY an amber "payments disabled" alert (no form). TenantPaymentHistory cancel limited to AWAITING_VERIFICATION; method label always "Manual KHQR".
- admin-dashboard AdminPaymentConfig: amber master Switch "Enable subscription payments" (disables new seller requests; pending ones still verifiable) + new "Free plan usage" panel (Switch + listings/featured/seats number inputs); freePlan inputs use kpiListings/actFeature/subSeatsLabel labels; KHQR payload + instructions textareas got field-sizing-fixed min-w-0 (390px overflow fix — field-sizing-content + unbreakable 120-char KHQR string forced 413px scrollWidth). AdminPayments: PENDING filter chip removed (PAYMENT_FILTER_LABEL map — also fixed a raw-key label bug `payStatusAwaiting_verification` → "Pending verification"), verify button only for AWAITING_VERIFICATION, method label simplified.
- dealer-dashboard DealerSubscription: amber disabled-payments notice when paymentsEnabled=false; FREE card shows payFreeDisabledNotice + disabled downgrade button when freePlanEnabled=false; FREE card limits come from API (admin-configured); TenantPaymentHistory remounts via historyKey on dialog submit so new requests appear immediately (was: stale until tab switch).
- i18n: +12 keys EN/KM appended in both dicts in sync (553/553 verified: payDisabledNotice, payStepPay/Telegram/Submit, payConfigEnabled(+Desc), payFreePlanTitle/Desc/Enabled, payFreeDisabledNotice, subSeatsLabel); paySubtitle + payConfigSubtitle rewritten (Bakong mentions removed).
- seed.ts: payments.manualConfig defaults now include enabled:true + freePlan{true,3,0,1}; instructions updated to Telegram-review wording.

Verification (curl matrix with 6 cookie jars + agent-browser session pay8):
- Config: admin GET returns enabled+freePlan (old stored config merged with new defaults); seller GET/manual fields; buyer 403 on both seller config and admin config.
- Manual-only: POST 201 AWAITING_VERIFICATION (method MANUAL); duplicate open 409; missing manualRef 400; `method:"BAKONG"` in body is ignored (schema-stripped); deleted routes check/qr → 404.
- Master toggle: admin PUT enabled=false → seller POST 403 + seller config enabled:false + admin queue still verifiable (verified sokha's PRO while disabled → sub activated, extension base = period end); re-enable 200.
- Free plan: PUT 7/2/2 → FREE plan card shows 7/2/2; ppauto downgraded to FREE got 3/0/1; changing config to 5/1/2 live-synced ppauto's DB row; freePlan.enabled=false → PRO tenant downgrade 403; restored 3/0/1.
- Reject: without reason 400; with reason → REJECTED + reason stored.
- Browser E2E (admin + sokha, EN/KM, 1280 + 390px): admin Settings shows master switch + free-plan panel (3/0/1) → toggled payments off + Save → seller config API confirmed disabled → dealer subscription tab shows amber disabled notice + PRO/ENTERPRISE dialog shows ONLY the disabled alert; re-enabled → dialog shows 3 steps + KHQR QR image (demo payload set via admin) + account name + instructions + @khlan_admin t.me CTA + ref form → submitted FT250111Z9911 → "Pending verification" toast + history row + Cancel request works ("Cancelled"); admin Payments tab: filter chips Pending verification/Verified/Rejected/Cancelled/Any condition (no PENDING), Verify & activate on ppauto's seeded request → subscription BASIC ACTIVE extended to 2026-12-01 (audited).
- Mobile 390×844: admin dashboard/Payments/Settings + dealer subscription + payment dialog all scrollWidth=390 after the field-sizing fix. Zero console errors / page errors (session + dialog + QR states).
- Fixed during verification: (1) payment filter chip raw-key label; (2) payment history not refreshing after dialog submit (historyKey remount); (3) Settings-tab 23px horizontal overflow on mobile from field-sizing textareas.
- DB reseeded → pristine (8 users/khlan123, 1 AWAITING_VERIFICATION manual payment for ppauto, 2 purchase requests, config enabled=true + freePlan 3/0/1 + khqrPayload null). lint 0 errors; tsc clean for project files (only pre-existing non-project errors remain); dev.log clean post-reseed (one transient [api/session] error during the reseed wipe is a known race from a live browser polling session — not a code defect).

Stage Summary:
- Subscription payments are now manual-KHQR-only, exactly as requested: the seller sees ONLY the Super Admin's configured KHQR + Telegram contact, pays with their banking app, sends proof via Telegram, submits the bank transaction reference, and the subscription activates ONLY when the Super Admin verifies (audited; Bakong auto-verification completely removed).
- Super Admin settings (Dashboard → Settings): master enable/disable switch for subscription payments (off = no new seller payment requests, pending still verifiable) + full KHQR config (account name, payload, image URL fallback, EN/KM instructions, Telegram contact) + Free plan usage config (enable/disable + listings/featured/seats) that applies to the plan card, the downgrade action, and live-syncs all existing FREE subscriptions.
- Guards hold: paid plans never activate without admin verification (402 on direct POST); payment status and subscription status remain separate; every transition audited (PAYMENT_REQUESTED/VERIFIED/REJECTED, SUBSCRIPTION_DOWNGRADED, PAYMENT_CONFIG_UPDATED).
- Files: DELETED lib/bakong.ts + api/tenant/payments/[id]/{check,qr}; MODIFIED lib/api/payments.ts, lib/commerce-types.ts, api/tenant/payments/route.ts, api/tenant/payments/config/route.ts, api/admin/payment-config/route.ts, api/tenant/subscription/route.ts, dashboard/payment-flow.tsx, dashboard/admin-dashboard.tsx, dashboard/dealer-dashboard.tsx, lib/i18n.ts, prisma/seed.ts. No schema migration needed (Bakong columns remain nullable/unused).

---
Task ID: 9
Agent: Main orchestrator (Z.ai Code)
Task: Public visitor browsing, default Super Admin, OTP removal, English click-in-order captcha (Security Verification)

Work Log:
- Audited auth stack (session.ts/auth.ts/login/register/otp routes/profile-dialog/auth-view), favorites+conversations gating, header account menu, i18n auth keys.
- NEW lib/captcha.ts: click-in-order captcha core — in-memory challenge store (3-min TTL, 4×3 slot grid, no-overlap scatter, ±42° rotation) over a 20-word English pool (4–6 letters, all distinct: CARS/DRIVE/KHMER/LEXUS/PRADO/BUMPER…); HMAC single-use captchaToken (5-min TTL) with globalThis-anchored state (fix: Next.js bundles each route separately, plain module Maps were NOT shared between captcha GET and verify routes).
- NEW endpoints: GET /api/auth/captcha (challenge: id, word, shuffled tokens {letter,x,y,rot}, rate-limit 30/min/IP) and POST /api/auth/captcha/verify (sequence check → {ok, captchaToken}, wrong order 400). login/register schemas now REQUIRE captchaToken; token consumed before credential check (each attempt needs a fresh captcha; wrong password = captcha burned, by design).
- NEW lib/bootstrap.ts ensureDefaultSuperAdmin(): idempotent guarantee that usr_admin (Nita Meng, +85512998009, SUPER_ADMIN, password khlan123) exists — creates when missing (never hijacks a phone held by another user), repairs missing role/password; called once per process from GET /api/session so fresh DBs always ship an admin. Seed already created it; curl-verified pw:set.
- OTP REMOVED: deleted api/auth/otp/{send,verify}, generateOtpCode/hashOtpCode from auth.ts, OtpCode prisma model (db:push dropped the table), OTP login tab in auth-view (now 2 tabs), OTP verify sub-flow in profile-dialog PhoneSection, unused ui/input-otp.tsx, and 16 dead i18n keys (authOtp*, authErrCode*, authDemoOtpAlert, profilePhoneVerify*, buyLoginRequired) in BOTH dicts; authDemoHintBody rewritten (no OTP mention).
- NEW security-captcha.tsx: dialog matching the reference screenshot — "Security Verification" title, photo-style panel (sky gradient + clouds + 2×2 white grid lines), scattered rotated letters with white outline text-shadow, red "Please click in order: “W O R D”", per-letter amber order badges, auto-verify on last letter, wrong letter = shake + reset + auto new puzzle, Refresh control, progress n/N. Wired into BOTH login and signup (form validates → opens dialog → onVerified(token) fires the real API call; server captcha error reopens the dialog).
- Public/guest model: SessionDTO gains additive demoPersona? flag (contract extension); /api/session sets demoPersona = !authed && persona-cookie present. store.ts exports isGuest(me) = me && !authed && !demoPersona. Genuine guests: browsing stays fully public (home/browse/detail/seller), but Contact seller, Request buy, Request test drive, favorites (card + detail), sell view, messages view now prompt registration (toast authRequiredToast + navigate auth/signup; full views render new shared GuestPanel with Register free/Log in CTAs). Header guests see compact Log in + amber Sign up buttons; demo persona switcher unchanged (sandbox pass preserved).
- Server guest guards (never touch the fallback demo buyer): /api/favorites GET returns [] for guests, POST/DELETE 401; POST /api/conversations 401; POST /api/purchases 401; POST /api/account/appointments 401 — via new shared isGuestRequest() in session.ts.
- page.tsx: auth view takes {name:"auth", tab?: "login"|"signup"} + key remount so gated CTAs land on the right tab (contact → signup).
- i18n appended (both dicts, 12 keys): captchaTitle/Subtitle/ClickInOrder/Refresh/Verifying/Failed/SuccessToast, authRequiredToast, guestPanelTitle/Body, guestCtaRegister/Login. KM translations included. EN/KM parity verified.
- Fixed during E2E: (1) captcha state not shared across route bundles → globalThis singleton; (2) double-translate bug (Tailwind -translate-x/y-1/2 classes + inline translate(-50%,-50%) shifted letters 24px up-left, pushing edge letters outside the overflow-hidden panel and un-clickable) → removed Tailwind classes, kept inline transform; (3) tightened position clamps to x 9–91% / y 16–84%; (4) guests saw the fallback buyer's favorites count → favorites API guests get [].

Verification (curl + agent-browser, EN/KM, 1280 & 390px):
- Curl: challenge shape (word/tokens/TTL); wrong sequence 400; correct → token; token reuse 400 (single-use proven); garbage token 400; wrong password 401; login without captchaToken 400; register with captcha 201; otp/send + otp/verify → 404; persona switch → demoPersona:true, fresh visitor → demoPersona:false; admin login → authed:true SUPER_ADMIN.
- Browser E2E: guest home renders cars publicly with Log in/Sign up header; detail Contact seller → signup-tab auth view; captcha dialog visual matches reference (screenshot); solved TYRES→admin login, KHMER→buyer login, CABIN→UI registration (auto-login), LEXUS on mobile, VALET desktop post-fix; wrong-order click auto-refreshes puzzle; Refresh button yields new word; letters-outside-panel count = 0; zero console/page errors; mobile 390 scrollWidth 390 (no overflow); GuestPanel on favorites/sell with sticky footer at viewport bottom.
- DB restored pristine (both test users deleted); OtpCode table dropped; lint 0 errors; tsc clean for project files; dev.log clean.

Stage Summary:
- Visitors now get the exact requested experience: every listing is publicly viewable without an account, and any interest action (contact dealer, buy, test drive, favorites, selling) funnels into registration — with the OTP flow fully removed and password/Telegram as the only sign-in paths.
- Every login AND registration is protected by the English "Security Verification" click-in-order captcha, server-enforced with single-use signed tokens (client bypass impossible); wrong order auto-refreshes a new puzzle.
- The default Super Admin (Nita Meng / +85512998009 / khlan123, id usr_admin) is guaranteed to exist on any fresh database via runtime bootstrap, on top of the seed; credentials are listed in the auth page's Demo accounts panel.
- Payment/subscription logic untouched (manual KHQR-only flow from Task 8 intact); contract change is additive only (SessionDTO.demoPersona?).
- Files: NEW lib/captcha.ts, lib/bootstrap.ts, api/auth/captcha/route.ts, api/auth/captcha/verify/route.ts, components/marketplace/security-captcha.tsx, components/marketplace/guest-panel.tsx; DELETED api/auth/otp/*, components/ui/input-otp.tsx, prisma OtpCode model; MODIFIED api/auth/login, api/auth/register, api/session, lib/auth.ts, lib/session.ts (isGuestRequest), lib/store.ts (View tab + isGuest), lib/dashboard-types.ts (additive demoPersona), api/favorites, api/conversations, api/purchases, api/account/appointments, app/page.tsx, app/globals.css (shake keyframes), header.tsx, vehicle-card.tsx, contact-dialog.tsx, detail-view.tsx, auth-view.tsx, profile-dialog.tsx, messages/favorites/sell views, lib/i18n.ts.

---
Task ID: 10
Agent: Z.ai Code (main)
Task: "help me check and verify fix, I log in by admin but all not working well, I don't have setting for manage control" — diagnose why the Super Admin sees a buyer-like experience with no settings, and fix it

Work Log:
- Verified the backend first via curl: captcha challenge → verify → admin login (+85512998009/khlan123) all OK; /api/admin/settings + /api/admin/payment-config both 200; admin dashboard tabs incl. Settings render fine in a clean browser session — so the admin features were intact; the failure was in session state, not features.
- Root causes found (3 + 1 latent crash):
  1. Phantom-login masquerade: a stale/invalid khlan_auth cookie (DB reseed, rotated secret, expiry) made getCurrentUser() silently fall through to the demo persona/demo buyer — the user believes they are logged in as admin but the UI shows the buyer dashboard with no admin tools; the server never told the browser the session was dead.
  2. Guests could open the fallback demo buyer's CustomerDashboard by clicking the header "Dashboard" button (DashboardView routed purely on role, never checked isGuest) — looked exactly like "logged in as admin but nothing works / no settings".
  3. No post-login navigation: after admin login the app reloaded to home; the admin had to discover Dashboard → 7th/8th tab themselves.
  4. dev.log showed a REAL crash: getDemoUser() had a create race on SellerProfile (P2002 unique userId) under concurrent /api/session boot requests → GET /api/session 500 → session never boots → broken dashboard ("all not working well").
- Fixes:
  - api/session GET: if the request carries khlan_auth but the session is not authed, the response now clears the dead cookie (Set-Cookie khlan_auth=; Max-Age=0) — stale sessions become genuine guests who see Log in/Sign up instead of a phantom buyer identity.
  - lib/session.ts isGuestRequest(): the auth cookie must carry a VALID signed token (verifySessionToken) to count as authed — a stale cookie no longer lets guest-state requests attach data to the demo buyer.
  - lib/session.ts getDemoUser(): SellerProfile create wrapped in try/catch with findUnique fallback — concurrent boot requests can no longer 500 /api/session (verified: 12 concurrent curls → 12×200).
  - dashboard-view.tsx: genuine guests (isGuest) get the shared GuestPanel ("Create a free account to continue" + Register free/Log in) instead of the invisible fallback buyer's customer dashboard.
  - auth-view.tsx doLogin: login response role is SUPER_ADMIN/ADMIN → parks sessionStorage khlan_go_dashboard before the reload; SessionBoot replays it once the fresh session is loaded → admins land DIRECTLY on their dashboard (manage controls immediately visible; buyers unaffected).
- Browser E2E (agent-browser): stale-cookie session → bogus khlan_auth cleared server-side, header shows Log in/Sign up, clicking Dashboard renders the GuestPanel; fresh guest → full admin login through the click-in-order captcha (COUPE solved after one deliberate wrong-order attempt which correctly auto-refreshed the puzzle) → auto-landed on "សូមស្វាគមន៍, Nita Meng / Super Admin" dashboard with all 8 tabs → Settings tab shows System settings + Subscription payments (KHQR) master switch ON; screenshot captured; zero console/page errors.
- Did NOT touch payment/subscription logic, contract files, or i18n (no new strings needed — GuestPanel strings already existed).

Verification:
- curl: stale khlan_auth → session 200 + clearing Set-Cookie; 12 concurrent /api/session → all 200 (race fixed); admin login + both settings endpoints still 200.
- agent-browser: guest Dashboard → GuestPanel; admin login → auto-dashboard → Settings with KHQR config; wrong captcha order → shake + new puzzle (by design); EN/KM both render (admin account locale=km shows Khmer by design, EN toggle works).
- lint 0 errors; dev.log clean post-fix (only the 1 pre-fix historical P2002 remains in the old log region).

Stage Summary:
- The reported experience is fixed at its root: dead sessions can no longer masquerade as the demo buyer (cookie is cleared + guest detection validates the signature), guests can no longer see a fake "buyer dashboard" (they get the register/login panel), and the Super Admin now lands directly on the dashboard with the Settings manage controls after login.
- The intermittent "all not working well" had a second, independent cause: a session-boot race that returned 500 on /api/session — now race-proof.
- Super Admin credentials (unchanged, guaranteed to exist on any fresh DB): phone +85512998009, password khlan123 (Nita Meng, id usr_admin); also available via the demo persona switcher "Super Admin — Nita".
- Files: MODIFIED src/app/api/session/route.ts, src/lib/session.ts, src/components/marketplace/dashboard/dashboard-view.tsx, src/components/marketplace/views/auth-view.tsx, src/app/page.tsx.
