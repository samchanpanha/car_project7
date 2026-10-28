package com.khlan.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.khlan.entity.AbaTransactionEntity;
import com.khlan.repository.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PaymentServiceAbaAuditTest {

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

    @InjectMocks
    private PaymentService paymentService;

    @Test
    void verifyActionScansListedTransactionsAndBackfillsAlertDetails() {
        AbaTransactionEntity transaction = AbaTransactionEntity.builder()
                .id("aba_test")
                .rawMessage("PayWay by ABA: ៛100 paid by SAM CHAN PANHA (*849) on Oct 28, 01:00 PM via ABA KHQR (Wing Bank (Cambodia) Plc) at SAM CHAN PANHA. Trx. ID: 179316724177253, APV: 547598.")
                .trxId("179316724177253")
                .amount(100.0)
                .currency("KHR")
                .amountUsd(0.02)
                .payerName("SAM CHAN PANHA (*849)")
                .bankCode("ABA")
                .transactionDate(OffsetDateTime.parse("2026-10-28T13:21:15+07:00"))
                .status("UNMATCHED")
                .build();
        when(abaTransactionRepository.findAllByOrderByTransactionDateDesc(any(PageRequest.class)))
                .thenReturn(new PageImpl<>(List.of(transaction)));
        when(subscriptionPaymentRepository.findByStatusOrderByCreatedAtDesc("AWAITING_VERIFICATION"))
                .thenReturn(List.of());

        Map<String, Object> result = paymentService.handleAbaTransactionAction(Map.of("action", "verify"), "admin");
        @SuppressWarnings("unchecked")
        Map<String, Object> report = (Map<String, Object>) result.get("report");

        assertEquals(1L, report.get("totalTransactions"));
        assertEquals("SAM CHAN PANHA", transaction.getPayerName());
        assertEquals("*849", transaction.getPayerAccount());
        assertEquals("Wing Bank (Cambodia) Plc", transaction.getBankCode());
        assertEquals("SAM CHAN PANHA", transaction.getMerchantName());
        assertEquals("Oct 28, 01:00 PM", transaction.getTransactionDateRaw());
        assertEquals(OffsetDateTime.parse("2026-10-28T13:00+07:00"), transaction.getTransactionDate());
        verify(abaTransactionRepository).save(transaction);
    }
}
