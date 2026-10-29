package com.khlan.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.khlan.entity.SubscriptionPaymentEntity;
import com.khlan.repository.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;

import java.util.Optional;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Guards the double-activation bug: Telegram inline buttons can be tapped twice and
 * reconciliation can retry the same payment. A VERIFIED payment must never extend the
 * tenant subscription again.
 */
@ExtendWith(MockitoExtension.class)
class PaymentServiceIdempotencyTest {

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
    private ObjectProvider<TelegramService> telegramServiceProvider;
    @Mock
    private ObjectProvider<CronSchedulerService> cronSchedulerProvider;

    @InjectMocks
    private PaymentService paymentService;

    @Test
    void verifyingAnAlreadyVerifiedPaymentDoesNotExtendSubscriptionAgain() {
        SubscriptionPaymentEntity payment = SubscriptionPaymentEntity.builder()
                .id("pay_retry")
                .tenantId("tenant_1")
                .plan("PRO")
                .billingCycle("MONTHLY")
                .amountUsd(29.0)
                .months(1)
                .status("VERIFIED")
                .build();

        when(subscriptionPaymentRepository.findById("pay_retry")).thenReturn(Optional.of(payment));
        when(userRepository.findById("admin")).thenReturn(Optional.empty());
        when(tenantRepository.findById("tenant_1")).thenReturn(Optional.empty());

        paymentService.handlePaymentAction("pay_retry", "verify", "second click", "admin");
        paymentService.handlePaymentAction("pay_retry", "approve", "reconciliation retry", "admin");

        verify(subscriptionRepository, never()).save(any());
        verify(subscriptionPaymentRepository, never()).save(any());
        verify(abaTransactionRepository, never()).save(any());
    }

    @Test
    void rejectingAnAlreadyRejectedPaymentIsANoOp() {
        SubscriptionPaymentEntity payment = SubscriptionPaymentEntity.builder()
                .id("pay_rejected")
                .tenantId("tenant_1")
                .plan("PRO")
                .months(1)
                .status("REJECTED")
                .build();

        when(subscriptionPaymentRepository.findById("pay_rejected")).thenReturn(Optional.of(payment));
        when(userRepository.findById("admin")).thenReturn(Optional.empty());
        when(tenantRepository.findById("tenant_1")).thenReturn(Optional.empty());

        paymentService.handlePaymentAction("pay_rejected", "reject", "second click", "admin");

        verify(subscriptionPaymentRepository, never()).save(any());
    }
}
