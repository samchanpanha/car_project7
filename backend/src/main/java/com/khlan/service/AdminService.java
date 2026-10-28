package com.khlan.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.khlan.dto.AdminDTO;
import com.khlan.dto.TenantDTO;
import com.khlan.dto.VehicleDTO;
import com.khlan.entity.*;
import com.khlan.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.OffsetDateTime;
import java.util.*;

@Slf4j
@Service
@RequiredArgsConstructor
public class AdminService {

    private final UserRepository userRepository;
    private final TenantRepository tenantRepository;
    private final TenantMemberRepository tenantMemberRepository;
    private final VehicleRepository vehicleRepository;
    private final VehicleHistoryReportRepository reportRepository;
    private final ConversationRepository conversationRepository;
    private final FavoriteRepository favoriteRepository;
    private final AppointmentRepository appointmentRepository;
    private final SubscriptionRepository subscriptionRepository;
    private final AuditLogRepository auditLogRepository;
    private final PlatformSettingRepository platformSettingRepository;
    private final VehicleService vehicleService;
    private final MinioStorageService minioStorageService;
    private final ObjectMapper objectMapper;

    private static final long WEEK_SECONDS = 7 * 24 * 60 * 60;

    public void requireAdmin(UserEntity user) {
        if (user == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Login required");
        }
        if (!"SUPER_ADMIN".equals(user.getRole()) && !"ADMIN".equals(user.getRole())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Forbidden: admin access required");
        }
    }

    @Transactional(readOnly = true)
    public AdminDTO.AdminOverviewDTO getOverview() {
        long users = userRepository.count();
        long tenants = tenantRepository.count();
        long reportsGenerated = reportRepository.count();
        long conversations = conversationRepository.count();
        long favorites = favoriteRepository.count();
        long appointments = appointmentRepository.count();

        List<SubscriptionEntity> activeSubs = subscriptionRepository.findAll().stream()
                .filter(s -> "ACTIVE".equals(s.getStatus()))
                .toList();

        double mrrUsd = 0;
        for (SubscriptionEntity s : activeSubs) {
            double price = s.getPriceUsd() != null ? s.getPriceUsd() : 0.0;
            if ("YEARLY".equalsIgnoreCase(s.getBillingCycle())) {
                mrrUsd += (price / 12.0);
            } else {
                mrrUsd += price;
            }
        }

        List<VehicleEntity> allVehicles = vehicleRepository.findAll();
        long listingsPublished = allVehicles.stream().filter(v -> "PUBLISHED".equals(v.getStatus())).count();
        long listingsPending = allVehicles.stream().filter(v -> "PENDING_REVIEW".equals(v.getStatus())).count();

        Map<String, Long> listingsByStatus = new LinkedHashMap<>();
        for (String st : List.of("DRAFT", "PENDING_REVIEW", "PUBLISHED", "REJECTED", "SOLD", "ARCHIVED")) {
            listingsByStatus.put(st, allVehicles.stream().filter(v -> st.equals(v.getStatus())).count());
        }

        // Signup trends last 6 weeks
        OffsetDateTime now = OffsetDateTime.now();
        List<AdminDTO.SignupTrendDTO> signupTrend = new ArrayList<>();
        List<UserEntity> allUsers = userRepository.findAll();

        for (int w = 5; w >= 0; w--) {
            OffsetDateTime start = now.minusSeconds((w + 1) * WEEK_SECONDS);
            OffsetDateTime end = now.minusSeconds(w * WEEK_SECONDS);
            int uCount = (int) allUsers.stream().filter(u -> u.getCreatedAt() != null && !u.getCreatedAt().isBefore(start) && u.getCreatedAt().isBefore(end)).count();
            int vCount = (int) allVehicles.stream().filter(v -> v.getCreatedAt() != null && !v.getCreatedAt().isBefore(start) && v.getCreatedAt().isBefore(end)).count();
            signupTrend.add(AdminDTO.SignupTrendDTO.builder()
                    .label(w == 0 ? "W0" : "W-" + w)
                    .users(uCount)
                    .listings(vCount)
                    .build());
        }

        // Top Tenants
        List<TenantEntity> allTenants = tenantRepository.findAll();
        List<AdminDTO.TopTenantDTO> topTenants = allTenants.stream().map(t -> {
            List<VehicleEntity> vList = allVehicles.stream().filter(v -> t.getId().equals(v.getTenantId())).toList();
            long views = vList.stream().mapToLong(v -> v.getViews() != null ? v.getViews() : 0).sum();
            Optional<SubscriptionEntity> subOpt = subscriptionRepository.findByTenantId(t.getId());
            String plan = subOpt.map(SubscriptionEntity::getPlan).orElse("FREE");
            return AdminDTO.TopTenantDTO.builder()
                    .id(t.getId())
                    .name(t.getName())
                    .plan(plan)
                    .listings(vList.size())
                    .views(views)
                    .build();
        }).sorted(Comparator.comparingLong(AdminDTO.TopTenantDTO::getViews).reversed()).limit(3).toList();

        // Recent Audit
        List<AuditLogEntity> logs = auditLogRepository.findAll().stream()
                .sorted(Comparator.comparing(AuditLogEntity::getCreatedAt).reversed())
                .limit(8)
                .toList();

        List<AdminDTO.AuditEntryDTO> recentAudit = new ArrayList<>();
        for (AuditLogEntity l : logs) {
            String actorName = null;
            if (l.getActorId() != null) {
                actorName = userRepository.findById(l.getActorId()).map(UserEntity::getName).orElse(null);
            }
            Map<String, Object> meta = safeParseMap(l.getMetaJson());
            recentAudit.add(AdminDTO.AuditEntryDTO.builder()
                    .id(l.getId())
                    .action(l.getAction())
                    .entity(l.getEntity())
                    .entityId(l.getEntityId())
                    .actorName(actorName)
                    .createdAt(l.getCreatedAt() != null ? l.getCreatedAt().toString() : null)
                    .meta(meta)
                    .build());
        }

        return AdminDTO.AdminOverviewDTO.builder()
                .kpis(AdminDTO.KpisDTO.builder()
                        .users(users)
                        .tenants(tenants)
                        .listingsPublished(listingsPublished)
                        .listingsPending(listingsPending)
                        .reportsGenerated(reportsGenerated)
                        .conversations(conversations)
                        .favorites(favorites)
                        .appointments(appointments)
                        .mrrUsd(Math.round(mrrUsd))
                        .build())
                .listingsByStatus(listingsByStatus)
                .signupTrend(signupTrend)
                .topTenants(topTenants)
                .recentAudit(recentAudit)
                .build();
    }

    @Transactional(readOnly = true)
    public List<AdminDTO.AdminUserDTO> listUsers() {
        return listUsers(0, 200).getItems();
    }

    @Transactional(readOnly = true)
    public AdminDTO.PagedUsersDTO listUsers(int page, int size) {
        if (size <= 0) size = 20;
        if (page < 0) page = 0;

        List<UserEntity> allUsers = userRepository.findAll().stream()
                .sorted(Comparator.comparing(UserEntity::getCreatedAt, Comparator.nullsLast(Comparator.naturalOrder())).reversed())
                .toList();

        long total = allUsers.size();
        int from = Math.min(page * size, allUsers.size());
        int to = Math.min(from + size, allUsers.size());

        List<AdminDTO.AdminUserDTO> items = new ArrayList<>();
        for (UserEntity u : allUsers.subList(from, to)) {
            long listingCount = vehicleRepository.countBySellerIdAndStatus(u.getId(), "PUBLISHED")
                    + vehicleRepository.countBySellerIdAndStatus(u.getId(), "PENDING_REVIEW");
            long favCount = favoriteRepository.countByUserId(u.getId());

            String tenantName = null;
            Optional<TenantMemberEntity> memOpt = tenantMemberRepository.findFirstByUserIdAndStatus(u.getId(), "ACTIVE");
            if (memOpt.isPresent()) {
                tenantName = tenantRepository.findById(memOpt.get().getTenantId()).map(TenantEntity::getName).orElse(null);
            }

            items.add(AdminDTO.AdminUserDTO.builder()
                    .id(u.getId())
                    .name(u.getName())
                    .phone(u.getPhone())
                    .role(u.getRole())
                    .locale(u.getLocale())
                    .phoneVerified(Boolean.TRUE.equals(u.getPhoneVerified()))
                    .createdAt(u.getCreatedAt() != null ? u.getCreatedAt().toString() : null)
                    .listingCount(listingCount)
                    .favoriteCount(favCount)
                    .tenantName(tenantName)
                    .isBlacklisted(Boolean.TRUE.equals(u.getIsBlacklisted()))
                    .blacklistReason(u.getBlacklistReason())
                    .build());
        }

        return AdminDTO.PagedUsersDTO.builder()
                .items(items)
                .page(page)
                .size(size)
                .total(total)
                .build();
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> listVehicles(String status, String q) {
        List<VehicleEntity> vehicles = vehicleRepository.findAll().stream()
                .filter(v -> status == null || status.isBlank() || status.equalsIgnoreCase(v.getStatus()))
                .filter(v -> {
                    if (q == null || q.isBlank()) return true;
                    String target = (v.getMake() + " " + v.getModel() + " " + (v.getVariant() != null ? v.getVariant() : "")).toLowerCase();
                    return target.contains(q.trim().toLowerCase());
                })
                .sorted(Comparator.comparing(VehicleEntity::getCreatedAt).reversed())
                .limit(100)
                .toList();

        List<Map<String, Object>> result = new ArrayList<>();
        for (VehicleEntity v : vehicles) {
            VehicleDTO.VehicleCardDTO card = vehicleService.toCardDTO(v);
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("id", card.getId());
            map.put("make", card.getMake());
            map.put("model", card.getModel());
            map.put("variant", card.getVariant());
            map.put("year", card.getYear());
            map.put("priceUsd", card.getPriceUsd());
            map.put("mileageKm", card.getMileageKm());
            map.put("transmission", card.getTransmission());
            map.put("fuel", card.getFuel());
            map.put("bodyType", card.getBodyType());
            map.put("city", card.getCity());
            map.put("district", card.getDistrict());
            map.put("condition", card.getCondition());
            map.put("status", card.getStatus());
            map.put("featured", card.isFeatured());
            map.put("views", card.getViews());
            map.put("createdAt", card.getCreatedAt());
            map.put("seller", card.getSeller());
            map.put("images", card.getImages());
            map.put("sellerName", card.getSeller() != null ? card.getSeller().getName() : "Seller");
            result.add(map);
        }

        return result;
    }

    @Transactional
    public void updateVehicleStatusOrFeatured(String adminId, String vehicleId, Map<String, Object> req) {
        VehicleEntity vehicle = vehicleRepository.findById(vehicleId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Vehicle not found"));

        if (req.containsKey("status") && req.get("status") != null) {
            String newStatus = req.get("status").toString().toUpperCase();
            String oldStatus = vehicle.getStatus();
            vehicle.setStatus(newStatus);

            String action = "PUBLISHED".equals(newStatus) ? "LISTING_APPROVED" : ("REJECTED".equals(newStatus) ? "LISTING_REJECTED" : "LISTING_STATUS_CHANGED");
            writeAudit(adminId, action, "Vehicle", vehicleId, Map.of("from", oldStatus, "to", newStatus));
        }

        if (req.containsKey("featured") && req.get("featured") != null) {
            boolean featured = Boolean.parseBoolean(req.get("featured").toString());
            boolean oldFeatured = Boolean.TRUE.equals(vehicle.getFeatured());
            vehicle.setFeatured(featured);

            String action = featured ? "LISTING_FEATURED" : "LISTING_UNFEATURED";
            writeAudit(adminId, action, "Vehicle", vehicleId, Map.of("from", oldFeatured, "to", featured));
        }

        vehicleRepository.save(vehicle);
    }

    @Transactional(readOnly = true)
    public List<AdminDTO.AdminTenantDTO> listTenants() {
        List<TenantEntity> tenants = tenantRepository.findAll().stream()
                .sorted(Comparator.comparing(TenantEntity::getCreatedAt).reversed())
                .toList();

        List<AdminDTO.AdminTenantDTO> result = new ArrayList<>();
        for (TenantEntity t : tenants) {
            int memberCount = tenantMemberRepository.findByTenantId(t.getId()).size();
            long listingCount = vehicleRepository.countByTenantIdAndStatus(t.getId(), "PUBLISHED")
                    + vehicleRepository.countByTenantIdAndStatus(t.getId(), "PENDING_REVIEW");

            Optional<SubscriptionEntity> subOpt = subscriptionRepository.findByTenantId(t.getId());
            String plan = subOpt.map(SubscriptionEntity::getPlan).orElse(null);
            String subStatus = subOpt.map(SubscriptionEntity::getStatus).orElse(null);
            double mrr = 0.0;
            if (subOpt.isPresent()) {
                SubscriptionEntity s = subOpt.get();
                double p = s.getPriceUsd() != null ? s.getPriceUsd() : 0.0;
                mrr = "YEARLY".equalsIgnoreCase(s.getBillingCycle()) ? (p / 12.0) : p;
            }

            result.add(AdminDTO.AdminTenantDTO.builder()
                    .id(t.getId())
                    .name(t.getName())
                    .slug(t.getSlug())
                    .city(t.getCity())
                    .verification(t.getVerification())
                    .status(t.getStatus())
                    .memberCount(memberCount)
                    .listingCount((int) listingCount)
                    .plan(plan)
                    .subscriptionStatus(subStatus)
                    .mrrUsd(Math.round(mrr))
                    .createdAt(t.getCreatedAt() != null ? t.getCreatedAt().toString() : null)
                    .build());
        }

        return result;
    }

    @Transactional(readOnly = true)
    public List<AdminDTO.AuditEntryDTO> getAuditLogs(int limit) {
        int cap = Math.min(Math.max(1, limit), 200);
        List<AuditLogEntity> logs = auditLogRepository.findAll().stream()
                .sorted(Comparator.comparing(AuditLogEntity::getCreatedAt).reversed())
                .limit(cap)
                .toList();

        List<AdminDTO.AuditEntryDTO> result = new ArrayList<>();
        for (AuditLogEntity l : logs) {
            String actorName = l.getActorId() != null
                    ? userRepository.findById(l.getActorId()).map(UserEntity::getName).orElse(null)
                    : null;
            result.add(AdminDTO.AuditEntryDTO.builder()
                    .id(l.getId())
                    .action(l.getAction())
                    .entity(l.getEntity())
                    .entityId(l.getEntityId())
                    .actorName(actorName)
                    .createdAt(l.getCreatedAt() != null ? l.getCreatedAt().toString() : null)
                    .meta(safeParseMap(l.getMetaJson()))
                    .build());
        }
        return result;
    }

    @Transactional(readOnly = true)
    public AdminDTO.AiStatsDTO getAiStats() {
        long totalReports = reportRepository.count();
        List<VehicleHistoryReportEntity> completes = reportRepository.findAll().stream()
                .filter(r -> "COMPLETE".equals(r.getStatus()))
                .toList();

        int avgConfidence = completes.isEmpty() ? 0 :
                (int) Math.round(completes.stream().mapToDouble(VehicleHistoryReportEntity::getOverallConfidence).average().orElse(0.0));

        Map<String, Long> statusBreakdown = new LinkedHashMap<>();
        for (VehicleHistoryReportEntity r : completes) {
            try {
                List<Map<String, Object>> checks = objectMapper.readValue(r.getChecksJson(), new TypeReference<>() {});
                for (Map<String, Object> c : checks) {
                    String st = (String) c.get("status");
                    if (st != null) {
                        statusBreakdown.put(st, statusBreakdown.getOrDefault(st, 0L) + 1);
                    }
                }
            } catch (Exception ignored) {}
        }

        List<AdminDTO.RecentReportSummaryDTO> recent = completes.stream()
                .sorted(Comparator.comparing(VehicleHistoryReportEntity::getCreatedAt).reversed())
                .limit(6)
                .map(r -> {
                    String label = "Vehicle " + r.getVehicleId();
                    Optional<VehicleEntity> vOpt = vehicleRepository.findById(r.getVehicleId());
                    if (vOpt.isPresent()) {
                        VehicleEntity v = vOpt.get();
                        label = String.format("%s %s %d", v.getMake(), v.getModel(), v.getYear());
                    }
                    return AdminDTO.RecentReportSummaryDTO.builder()
                            .id(r.getId())
                            .vehicleLabel(label)
                            .confidence((int) Math.round(r.getOverallConfidence()))
                            .createdAt(r.getCreatedAt() != null ? r.getCreatedAt().toString() : null)
                            .build();
                }).toList();

        return AdminDTO.AiStatsDTO.builder()
                .totalReports(totalReports)
                .completeReports(completes.size())
                .avgConfidence(avgConfidence)
                .statusBreakdown(statusBreakdown)
                .recent(recent)
                .build();
    }

    @Transactional(readOnly = true)
    public AdminDTO.PlatformSettingsDTO getPlatformSettings() {
        boolean freeTrialEnabled = true;
        int freeTrialDays = 30;
        boolean maintenanceMode = false;
        boolean demoModeEnabled = true;
        boolean adminOnlyLogin = false;
        double commissionPct = 2.5;
        double featuredListingPriceUsd = 25.0;
        boolean autoApproveListings = false;

        List<PlatformSettingEntity> rows = platformSettingRepository.findAll();
        Map<String, String> byKey = new HashMap<>();
        for (PlatformSettingEntity r : rows) {
            byKey.put(r.getKey(), r.getValueJson());
        }

        if (byKey.containsKey("freeTrialEnabled")) freeTrialEnabled = Boolean.parseBoolean(byKey.get("freeTrialEnabled"));
        if (byKey.containsKey("freeTrialDays")) freeTrialDays = Integer.parseInt(byKey.get("freeTrialDays"));
        if (byKey.containsKey("maintenanceMode")) maintenanceMode = Boolean.parseBoolean(byKey.get("maintenanceMode"));
        if (byKey.containsKey("demoModeEnabled")) demoModeEnabled = Boolean.parseBoolean(byKey.get("demoModeEnabled"));
        if (byKey.containsKey("adminOnlyLogin")) adminOnlyLogin = Boolean.parseBoolean(byKey.get("adminOnlyLogin"));
        if (byKey.containsKey("commissionPct")) commissionPct = Double.parseDouble(byKey.get("commissionPct"));
        if (byKey.containsKey("featuredListingPriceUsd")) featuredListingPriceUsd = Double.parseDouble(byKey.get("featuredListingPriceUsd"));
        if (byKey.containsKey("autoApproveListings")) autoApproveListings = Boolean.parseBoolean(byKey.get("autoApproveListings"));

        if (byKey.containsKey("core_settings")) {
            Map<String, Object> map = safeParseMap(byKey.get("core_settings"));
            if (map.containsKey("freeTrialEnabled")) freeTrialEnabled = Boolean.parseBoolean(map.get("freeTrialEnabled").toString());
            if (map.containsKey("freeTrialDays")) freeTrialDays = Integer.parseInt(map.get("freeTrialDays").toString());
            if (map.containsKey("maintenanceMode")) maintenanceMode = Boolean.parseBoolean(map.get("maintenanceMode").toString());
            if (map.containsKey("demoModeEnabled")) demoModeEnabled = Boolean.parseBoolean(map.get("demoModeEnabled").toString());
            if (map.containsKey("adminOnlyLogin")) adminOnlyLogin = Boolean.parseBoolean(map.get("adminOnlyLogin").toString());
            if (map.containsKey("commissionPct")) commissionPct = Double.parseDouble(map.get("commissionPct").toString());
            if (map.containsKey("featuredListingPriceUsd")) featuredListingPriceUsd = Double.parseDouble(map.get("featuredListingPriceUsd").toString());
            if (map.containsKey("autoApproveListings")) autoApproveListings = Boolean.parseBoolean(map.get("autoApproveListings").toString());
        }

        List<TenantDTO.PlanDTO> defaultPlans = List.of(
                TenantDTO.PlanDTO.builder()
                        .id("FREE").plan("FREE").name("Starter").priceUsd(0.0)
                        .priceUsdMonthly(0.0).priceUsdYearly(0.0).priceKhrMonthly(0.0).priceKhrYearly(0.0)
                        .featuredSlots(0).branchSlots(1).listingsLimit(10).featuredLimit(0).seats(1).enabled(true)
                        .features(List.of("10 Active Listings", "1 Branch Location", "Standard Support"))
                        .build(),
                TenantDTO.PlanDTO.builder()
                        .id("BASIC").plan("BASIC").name("Basic Dealer").priceUsd(19.0)
                        .priceUsdMonthly(19.0).priceUsdYearly(190.0).priceKhrMonthly(78000.0).priceKhrYearly(780000.0)
                        .featuredSlots(2).branchSlots(1).listingsLimit(15).featuredLimit(2).seats(2).enabled(true)
                        .features(List.of("15 Car Listings", "2 Featured Spots", "Basic Support"))
                        .build(),
                TenantDTO.PlanDTO.builder()
                        .id("PRO").plan("PRO").name("Professional Dealership").priceUsd(49.0)
                        .priceUsdMonthly(49.0).priceUsdYearly(490.0).priceKhrMonthly(200900.0).priceKhrYearly(2009000.0)
                        .featuredSlots(5).branchSlots(3).listingsLimit(50).featuredLimit(5).seats(3).enabled(true)
                        .features(List.of("50 Car Listings", "5 Featured Spots", "3 Staff Seats", "AI Vehicle Reports", "Telegram CRM Bot"))
                        .build(),
                TenantDTO.PlanDTO.builder()
                        .id("ENTERPRISE").plan("ENTERPRISE").name("Enterprise Network").priceUsd(149.0)
                        .priceUsdMonthly(149.0).priceUsdYearly(1490.0).priceKhrMonthly(610900.0).priceKhrYearly(6109000.0)
                        .featuredSlots(20).branchSlots(10).listingsLimit(999).featuredLimit(20).seats(10).enabled(true)
                        .features(List.of("Unlimited Listings", "20 Featured Spots", "10 Staff Seats", "Priority API Access", "Dedicated Account Manager"))
                        .build()
        );

        // Honor admin plan configuration (active/disabled + naming + pricing)
        // from the plan_pricing setting so disabled plans are not offered.
        List<TenantDTO.PlanDTO> plans = new ArrayList<>(defaultPlans);
        try {
            java.util.Optional<PlatformSettingEntity> cfgOpt = platformSettingRepository.findById("plan_pricing");
            if (cfgOpt.isPresent()) {
                Map<String, com.khlan.dto.PlanDTO.PlanDefinitionDTO> configured =
                        objectMapper.readValue(cfgOpt.get().getValueJson(),
                                new com.fasterxml.jackson.core.type.TypeReference<Map<String, com.khlan.dto.PlanDTO.PlanDefinitionDTO>>() {});
                plans.removeIf(p -> {
                    com.khlan.dto.PlanDTO.PlanDefinitionDTO c = configured.get((p.getPlan() == null ? p.getId() : p.getPlan()).toUpperCase());
                    return c != null && Boolean.FALSE.equals(c.getEnabled());
                });
            }
        } catch (Exception e) {
            log.warn("Could not apply plan_pricing enabled flags: {}", e.getMessage());
        }

        return AdminDTO.PlatformSettingsDTO.builder()
                .freeTrialEnabled(freeTrialEnabled)
                .freeTrialDays(freeTrialDays)
                .maintenanceMode(maintenanceMode)
                .demoModeEnabled(demoModeEnabled)
                .adminOnlyLogin(adminOnlyLogin)
                .commissionPct(commissionPct)
                .featuredListingPriceUsd(featuredListingPriceUsd)
                .autoApproveListings(autoApproveListings)
                .plans(plans)
                .build();
    }

    @Transactional
    public AdminDTO.PlatformSettingsDTO updatePlatformSettings(String actorId, AdminDTO.PlatformSettingsUpdateRequest req) {
        Optional<PlatformSettingEntity> sOpt = platformSettingRepository.findById("core_settings");
        java.util.LinkedHashMap<String, Object> map = new java.util.LinkedHashMap<>();
        sOpt.ifPresent(s -> map.putAll(safeParseMap(s.getValueJson())));

        if (req.getFreeTrialEnabled() != null) {
            map.put("freeTrialEnabled", req.getFreeTrialEnabled());
            saveIndividualSetting("freeTrialEnabled", String.valueOf(req.getFreeTrialEnabled()));
        }
        if (req.getFreeTrialDays() != null) {
            map.put("freeTrialDays", req.getFreeTrialDays());
            saveIndividualSetting("freeTrialDays", String.valueOf(req.getFreeTrialDays()));
        }
        if (req.getMaintenanceMode() != null) {
            map.put("maintenanceMode", req.getMaintenanceMode());
            saveIndividualSetting("maintenanceMode", String.valueOf(req.getMaintenanceMode()));
        }
        if (req.getDemoModeEnabled() != null) {
            map.put("demoModeEnabled", req.getDemoModeEnabled());
            saveIndividualSetting("demoModeEnabled", String.valueOf(req.getDemoModeEnabled()));
        }
        if (req.getAdminOnlyLogin() != null) {
            map.put("adminOnlyLogin", req.getAdminOnlyLogin());
            saveIndividualSetting("adminOnlyLogin", String.valueOf(req.getAdminOnlyLogin()));
        }
        if (req.getCommissionPct() != null) {
            map.put("commissionPct", req.getCommissionPct());
            saveIndividualSetting("commissionPct", String.valueOf(req.getCommissionPct()));
        }
        if (req.getFeaturedListingPriceUsd() != null) {
            map.put("featuredListingPriceUsd", req.getFeaturedListingPriceUsd());
            saveIndividualSetting("featuredListingPriceUsd", String.valueOf(req.getFeaturedListingPriceUsd()));
        }
        if (req.getAutoApproveListings() != null) {
            map.put("autoApproveListings", req.getAutoApproveListings());
            saveIndividualSetting("autoApproveListings", String.valueOf(req.getAutoApproveListings()));
        }

        try {
            String json = objectMapper.writeValueAsString(map);
            PlatformSettingEntity entity = sOpt.map(s -> { s.setValueJson(json); return s; })
                    .orElseGet(() -> PlatformSettingEntity.builder().key("core_settings").valueJson(json).build());
            platformSettingRepository.save(entity);
        } catch (Exception e) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.INTERNAL_SERVER_ERROR, "Failed to save settings");
        }

        writeAudit(actorId, "SETTINGS_UPDATED", "PlatformSetting", "core_settings", new HashMap<>(map));
        return getPlatformSettings();
    }

    private void saveIndividualSetting(String key, String value) {
        PlatformSettingEntity entity = platformSettingRepository.findById(key)
                .map(s -> { s.setValueJson(value); return s; })
                .orElseGet(() -> PlatformSettingEntity.builder().key(key).valueJson(value).build());
        platformSettingRepository.save(entity);
    }

    @Transactional
    public AdminDTO.AdminUserDTO updateUser(String actorId, String userId, AdminDTO.UpdateUserRequest req) {
        UserEntity user = userRepository.findById(userId)
                .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(
                        org.springframework.http.HttpStatus.NOT_FOUND, "User not found"));

        if (req.getRole() != null && !req.getRole().isBlank()) user.setRole(req.getRole());
        if (req.getBlacklisted() != null) user.setIsBlacklisted(req.getBlacklisted());
        if (req.getBlacklistReason() != null)
            user.setBlacklistReason(req.getBlacklistReason().isBlank() ? null : req.getBlacklistReason());
        userRepository.save(user);

        long listingCount = vehicleRepository.countBySellerIdAndStatus(userId, "PUBLISHED");
        long favoriteCount = favoriteRepository.countByUserId(userId);
        Optional<TenantMemberEntity> memberOpt = tenantMemberRepository.findFirstByUserIdAndStatus(userId, "ACTIVE");
        String tenantName = memberOpt.flatMap(m -> tenantRepository.findById(m.getTenantId()))
                .map(TenantEntity::getName).orElse(null);

        return AdminDTO.AdminUserDTO.builder()
                .id(user.getId()).name(user.getName()).phone(user.getPhone()).role(user.getRole())
                .locale(user.getLocale()).phoneVerified(Boolean.TRUE.equals(user.getPhoneVerified()))
                .createdAt(user.getCreatedAt() != null ? user.getCreatedAt().toString() : null)
                .listingCount(listingCount).favoriteCount(favoriteCount).tenantName(tenantName)
                .isBlacklisted(Boolean.TRUE.equals(user.getIsBlacklisted()))
                .blacklistReason(user.getBlacklistReason())
                .build();
    }

    @Transactional
    public AdminDTO.AdminTenantDTO updateTenant(String actorId, String tenantId, AdminDTO.UpdateTenantRequest req) {
        TenantEntity tenant = tenantRepository.findById(tenantId)
                .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(
                        org.springframework.http.HttpStatus.NOT_FOUND, "Tenant not found"));

        if (req.getStatus() != null && !req.getStatus().isBlank()) tenant.setStatus(req.getStatus());
        if (req.getVerification() != null && !req.getVerification().isBlank()) tenant.setVerification(req.getVerification());
        tenantRepository.save(tenant);

        int memberCount = tenantMemberRepository.findByTenantId(tenantId).size();
        long listingCount = vehicleRepository.findByTenantId(tenantId).size();
        Optional<SubscriptionEntity> subOpt = subscriptionRepository.findByTenantId(tenantId);

        return AdminDTO.AdminTenantDTO.builder()
                .id(tenant.getId()).name(tenant.getName()).slug(tenant.getSlug()).city(tenant.getCity())
                .verification(tenant.getVerification()).status(tenant.getStatus())
                .memberCount(memberCount).listingCount((int) listingCount)
                .plan(subOpt.map(SubscriptionEntity::getPlan).orElse("FREE"))
                .subscriptionStatus(subOpt.map(SubscriptionEntity::getStatus).orElse("INACTIVE"))
                .mrrUsd(0.0).createdAt(tenant.getCreatedAt() != null ? tenant.getCreatedAt().toString() : null)
                .build();
    }

    public Map<String, Object> getStorageStatus() {
        String r2Endpoint = System.getenv().getOrDefault("CLOUDFLARE_R2_ENDPOINT", "https://cb9940df321e5a167f322120e5c74070.r2.cloudflarestorage.com");
        String r2Bucket = System.getenv().getOrDefault("CLOUDFLARE_R2_BUCKET", "cars-storage").replace("\"", "").trim();
        String r2Prefix = System.getenv().getOrDefault("CLOUDFLARE_R2_PREFIX", "");
        String r2PublicUrl = System.getenv().getOrDefault("CLOUDFLARE_R2_PUBLIC_URL", "https://pub-d32806cd92a44955a3772e3e6c2369a5.r2.dev");
        String r2Access = System.getenv().getOrDefault("CLOUDFLARE_R2_ACCESS_KEY_ID", "");

        boolean r2Configured = !r2Endpoint.isBlank() && !r2Access.isBlank();
        boolean r2Healthy = r2Configured && minioStorageService.checkHealth();
        int r2Count = r2Healthy ? minioStorageService.countObjects(r2Prefix) : 0;

        Map<String, Object> map = new LinkedHashMap<>();
        map.put("r2Configured", r2Configured);
        map.put("r2Healthy", r2Healthy);
        map.put("r2Bucket", r2Bucket);
        map.put("r2Prefix", r2Prefix);
        map.put("r2PublicUrl", r2PublicUrl);
        map.put("r2ObjectCount", r2Count);
        map.put("minioConfigured", true);
        map.put("minioHealthy", true);
        map.put("pendingCount", 0);
        map.put("pendingFiles", List.of());
        map.put("connected", r2Healthy);
        map.put("provider", "Cloudflare R2");
        map.put("bucket", r2Bucket);
        map.put("endpoint", r2Endpoint);
        map.put("message", r2Healthy ? "Cloudflare R2 Edge Storage is operational" : "Storage degraded");
        return map;
    }

    public Map<String, Object> testStorageConnection() {
        long start = System.currentTimeMillis();
        String r2Bucket = System.getenv().getOrDefault("CLOUDFLARE_R2_BUCKET", "cars-storage").replace("\"", "").trim();
        String r2Prefix = System.getenv().getOrDefault("CLOUDFLARE_R2_PREFIX", "");
        String r2PublicUrl = System.getenv().getOrDefault("CLOUDFLARE_R2_PUBLIC_URL", "https://pub-d32806cd92a44955a3772e3e6c2369a5.r2.dev");

        boolean healthy = minioStorageService.checkHealth();
        long latency = System.currentTimeMillis() - start;
        List<String> samples = healthy ? minioStorageService.listSampleObjects(r2Prefix, 5) : List.of();
        int count = samples.size();

        Map<String, Object> map = new LinkedHashMap<>();
        map.put("success", healthy);
        map.put("bucket", r2Bucket);
        map.put("prefix", r2Prefix);
        map.put("publicUrl", r2PublicUrl);
        map.put("objectCount", count);
        map.put("sampleObjects", samples);
        map.put("latencyMs", latency);
        if (!healthy) {
            map.put("error", "Failed to connect to storage bucket");
        }
        return map;
    }

    public Map<String, Object> syncR2Storage() {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("total", 0);
        map.put("synced", 0);
        map.put("failed", 0);
        map.put("errors", List.of());
        return map;
    }

    public Map<String, Object> getNacosStatus() {
        String nacosHost = System.getenv().getOrDefault("NACOS_SERVER_ADDR", "nacos:8848");
        String endpoint = nacosHost.startsWith("http") ? nacosHost : "http://" + nacosHost;
        endpoint = endpoint.replaceAll("/+$", "");

        Map<String, Object> health = new LinkedHashMap<>();
        health.put("endpoint", endpoint);

        List<Map<String, Object>> configs = new ArrayList<>();

        try {
            java.net.http.HttpClient client = java.net.http.HttpClient.newBuilder()
                    .connectTimeout(java.time.Duration.ofSeconds(3))
                    .build();

            // 1. Query Nacos server console state
            java.net.http.HttpRequest stateReq = java.net.http.HttpRequest.newBuilder()
                    .uri(java.net.URI.create(endpoint + "/nacos/v1/console/server/state"))
                    .timeout(java.time.Duration.ofSeconds(3))
                    .GET()
                    .build();

            java.net.http.HttpResponse<String> stateRes = client.send(stateReq, java.net.http.HttpResponse.BodyHandlers.ofString());
            if (stateRes.statusCode() == 200) {
                com.fasterxml.jackson.databind.JsonNode stateNode = objectMapper.readTree(stateRes.body());
                health.put("version", stateNode.path("version").asText("2.4.3"));
                health.put("standalone", "standalone".equalsIgnoreCase(stateNode.path("startup_mode").asText("standalone")));
                health.put("healthy", true);
            } else {
                health.put("version", "unknown");
                health.put("standalone", false);
                health.put("healthy", false);
            }

            // 2. Query published Nacos configs
            java.net.http.HttpRequest configsReq = java.net.http.HttpRequest.newBuilder()
                    .uri(java.net.URI.create(endpoint + "/nacos/v1/cs/configs?dataId=&group=&pageNo=1&pageSize=100&search=accurate"))
                    .timeout(java.time.Duration.ofSeconds(3))
                    .GET()
                    .build();

            java.net.http.HttpResponse<String> configsRes = client.send(configsReq, java.net.http.HttpResponse.BodyHandlers.ofString());
            if (configsRes.statusCode() == 200) {
                com.fasterxml.jackson.databind.JsonNode configsNode = objectMapper.readTree(configsRes.body());
                com.fasterxml.jackson.databind.JsonNode pageItems = configsNode.path("pageItems");
                if (pageItems.isArray()) {
                    for (com.fasterxml.jackson.databind.JsonNode item : pageItems) {
                        Map<String, Object> cfg = new LinkedHashMap<>();
                        cfg.put("dataId", item.path("dataId").asText());
                        cfg.put("group", item.path("group").asText("DEFAULT_GROUP"));
                        cfg.put("type", item.path("type").asText("yaml"));
                        configs.add(cfg);
                    }
                }
            }
        } catch (Exception e) {
            log.warn("[Nacos] Failed to check status at {}: {}", endpoint, e.getMessage());
            health.put("version", "unreachable");
            health.put("standalone", false);
            health.put("healthy", false);
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("endpoint", endpoint);
        result.put("health", health);
        result.put("configs", configs);
        return result;
    }

    public Map<String, Object> syncNacosConfigs() {
        String nacosHost = System.getenv().getOrDefault("NACOS_SERVER_ADDR", "nacos:8848");
        String endpoint = nacosHost.startsWith("http") ? nacosHost : "http://" + nacosHost;
        endpoint = endpoint.replaceAll("/+$", "");

        List<String> published = new ArrayList<>();
        List<String> errors = new ArrayList<>();

        Map<String, String> modularConfigs = getModularConfigTemplates();

        java.net.http.HttpClient client = java.net.http.HttpClient.newBuilder()
                .connectTimeout(java.time.Duration.ofSeconds(4))
                .build();

        for (Map.Entry<String, String> entry : modularConfigs.entrySet()) {
            String dataId = entry.getKey();
            String content = entry.getValue();

            try {
                String formBody = "dataId=" + java.net.URLEncoder.encode(dataId, java.nio.charset.StandardCharsets.UTF_8)
                        + "&group=DEFAULT_GROUP&type=yaml&content=" + java.net.URLEncoder.encode(content, java.nio.charset.StandardCharsets.UTF_8);

                java.net.http.HttpRequest req = java.net.http.HttpRequest.newBuilder()
                        .uri(java.net.URI.create(endpoint + "/nacos/v1/cs/configs"))
                        .header("Content-Type", "application/x-www-form-urlencoded")
                        .timeout(java.time.Duration.ofSeconds(5))
                        .POST(java.net.http.HttpRequest.BodyPublishers.ofString(formBody))
                        .build();

                java.net.http.HttpResponse<String> res = client.send(req, java.net.http.HttpResponse.BodyHandlers.ofString());
                if (res.statusCode() == 200 && "true".equalsIgnoreCase(res.body().trim())) {
                    published.add(dataId);
                } else {
                    errors.add(dataId + ": HTTP " + res.statusCode() + " " + res.body());
                }
            } catch (Exception ex) {
                log.error("[Nacos] Error publishing {}: {}", dataId, ex.getMessage());
                errors.add(dataId + ": " + ex.getMessage());
            }
        }

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("published", published);
        response.put("errors", errors);
        return response;
    }

    private Map<String, String> getModularConfigTemplates() {
        Map<String, String> map = new LinkedHashMap<>();

        // 1. Backend config
        map.put("khlan-backend.yaml",
                """
                server:
                  port: 8080
                  shutdown: graceful
                spring:
                  application:
                    name: khlan-backend
                  threads:
                    virtual:
                      enabled: true
                  datasource:
                    url: jdbc:postgresql://postgres:5432/khlandb
                    username: khlan
                    password: khlan_secret_2026
                    driver-class-name: org.postgresql.Driver
                    hikari:
                      maximum-pool-size: 20
                      minimum-idle: 5
                      idle-timeout: 300000
                      connection-timeout: 20000
                  jpa:
                    open-in-view: false
                    hibernate:
                      ddl-auto: validate
                  flyway:
                    enabled: true
                    baseline-on-migrate: true
                    locations: classpath:db/migration
                  data:
                    redis:
                      host: redis
                      port: 6379
                      timeout: 3000ms
                jwt:
                  secret: KhLanSuperSecretJwtKeyCambodiaMarketplace2026SecureToken
                  access-token-expiration-ms: 86400000
                  refresh-token-expiration-ms: 604800000
                management:
                  endpoints:
                    web:
                      exposure:
                        include: health,info,prometheus,metrics
                  endpoint:
                    health:
                      show-details: always
                    prometheus:
                      enabled: true
                """);

        // 2. Storage config
        String r2Endpoint = System.getenv().getOrDefault("CLOUDFLARE_R2_ENDPOINT", "https://cb9940df321e5a167f322120e5c74070.r2.cloudflarestorage.com");
        String r2Access = System.getenv().getOrDefault("CLOUDFLARE_R2_ACCESS_KEY_ID", "d3de5abfa49f01c944cc6cc9eee5a282");
        String r2Secret = System.getenv().getOrDefault("CLOUDFLARE_R2_SECRET_ACCESS_KEY", "4f2977c626ea5856833a712e08052fbc78ab4cf7ebd22b6c529bbf85bf77cf5d");
        String r2Bucket = System.getenv().getOrDefault("CLOUDFLARE_R2_BUCKET", "cars-storage");
        String r2Prefix = System.getenv().getOrDefault("CLOUDFLARE_R2_PREFIX", "");
        String r2Public = System.getenv().getOrDefault("CLOUDFLARE_R2_PUBLIC_URL", "https://pub-d32806cd92a44955a3772e3e6c2369a5.r2.dev");

        map.put("khlan-storage.yaml",
                String.format(
                        """
                        storage:
                          default-provider: CLOUDFLARE_R2
                          r2:
                            endpoint: %s
                            access-key-id: %s
                            secret-access-key: %s
                            bucket: %s
                            prefix: %s
                            public-url: %s
                          minio:
                            endpoint: http://minio:9000
                            access-key: minioadmin
                            secret-key: minioadmin
                            bucket: cars-storage
                        """,
                        r2Endpoint, r2Access, r2Secret, r2Bucket, r2Prefix, r2Public
                ));

        // 3. Telegram config
        String tgToken = System.getenv().getOrDefault("TELEGRAM_BOT_TOKEN", "8691160498:AAFkdDht6Wj7TAxRWxLTJPurDRP84BMwxb0");
        String tgChat = System.getenv().getOrDefault("TELEGRAM_GROUP_CHAT_ID", "-1004489863210");
        String tgSecret = System.getenv().getOrDefault("TELEGRAM_WEBHOOK_SECRET", "khlan_webhook_secret_2026");

        map.put("khlan-telegram.yaml",
                String.format(
                        """
                        telegram:
                          bot-token: %s
                          group-chat-id: "%s"
                          webhook-secret: %s
                          mini-app:
                            enabled: true
                            app-url: https://t.me/khlan_bot/app
                        """,
                        tgToken, tgChat, tgSecret
                ));

        // 4. Frontend config
        map.put("khlan-frontend.yaml",
                """
                frontend:
                  app-name: KhLan Automotive Marketplace
                  default-locale: km
                  supported-locales:
                    - km
                    - en
                    - zh
                    - vi
                  features:
                    ai-inspection: true
                    telegram-mini-app: true
                    multi-category: true
                    demo-mode: false
                  pricing:
                    default-currency: USD
                    khr-rate: 4100
                """);

        return map;
    }

    private void writeAudit(String actorId, String action, String entity, String entityId, Map<String, Object> meta) {
        try {
            String auditId = "aud_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16);
            AuditLogEntity audit = AuditLogEntity.builder()
                    .id(auditId)
                    .actorId(actorId)
                    .action(action)
                    .entity(entity)
                    .entityId(entityId)
                    .metaJson(objectMapper.writeValueAsString(meta))
                    .createdAt(OffsetDateTime.now())
                    .build();
            auditLogRepository.save(audit);
        } catch (Exception ignored) {}
    }

    private Map<String, Object> safeParseMap(String json) {
        if (json == null || json.isBlank()) return Map.of();
        try {
            return objectMapper.readValue(json, new TypeReference<Map<String, Object>>() {});
        } catch (Exception e) {
            return Map.of();
        }
    }
}
