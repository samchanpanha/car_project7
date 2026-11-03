package com.khlan.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.khlan.dto.PlanDTO;
import com.khlan.dto.TenantDTO;
import com.khlan.entity.PlatformSettingEntity;
import com.khlan.entity.SubscriptionEntity;
import com.khlan.repository.PlatformSettingRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

@Slf4j
@Service
@RequiredArgsConstructor
public class PlanCatalogService {

    public static final String SETTING_KEY_PLANS = "plan_pricing";
    public static final double KHR_RATE = 4100.0;
    public static final double FEATURED_ADDON_PRICE_USD = 10.0;

    public static final List<String> PLAN_ORDER = List.of("FREE", "STARTER", "BASIC", "PRO", "ENTERPRISE");
    public static final Set<String> PAID_PLANS = Set.of("STARTER", "BASIC", "PRO", "ENTERPRISE");

    private final PlatformSettingRepository platformSettingRepository;
    private final ObjectMapper objectMapper;

    /**
     * Resolves the full plan catalog: PlatformSetting overrides merged on top of built-in defaults.
     */
    @Transactional(readOnly = true)
    public Map<String, PlanDTO.PlanDefinitionDTO> getPlans() {
        Map<String, PlanDTO.PlanDefinitionDTO> defaults = buildDefaultPlans();

        try {
            Optional<PlatformSettingEntity> settingOpt = platformSettingRepository.findById(SETTING_KEY_PLANS);
            if (settingOpt.isPresent()) {
                Map<String, PlanDTO.PlanDefinitionDTO> configured = objectMapper.readValue(
                        settingOpt.get().getValueJson(),
                        new TypeReference<Map<String, PlanDTO.PlanDefinitionDTO>>() {}
                );
                if (configured != null) {
                    for (Map.Entry<String, PlanDTO.PlanDefinitionDTO> entry : configured.entrySet()) {
                        String key = entry.getKey().toUpperCase();
                        PlanDTO.PlanDefinitionDTO override = entry.getValue();
                        if (override == null) continue;

                        PlanDTO.PlanDefinitionDTO base = defaults.get(key);
                        if (base == null) {
                            defaults.put(key, override);
                        } else {
                            mergePlan(base, override);
                        }
                    }
                }
            }
        } catch (Exception e) {
            log.error("Failed to read plan pricing platform setting; falling back to built-in defaults", e);
        }

        return defaults;
    }

    /**
     * Retrieves an individual plan definition. Returns null if unknown or disabled.
     */
    @Transactional(readOnly = true)
    public PlanDTO.PlanDefinitionDTO getPlan(String planKey) {
        if (planKey == null) return null;
        PlanDTO.PlanDefinitionDTO p = getPlans().get(planKey.toUpperCase());
        if (p == null || Boolean.FALSE.equals(p.getEnabled())) return null;
        return p;
    }

    /**
     * Retrieves an active purchasable plan (paid plan, enabled).
     */
    @Transactional(readOnly = true)
    public PlanDTO.PlanDefinitionDTO getPurchasablePlan(String planKey) {
        if (planKey == null) return null;
        String upper = planKey.toUpperCase();
        if (!PAID_PLANS.contains(upper)) return null;
        return getPlan(upper);
    }

    /**
     * Resolves price in USD for monthly or yearly billing.
     */
    @Transactional(readOnly = true)
    public double resolvePriceUsd(String planKey, boolean yearly) {
        PlanDTO.PlanDefinitionDTO plan = getPlan(planKey);
        if (plan == null) return 0.0;
        if (yearly) {
            if (plan.getPriceUsdYearly() != null) return plan.getPriceUsdYearly();
            if (plan.getPriceUsdMonthly() != null) return plan.getPriceUsdMonthly() * 10.0;
            return 0.0;
        }
        return plan.getPriceUsdMonthly() != null ? plan.getPriceUsdMonthly() : 0.0;
    }

    /**
     * Resolves price in KHR for monthly or yearly billing.
     */
    @Transactional(readOnly = true)
    public double resolvePriceKhr(String planKey, boolean yearly) {
        PlanDTO.PlanDefinitionDTO plan = getPlan(planKey);
        if (plan == null) return 0.0;
        if (yearly) {
            if (plan.getPriceKhrYearly() != null) return plan.getPriceKhrYearly();
            return resolvePriceUsd(planKey, true) * KHR_RATE;
        }
        if (plan.getPriceKhrMonthly() != null) return plan.getPriceKhrMonthly();
        return resolvePriceUsd(planKey, false) * KHR_RATE;
    }

    @Transactional(readOnly = true)
    public int resolveListingsLimit(String planKey) {
        PlanDTO.PlanDefinitionDTO plan = getPlan(planKey);
        return plan != null && plan.getListingsLimit() != null ? plan.getListingsLimit() : 3;
    }

    @Transactional(readOnly = true)
    public int resolveFeaturedLimit(String planKey) {
        PlanDTO.PlanDefinitionDTO plan = getPlan(planKey);
        return plan != null && plan.getFeaturedLimit() != null ? plan.getFeaturedLimit() : 0;
    }

    @Transactional(readOnly = true)
    public int resolveSeatsLimit(String planKey) {
        PlanDTO.PlanDefinitionDTO plan = getPlan(planKey);
        return plan != null && plan.getSeats() != null ? plan.getSeats() : 1;
    }

    @Transactional(readOnly = true)
    public int resolveBranchSlots(String planKey) {
        PlanDTO.PlanDefinitionDTO plan = getPlan(planKey);
        return plan != null && plan.getBranchSlots() != null ? plan.getBranchSlots() : 1;
    }

    @Transactional(readOnly = true)
    public boolean canSellSpareParts(String planKey) {
        PlanDTO.PlanDefinitionDTO plan = getPlan(planKey);
        return plan != null && Boolean.TRUE.equals(plan.getCanSellSpareParts());
    }

    @Transactional(readOnly = true)
    public double getFeaturedAddonPriceUsd() {
        Optional<PlatformSettingEntity> sOpt = platformSettingRepository.findById("core_settings");
        if (sOpt.isPresent()) {
            try {
                com.fasterxml.jackson.databind.JsonNode n = objectMapper.readTree(sOpt.get().getValueJson());
                if (n.has("featuredListingPriceUsd") && n.get("featuredListingPriceUsd").isNumber()) {
                    return n.get("featuredListingPriceUsd").asDouble();
                }
            } catch (Exception ignored) {}
        }
        return FEATURED_ADDON_PRICE_USD;
    }

    /**
     * Single authority that applies plan limits to a SubscriptionEntity.
     */
    public void applyLimits(SubscriptionEntity sub, String planKey) {
        if (sub == null) return;
        String plan = planKey != null ? planKey.toUpperCase() : "FREE";
        PlanDTO.PlanDefinitionDTO def = getPlan(plan);
        if (def == null) {
            def = buildDefaultPlans().getOrDefault(plan, buildDefaultPlans().get("FREE"));
        }

        sub.setPlan(def.getPlan());
        sub.setListingsLimit(def.getListingsLimit() != null ? def.getListingsLimit() : 3);
        sub.setFeaturedLimit(def.getFeaturedLimit() != null ? def.getFeaturedLimit() : 0);
        sub.setSeats(def.getSeats() != null ? def.getSeats() : 1);
        sub.setPriceUsd(def.getPriceUsdMonthly() != null ? def.getPriceUsdMonthly() : 0.0);
    }

    /**
     * Formats the plans as TenantDTO.PlanDTO list for TenantService / AdminService.
     */
    @Transactional(readOnly = true)
    public List<TenantDTO.PlanDTO> getTenantPlans() {
        Map<String, PlanDTO.PlanDefinitionDTO> catalog = getPlans();
        List<TenantDTO.PlanDTO> list = new ArrayList<>();

        for (String key : PLAN_ORDER) {
            PlanDTO.PlanDefinitionDTO def = catalog.get(key);
            if (def == null) continue;

            List<String> featureTexts = new ArrayList<>();
            if (def.getFeatures() != null) {
                for (PlanDTO.FeatureDTO f : def.getFeatures()) {
                    if (f != null && f.getEn() != null) featureTexts.add(f.getEn());
                }
            }

            list.add(TenantDTO.PlanDTO.builder()
                    .id(def.getPlan())
                    .plan(def.getPlan())
                    .name(def.getName())
                    .priceUsd(def.getPriceUsdMonthly() != null ? def.getPriceUsdMonthly() : 0.0)
                    .priceUsdMonthly(def.getPriceUsdMonthly() != null ? def.getPriceUsdMonthly() : 0.0)
                    .priceUsdYearly(def.getPriceUsdYearly() != null ? def.getPriceUsdYearly() : 0.0)
                    .priceKhrMonthly(def.getPriceKhrMonthly() != null ? def.getPriceKhrMonthly() : 0.0)
                    .priceKhrYearly(def.getPriceKhrYearly() != null ? def.getPriceKhrYearly() : 0.0)
                    .featuredSlots(def.getFeaturedLimit() != null ? def.getFeaturedLimit() : 0)
                    .featuredLimit(def.getFeaturedLimit() != null ? def.getFeaturedLimit() : 0)
                    .branchSlots(def.getBranchSlots() != null ? def.getBranchSlots() : 1)
                    .listingsLimit(def.getListingsLimit() != null ? def.getListingsLimit() : 3)
                    .seats(def.getSeats() != null ? def.getSeats() : 1)
                    .canSellSpareParts(Boolean.TRUE.equals(def.getCanSellSpareParts()))
                    .enabled(def.getEnabled() != null ? def.getEnabled() : true)
                    .features(featureTexts)
                    .build());
        }

        return list;
    }

    private void mergePlan(PlanDTO.PlanDefinitionDTO target, PlanDTO.PlanDefinitionDTO source) {
        if (source.getName() != null) target.setName(source.getName());
        if (source.getPriceUsdMonthly() != null) target.setPriceUsdMonthly(source.getPriceUsdMonthly());
        if (source.getPriceUsdYearly() != null) target.setPriceUsdYearly(source.getPriceUsdYearly());
        if (source.getPriceKhrMonthly() != null) target.setPriceKhrMonthly(source.getPriceKhrMonthly());
        if (source.getPriceKhrYearly() != null) target.setPriceKhrYearly(source.getPriceKhrYearly());
        if (source.getListingsLimit() != null) target.setListingsLimit(source.getListingsLimit());
        if (source.getFeaturedLimit() != null) target.setFeaturedLimit(source.getFeaturedLimit());
        if (source.getSeats() != null) target.setSeats(source.getSeats());
        if (source.getBranchSlots() != null) target.setBranchSlots(source.getBranchSlots());
        if (source.getCanSellSpareParts() != null) target.setCanSellSpareParts(source.getCanSellSpareParts());
        if (source.getEnabled() != null) target.setEnabled(source.getEnabled());
        if (source.getFeatures() != null && !source.getFeatures().isEmpty()) target.setFeatures(source.getFeatures());
    }

    public static Map<String, PlanDTO.PlanDefinitionDTO> buildDefaultPlans() {
        Map<String, PlanDTO.PlanDefinitionDTO> map = new LinkedHashMap<>();

        // 1. FREE ($0/mo, $0/yr, 3 listings, 0 featured, 1 seat, 1 branch, no spare parts)
        map.put("FREE", PlanDTO.PlanDefinitionDTO.builder()
                .plan("FREE")
                .name("Free")
                .priceUsdMonthly(0.0)
                .priceUsdYearly(0.0)
                .priceKhrMonthly(0.0)
                .priceKhrYearly(0.0)
                .listingsLimit(3)
                .featuredLimit(0)
                .seats(1)
                .branchSlots(1)
                .canSellSpareParts(false)
                .enabled(true)
                .features(List.of(
                        new PlanDTO.FeatureDTO("Up to 3 active vehicle listings", "ការដាក់លក់រថយន្តសកម្មរហូតដល់ ៣"),
                        new PlanDTO.FeatureDTO("1 user account", "គណនីអ្នកប្រើប្រាស់ ១"),
                        new PlanDTO.FeatureDTO("Standard AI inspection reports", "របាយការណ៍ត្រួតពិនិត្យ AI ស្តង់ដារ")
                ))
                .build());

        // 2. STARTER ($9/mo, $90/yr, ៛37,000/mo, 5 listings, 1 featured, 1 seat, 1 branch, no spare parts)
        map.put("STARTER", PlanDTO.PlanDefinitionDTO.builder()
                .plan("STARTER")
                .name("Starter")
                .priceUsdMonthly(9.0)
                .priceUsdYearly(90.0)
                .priceKhrMonthly(37000.0)
                .priceKhrYearly(370000.0)
                .listingsLimit(5)
                .featuredLimit(1)
                .seats(1)
                .branchSlots(1)
                .canSellSpareParts(false)
                .enabled(true)
                .features(List.of(
                        new PlanDTO.FeatureDTO("Up to 5 active vehicle listings", "ការដាក់លក់រថយន្តសកម្មរហូតដល់ ៥"),
                        new PlanDTO.FeatureDTO("1 featured listing slot", "កន្លែងរថយន្តលេចធ្លោ ១"),
                        new PlanDTO.FeatureDTO("1 user account", "គណនីអ្នកប្រើប្រាស់ ១"),
                        new PlanDTO.FeatureDTO("Standard AI inspection reports", "របាយការណ៍ត្រួតពិនិត្យ AI ស្តង់ដារ")
                ))
                .build());

        // 3. BASIC ($29/mo, $290/yr, ៛119,000/mo, 15 listings, 3 featured, 2 seats, 1 branch, no spare parts)
        map.put("BASIC", PlanDTO.PlanDefinitionDTO.builder()
                .plan("BASIC")
                .name("Basic Dealer")
                .priceUsdMonthly(29.0)
                .priceUsdYearly(290.0)
                .priceKhrMonthly(119000.0)
                .priceKhrYearly(1190000.0)
                .listingsLimit(15)
                .featuredLimit(3)
                .seats(2)
                .branchSlots(1)
                .canSellSpareParts(false)
                .enabled(true)
                .features(List.of(
                        new PlanDTO.FeatureDTO("Up to 15 active vehicle listings", "ការដាក់លក់រថយន្តសកម្មរហូតដល់ ១៥"),
                        new PlanDTO.FeatureDTO("3 featured slots", "កន្លែងរថយន្តលេចធ្លោ ៣"),
                        new PlanDTO.FeatureDTO("2 staff seats", "កន្លែងបុគ្គលិក ២ នាក់"),
                        new PlanDTO.FeatureDTO("1 showroom location", "ទីតាំងសាខាបង្ហាញ ១")
                ))
                .build());

        // 4. PRO ($59/mo, $590/yr, ៛242,000/mo, 50 listings, 10 featured, 5 seats, 3 branches, yes spare parts)
        map.put("PRO", PlanDTO.PlanDefinitionDTO.builder()
                .plan("PRO")
                .name("Pro Dealership")
                .priceUsdMonthly(59.0)
                .priceUsdYearly(590.0)
                .priceKhrMonthly(242000.0)
                .priceKhrYearly(2420000.0)
                .listingsLimit(50)
                .featuredLimit(10)
                .seats(5)
                .branchSlots(3)
                .canSellSpareParts(true)
                .enabled(true)
                .features(List.of(
                        new PlanDTO.FeatureDTO("Up to 50 active vehicle listings", "ការដាក់លក់រថយន្តសកម្មរហូតដល់ ៥០"),
                        new PlanDTO.FeatureDTO("10 featured slots & CRM", "កន្លែងរថយន្តលេចធ្លោ ១០ និង CRM"),
                        new PlanDTO.FeatureDTO("5 staff seats", "កន្លែងបុគ្គលិក ៥ នាក់"),
                        new PlanDTO.FeatureDTO("Up to 3 branch locations", "សាខាបង្ហាញរថយន្តរហូតដល់ ៣"),
                        new PlanDTO.FeatureDTO("Sell spare parts & motorcycles", "លក់គ្រឿងបន្លាស់ និងម៉ូតូ")
                ))
                .build());

        // 5. ENTERPRISE ($149/mo, $1,490/yr, ៛611,000/mo, 1000 listings, 30 featured, 20 seats, 10 branches, yes spare parts)
        map.put("ENTERPRISE", PlanDTO.PlanDefinitionDTO.builder()
                .plan("ENTERPRISE")
                .name("Enterprise Network")
                .priceUsdMonthly(149.0)
                .priceUsdYearly(1490.0)
                .priceKhrMonthly(611000.0)
                .priceKhrYearly(6110000.0)
                .listingsLimit(1000)
                .featuredLimit(30)
                .seats(20)
                .branchSlots(10)
                .canSellSpareParts(true)
                .enabled(true)
                .features(List.of(
                        new PlanDTO.FeatureDTO("Unlimited inventory (1,000 listings)", "ស្តុកមិនកំណត់ (១,០០០ គ្រឿង)"),
                        new PlanDTO.FeatureDTO("30 featured slots", "កន្លែងរថយន្តលេចធ្លោ ៣០"),
                        new PlanDTO.FeatureDTO("20 staff seats", "កន្លែងបុគ្គលិក ២០ នាក់"),
                        new PlanDTO.FeatureDTO("Up to 10 branch locations", "សាខាបង្ហាញរថយន្តរហូតដល់ ១០"),
                        new PlanDTO.FeatureDTO("Dedicated Telegram bot automation", "ស្វ័យប្រវត្តិកម្ម Telegram Bot ផ្ទាល់ខ្លួន"),
                        new PlanDTO.FeatureDTO("Sell spare parts & motorcycles", "លក់គ្រឿងបន្លាស់ និងម៉ូតូ")
                ))
                .build());

        return map;
    }
}
