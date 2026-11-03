package com.khlan.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.khlan.dto.PlanDTO;
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
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class PlanAdminService {

    private final SubscriptionRepository subscriptionRepository;
    private final SubscriptionPaymentRepository subscriptionPaymentRepository;
    private final TenantRepository tenantRepository;
    private final PlatformSettingRepository platformSettingRepository;
    private final AuditLogRepository auditLogRepository;
    private final ObjectMapper objectMapper;
    private final PlanCatalogService planCatalogService;

    private static final String SETTING_KEY_PLANS = "plan_pricing";

    @Transactional(readOnly = true)
    public PlanDTO.PlanPricingResponse getPlanPricing() {
        return PlanDTO.PlanPricingResponse.builder()
                .plans(planCatalogService.getPlans())
                .khrExchangeRate(PlanCatalogService.KHR_RATE)
                .build();
    }

    @Transactional
    public void savePlanPricing(Map<String, PlanDTO.PlanDefinitionDTO> plans, String adminUserId) {
        try {
            String json = objectMapper.writeValueAsString(plans);
            PlatformSettingEntity setting = PlatformSettingEntity.builder()
                    .key(SETTING_KEY_PLANS)
                    .valueJson(json)
                    .build();
            platformSettingRepository.save(setting);

            recordAudit(adminUserId, "PLAN_PRICING_UPDATED", "PlatformSetting", SETTING_KEY_PLANS,
                    Map.of("plansUpdated", plans.keySet()));
        } catch (Exception e) {
            log.error("Failed to save plan pricing", e);
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to save plan pricing");
        }
    }

    @Transactional
    public void extendSubscription(PlanDTO.ExtendSubscriptionRequest req, String adminUserId) {
        TenantEntity tenant = tenantRepository.findById(req.getTenantId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Tenant not found"));

        SubscriptionEntity sub = subscriptionRepository.findByTenantId(req.getTenantId())
                .orElseGet(() -> SubscriptionEntity.builder()
                        .id("sub_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16))
                        .tenantId(req.getTenantId())
                        .startedAt(OffsetDateTime.now())
                        .build());

        String targetPlan = req.getPlan() != null ? req.getPlan().toUpperCase() : sub.getPlan();
        if (targetPlan == null) targetPlan = "PRO";

        OffsetDateTime now = OffsetDateTime.now();
        OffsetDateTime base = (sub.getCurrentPeriodEnd() != null && sub.getCurrentPeriodEnd().isAfter(now)
                && "ACTIVE".equals(sub.getStatus()))
                ? sub.getCurrentPeriodEnd()
                : now;

        int months = req.getMonths() != null ? Math.min(36, Math.max(1, req.getMonths())) : 1;
        OffsetDateTime newPeriodEnd = base.plusMonths(months);

        sub.setPlan(targetPlan);
        sub.setStatus("ACTIVE");
        sub.setCurrentPeriodEnd(newPeriodEnd);

        // Adjust limits via unified catalog
        planCatalogService.applyLimits(sub, targetPlan);

        subscriptionRepository.save(sub);

        recordAudit(adminUserId, "SUBSCRIPTION_EXTENDED", "Subscription", sub.getId(),
                Map.of("tenantId", tenant.getId(), "plan", targetPlan, "months", months, "periodEnd", newPeriodEnd.toString(),
                        "note", req.getNote() != null ? req.getNote() : ""));
    }

    @Transactional(readOnly = true)
    public PlanDTO.SubscriptionAnalyticsDTO getSubscriptionAnalytics() {
        List<SubscriptionPaymentEntity> verifiedPayments = subscriptionPaymentRepository.findByStatusOrderByCreatedAtDesc("VERIFIED");
        long pendingCount = subscriptionPaymentRepository.countByStatus("AWAITING_VERIFICATION");
        List<SubscriptionEntity> activeSubs = subscriptionRepository.findAll().stream()
                .filter(s -> "ACTIVE".equals(s.getStatus()))
                .toList();

        double totalRevenue = verifiedPayments.stream().mapToDouble(SubscriptionPaymentEntity::getAmountUsd).sum();
        double monthlyRevenue = verifiedPayments.stream()
                .filter(p -> "MONTHLY".equalsIgnoreCase(p.getBillingCycle()))
                .mapToDouble(SubscriptionPaymentEntity::getAmountUsd).sum();
        double yearlyRevenue = verifiedPayments.stream()
                .filter(p -> "YEARLY".equalsIgnoreCase(p.getBillingCycle()))
                .mapToDouble(SubscriptionPaymentEntity::getAmountUsd).sum();

        // Calculate Estimated MRR
        double mrr = activeSubs.stream().mapToDouble(s -> {
            if ("FREE".equalsIgnoreCase(s.getPlan())) return 0.0;
            double price = s.getPriceUsd() != null ? s.getPriceUsd() : 0.0;
            return "YEARLY".equalsIgnoreCase(s.getBillingCycle()) ? price / 12.0 : price;
        }).sum();

        Map<String, Long> planCounts = new HashMap<>(Map.of("FREE", 0L, "BASIC", 0L, "PRO", 0L, "ENTERPRISE", 0L));
        for (SubscriptionEntity s : activeSubs) {
            String p = s.getPlan() != null ? s.getPlan().toUpperCase() : "FREE";
            planCounts.put(p, planCounts.getOrDefault(p, 0L) + 1);
        }

        List<Map<String, Object>> recent = verifiedPayments.stream().limit(10).map(p -> {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("id", p.getId());
            map.put("tenantId", p.getTenantId());
            map.put("plan", p.getPlan());
            map.put("amountUsd", p.getAmountUsd());
            map.put("currency", p.getCurrency());
            map.put("createdAt", p.getCreatedAt().toString());
            return map;
        }).collect(Collectors.toList());

        return PlanDTO.SubscriptionAnalyticsDTO.builder()
                .totalRevenue(Math.round(totalRevenue * 100.0) / 100.0)
                .monthlyRevenue(Math.round(monthlyRevenue * 100.0) / 100.0)
                .yearlyRevenue(Math.round(yearlyRevenue * 100.0) / 100.0)
                .mrr(Math.round(mrr * 100.0) / 100.0)
                .pendingCount((int) pendingCount)
                .planCounts(planCounts)
                .recent(recent)
                .build();
    }



    private void recordAudit(String actorId, String action, String entity, String entityId, Map<String, Object> meta) {
        try {
            AuditLogEntity logEntity = AuditLogEntity.builder()
                    .id("aud_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16))
                    .actorId(actorId)
                    .action(action)
                    .entity(entity)
                    .entityId(entityId)
                    .metaJson(objectMapper.writeValueAsString(meta))
                    .build();
            auditLogRepository.save(logEntity);
        } catch (Exception e) {
            log.error("Failed to record audit log", e);
        }
    }
}
