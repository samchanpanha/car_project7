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
            Optional<SubscriptionEntity> subOpt = subscriptionRepository.findById(t.getId());
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
        List<UserEntity> users = userRepository.findAll().stream()
                .sorted(Comparator.comparing(UserEntity::getCreatedAt).reversed())
                .limit(200)
                .toList();

        List<AdminDTO.AdminUserDTO> result = new ArrayList<>();
        for (UserEntity u : users) {
            long listingCount = vehicleRepository.countBySellerIdAndStatus(u.getId(), "PUBLISHED")
                    + vehicleRepository.countBySellerIdAndStatus(u.getId(), "PENDING_REVIEW");
            long favCount = favoriteRepository.countByUserId(u.getId());

            String tenantName = null;
            Optional<TenantMemberEntity> memOpt = tenantMemberRepository.findFirstByUserIdAndStatus(u.getId(), "ACTIVE");
            if (memOpt.isPresent()) {
                tenantName = tenantRepository.findById(memOpt.get().getTenantId()).map(TenantEntity::getName).orElse(null);
            }

            result.add(AdminDTO.AdminUserDTO.builder()
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

        return result;
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

            Optional<SubscriptionEntity> subOpt = subscriptionRepository.findById(t.getId());
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

        Optional<PlatformSettingEntity> sOpt = platformSettingRepository.findById("core_settings");
        if (sOpt.isPresent()) {
            Map<String, Object> map = safeParseMap(sOpt.get().getValueJson());
            if (map.containsKey("freeTrialEnabled")) freeTrialEnabled = Boolean.parseBoolean(map.get("freeTrialEnabled").toString());
            if (map.containsKey("freeTrialDays")) freeTrialDays = Integer.parseInt(map.get("freeTrialDays").toString());
            if (map.containsKey("maintenanceMode")) maintenanceMode = Boolean.parseBoolean(map.get("maintenanceMode").toString());
        }

        List<TenantDTO.PlanDTO> plans = List.of(
                TenantDTO.PlanDTO.builder()
                        .id("FREE").name("Starter").priceUsd(0.0).featuredSlots(0).branchSlots(1)
                        .features(List.of("10 Active Listings", "1 Branch Location", "Standard Support"))
                        .build(),
                TenantDTO.PlanDTO.builder()
                        .id("PRO").name("Professional Dealership").priceUsd(49.0).featuredSlots(5).branchSlots(3)
                        .features(List.of("Unlimited Listings", "5 Featured Spots", "3 Branch Locations", "AI Vehicle Reports", "Telegram CRM Bot"))
                        .build(),
                TenantDTO.PlanDTO.builder()
                        .id("ENTERPRISE").name("Enterprise Network").priceUsd(149.0).featuredSlots(20).branchSlots(10)
                        .features(List.of("Multi-Branch Sync", "20 Featured Spots", "10 Branch Locations", "Priority API Access", "Dedicated Account Manager"))
                        .build()
        );

        return AdminDTO.PlatformSettingsDTO.builder()
                .freeTrialEnabled(freeTrialEnabled)
                .freeTrialDays(freeTrialDays)
                .maintenanceMode(maintenanceMode)
                .plans(plans)
                .build();
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
