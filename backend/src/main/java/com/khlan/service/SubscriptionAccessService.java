package com.khlan.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.khlan.dto.PlanDTO;
import com.khlan.dto.SubscriptionAccessDTO;
import com.khlan.entity.*;
import com.khlan.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class SubscriptionAccessService {

    private final SubscriptionRepository subscriptionRepository;
    private final TenantRepository tenantRepository;
    private final TenantMemberRepository tenantMemberRepository;
    private final SellerProfileRepository sellerProfileRepository;
    private final VehicleRepository vehicleRepository;
    private final UserRepository userRepository;
    private final PlanCatalogService planCatalogService;
    private final PlatformSettingRepository platformSettingRepository;
    private final ObjectMapper objectMapper;

    /**
     * Resolves subscription state, effective limits, and access rights for a user.
     * Evaluates read-time lazy expiration so status is never up to 24h stale.
     */
    @Transactional
    public SubscriptionAccessDTO resolve(String userId) {
        if (userId == null || userId.isBlank()) {
            return emptyAccess(null);
        }

        UserEntity user = userRepository.findById(userId).orElse(null);
        if (user == null) {
            return emptyAccess(userId);
        }

        // 1. Resolve tenant
        String tenantId = resolveTenantId(user);

        // Platform trial settings
        TrialSettings trialSettings = resolveTrialSettings();
        boolean freeTrialEnabled = trialSettings.enabled();
        int freeTrialDays = trialSettings.days();

        PlanDTO.PlanDefinitionDTO freeDef = planCatalogService.getPlan("FREE");
        boolean freePlanEnabled = freeDef != null && Boolean.TRUE.equals(freeDef.getEnabled());

        if (tenantId == null) {
            // User has no tenant yet; evaluate virtual trial
            OffsetDateTime startedAt = user.getCreatedAt() != null ? user.getCreatedAt() : OffsetDateTime.now();
            OffsetDateTime periodEnd = startedAt.plusDays(freeTrialDays);
            long daysLeft = Math.max(0, ChronoUnit.DAYS.between(OffsetDateTime.now(), periodEnd));
            boolean trialActive = freeTrialEnabled && daysLeft > 0;

            String status = trialActive ? "ACTIVE" : (freeTrialEnabled ? "EXPIRED" : (freePlanEnabled ? "ACTIVE" : "INACTIVE"));
            String effectivePlan = "FREE";
            int listingsLimit = planCatalogService.resolveListingsLimit("FREE");
            long listingsUsed = vehicleRepository.countBySellerIdAndStatus(userId, "PUBLISHED");
            boolean canPost = "ACTIVE".equalsIgnoreCase(status) && listingsUsed < listingsLimit;

            return SubscriptionAccessDTO.builder()
                    .userId(userId)
                    .tenantId(null)
                    .effectivePlan(effectivePlan)
                    .status(status)
                    .isTrial(trialActive)
                    .startedAt(startedAt.toString())
                    .currentPeriodEnd(periodEnd.toString())
                    .daysLeft(daysLeft)
                    .listingsLimit(listingsLimit)
                    .listingsUsed((int) listingsUsed)
                    .featuredLimit(planCatalogService.resolveFeaturedLimit("FREE"))
                    .featuredUsed(0)
                    .seatsLimit(planCatalogService.resolveSeatsLimit("FREE"))
                    .seatsUsed(1)
                    .branchSlots(1)
                    .canSellSpareParts(false)
                    .requiresSubscription("INACTIVE".equalsIgnoreCase(status))
                    .freeTrialEnabled(freeTrialEnabled)
                    .canPost(canPost)
                    .reason(trialActive ? "ACTIVE_TRIAL" : (freeTrialEnabled ? "TRIAL_EXPIRED" : "NO_TENANT"))
                    .build();
        }

        // 2. Query subscription for tenant
        SubscriptionEntity sub = subscriptionRepository.findByTenantId(tenantId).orElse(null);

        // If missing, auto-provision one
        if (sub == null) {
            sub = SubscriptionEntity.builder()
                    .id("sub_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16))
                    .tenantId(tenantId)
                    .billingCycle("MONTHLY")
                    .build();
            planCatalogService.applyLimits(sub, "FREE");

            OffsetDateTime startedAt = user.getCreatedAt() != null ? user.getCreatedAt() : OffsetDateTime.now();
            OffsetDateTime periodEnd = startedAt.plusDays(freeTrialDays);
            sub.setStartedAt(startedAt);
            sub.setCurrentPeriodEnd(periodEnd);

            if (freeTrialEnabled) {
                if (periodEnd.isBefore(OffsetDateTime.now())) {
                    sub.setStatus("EXPIRED");
                } else {
                    sub.setStatus("ACTIVE");
                }
            } else if (freePlanEnabled) {
                sub.setStatus("ACTIVE");
            } else {
                sub.setStatus("INACTIVE");
            }
            sub = subscriptionRepository.save(sub);
        }

        // 3. Lazy expiry at read time
        if ("ACTIVE".equalsIgnoreCase(sub.getStatus())
                && sub.getCurrentPeriodEnd() != null
                && sub.getCurrentPeriodEnd().isBefore(OffsetDateTime.now())) {
            sub.setStatus("EXPIRED");
            sub = subscriptionRepository.save(sub);
            log.info("Subscription for tenant {} lazily expired at read time", tenantId);
        }

        String rawPlan = sub.getPlan() != null ? sub.getPlan().toUpperCase() : "FREE";
        String status = sub.getStatus() != null ? sub.getStatus().toUpperCase() : "ACTIVE";

        long daysLeft = 0;
        if (sub.getCurrentPeriodEnd() != null) {
            daysLeft = Math.max(0, ChronoUnit.DAYS.between(OffsetDateTime.now(), sub.getCurrentPeriodEnd()));
        }

        // If expired or cancelled, fall back to FREE tier quotas for read-only grace
        boolean isExpiredOrCancelled = "EXPIRED".equalsIgnoreCase(status) || "CANCELLED".equalsIgnoreCase(status);
        String effectivePlan = isExpiredOrCancelled ? "FREE" : rawPlan;

        int listingsLimit = isExpiredOrCancelled
                ? planCatalogService.resolveListingsLimit("FREE")
                : (sub.getListingsLimit() != null ? sub.getListingsLimit() : planCatalogService.resolveListingsLimit(effectivePlan));

        int featuredLimit = isExpiredOrCancelled
                ? 0
                : (sub.getFeaturedLimit() != null ? sub.getFeaturedLimit() : planCatalogService.resolveFeaturedLimit(effectivePlan));

        int seatsLimit = isExpiredOrCancelled
                ? 1
                : (sub.getSeats() != null ? sub.getSeats() : planCatalogService.resolveSeatsLimit(effectivePlan));

        int branchSlots = isExpiredOrCancelled
                ? 1
                : planCatalogService.resolveBranchSlots(effectivePlan);

        boolean canSellSpareParts = !isExpiredOrCancelled && planCatalogService.canSellSpareParts(effectivePlan);

        // Usage counts
        long listingsUsed = vehicleRepository.countByTenantIdAndStatusIn(tenantId, List.of("PUBLISHED", "PENDING_REVIEW"));
        long featuredUsed = vehicleRepository.countByTenantIdAndFeaturedTrue(tenantId);
        long seatsUsed = tenantMemberRepository.findByTenantId(tenantId).stream()
                .filter(m -> "ACTIVE".equalsIgnoreCase(m.getStatus()))
                .count();

        boolean isTrial = "FREE".equalsIgnoreCase(rawPlan) && freeTrialEnabled && daysLeft > 0 && (sub.getPriceUsd() == null || sub.getPriceUsd() == 0.0);
        boolean requiresSubscription = "INACTIVE".equalsIgnoreCase(status) || (!freeTrialEnabled && "FREE".equalsIgnoreCase(rawPlan) && !freePlanEnabled);
        boolean canPost = "ACTIVE".equalsIgnoreCase(status) && listingsUsed < listingsLimit;

        String reason = switch (status) {
            case "EXPIRED" -> "PAID_EXPIRED";
            case "CANCELLED" -> "CANCELLED";
            case "INACTIVE" -> "SUBSCRIPTION_REQUIRED";
            default -> isTrial ? "ACTIVE_TRIAL" : "ACTIVE_SUBSCRIPTION";
        };

        return SubscriptionAccessDTO.builder()
                .userId(userId)
                .tenantId(tenantId)
                .effectivePlan(effectivePlan)
                .status(status)
                .isTrial(isTrial)
                .startedAt(sub.getStartedAt() != null ? sub.getStartedAt().toString() : null)
                .currentPeriodEnd(sub.getCurrentPeriodEnd() != null ? sub.getCurrentPeriodEnd().toString() : null)
                .daysLeft(daysLeft)
                .listingsLimit(listingsLimit)
                .listingsUsed((int) listingsUsed)
                .featuredLimit(featuredLimit)
                .featuredUsed((int) featuredUsed)
                .seatsLimit(seatsLimit)
                .seatsUsed((int) seatsUsed)
                .branchSlots(branchSlots)
                .canSellSpareParts(canSellSpareParts)
                .requiresSubscription(requiresSubscription)
                .freeTrialEnabled(freeTrialEnabled)
                .canPost(canPost)
                .reason(reason)
                .build();
    }

    /**
     * Resolves the user's tenant ID, creating a personal tenant if needed for sellers/dealers.
     */
    @Transactional
    public String ensureTenantId(UserEntity user) {
        String existing = resolveTenantId(user);
        if (existing != null) {
            return existing;
        }

        String name = user.getName() != null && !user.getName().isBlank() ? user.getName().trim() : "Seller";
        boolean isDealer = "DEALER".equalsIgnoreCase(user.getRole());
        String cleanSlug = name.toLowerCase().replaceAll("[^a-z0-9]+", "-") + "-" + UUID.randomUUID().toString().substring(0, 5);
        String tenantId = "ten_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16);

        TenantEntity tenant = TenantEntity.builder()
                .id(tenantId)
                .name(isDealer ? name + "'s Dealership" : name + " (Seller)")
                .slug(cleanSlug)
                .phone(user.getPhone())
                .status("ACTIVE")
                .build();
        tenantRepository.save(tenant);

        TenantMemberEntity member = TenantMemberEntity.builder()
                .id("tm_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16))
                .tenantId(tenantId)
                .userId(user.getId())
                .role("OWNER")
                .status("ACTIVE")
                .build();
        tenantMemberRepository.save(member);

        SellerProfileEntity profile = sellerProfileRepository.findByUserId(user.getId())
                .orElseGet(() -> SellerProfileEntity.builder()
                        .id("sp_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16))
                        .userId(user.getId())
                        .type(isDealer ? "DEALER" : "PRIVATE")
                        .city("Phnom Penh")
                        .memberSince(OffsetDateTime.now())
                        .build());
        profile.setTenantId(tenantId);
        sellerProfileRepository.save(profile);

        // Ensure default FREE subscription row
        TrialSettings trialSettings = resolveTrialSettings();
        boolean freeTrialEnabled = trialSettings.enabled();
        int freeTrialDays = trialSettings.days();

        SubscriptionEntity sub = SubscriptionEntity.builder()
                .id("sub_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16))
                .tenantId(tenantId)
                .billingCycle("MONTHLY")
                .startedAt(OffsetDateTime.now())
                .currentPeriodEnd(OffsetDateTime.now().plusDays(freeTrialDays))
                .status(freeTrialEnabled ? "ACTIVE" : "INACTIVE")
                .build();
        planCatalogService.applyLimits(sub, "FREE");
        subscriptionRepository.save(sub);

        return tenantId;
    }

    /**
     * Finds tenantId if one exists for the user without auto-creating.
     */
    public String resolveTenantId(UserEntity user) {
        if (user == null) return null;

        // Check seller profile first
        Optional<SellerProfileEntity> profile = sellerProfileRepository.findByUserId(user.getId());
        if (profile.isPresent() && profile.get().getTenantId() != null && !profile.get().getTenantId().isBlank()) {
            return profile.get().getTenantId();
        }

        // Check active tenant membership
        Optional<TenantMemberEntity> tm = tenantMemberRepository.findFirstByUserIdAndStatus(user.getId(), "ACTIVE");
        if (tm.isPresent()) {
            String tid = tm.get().getTenantId();
            if (profile.isPresent() && (profile.get().getTenantId() == null || profile.get().getTenantId().isBlank())) {
                SellerProfileEntity p = profile.get();
                p.setTenantId(tid);
                sellerProfileRepository.save(p);
            }
            return tid;
        }

        return null;
    }

    /**
     * Enforces subscription limits and status when a seller attempts to create a listing.
     * Throws 403 FORBIDDEN or 400 BAD_REQUEST if limits are exceeded.
     */
    @Transactional
    public void assertCanCreateListing(UserEntity seller, String listingCategory) {
        SubscriptionAccessDTO access = resolve(seller.getId());

        if ("EXPIRED".equalsIgnoreCase(access.getStatus())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Your subscription has expired. Please renew your plan to post new vehicles.");
        }

        if ("INACTIVE".equalsIgnoreCase(access.getStatus())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "A subscription is required to publish listings. Please choose a plan to continue.");
        }

        if ("CANCELLED".equalsIgnoreCase(access.getStatus())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Your subscription was cancelled. Please reactivate your plan to post new vehicles.");
        }

        if ("SPARE_PART".equals(listingCategory) && !access.isCanSellSpareParts()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Your current " + access.getEffectivePlan() + " plan does not allow listing spare parts. Please upgrade to Pro or Enterprise.");
        }

        if (access.getListingsUsed() >= access.getListingsLimit()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Listing limit reached for your " + access.getEffectivePlan() + " plan ("
                            + access.getListingsUsed() + "/" + access.getListingsLimit() + "). Please upgrade your subscription to post more vehicles.");
        }
    }

    private record TrialSettings(boolean enabled, int days) {}

    private TrialSettings resolveTrialSettings() {
        boolean freeTrialEnabled = true;
        int freeTrialDays = 30;
        try {
            Optional<PlatformSettingEntity> sOpt = platformSettingRepository.findById("core_settings");
            if (sOpt.isPresent() && sOpt.get().getValueJson() != null) {
                Map<String, Object> map = objectMapper.readValue(
                        sOpt.get().getValueJson(),
                        new TypeReference<Map<String, Object>>() {}
                );
                if (map != null) {
                    if (map.containsKey("freeTrialEnabled")) {
                        freeTrialEnabled = Boolean.parseBoolean(String.valueOf(map.get("freeTrialEnabled")));
                    }
                    if (map.containsKey("freeTrialDays")) {
                        try {
                            freeTrialDays = Integer.parseInt(String.valueOf(map.get("freeTrialDays")));
                        } catch (NumberFormatException ignored) {}
                    }
                }
            } else {
                Optional<PlatformSettingEntity> ftEnabledOpt = platformSettingRepository.findById("freeTrialEnabled");
                if (ftEnabledOpt.isPresent()) {
                    freeTrialEnabled = Boolean.parseBoolean(ftEnabledOpt.get().getValueJson());
                }
                Optional<PlatformSettingEntity> ftDaysOpt = platformSettingRepository.findById("freeTrialDays");
                if (ftDaysOpt.isPresent()) {
                    try {
                        freeTrialDays = Integer.parseInt(ftDaysOpt.get().getValueJson());
                    } catch (NumberFormatException ignored) {}
                }
            }
        } catch (Exception e) {
            log.warn("Failed to load trial settings, using defaults (enabled=true, days=30): {}", e.getMessage());
        }
        return new TrialSettings(freeTrialEnabled, freeTrialDays > 0 ? freeTrialDays : 30);
    }

    private SubscriptionAccessDTO emptyAccess(String userId) {
        return SubscriptionAccessDTO.builder()
                .userId(userId)
                .effectivePlan("FREE")
                .status("INACTIVE")
                .isTrial(false)
                .daysLeft(0)
                .listingsLimit(3)
                .listingsUsed(0)
                .featuredLimit(0)
                .featuredUsed(0)
                .seatsLimit(1)
                .seatsUsed(1)
                .branchSlots(1)
                .canSellSpareParts(false)
                .requiresSubscription(true)
                .freeTrialEnabled(false)
                .canPost(false)
                .reason("NOT_AUTHENTICATED")
                .build();
    }
}

