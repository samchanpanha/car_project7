package com.khlan.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.khlan.dto.PlanDTO;
import com.khlan.dto.SubscriptionAccessDTO;
import com.khlan.entity.*;
import com.khlan.repository.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class SubscriptionAccessServiceTest {

    @Mock
    private SubscriptionRepository subscriptionRepository;
    @Mock
    private TenantRepository tenantRepository;
    @Mock
    private TenantMemberRepository tenantMemberRepository;
    @Mock
    private SellerProfileRepository sellerProfileRepository;
    @Mock
    private VehicleRepository vehicleRepository;
    @Mock
    private UserRepository userRepository;
    @Mock
    private PlanCatalogService planCatalogService;
    @Mock
    private PlatformSettingRepository platformSettingRepository;

    private SubscriptionAccessService accessService;

    @BeforeEach
    void setUp() {
        accessService = new SubscriptionAccessService(
                subscriptionRepository,
                tenantRepository,
                tenantMemberRepository,
                sellerProfileRepository,
                vehicleRepository,
                userRepository,
                planCatalogService,
                platformSettingRepository,
                new ObjectMapper()
        );
    }

    @Test
    @DisplayName("Active paid plan within period resolves to ACTIVE with full quotas and post access")
    void testActivePaidSubscription() {
        UserEntity user = UserEntity.builder().id("usr_dealer_1").role("DEALER").build();
        when(userRepository.findById("usr_dealer_1")).thenReturn(Optional.of(user));

        TenantMemberEntity tm = TenantMemberEntity.builder().tenantId("ten_1").role("OWNER").status("ACTIVE").build();
        when(tenantMemberRepository.findFirstByUserIdAndStatus("usr_dealer_1", "ACTIVE")).thenReturn(Optional.of(tm));
        when(sellerProfileRepository.findByUserId("usr_dealer_1")).thenReturn(Optional.empty());

        when(planCatalogService.getPlan("FREE")).thenReturn(PlanDTO.PlanDefinitionDTO.builder().enabled(true).build());

        SubscriptionEntity sub = SubscriptionEntity.builder()
                .tenantId("ten_1")
                .plan("PRO")
                .status("ACTIVE")
                .listingsLimit(50)
                .featuredLimit(10)
                .seats(5)
                .currentPeriodEnd(OffsetDateTime.now().plusDays(20))
                .build();
        when(subscriptionRepository.findByTenantId("ten_1")).thenReturn(Optional.of(sub));

        when(planCatalogService.resolveBranchSlots("PRO")).thenReturn(3);
        when(planCatalogService.canSellSpareParts("PRO")).thenReturn(true);
        when(vehicleRepository.countByTenantIdAndStatusIn(eq("ten_1"), any())).thenReturn(10L);
        when(vehicleRepository.countByTenantIdAndFeaturedTrue("ten_1")).thenReturn(2L);
        when(tenantMemberRepository.findByTenantId("ten_1")).thenReturn(List.of(tm));

        SubscriptionAccessDTO access = accessService.resolve("usr_dealer_1");

        assertNotNull(access);
        assertEquals("PRO", access.getEffectivePlan());
        assertEquals("ACTIVE", access.getStatus());
        assertFalse(access.isTrial());
        assertTrue(access.isCanPost());
        assertTrue(access.isCanSellSpareParts());
        assertEquals(50, access.getListingsLimit());
        assertEquals(10, access.getListingsUsed());
        assertEquals(10, access.getFeaturedLimit());
        assertEquals(2, access.getFeaturedUsed());
        assertEquals(3, access.getBranchSlots());
    }

    @Test
    @DisplayName("Paid plan past periodEnd is lazily expired at read time and enters read-only grace")
    void testLazyExpiryAtReadTime() {
        UserEntity user = UserEntity.builder().id("usr_dealer_2").role("DEALER").build();
        when(userRepository.findById("usr_dealer_2")).thenReturn(Optional.of(user));

        TenantMemberEntity tm = TenantMemberEntity.builder().tenantId("ten_2").role("OWNER").status("ACTIVE").build();
        when(tenantMemberRepository.findFirstByUserIdAndStatus("usr_dealer_2", "ACTIVE")).thenReturn(Optional.of(tm));
        when(sellerProfileRepository.findByUserId("usr_dealer_2")).thenReturn(Optional.empty());

        when(planCatalogService.getPlan("FREE")).thenReturn(PlanDTO.PlanDefinitionDTO.builder().enabled(true).build());

        // Expired 2 days ago, but still marked ACTIVE in DB
        SubscriptionEntity sub = SubscriptionEntity.builder()
                .tenantId("ten_2")
                .plan("PRO")
                .status("ACTIVE")
                .listingsLimit(50)
                .featuredLimit(10)
                .seats(5)
                .currentPeriodEnd(OffsetDateTime.now().minusDays(2))
                .build();
        when(subscriptionRepository.findByTenantId("ten_2")).thenReturn(Optional.of(sub));
        when(subscriptionRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        when(planCatalogService.resolveListingsLimit("FREE")).thenReturn(3);

        SubscriptionAccessDTO access = accessService.resolve("usr_dealer_2");

        // Status updated to EXPIRED on read
        assertEquals("EXPIRED", access.getStatus());
        assertEquals("FREE", access.getEffectivePlan()); // Downgraded to FREE
        assertFalse(access.isCanPost()); // Block write operations
        assertFalse(access.isCanSellSpareParts());
        assertEquals(3, access.getListingsLimit()); // FREE limits applied
        verify(subscriptionRepository).save(argThat(s -> "EXPIRED".equalsIgnoreCase(s.getStatus())));
    }

    @Test
    @DisplayName("assertCanCreateListing rejects expired subscription with 403 Forbidden")
    void testAssertCanCreateListingRejectsExpired() {
        UserEntity seller = UserEntity.builder().id("usr_expired").role("SELLER").build();
        when(userRepository.findById("usr_expired")).thenReturn(Optional.of(seller));

        TenantMemberEntity tm = TenantMemberEntity.builder().tenantId("ten_exp").role("OWNER").status("ACTIVE").build();
        when(tenantMemberRepository.findFirstByUserIdAndStatus("usr_expired", "ACTIVE")).thenReturn(Optional.of(tm));
        when(sellerProfileRepository.findByUserId("usr_expired")).thenReturn(Optional.empty());

        SubscriptionEntity sub = SubscriptionEntity.builder()
                .tenantId("ten_exp")
                .plan("FREE")
                .status("EXPIRED")
                .build();
        when(subscriptionRepository.findByTenantId("ten_exp")).thenReturn(Optional.of(sub));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> accessService.assertCanCreateListing(seller, "CAR"));

        assertEquals(403, ex.getStatusCode().value());
        assertTrue(ex.getReason().contains("expired"));
    }

    @Test
    @DisplayName("assertCanCreateListing rejects listing creation when listings limit is reached")
    void testAssertCanCreateListingRejectsAtLimit() {
        UserEntity seller = UserEntity.builder().id("usr_full").role("SELLER").build();
        when(userRepository.findById("usr_full")).thenReturn(Optional.of(seller));

        TenantMemberEntity tm = TenantMemberEntity.builder().tenantId("ten_full").role("OWNER").status("ACTIVE").build();
        when(tenantMemberRepository.findFirstByUserIdAndStatus("usr_full", "ACTIVE")).thenReturn(Optional.of(tm));
        when(sellerProfileRepository.findByUserId("usr_full")).thenReturn(Optional.empty());

        SubscriptionEntity sub = SubscriptionEntity.builder()
                .tenantId("ten_full")
                .plan("FREE")
                .status("ACTIVE")
                .listingsLimit(3)
                .build();
        when(subscriptionRepository.findByTenantId("ten_full")).thenReturn(Optional.of(sub));
        when(planCatalogService.getPlan("FREE")).thenReturn(PlanDTO.PlanDefinitionDTO.builder().enabled(true).build());

        // Already has 3 published listings
        when(vehicleRepository.countByTenantIdAndStatusIn(eq("ten_full"), any())).thenReturn(3L);

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> accessService.assertCanCreateListing(seller, "CAR"));

        assertEquals(400, ex.getStatusCode().value());
        assertTrue(ex.getReason().contains("Listing limit reached"));
    }

    @Test
    @DisplayName("assertCanCreateListing rejects SPARE_PART listing if plan does not permit it")
    void testAssertCanCreateListingRejectsSparePartsOnBasic() {
        UserEntity seller = UserEntity.builder().id("usr_basic").role("SELLER").build();
        when(userRepository.findById("usr_basic")).thenReturn(Optional.of(seller));

        TenantMemberEntity tm = TenantMemberEntity.builder().tenantId("ten_basic").role("OWNER").status("ACTIVE").build();
        when(tenantMemberRepository.findFirstByUserIdAndStatus("usr_basic", "ACTIVE")).thenReturn(Optional.of(tm));
        when(sellerProfileRepository.findByUserId("usr_basic")).thenReturn(Optional.empty());

        SubscriptionEntity sub = SubscriptionEntity.builder()
                .tenantId("ten_basic")
                .plan("BASIC")
                .status("ACTIVE")
                .listingsLimit(15)
                .build();
        when(subscriptionRepository.findByTenantId("ten_basic")).thenReturn(Optional.of(sub));
        when(planCatalogService.getPlan("FREE")).thenReturn(PlanDTO.PlanDefinitionDTO.builder().enabled(true).build());
        when(planCatalogService.canSellSpareParts("BASIC")).thenReturn(false);

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> accessService.assertCanCreateListing(seller, "SPARE_PART"));

        assertEquals(400, ex.getStatusCode().value());
        assertTrue(ex.getReason().contains("does not allow listing spare parts"));
    }
}
