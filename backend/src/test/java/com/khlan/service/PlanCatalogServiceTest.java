package com.khlan.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.khlan.dto.PlanDTO;
import com.khlan.entity.PlatformSettingEntity;
import com.khlan.entity.SubscriptionEntity;
import com.khlan.repository.PlatformSettingRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PlanCatalogServiceTest {

    @Mock
    private PlatformSettingRepository platformSettingRepository;

    private final ObjectMapper objectMapper = new ObjectMapper();
    private PlanCatalogService planCatalogService;

    @BeforeEach
    void setUp() {
        planCatalogService = new PlanCatalogService(platformSettingRepository, objectMapper);
    }

    @Test
    @DisplayName("Default catalog contains 5 tiers with correct Cambodia market pricing and quotas")
    void testDefaultCatalog() {
        when(platformSettingRepository.findById(PlanCatalogService.SETTING_KEY_PLANS)).thenReturn(Optional.empty());

        Map<String, PlanDTO.PlanDefinitionDTO> plans = planCatalogService.getPlans();
        assertNotNull(plans);
        assertEquals(5, plans.size());

        // FREE
        PlanDTO.PlanDefinitionDTO free = plans.get("FREE");
        assertEquals(0.0, free.getPriceUsdMonthly());
        assertEquals(3, free.getListingsLimit());
        assertEquals(0, free.getFeaturedLimit());
        assertEquals(1, free.getSeats());
        assertEquals(1, free.getBranchSlots());
        assertFalse(free.getCanSellSpareParts());

        // STARTER ($9/mo, 5 listings, 1 featured)
        PlanDTO.PlanDefinitionDTO starter = plans.get("STARTER");
        assertEquals(9.0, starter.getPriceUsdMonthly());
        assertEquals(90.0, starter.getPriceUsdYearly());
        assertEquals(5, starter.getListingsLimit());
        assertEquals(1, starter.getFeaturedLimit());
        assertEquals(1, starter.getSeats());
        assertEquals(1, starter.getBranchSlots());
        assertFalse(starter.getCanSellSpareParts());

        // BASIC ($29/mo, 15 listings, 3 featured, 2 seats)
        PlanDTO.PlanDefinitionDTO basic = plans.get("BASIC");
        assertEquals(29.0, basic.getPriceUsdMonthly());
        assertEquals(290.0, basic.getPriceUsdYearly());
        assertEquals(15, basic.getListingsLimit());
        assertEquals(3, basic.getFeaturedLimit());
        assertEquals(2, basic.getSeats());
        assertEquals(1, basic.getBranchSlots());
        assertFalse(basic.getCanSellSpareParts());

        // PRO ($59/mo, 50 listings, 10 featured, 5 seats, 3 branches, spare parts)
        PlanDTO.PlanDefinitionDTO pro = plans.get("PRO");
        assertEquals(59.0, pro.getPriceUsdMonthly());
        assertEquals(590.0, pro.getPriceUsdYearly());
        assertEquals(50, pro.getListingsLimit());
        assertEquals(10, pro.getFeaturedLimit());
        assertEquals(5, pro.getSeats());
        assertEquals(3, pro.getBranchSlots());
        assertTrue(pro.getCanSellSpareParts());

        // ENTERPRISE ($149/mo, 1000 listings, 30 featured, 20 seats, 10 branches, spare parts)
        PlanDTO.PlanDefinitionDTO ent = plans.get("ENTERPRISE");
        assertEquals(149.0, ent.getPriceUsdMonthly());
        assertEquals(1490.0, ent.getPriceUsdYearly());
        assertEquals(1000, ent.getListingsLimit());
        assertEquals(30, ent.getFeaturedLimit());
        assertEquals(20, ent.getSeats());
        assertEquals(10, ent.getBranchSlots());
        assertTrue(ent.getCanSellSpareParts());
    }

    @Test
    @DisplayName("Admin platform setting overrides merged seamlessly on top of built-in catalog")
    void testAdminSettingOverrides() throws Exception {
        String overrideJson = """
                {
                    "PRO": {
                        "priceUsdMonthly": 65.0,
                        "listingsLimit": 60
                    }
                }
                """;
        PlatformSettingEntity setting = PlatformSettingEntity.builder()
                .key(PlanCatalogService.SETTING_KEY_PLANS)
                .valueJson(overrideJson)
                .build();
        when(platformSettingRepository.findById(PlanCatalogService.SETTING_KEY_PLANS)).thenReturn(Optional.of(setting));

        PlanDTO.PlanDefinitionDTO pro = planCatalogService.getPlan("PRO");
        assertNotNull(pro);
        assertEquals(65.0, pro.getPriceUsdMonthly()); // overridden
        assertEquals(60, pro.getListingsLimit()); // overridden
        assertEquals(10, pro.getFeaturedLimit()); // preserved from default
        assertEquals(5, pro.getSeats()); // preserved from default
        assertEquals(3, pro.getBranchSlots()); // preserved from default
        assertTrue(pro.getCanSellSpareParts()); // preserved from default
    }

    @Test
    @DisplayName("applyLimits updates subscription entity quotas correctly")
    void testApplyLimits() {
        when(platformSettingRepository.findById(PlanCatalogService.SETTING_KEY_PLANS)).thenReturn(Optional.empty());

        SubscriptionEntity sub = new SubscriptionEntity();
        planCatalogService.applyLimits(sub, "PRO");

        assertEquals("PRO", sub.getPlan());
        assertEquals(50, sub.getListingsLimit());
        assertEquals(10, sub.getFeaturedLimit());
        assertEquals(5, sub.getSeats());
        assertEquals(59.0, sub.getPriceUsd());
    }

    @Test
    @DisplayName("getPurchasablePlan rejects FREE tier or disabled plans")
    void testPurchasablePlanValidation() {
        when(platformSettingRepository.findById(PlanCatalogService.SETTING_KEY_PLANS)).thenReturn(Optional.empty());

        assertNull(planCatalogService.getPurchasablePlan("FREE"));
        assertNull(planCatalogService.getPurchasablePlan("UNKNOWN"));
        assertNotNull(planCatalogService.getPurchasablePlan("STARTER"));
        assertNotNull(planCatalogService.getPurchasablePlan("PRO"));
    }
}

