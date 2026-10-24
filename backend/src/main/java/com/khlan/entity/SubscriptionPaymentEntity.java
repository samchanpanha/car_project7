package com.khlan.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.OffsetDateTime;

@Entity
@Table(name = "subscription_payments")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SubscriptionPaymentEntity {

    @Id
    @Column(length = 64)
    private String id;

    @Column(name = "tenant_id", nullable = false, length = 64)
    private String tenantId;

    @Column(nullable = false, length = 32)
    private String plan;

    @Column(name = "billing_cycle", nullable = false, length = 32)
    private String billingCycle;

    @Column(name = "amount_usd", nullable = false)
    private Double amountUsd;

    @Column(nullable = false, length = 8)
    @Builder.Default
    private String currency = "USD";

    @Column(name = "amount_expected")
    private Double amountExpected;

    @Column(name = "exchange_rate")
    private Double exchangeRate;

    @Column(nullable = false)
    private Integer months;

    @Column(nullable = false, length = 32)
    private String method;

    @Column(nullable = false, length = 32)
    @Builder.Default
    private String status = "PENDING";

    @Column(nullable = false, unique = true, length = 64)
    private String reference;

    @Column(name = "bakong_md5", length = 64)
    private String bakongMd5;

    @Column(name = "bakong_hash", length = 128)
    private String bakongHash;

    @Column(name = "qr_payload", columnDefinition = "TEXT")
    private String qrPayload;

    @Column(name = "manual_ref", length = 128)
    private String manualRef;

    @Column(name = "manual_ref_key", length = 128)
    private String manualRefKey;

    @Column(name = "manual_ref_kind", length = 32)
    private String manualRefKind;

    @Column(name = "idempotency_key", length = 128)
    private String idempotencyKey;

    @Column(name = "evidence_hash", length = 128)
    private String evidenceHash;

    @Column(name = "evidence_phash", length = 64)
    private String evidencePhash;

    @Column(name = "evidence_url", columnDefinition = "TEXT")
    private String evidenceUrl;

    @Column(name = "evidence_image", columnDefinition = "TEXT")
    private String evidenceImage;

    @Column(name = "ocr_status", length = 32)
    private String ocrStatus;

    @Column(name = "ocr_confidence")
    private Double ocrConfidence;

    @Column(name = "ocr_ref", length = 128)
    private String ocrRef;

    @Column(name = "ocr_amount")
    private Double ocrAmount;

    @Column(name = "ocr_currency", length = 8)
    private String ocrCurrency;

    @Column(name = "ocr_paid_at")
    private OffsetDateTime ocrPaidAt;

    @Column(name = "ocr_raw_text", columnDefinition = "TEXT")
    private String ocrRawText;

    @Column(name = "ocr_json", columnDefinition = "TEXT")
    private String ocrJson;

    @Column(name = "risk_flags_json", columnDefinition = "TEXT")
    private String riskFlagsJson;

    @Column(name = "verified_source", length = 32)
    private String verifiedSource;

    @Column(name = "telegram_sent_at")
    private OffsetDateTime telegramSentAt;

    @Column(name = "telegram_error", columnDefinition = "TEXT")
    private String telegramError;

    @Column(name = "telegram_message_id")
    private Integer telegramMessageId;

    @Column(name = "telegram_group_id", length = 64)
    private String telegramGroupId;

    @Column(name = "verified_by_name", length = 128)
    private String verifiedByName;

    @Column(name = "notified_seller", nullable = false)
    @Builder.Default
    private Boolean notifiedSeller = false;

    @Column(name = "notified_at")
    private OffsetDateTime notifiedAt;

    @Column(columnDefinition = "TEXT")
    private String note;

    @Column(name = "rejection_reason", columnDefinition = "TEXT")
    private String rejectionReason;

    @Column(name = "reviewed_by_id", length = 64)
    private String reviewedById;

    @Column(name = "reviewed_at")
    private OffsetDateTime reviewedAt;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;
}
