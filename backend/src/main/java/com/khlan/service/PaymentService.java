package com.khlan.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.khlan.dto.PaymentDTO;
import com.khlan.entity.*;
import com.khlan.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.security.MessageDigest;
import java.time.OffsetDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class PaymentService {

    private final SubscriptionPaymentRepository subscriptionPaymentRepository;
    private final AbaTransactionRepository abaTransactionRepository;
    private final SubscriptionRepository subscriptionRepository;
    private final TenantRepository tenantRepository;
    private final UserRepository userRepository;
    private final PlatformSettingRepository platformSettingRepository;
    private final AuditLogRepository auditLogRepository;
    private final MinioStorageService minioStorageService;
    private final ObjectMapper objectMapper;
    private final ReceiptSlipParser receiptSlipParser;

    private static final String SETTING_KEY_PAYMENT_CONFIG = "payment_config";

    @Transactional(readOnly = true)
    public List<PaymentDTO.SubscriptionPaymentDTO> getTenantPayments(String tenantId) {
        TenantEntity tenant = tenantRepository.findById(tenantId).orElse(null);
        String tenantName = tenant != null ? tenant.getName() : null;

        List<SubscriptionPaymentEntity> rows = subscriptionPaymentRepository.findByTenantIdOrderByCreatedAtDesc(tenantId);
        return rows.stream().map(p -> toDTO(p, tenantName, false)).collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public PaymentDTO.SubscriptionPaymentDTO getPaymentById(String id) {
        SubscriptionPaymentEntity p = subscriptionPaymentRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Payment not found"));
        TenantEntity tenant = tenantRepository.findById(p.getTenantId()).orElse(null);
        return toDTO(p, tenant != null ? tenant.getName() : null, true);
    }

    @Transactional(readOnly = true)
    public PaymentDTO.PaymentConfigDTO getPaymentConfig() {
        return platformSettingRepository.findById(SETTING_KEY_PAYMENT_CONFIG)
                .map(setting -> {
                    try {
                        return objectMapper.readValue(setting.getValueJson(), PaymentDTO.PaymentConfigDTO.class);
                    } catch (Exception e) {
                        log.error("Failed to parse payment config JSON", e);
                        return defaultPaymentConfig();
                    }
                })
                .orElseGet(this::defaultPaymentConfig);
    }

    @Transactional
    public PaymentDTO.PaymentConfigDTO savePaymentConfig(PaymentDTO.PaymentConfigDTO config, String adminUserId) {
        try {
            String json = objectMapper.writeValueAsString(config);
            PlatformSettingEntity setting = PlatformSettingEntity.builder()
                    .key(SETTING_KEY_PAYMENT_CONFIG)
                    .valueJson(json)
                    .build();
            platformSettingRepository.save(setting);

            recordAudit(adminUserId, "PAYMENT_CONFIG_UPDATED", "PlatformSetting", SETTING_KEY_PAYMENT_CONFIG, Map.of("enabled", config.isEnabled()));
            return config;
        } catch (Exception e) {
            log.error("Failed to save payment config", e);
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to save payment config");
        }
    }

    @Transactional
    public PaymentDTO.SubscriptionPaymentDTO createPayment(String tenantId, PaymentDTO.CreatePaymentRequest req) {
        TenantEntity tenant = tenantRepository.findById(tenantId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Tenant not found"));

        String plan = req.getPlan() != null ? req.getPlan().toUpperCase() : "PRO";
        String cycle = req.getBillingCycle() != null ? req.getBillingCycle().toUpperCase() : "MONTHLY";
        boolean isYearly = "YEARLY".equals(cycle);
        int months = isYearly ? 12 : 1;

        double amountUsd = resolvePlanPrice(plan, isYearly);
        String currency = "KHR".equalsIgnoreCase(req.getCurrency()) ? "KHR" : "USD";
        double rate = 4100.0;
        double amountExpected = "KHR".equals(currency) ? amountUsd * rate : amountUsd;

        String ref = "SUB-" + generateAlphaNumeric(6);
        String id = "pay_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16);

        String manualRef = req.getManualRef() != null ? req.getManualRef().trim() : null;
        String manualRefKey = manualRef != null ? normalizeRef(manualRef) : null;
        String status = (manualRef != null && !manualRef.isBlank()) ? "AWAITING_VERIFICATION" : "PENDING";

        SubscriptionPaymentEntity payment = SubscriptionPaymentEntity.builder()
                .id(id)
                .tenantId(tenantId)
                .plan(plan)
                .billingCycle(cycle)
                .amountUsd(amountUsd)
                .currency(currency)
                .amountExpected(amountExpected)
                .exchangeRate(rate)
                .months(months)
                .method("MANUAL")
                .status(status)
                .reference(ref)
                .manualRef(manualRef)
                .manualRefKey(manualRefKey)
                .note(req.getNote())
                .build();

        subscriptionPaymentRepository.save(payment);
        return toDTO(payment, tenant.getName(), false);
    }

    @Transactional(readOnly = true)
    public PaymentDTO.CheckRefResponse checkReference(PaymentDTO.CheckRefRequest req) {
        if (req.getRef() == null || req.getRef().trim().length() < 3) {
            return PaymentDTO.CheckRefResponse.builder()
                    .valid(false)
                    .exists(false)
                    .duplicate(false)
                    .message("Reference too short")
                    .build();
        }

        String normalized = normalizeRef(req.getRef());
        Optional<SubscriptionPaymentEntity> existing = subscriptionPaymentRepository.findByManualRefKey(normalized);
        if (existing.isPresent()) {
            SubscriptionPaymentEntity p = existing.get();
            if ("VERIFIED".equals(p.getStatus()) || "AWAITING_VERIFICATION".equals(p.getStatus())) {
                return PaymentDTO.CheckRefResponse.builder()
                        .valid(false)
                        .exists(true)
                        .duplicate(true)
                        .normalizedRef(normalized)
                        .message("This transaction reference has already been claimed.")
                        .build();
            }
        }

        // Check if an unmatched ABA transaction matches this reference
        Optional<AbaTransactionEntity> aba = abaTransactionRepository.findByTrxId(normalized);
        if (aba.isPresent()) {
            return PaymentDTO.CheckRefResponse.builder()
                    .valid(true)
                    .exists(true)
                    .duplicate(false)
                    .bankCode("ABA")
                    .source("ABA_PAYWAY")
                    .normalizedRef(normalized)
                    .message("Reference matched ABA transaction record.")
                    .build();
        }

        return PaymentDTO.CheckRefResponse.builder()
                .valid(true)
                .exists(false)
                .duplicate(false)
                .normalizedRef(normalized)
                .message("Reference available for submission.")
                .build();
    }

    @Transactional
    public PaymentDTO.SubscriptionPaymentDTO uploadReceipt(String paymentId, MultipartFile file) {
        SubscriptionPaymentEntity payment = subscriptionPaymentRepository.findById(paymentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Payment not found"));

        try {
            byte[] bytes = file.getBytes();
            String hash = computeSha256(bytes);

            // Duplicate detection check
            Optional<SubscriptionPaymentEntity> duplicate = subscriptionPaymentRepository.findByEvidenceHash(hash);
            if (duplicate.isPresent() && !duplicate.get().getId().equals(paymentId)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This receipt image has already been submitted for another payment.");
            }

            String mimeType = file.getContentType() != null ? file.getContentType() : "image/jpeg";
            String publicUrl = minioStorageService.uploadPublicMedia(bytes, mimeType);

            payment.setEvidenceUrl(publicUrl);
            payment.setEvidenceHash(hash);
            payment.setStatus("AWAITING_VERIFICATION");

            subscriptionPaymentRepository.save(payment);

            TenantEntity tenant = tenantRepository.findById(payment.getTenantId()).orElse(null);
            return toDTO(payment, tenant != null ? tenant.getName() : null, true);
        } catch (ResponseStatusException rse) {
            throw rse;
        } catch (Exception e) {
            log.error("Failed to upload receipt", e);
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to store receipt image");
        }
    }

    @Transactional
    public PaymentDTO.OcrResponseDTO verifyReceiptOcrJson(PaymentDTO.OcrRequestDTO req) {
        if (req.getImage() == null || req.getImage().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Image is required");
        }

        try {
            String dataUrl = req.getImage();
            String mimeType = "image/jpeg";
            if (dataUrl.startsWith("data:")) {
                int semi = dataUrl.indexOf(";");
                if (semi > 5) {
                    mimeType = dataUrl.substring(5, semi);
                }
            }

            byte[] bytes;
            if (dataUrl.startsWith("data:")) {
                int comma = dataUrl.indexOf(",");
                String meta = comma != -1 ? dataUrl.substring(5, comma) : "";
                String payload = comma != -1 ? dataUrl.substring(comma + 1) : dataUrl;
                if (meta.contains(";base64")) {
                    bytes = Base64.getDecoder().decode(payload.trim());
                } else {
                    bytes = java.net.URLDecoder.decode(payload, java.nio.charset.StandardCharsets.UTF_8)
                            .getBytes(java.nio.charset.StandardCharsets.UTF_8);
                }
            } else {
                bytes = Base64.getDecoder().decode(dataUrl.trim());
            }

            String previewUrl = minioStorageService.uploadPublicMedia(bytes, mimeType);

            return receiptSlipParser.processReceipt(
                    bytes,
                    dataUrl,
                    req.getPlan() != null ? req.getPlan() : "PRO",
                    req.getCycle() != null ? req.getCycle() : "MONTHLY",
                    req.getCurrency() != null ? req.getCurrency() : "USD",
                    req.getEnteredRef(),
                    previewUrl,
                    getPaymentConfig()
            );
        } catch (ResponseStatusException rse) {
            throw rse;
        } catch (Exception e) {
            log.error("Failed to parse OCR receipt image", e);
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to parse receipt image: " + e.getMessage());
        }
    }

    @Transactional
    public PaymentDTO.OcrResponseDTO verifyReceiptOcrMultipart(MultipartFile file, String manualRef, String plan, String cycle) {
        try {
            byte[] bytes = file.getBytes();
            String mimeType = file.getContentType() != null ? file.getContentType() : "image/jpeg";
            String previewUrl = minioStorageService.uploadPublicMedia(bytes, mimeType);
            String dataUrl = "data:" + mimeType + ";base64," + Base64.getEncoder().encodeToString(bytes);

            return receiptSlipParser.processReceipt(
                    bytes,
                    dataUrl,
                    plan != null ? plan : "PRO",
                    cycle != null ? cycle : "MONTHLY",
                    "USD",
                    manualRef,
                    previewUrl,
                    getPaymentConfig()
            );
        } catch (Exception e) {
            log.error("Failed to parse multipart OCR receipt image", e);
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to parse receipt image");
        }
    }

    @Transactional(readOnly = true)
    public Page<PaymentDTO.SubscriptionPaymentDTO> getAdminPayments(String status, Pageable pageable) {
        String filterStatus = (status != null && !status.isBlank() && !"ALL".equalsIgnoreCase(status)) ? status : null;
        Page<SubscriptionPaymentEntity> page = subscriptionPaymentRepository.findPaymentsFiltered(filterStatus, pageable);

        return page.map(p -> {
            TenantEntity tenant = tenantRepository.findById(p.getTenantId()).orElse(null);
            return toDTO(p, tenant != null ? tenant.getName() : null, true);
        });
    }

    @Transactional
    public PaymentDTO.SubscriptionPaymentDTO handlePaymentAction(String paymentId, String action, String reason, String adminUserId) {
        SubscriptionPaymentEntity payment = subscriptionPaymentRepository.findById(paymentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Payment not found"));

        UserEntity admin = userRepository.findById(adminUserId).orElse(null);
        String adminName = admin != null ? admin.getName() : "Admin";

        if ("verify".equalsIgnoreCase(action)) {
            payment.setStatus("VERIFIED");
            payment.setReviewedById(adminUserId);
            payment.setReviewedAt(OffsetDateTime.now());
            payment.setVerifiedByName(adminName);

            // Activate or extend tenant subscription
            SubscriptionEntity sub = subscriptionRepository.findByTenantId(payment.getTenantId())
                    .orElseGet(() -> SubscriptionEntity.builder()
                            .id("sub_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16))
                            .tenantId(payment.getTenantId())
                            .startedAt(OffsetDateTime.now())
                            .build());

            OffsetDateTime base = (sub.getCurrentPeriodEnd() != null && sub.getCurrentPeriodEnd().isAfter(OffsetDateTime.now())
                    && "ACTIVE".equals(sub.getStatus()))
                    ? sub.getCurrentPeriodEnd()
                    : OffsetDateTime.now();

            int monthsToAdd = payment.getMonths() != null ? payment.getMonths() : 1;
            OffsetDateTime newPeriodEnd = base.plusMonths(monthsToAdd);

            sub.setPlan(payment.getPlan());
            sub.setStatus("ACTIVE");
            sub.setBillingCycle(payment.getBillingCycle());
            sub.setPriceUsd(payment.getAmountUsd());
            sub.setCurrentPeriodEnd(newPeriodEnd);

            // Tier quotas
            if ("ENTERPRISE".equalsIgnoreCase(payment.getPlan())) {
                sub.setListingsLimit(1000);
                sub.setFeaturedLimit(50);
                sub.setSeats(20);
            } else if ("PRO".equalsIgnoreCase(payment.getPlan())) {
                sub.setListingsLimit(50);
                sub.setFeaturedLimit(10);
                sub.setSeats(5);
            } else {
                sub.setListingsLimit(15);
                sub.setFeaturedLimit(2);
                sub.setSeats(2);
            }

            subscriptionRepository.save(sub);
            subscriptionPaymentRepository.save(payment);

            recordAudit(adminUserId, "PAYMENT_VERIFIED", "SubscriptionPayment", paymentId,
                    Map.of("plan", payment.getPlan(), "periodEnd", newPeriodEnd.toString()));
        } else if ("reject".equalsIgnoreCase(action)) {
            payment.setStatus("REJECTED");
            payment.setRejectionReason(reason != null ? reason : "Rejected by admin");
            payment.setReviewedById(adminUserId);
            payment.setReviewedAt(OffsetDateTime.now());

            subscriptionPaymentRepository.save(payment);
            recordAudit(adminUserId, "PAYMENT_REJECTED", "SubscriptionPayment", paymentId,
                    Map.of("reason", payment.getRejectionReason()));
        } else {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown payment action: " + action);
        }

        TenantEntity tenant = tenantRepository.findById(payment.getTenantId()).orElse(null);
        return toDTO(payment, tenant != null ? tenant.getName() : null, true);
    }

    @Transactional(readOnly = true)
    public PaymentDTO.AbaTransactionsResponse getAbaTransactions(String status, String search, String day,
                                                                  Boolean duplicate, Boolean collision, int limit) {
        int take = Math.min(100, Math.max(1, limit));
        Page<AbaTransactionEntity> page = abaTransactionRepository.findAllByOrderByTransactionDateDesc(PageRequest.of(0, take));

        List<AbaTransactionEntity> rows = page.getContent();
        if (status != null && !status.isBlank() && !"ALL".equalsIgnoreCase(status)) {
            rows = rows.stream().filter(t -> status.equalsIgnoreCase(t.getStatus())).toList();
        }
        if (Boolean.TRUE.equals(duplicate)) {
            rows = rows.stream().filter(t -> Boolean.TRUE.equals(t.getIsDuplicate())).toList();
        }
        if (Boolean.TRUE.equals(collision)) {
            rows = rows.stream().filter(t -> Boolean.TRUE.equals(t.getSameTimeCollision())).toList();
        }
        if (search != null && !search.isBlank()) {
            String q = search.toLowerCase();
            rows = rows.stream().filter(t ->
                    (t.getTrxId() != null && t.getTrxId().toLowerCase().contains(q)) ||
                    (t.getPayerName() != null && t.getPayerName().toLowerCase().contains(q)) ||
                    (t.getRawMessage() != null && t.getRawMessage().toLowerCase().contains(q))
            ).toList();
        }

        long total = abaTransactionRepository.count();
        long unmatched = abaTransactionRepository.countByStatus("UNMATCHED");
        long matched = abaTransactionRepository.countByStatus("MATCHED");
        double volume = rows.stream().mapToDouble(AbaTransactionEntity::getAmountUsd).sum();

        List<PaymentDTO.AbaTransactionDTO> dtos = rows.stream().map(t -> PaymentDTO.AbaTransactionDTO.builder()
                .id(t.getId())
                .trxId(t.getTrxId())
                .apv(t.getApv())
                .amount(t.getAmount())
                .currency(t.getCurrency())
                .amountUsd(t.getAmountUsd())
                .payerName(t.getPayerName())
                .payerAccount(t.getPayerAccount())
                .bankCode(t.getBankCode())
                .merchantName(t.getMerchantName())
                .transactionDate(t.getTransactionDate().toString())
                .status(t.getStatus())
                .subscriptionPaymentId(t.getSubscriptionPaymentId())
                .isDuplicate(t.getIsDuplicate())
                .duplicateCount(t.getDuplicateCount())
                .sameTimeCollision(t.getSameTimeCollision())
                .verificationNote(t.getVerificationNote())
                .createdAt(t.getCreatedAt().toString())
                .build()).collect(Collectors.toList());

        return PaymentDTO.AbaTransactionsResponse.builder()
                .transactions(dtos)
                .total(total)
                .unmatched(unmatched)
                .matched(matched)
                .underpaid(0)
                .duplicateCount(0)
                .collisionCount(0)
                .totalUsdVolume(Math.round(volume * 100.0) / 100.0)
                .build();
    }

    private PaymentDTO.SubscriptionPaymentDTO toDTO(SubscriptionPaymentEntity p, String tenantName, boolean includeImage) {
        List<String> riskFlags = null;
        if (p.getRiskFlagsJson() != null) {
            try {
                riskFlags = objectMapper.readValue(p.getRiskFlagsJson(), new com.fasterxml.jackson.core.type.TypeReference<List<String>>() {});
            } catch (Exception ignored) {}
        }

        return PaymentDTO.SubscriptionPaymentDTO.builder()
                .id(p.getId())
                .plan(p.getPlan())
                .billingCycle(p.getBillingCycle())
                .amountUsd(p.getAmountUsd())
                .currency(p.getCurrency())
                .amountExpected(p.getAmountExpected())
                .months(p.getMonths())
                .method(p.getMethod())
                .status(p.getStatus())
                .reference(p.getReference())
                .manualRef(p.getManualRef())
                .evidenceUrl(p.getEvidenceUrl())
                .evidenceImage(includeImage ? p.getEvidenceImage() : null)
                .hasEvidenceImage(p.getEvidenceUrl() != null || p.getEvidenceImage() != null)
                .ocrStatus(p.getOcrStatus())
                .ocrConfidence(p.getOcrConfidence())
                .ocrRef(p.getOcrRef())
                .ocrAmount(p.getOcrAmount())
                .ocrCurrency(p.getOcrCurrency())
                .ocrPaidAt(p.getOcrPaidAt() != null ? p.getOcrPaidAt().toString() : null)
                .riskFlags(riskFlags)
                .telegramSentAt(p.getTelegramSentAt() != null ? p.getTelegramSentAt().toString() : null)
                .telegramError(p.getTelegramError())
                .note(p.getNote())
                .rejectionReason(p.getRejectionReason())
                .tenantId(p.getTenantId())
                .tenantName(tenantName)
                .reviewedAt(p.getReviewedAt() != null ? p.getReviewedAt().toString() : null)
                .verifiedByName(p.getVerifiedByName())
                .createdAt(p.getCreatedAt() != null ? p.getCreatedAt().toString() : OffsetDateTime.now().toString())
                .build();
    }

    private PaymentDTO.PaymentConfigDTO defaultPaymentConfig() {
        return PaymentDTO.PaymentConfigDTO.builder()
                .enabled(true)
                .manual(PaymentDTO.ManualConfig.builder()
                        .accountName("KhLan Auto Marketplace")
                        .instructionsEn("Please scan the KHQR code using your mobile banking app (ABA, Bakong, etc.). After payment, submit your transaction ID reference.")
                        .instructionsKm("សូមស្កេនកូដ KHQR ដោយប្រើកម្មវិធីធនាគារចល័តរបស់អ្នក (ABA, Bakong ជាដើម)។ បន្ទាប់ពីការទូទាត់ សូមដាក់លេខកូដសម្គាល់ប្រតិបត្តិការរបស់អ្នក។")
                        .telegram("@khlan_support")
                        .hasKhqr(true)
                        .khrExchangeRate(4100.0)
                        .skipMerchantCheck(true)
                        .build())
                .freePlan(PaymentDTO.FreePlanConfig.builder()
                        .enabled(true)
                        .listingsLimit(3)
                        .featuredLimit(0)
                        .seats(1)
                        .build())
                .build();
    }

    private double resolvePlanPrice(String plan, boolean yearly) {
        if ("ENTERPRISE".equalsIgnoreCase(plan)) return yearly ? 990.0 : 99.0;
        if ("PRO".equalsIgnoreCase(plan)) return yearly ? 490.0 : 49.0;
        return yearly ? 190.0 : 19.0; // BASIC
    }

    private String normalizeRef(String ref) {
        if (ref == null) return "";
        return ref.trim().toUpperCase().replaceAll("[^A-Z0-9]", "");
    }

    private String generateAlphaNumeric(int len) {
        String chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        Random random = new Random();
        StringBuilder sb = new StringBuilder(len);
        for (int i = 0; i < len; i++) {
            sb.append(chars.charAt(random.nextInt(chars.length())));
        }
        return sb.toString();
    }

    private String computeSha256(byte[] data) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(data);
            StringBuilder hexString = new StringBuilder();
            for (byte b : hash) {
                String hex = Integer.toHexString(0xff & b);
                if (hex.length() == 1) hexString.append('0');
                hexString.append(hex);
            }
            return hexString.toString();
        } catch (Exception e) {
            return UUID.randomUUID().toString();
        }
    }

    private void recordAudit(String actorId, String action, String entity, String entityId, Map<String, Object> meta) {
        try {
            AuditLogEntity logEntity = AuditLogEntity.builder()
                    .id("aud_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16))
                    .actorId(actorId)
                    .action(action)
                    .entity(entity)
                    .entityId(entityId)
                    .metaJson(objectMapper.writeValueAsString(meta))
                    .build();
            auditLogRepository.save(logEntity);
        } catch (Exception e) {
            log.error("Failed to record audit log", e);
        }
    }
}
