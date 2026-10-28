package com.khlan.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.Map;

public class PaymentDTO {

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class SubscriptionPaymentDTO {
        private String id;
        private String plan;
        private String billingCycle;
        private Double amountUsd;
        private String currency;
        private Double amountExpected;
        private Integer months;
        private String method;
        private String status;
        private String reference;
        private String manualRef;
        private String evidenceUrl;
        private String evidenceImage;
        private Boolean hasEvidenceImage;
        private String ocrStatus;
        private Double ocrConfidence;
        private String ocrRef;
        private Double ocrAmount;
        private String ocrCurrency;
        private String ocrPaidAt;
        private List<String> riskFlags;
        private String telegramSentAt;
        private String telegramError;
        private String note;
        private String rejectionReason;
        private String tenantId;
        private String tenantName;
        private String reviewedAt;
        private String verifiedByName;
        private String createdAt;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class CreatePaymentRequest {
        private String plan;
        private String billingCycle;
        private String currency;
        private String manualRef;
        private String note;
        private String evidenceImage;
        private String evidenceUrl;
        private String paymentDate;
        private Boolean submitForReview;
        private Object ocrData;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class CheckRefRequest {
        private String ref;
        private String plan;
        private String billingCycle;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class CheckRefResponse {
        private boolean valid;
        private boolean exists;
        private boolean duplicate;
        private String message;
        private String normalizedRef;
        private String bankCode;
        private String source;
        private String trxId;
        private String transactionDateFormatted;
        private String transactionDateRaw;
        private Boolean isNotCurrentDate;
        private Boolean isOld;
        private String telegramAdmin;
        private String telegramAdminLink;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class OcrRequestDTO {
        private String image; // base64 data URL
        private String plan;
        private String cycle;
        private String currency;
        private String enteredRef;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class OcrResponseDTO {
        private boolean success;
        private boolean blocked;
        @com.fasterxml.jackson.annotation.JsonProperty("isWrongMerchant")
        private boolean isWrongMerchant;
        private String fraudAlertId;
        private String imageHash;
        private String previewUrl;
        private ParsedReceiptDTO data;
        private VerificationDetailsDTO verification;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class ParsedReceiptDTO {
        private String trxId;
        private String externalRef;
        private String apv;
        private Double amount;
        private String currency;
        private Double amountUsd;
        private Double amountKhr;
        private String paidAt;
        private String paidAtRaw;
        private String payerName;
        private String payerAccount;
        private String payee;
        private String beneficiaryBank;
        private String bankName;
        private String bankCode;
        @com.fasterxml.jackson.annotation.JsonProperty("isInterbank")
        private Boolean isInterbank;
        private Double confidence;
        private String rawText;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class VerificationDetailsDTO {
        private String status; // PASS | WARN | MISMATCH
        private Double confidence;
        private boolean amountMatch;
        private boolean currencyMatch;
        @com.fasterxml.jackson.annotation.JsonProperty("isDuplicate")
        private boolean isDuplicate;
        private String duplicateDetails;
        @com.fasterxml.jackson.annotation.JsonProperty("isOld")
        private boolean isOld;
        private Integer ageHours;
        @com.fasterxml.jackson.annotation.JsonProperty("isNotCurrentDate")
        private Boolean isNotCurrentDate;
        private String transactionDateFormatted;
        private String telegramAdmin;
        private String telegramAdminLink;
        @com.fasterxml.jackson.annotation.JsonProperty("isInterbank")
        private Boolean isInterbank;
        private String originatingBank;
        private String abaTrxId;
        @com.fasterxml.jackson.annotation.JsonProperty("isWrongMerchant")
        private boolean isWrongMerchant;
        private String detectedPayee;
        private String expectedMerchant;
        @com.fasterxml.jackson.annotation.JsonProperty("isUnderpaid")
        private boolean isUnderpaid;
        private List<String> riskFlags;
        private String message;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class OcrVerifyResponse {
        private String status;
        private Double confidence;
        private String trxId;
        private Double amount;
        private String currency;
        private String paidAt;
        private String payerName;
        private String payee;
        private String bankName;
        private List<String> riskFlags;
        private String message;
        private String evidenceUrl;
        private String evidenceHash;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class PaymentConfigDTO {
        private boolean enabled;
        private ManualConfig manual;
        private FreePlanConfig freePlan;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class ManualConfig {
        private String accountName;
        private String instructionsEn;
        private String instructionsKm;
        private String telegram;
        private boolean hasKhqr;
        private String khqrDataUrl;
        private String khqrImage;
        private String khqrImageMonthly;
        private String khqrImageYearly;
        private String khqrImageUsd;
        private String khqrImageKhr;
        private String khqrImageMonthlyKhr;
        private String khqrImageYearlyKhr;
        private Double khrExchangeRate;
        private Boolean skipMerchantCheck;
        private String telegramBotToken;
        private String telegramChatId;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class FreePlanConfig {
        private boolean enabled;
        private int listingsLimit;
        private int featuredLimit;
        private int seats;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class PaymentActionRequest {
        private String action; // verify | reject | send_telegram
        private String reason;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class AbaTransactionDTO {
        private String id;
        private String rawMessage;
        private String source;
        private String trxId;
        private String apv;
        private Double amount;
        private String currency;
        private Double amountUsd;
        private String payerName;
        private String payerAccount;
        private String bankCode;
        private String merchantName;
        private String transactionDateRaw;
        private String transactionDate;
        private String status;
        private String subscriptionPaymentId;
        private String matchedAt;
        private String matchedBy;
        private Boolean isDuplicate;
        private Integer duplicateCount;
        private Boolean sameTimeCollision;
        private String collisionTrxIds;
        private String verificationNote;
        private String createdAt;
        private Map<String, Object> subscriptionPayment;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class AbaDailyStatDTO {
        private String date;
        private int count;
        private double totalKhr;
        private double totalUsd;
        private int matchedCount;
        private int unmatchedCount;
        private int underpaidCount;
        private int duplicateCount;
        private int collisionCount;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class AbaSummaryDTO {
        private long totalCount;
        private long unmatchedCount;
        private long matchedCount;
        private long underpaidCount;
        private long duplicateCount;
        private long collisionCount;
        private double totalKhr;
        private double totalUsd;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class AbaTransactionsResponse {
        private List<AbaTransactionDTO> transactions;
        private List<AbaDailyStatDTO> dailyBreakdown;
        private AbaSummaryDTO summary;
        private long total;
        private long unmatched;
        private long matched;
        private long underpaid;
        private long duplicateCount;
        private long collisionCount;
        private Double totalUsdVolume;
        private Object daemonStatus;
    }
}
