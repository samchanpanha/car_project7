package com.khlan.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.khlan.dto.PaymentDTO;
import com.khlan.dto.PlanDTO;
import com.khlan.entity.*;
import com.khlan.repository.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.web.server.ResponseStatusException;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class PlanPricingEnforcementTest {

    @Mock
    private SubscriptionPaymentRepository subscriptionPaymentRepository;
    @Mock
    private AbaTransactionRepository abaTransactionRepository;
    @Mock
    private SubscriptionRepository subscriptionRepository;
    @Mock
    private TenantRepository tenantRepository;
    @Mock
    private UserRepository userRepository;
    @Mock
    private PlatformSettingRepository platformSettingRepository;
    @Mock
    private AuditLogRepository auditLogRepository;
    @Mock
    private MinioStorageService minioStorageService;
    @Mock
    private ObjectMapper objectMapper;
    @Mock
    private ReceiptSlipParser receiptSlipParser;
    @Mock
    private RealtimeService realtimeService;
    @Mock
    private PlanCatalogService planCatalogService;
    @Mock
    private VehicleRepository vehicleRepository;
    @Mock
    private ObjectProvider<TelegramService> telegramServiceProvider;
    @Mock
    private ObjectProvider<CronSchedulerService> cronSchedulerProvider;

    @InjectMocks
    private PaymentService paymentService;

    @Test
    @DisplayName("PaymentService charges the catalog price for PRO ($59), not the old hardcoded $49")
    void testCreatePaymentChargesCatalogPrice() {
        TenantEntity tenant = TenantEntity.builder().id("ten_pro").name("Pro Dealer").build();
        when(tenantRepository.findById("ten_pro")).thenReturn(Optional.of(tenant));

        PlanDTO.PlanDefinitionDTO proDef = PlanDTO.PlanDefinitionDTO.builder()
                .plan("PRO")
                .priceUsdMonthly(59.0)
                .build();
        when(planCatalogService.getPurchasablePlan("PRO")).thenReturn(proDef);
        when(planCatalogService.resolvePriceUsd("PRO", false)).thenReturn(59.0);
        when(subscriptionPaymentRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        PaymentDTO.CreatePaymentRequest req = PaymentDTO.CreatePaymentRequest.builder()
                .plan("PRO")
                .billingCycle("MONTHLY")
                .currency("USD")
                .build();

        PaymentDTO.SubscriptionPaymentDTO result = paymentService.createPayment("ten_pro", req);

        assertNotNull(result);
        assertEquals("PRO", result.getPlan());
        assertEquals(59.0, result.getAmountUsd(), "Must charge $59 catalog price for PRO, not hardcoded $49");
    }

    @Test
    @DisplayName("PaymentService rejects unknown plan or FREE tier purchase")
    void testCreatePaymentRejectsInvalidPlan() {
        TenantEntity tenant = TenantEntity.builder().id("ten_free").name("Free Dealer").build();
        when(tenantRepository.findById("ten_free")).thenReturn(Optional.of(tenant));
        when(planCatalogService.getPurchasablePlan("FREE")).thenReturn(null);

        PaymentDTO.CreatePaymentRequest req = PaymentDTO.CreatePaymentRequest.builder()
                .plan("FREE")
                .build();

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> paymentService.createPayment("ten_free", req));

        assertEquals(400, ex.getStatusCode().value());
        assertTrue(ex.getReason().contains("plan is not available"));
    }

    @Test
    @DisplayName("PaymentService supports FEATURED listing add-on purchase at $10")
    void testCreatePaymentFeaturedAddon() {
        TenantEntity tenant = TenantEntity.builder().id("ten_feat").name("Feat Dealer").build();
        when(tenantRepository.findById("ten_feat")).thenReturn(Optional.of(tenant));
        when(planCatalogService.getFeaturedAddonPriceUsd()).thenReturn(10.0);
        when(subscriptionPaymentRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        PaymentDTO.CreatePaymentRequest req = PaymentDTO.CreatePaymentRequest.builder()
                .plan("FEATURED")
                .currency("USD")
                .note("Promotion for vehicle veh_12345")
                .build();

        PaymentDTO.SubscriptionPaymentDTO result = paymentService.createPayment("ten_feat", req);

        assertNotNull(result);
        assertEquals("FEATURED", result.getPlan());
        assertEquals(10.0, result.getAmountUsd(), "Must charge $10 for featured add-on");
    }

    @Test
    @DisplayName("handlePaymentAction approving FEATURED increments slot and marks vehicle featured")
    void testApproveFeaturedPayment() {
        SubscriptionPaymentEntity payment = SubscriptionPaymentEntity.builder()
                .id("pay_feat_1")
                .tenantId("ten_feat")
                .plan("FEATURED")
                .amountUsd(10.0)
                .status("AWAITING_VERIFICATION")
                .note("veh_target_999")
                .build();

        when(subscriptionPaymentRepository.findById("pay_feat_1")).thenReturn(Optional.of(payment));

        SubscriptionEntity sub = SubscriptionEntity.builder()
                .tenantId("ten_feat")
                .featuredLimit(1)
                .build();
        when(subscriptionRepository.findByTenantId("ten_feat")).thenReturn(Optional.of(sub));

        VehicleEntity vehicle = VehicleEntity.builder()
                .id("veh_target_999")
                .tenantId("ten_feat")
                .featured(false)
                .build();
        when(vehicleRepository.findById("veh_target_999")).thenReturn(Optional.of(vehicle));

        paymentService.handlePaymentAction("pay_feat_1", "approve", null, "admin_user");

        assertEquals("VERIFIED", payment.getStatus());
        assertEquals(2, sub.getFeaturedLimit(), "Featured limit should be incremented from 1 to 2");
        assertTrue(vehicle.getFeatured(), "Vehicle must be promoted to featured");
        verify(vehicleRepository).save(vehicle);
    }
}

