package com.khlan.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.OffsetDateTime;

@Entity
@Table(name = "aba_transactions")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AbaTransactionEntity {

    @Id
    @Column(length = 64)
    private String id;

    @Column(name = "raw_message", nullable = false, columnDefinition = "TEXT")
    private String rawMessage;

    @Column(name = "message_id")
    private Integer messageId;

    @Column(name = "chat_id", length = 64)
    private String chatId;

    @Column(nullable = false, length = 32)
    @Builder.Default
    private String source = "ABA_PAYWAY";

    @Column(name = "trx_id", nullable = false, unique = true, length = 64)
    private String trxId;

    @Column(length = 32)
    private String apv;

    @Column(nullable = false)
    private Double amount;

    @Column(nullable = false, length = 8)
    private String currency;

    @Column(name = "amount_usd", nullable = false)
    private Double amountUsd;

    @Column(name = "payer_name", length = 128)
    private String payerName;

    @Column(name = "payer_account", length = 32)
    private String payerAccount;

    @Column(name = "bank_code", length = 32)
    private String bankCode;

    @Column(name = "merchant_name", length = 128)
    private String merchantName;

    @Column(name = "transaction_date_raw", length = 64)
    private String transactionDateRaw;

    @Column(name = "transaction_date", nullable = false)
    private OffsetDateTime transactionDate;

    @Column(nullable = false, length = 32)
    @Builder.Default
    private String status = "UNMATCHED";

    @Column(name = "subscription_payment_id", length = 64)
    private String subscriptionPaymentId;

    @Column(name = "matched_at")
    private OffsetDateTime matchedAt;

    @Column(name = "matched_by", length = 64)
    private String matchedBy;

    @Column(name = "is_duplicate", nullable = false)
    @Builder.Default
    private Boolean isDuplicate = false;

    @Column(name = "duplicate_count", nullable = false)
    @Builder.Default
    private Integer duplicateCount = 0;

    @Column(name = "same_time_collision", nullable = false)
    @Builder.Default
    private Boolean sameTimeCollision = false;

    @Column(name = "collision_trx_ids", columnDefinition = "TEXT")
    private String collisionTrxIds;

    @Column(name = "verification_note", columnDefinition = "TEXT")
    private String verificationNote;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;
}
