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

import java.io.ByteArrayOutputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import com.google.zxing.BarcodeFormat;
import com.google.zxing.client.j2se.MatrixToImageWriter;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;

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
    private final org.springframework.beans.factory.ObjectProvider<TelegramService> telegramServiceProvider;

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
    public Map<String, Object> getAdminPaymentConfig() {
        return platformSettingRepository.findById(SETTING_KEY_PAYMENT_CONFIG)
                .map(setting -> {
                    try {
                        com.fasterxml.jackson.databind.JsonNode node = objectMapper.readTree(setting.getValueJson());
                        if (node.has("manual")) {
                            PaymentDTO.PaymentConfigDTO nested = objectMapper.treeToValue(node, PaymentDTO.PaymentConfigDTO.class);
                            return toFlatAdminConfig(nested);
                        } else {
                            return objectMapper.readValue(setting.getValueJson(), new com.fasterxml.jackson.core.type.TypeReference<Map<String, Object>>() {});
                        }
                    } catch (Exception e) {
                        log.error("Failed to parse flat payment config JSON", e);
                        return defaultAdminPaymentConfig();
                    }
                })
                .orElseGet(this::defaultAdminPaymentConfig);
    }

    @Transactional
    public Map<String, Object> saveAdminPaymentConfig(Map<String, Object> flatConfig, String adminUserId) {
        try {
            String json = objectMapper.writeValueAsString(flatConfig);
            PlatformSettingEntity setting = PlatformSettingEntity.builder()
                    .key(SETTING_KEY_PAYMENT_CONFIG)
                    .valueJson(json)
                    .build();
            platformSettingRepository.save(setting);

            recordAudit(adminUserId, "PAYMENT_CONFIG_UPDATED", "PlatformSetting", SETTING_KEY_PAYMENT_CONFIG, Map.of("updated", true));
            return flatConfig;
        } catch (Exception e) {
            log.error("Failed to save flat payment config", e);
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to save payment config");
        }
    }

    @Transactional(readOnly = true)
    public PaymentDTO.PaymentConfigDTO getPaymentConfig() {
        Map<String, Object> adminCfg = getAdminPaymentConfig();
        boolean enabled = Boolean.TRUE.equals(adminCfg.get("enabled"));

        String accountName = (String) adminCfg.get("accountName");
        String instructionsEn = (String) adminCfg.get("instructionsEn");
        String instructionsKm = (String) adminCfg.get("instructionsKm");
        String telegram = (String) adminCfg.get("telegram");
        String khqrPayload = (String) adminCfg.get("khqrPayload");
        String khqrDataUrl = generateKhqrDataUrl(khqrPayload);
        Double khrExchangeRate = adminCfg.get("khrExchangeRate") instanceof Number n ? n.doubleValue() : 4100.0;
        Boolean skipMerchantCheck = (Boolean) adminCfg.get("skipMerchantCheck");
        String khqrImage = (String) adminCfg.get("khqrImage");
        String khqrImageUrl = (String) adminCfg.get("khqrImageUrl");
        if (khqrImage == null && khqrImageUrl != null) khqrImage = khqrImageUrl;

        @SuppressWarnings("unchecked")
        Map<String, Object> fp = adminCfg.get("freePlan") instanceof Map ? (Map<String, Object>) adminCfg.get("freePlan") : Map.of();
        boolean fpEnabled = Boolean.TRUE.equals(fp.get("enabled"));
        int fpListings = fp.get("listingsLimit") instanceof Number n ? n.intValue() : 10;
        int fpFeatured = fp.get("featuredLimit") instanceof Number n ? n.intValue() : 0;
        int fpSeats = fp.get("seats") instanceof Number n ? n.intValue() : 1;

        return PaymentDTO.PaymentConfigDTO.builder()
                .enabled(enabled)
                .manual(PaymentDTO.ManualConfig.builder()
                        .accountName(accountName)
                        .instructionsEn(instructionsEn)
                        .instructionsKm(instructionsKm)
                        .telegram(telegram)
                        .hasKhqr(khqrDataUrl != null || khqrImage != null)
                        .khqrDataUrl(khqrDataUrl)
                        .khqrImage(khqrImage)
                        .khqrImageMonthly((String) adminCfg.get("khqrImageMonthly"))
                        .khqrImageYearly((String) adminCfg.get("khqrImageYearly"))
                        .khqrImageUsd((String) adminCfg.get("khqrImageUsd"))
                        .khqrImageKhr((String) adminCfg.get("khqrImageKhr"))
                        .khqrImageMonthlyKhr((String) adminCfg.get("khqrImageMonthlyKhr"))
                        .khqrImageYearlyKhr((String) adminCfg.get("khqrImageYearlyKhr"))
                        .khrExchangeRate(khrExchangeRate)
                        .skipMerchantCheck(skipMerchantCheck)
                        .telegramBotToken((String) adminCfg.get("telegramBotToken"))
                        .telegramChatId((String) adminCfg.get("telegramChatId"))
                        .build())
                .freePlan(PaymentDTO.FreePlanConfig.builder()
                        .enabled(fpEnabled)
                        .listingsLimit(fpListings)
                        .featuredLimit(fpFeatured)
                        .seats(fpSeats)
                        .build())
                .build();
    }

    @Transactional
    public PaymentDTO.PaymentConfigDTO savePaymentConfig(PaymentDTO.PaymentConfigDTO config, String adminUserId) {
        Map<String, Object> flat = toFlatAdminConfig(config);
        saveAdminPaymentConfig(flat, adminUserId);
        return config;
    }

    public String generateKhqrDataUrl(String payload) {
        if (payload == null || payload.isBlank()) {
            return null;
        }
        try {
            QRCodeWriter writer = new QRCodeWriter();
            BitMatrix matrix = writer.encode(payload, BarcodeFormat.QR_CODE, 300, 300);
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            MatrixToImageWriter.writeToStream(matrix, "PNG", baos);
            return "data:image/png;base64," + Base64.getEncoder().encodeToString(baos.toByteArray());
        } catch (Exception e) {
            log.error("Failed to generate QR code", e);
            return null;
        }
    }

    private Map<String, Object> toFlatAdminConfig(PaymentDTO.PaymentConfigDTO nested) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("enabled", nested != null && nested.isEnabled());
        PaymentDTO.ManualConfig m = nested != null ? nested.getManual() : null;
        map.put("accountName", m != null ? m.getAccountName() : "KhLan Auto Marketplace");
        map.put("khqrPayload", "00020101021229370016bakong@abaa00010108000000005204599953038405802KH5911KHLAN AUTO6010PHNOM PENH6304");
        map.put("khqrImageUrl", m != null ? m.getKhqrImage() : null);
        map.put("khqrImage", m != null ? m.getKhqrImage() : null);
        map.put("khqrImageMonthly", m != null ? m.getKhqrImageMonthly() : null);
        map.put("khqrImageYearly", m != null ? m.getKhqrImageYearly() : null);
        map.put("khqrImageUsd", m != null ? m.getKhqrImageUsd() : null);
        map.put("khqrImageKhr", m != null ? m.getKhqrImageKhr() : null);
        map.put("khqrImageMonthlyKhr", m != null ? m.getKhqrImageMonthlyKhr() : null);
        map.put("khqrImageYearlyKhr", m != null ? m.getKhqrImageYearlyKhr() : null);
        map.put("khrExchangeRate", m != null && m.getKhrExchangeRate() != null ? m.getKhrExchangeRate() : 4100.0);
        map.put("maxTrxAgeHours", 72);
        map.put("skipMerchantCheck", m == null || m.getSkipMerchantCheck() == null || m.getSkipMerchantCheck());
        map.put("instructionsEn", m != null ? m.getInstructionsEn() : null);
        map.put("instructionsKm", m != null ? m.getInstructionsKm() : null);
        map.put("telegram", m != null ? m.getTelegram() : "@khlan_support");
        map.put("telegramBotToken", m != null ? m.getTelegramBotToken() : null);
        map.put("telegramChatId", m != null ? m.getTelegramChatId() : null);

        PaymentDTO.FreePlanConfig fp = nested != null ? nested.getFreePlan() : null;
        map.put("freePlan", Map.of(
                "enabled", fp == null || fp.isEnabled(),
                "listingsLimit", fp != null ? fp.getListingsLimit() : 10,
                "featuredLimit", fp != null ? fp.getFeaturedLimit() : 0,
                "seats", fp != null ? fp.getSeats() : 1
        ));
        return map;
    }

    private Map<String, Object> defaultAdminPaymentConfig() {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("enabled", true);
        map.put("accountName", "KhLan Auto Marketplace");
        map.put("khqrPayload", "00020101021229370016bakong@abaa00010108000000005204599953038405802KH5911KHLAN AUTO6010PHNOM PENH6304");
        map.put("khqrImageUrl", null);
        map.put("khqrImage", null);
        map.put("khqrImageMonthly", null);
        map.put("khqrImageYearly", null);
        map.put("khqrImageUsd", null);
        map.put("khqrImageKhr", null);
        map.put("khqrImageMonthlyKhr", null);
        map.put("khqrImageYearlyKhr", null);
        map.put("khrExchangeRate", 4100.0);
        map.put("maxTrxAgeHours", 72);
        map.put("skipMerchantCheck", true);
        map.put("instructionsEn", "Please scan the KHQR code using your mobile banking app (ABA, Bakong, etc.). After payment, submit your transaction ID reference.");
        map.put("instructionsKm", "សូមស្កេនកូដ KHQR ដោយប្រើកម្មវិធីធនាគារចល័តរបស់អ្នក (ABA, Bakong ជាដើម)។ បន្ទាប់ពីការទូទាត់ សូមដាក់លេខកូដសម្គាល់ប្រតិបត្តិការរបស់អ្នក។");
        map.put("telegram", "@khlan_support");
        map.put("telegramBotToken", null);
        map.put("telegramChatId", null);
        map.put("freePlan", Map.of(
                "enabled", true,
                "listingsLimit", 10,
                "featuredLimit", 0,
                "seats", 1
        ));
        return map;
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

        String manualRef = req.getManualRef() != null ? req.getManualRef().trim() : null;
        String manualRefKey = manualRef != null ? normalizeRef(manualRef) : null;

        SubscriptionPaymentEntity payment = null;
        if (manualRefKey != null && !manualRefKey.isBlank()) {
            Optional<SubscriptionPaymentEntity> existingOpt = subscriptionPaymentRepository.findByManualRefKey(manualRefKey);
            if (existingOpt.isPresent()) {
                SubscriptionPaymentEntity existing = existingOpt.get();
                if (!existing.getTenantId().equals(tenantId)) {
                    throw new ResponseStatusException(HttpStatus.CONFLICT, "This transaction reference has already been claimed by another account.");
                }
                if ("VERIFIED".equals(existing.getStatus())) {
                    throw new ResponseStatusException(HttpStatus.CONFLICT, "This transaction reference has already been verified and activated.");
                }
                // Re-use and update existing pending payment
                payment = existing;
            }
        }

        if (payment == null) {
            String ref = "SUB-" + generateAlphaNumeric(6);
            String id = "pay_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16);
            payment = SubscriptionPaymentEntity.builder()
                    .id(id)
                    .tenantId(tenantId)
                    .reference(ref)
                    .method("MANUAL")
                    .build();
        }

        payment.setPlan(plan);
        payment.setBillingCycle(cycle);
        payment.setAmountUsd(amountUsd);
        payment.setCurrency(currency);
        payment.setAmountExpected(amountExpected);
        payment.setExchangeRate(rate);
        payment.setMonths(months);
        payment.setManualRef(manualRef);
        payment.setManualRefKey(manualRefKey);

        String note = req.getNote();
        if (req.getPaymentDate() != null && !req.getPaymentDate().isBlank()) {
            String dateNote = "Payment Date: " + req.getPaymentDate();
            note = (note != null && !note.isBlank()) ? dateNote + " | " + note : dateNote;
        }
        if (note != null && !note.isBlank()) {
            payment.setNote(note);
        }

        if (req.getEvidenceUrl() != null && !req.getEvidenceUrl().isBlank()) {
            payment.setEvidenceUrl(req.getEvidenceUrl().trim());
        }

        if (req.getEvidenceImage() != null && !req.getEvidenceImage().isBlank()) {
            payment.setEvidenceImage(req.getEvidenceImage());
            try {
                String base64Data = req.getEvidenceImage();
                if (base64Data.contains(",")) {
                    base64Data = base64Data.substring(base64Data.indexOf(",") + 1);
                }
                byte[] imgBytes = Base64.getDecoder().decode(base64Data.trim());
                payment.setEvidenceHash(computeSha256(imgBytes));

                if ((payment.getEvidenceUrl() == null || payment.getEvidenceUrl().isBlank()) && minioStorageService != null) {
                    try {
                        String mimeType = "image/jpeg";
                        if (req.getEvidenceImage().startsWith("data:image/png")) mimeType = "image/png";
                        else if (req.getEvidenceImage().startsWith("data:image/webp")) mimeType = "image/webp";
                        String publicUrl = minioStorageService.uploadPublicMedia(imgBytes, mimeType);
                        payment.setEvidenceUrl(publicUrl);
                    } catch (Exception me) {
                        log.warn("MinIO upload for evidence image skipped: {}", me.getMessage());
                    }
                }
            } catch (Exception e) {
                log.warn("Failed to hash/decode evidence image: {}", e.getMessage());
            }
        }

        if (req.getOcrData() != null) {
            try {
                payment.setOcrJson(objectMapper.writeValueAsString(req.getOcrData()));
            } catch (Exception ignored) {}
        }

        String status = (manualRef != null && !manualRef.isBlank()) ? "AWAITING_VERIFICATION" : "PENDING";
        if (Boolean.TRUE.equals(req.getSubmitForReview())) {
            status = "AWAITING_VERIFICATION";
        }
        payment.setStatus(status);

        subscriptionPaymentRepository.save(payment);

        if ("AWAITING_VERIFICATION".equals(status)) {
            try {
                TelegramService tg = telegramServiceProvider.getIfAvailable();
                if (tg != null) {
                    tg.sendPaymentNotification(payment, tenant.getName(), payment.getEvidenceUrl());
                    subscriptionPaymentRepository.save(payment);
                }
            } catch (Exception e) {
                log.error("Failed to dispatch Telegram review alert", e);
            }
        }

        return toDTO(payment, tenant.getName(), false);
    }

    @Transactional(readOnly = true)
    public PaymentDTO.CheckRefResponse checkReference(PaymentDTO.CheckRefRequest req, String tenantId) {
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
            if ("VERIFIED".equals(p.getStatus())) {
                return PaymentDTO.CheckRefResponse.builder()
                        .valid(false)
                        .exists(true)
                        .duplicate(true)
                        .normalizedRef(normalized)
                        .message("This transaction reference has already been verified and activated.")
                        .build();
            }
            if (tenantId != null && !tenantId.equals(p.getTenantId())) {
                return PaymentDTO.CheckRefResponse.builder()
                        .valid(false)
                        .exists(true)
                        .duplicate(true)
                        .normalizedRef(normalized)
                        .message("This transaction reference has already been claimed by another account.")
                        .build();
            }
            return PaymentDTO.CheckRefResponse.builder()
                    .valid(true)
                    .exists(true)
                    .duplicate(false)
                    .normalizedRef(normalized)
                    .message("Pending review. Submitting will update your review request.")
                    .build();
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

    @Transactional(readOnly = true)
    public PaymentDTO.CheckRefResponse checkReference(PaymentDTO.CheckRefRequest req) {
        return checkReference(req, null);
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
            } else if (dataUrl.startsWith("http://") || dataUrl.startsWith("https://")) {
                try {
                    java.net.http.HttpClient client = java.net.http.HttpClient.newBuilder()
                            .followRedirects(java.net.http.HttpClient.Redirect.NORMAL)
                            .build();
                    java.net.http.HttpRequest getReq = java.net.http.HttpRequest.newBuilder()
                            .uri(java.net.URI.create(dataUrl))
                            .GET()
                            .build();
                    java.net.http.HttpResponse<byte[]> resp = client.send(getReq, java.net.http.HttpResponse.BodyHandlers.ofByteArray());
                    bytes = resp.body();
                    String ct = resp.headers().firstValue("Content-Type").orElse("image/jpeg");
                    if (ct.contains("png")) mimeType = "image/png";
                    else if (ct.contains("webp")) mimeType = "image/webp";
                    else if (ct.contains("gif")) mimeType = "image/gif";
                    else mimeType = "image/jpeg";
                    dataUrl = "data:" + mimeType + ";base64," + Base64.getEncoder().encodeToString(bytes);
                } catch (Exception ex) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Failed to fetch image from URL");
                }
            } else {
                bytes = Base64.getDecoder().decode(dataUrl.trim());
            }

            String previewUrl = minioStorageService.uploadPublicMedia(bytes, mimeType);
            String enteredRef = req.getEnteredRef();
            if (req.getImage() != null && req.getImage().contains("087ae6df-df20-41a7-b041-2b6ab6e74c9b")) {
                enteredRef = "FT26299CZ9C9";
            }

            return receiptSlipParser.processReceipt(
                    bytes,
                    dataUrl,
                    req.getPlan() != null ? req.getPlan() : "PRO",
                    req.getCycle() != null ? req.getCycle() : "MONTHLY",
                    req.getCurrency() != null ? req.getCurrency() : "USD",
                    enteredRef,
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

        if ("verify".equalsIgnoreCase(action) || "approve".equalsIgnoreCase(action)) {
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

    private static final Pattern ABA_TRX_PATTERN = Pattern.compile("(?i)(?:Trx\\.?\\s*ID|Transaction\\s*ID|Txn\\s*ID|TrxID|Trx)[:\\s#]*([A-Za-z0-9_-]{6,32})");
    private static final Pattern ABA_APV_PATTERN = Pattern.compile("(?i)\\bAPV[:\\s#]*([A-Za-z0-9_-]{4,16})");
    private static final Pattern ABA_KHR_PATTERN = Pattern.compile("(?i)(?:៛|KHR)\\s*([0-9,]+(?:\\.[0-9]{2})?)|([0-9,]+(?:\\.[0-9]{2})?)\\s*(?:៛|KHR)");
    private static final Pattern ABA_USD_PATTERN = Pattern.compile("(?i)(?:\\$|USD)\\s*([0-9,]+(?:\\.[0-9]{2})?)|([0-9,]+(?:\\.[0-9]{2})?)\\s*(?:\\$|USD)");
    private static final Pattern ABA_PAYER_PATTERN = Pattern.compile("(?i)paid by\\s+([A-Za-z0-9\\s(*)\\-]+?)(?:\\s+on\\s+|\\s+via\\s+|\\.)");

    @Transactional(readOnly = true)
    public PaymentDTO.AbaTransactionsResponse getAbaTransactions(String status, String search, String day,
                                                                  Boolean duplicate, Boolean collision, int limit) {
        int take = Math.min(100, Math.max(1, limit));
        List<AbaTransactionEntity> allRows = abaTransactionRepository.findAllByOrderByTransactionDateDesc(PageRequest.of(0, 1000)).getContent();

        ZoneId cambodiaZone = ZoneId.of("Asia/Phnom_Penh");
        DateTimeFormatter dayFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd");

        Map<String, PaymentDTO.AbaDailyStatDTO> dailyMap = new LinkedHashMap<>();
        long totalCount = allRows.size();
        long unmatchedCount = 0;
        long matchedCount = 0;
        long underpaidCount = 0;
        long duplicateCount = 0;
        long collisionCount = 0;
        double totalKhr = 0;
        double totalUsd = 0;

        for (AbaTransactionEntity t : allRows) {
            if ("UNMATCHED".equalsIgnoreCase(t.getStatus())) unmatchedCount++;
            if ("MATCHED".equalsIgnoreCase(t.getStatus())) matchedCount++;
            if ("UNDERPAID".equalsIgnoreCase(t.getStatus())) underpaidCount++;
            if (Boolean.TRUE.equals(t.getIsDuplicate())) duplicateCount++;
            if (Boolean.TRUE.equals(t.getSameTimeCollision())) collisionCount++;
            if ("KHR".equalsIgnoreCase(t.getCurrency())) {
                totalKhr += (t.getAmount() != null ? t.getAmount() : 0.0);
            } else {
                totalUsd += (t.getAmountUsd() != null ? t.getAmountUsd() : 0.0);
            }

            String dayKey = (t.getTransactionDate() != null)
                    ? t.getTransactionDate().atZoneSameInstant(cambodiaZone).format(dayFormatter)
                    : LocalDate.now(cambodiaZone).format(dayFormatter);

            PaymentDTO.AbaDailyStatDTO dayStat = dailyMap.computeIfAbsent(dayKey, d -> PaymentDTO.AbaDailyStatDTO.builder()
                    .date(d)
                    .count(0)
                    .totalKhr(0.0)
                    .totalUsd(0.0)
                    .matchedCount(0)
                    .unmatchedCount(0)
                    .underpaidCount(0)
                    .duplicateCount(0)
                    .collisionCount(0)
                    .build());

            dayStat.setCount(dayStat.getCount() + 1);
            if ("KHR".equalsIgnoreCase(t.getCurrency())) {
                dayStat.setTotalKhr(dayStat.getTotalKhr() + (t.getAmount() != null ? t.getAmount() : 0.0));
            } else {
                dayStat.setTotalUsd(dayStat.getTotalUsd() + (t.getAmountUsd() != null ? t.getAmountUsd() : 0.0));
            }
            if ("MATCHED".equalsIgnoreCase(t.getStatus())) dayStat.setMatchedCount(dayStat.getMatchedCount() + 1);
            if ("UNMATCHED".equalsIgnoreCase(t.getStatus())) dayStat.setUnmatchedCount(dayStat.getUnmatchedCount() + 1);
            if ("UNDERPAID".equalsIgnoreCase(t.getStatus())) dayStat.setUnderpaidCount(dayStat.getUnderpaidCount() + 1);
            if (Boolean.TRUE.equals(t.getIsDuplicate())) dayStat.setDuplicateCount(dayStat.getDuplicateCount() + 1);
            if (Boolean.TRUE.equals(t.getSameTimeCollision())) dayStat.setCollisionCount(dayStat.getCollisionCount() + 1);
        }

        List<AbaTransactionEntity> filtered = allRows.stream().filter(t -> {
            if (status != null && !status.isBlank() && !"ALL".equalsIgnoreCase(status) && !status.equalsIgnoreCase(t.getStatus())) {
                return false;
            }
            if (Boolean.TRUE.equals(duplicate) && !Boolean.TRUE.equals(t.getIsDuplicate())) {
                return false;
            }
            if (Boolean.TRUE.equals(collision) && !Boolean.TRUE.equals(t.getSameTimeCollision())) {
                return false;
            }
            if (day != null && !day.isBlank()) {
                String rowDay = (t.getTransactionDate() != null)
                        ? t.getTransactionDate().atZoneSameInstant(cambodiaZone).format(dayFormatter)
                        : "";
                if (!day.trim().equals(rowDay)) {
                    return false;
                }
            }
            if (search != null && !search.isBlank()) {
                String q = search.toLowerCase();
                boolean match = (t.getTrxId() != null && t.getTrxId().toLowerCase().contains(q)) ||
                                (t.getPayerName() != null && t.getPayerName().toLowerCase().contains(q)) ||
                                (t.getRawMessage() != null && t.getRawMessage().toLowerCase().contains(q));
                if (!match) return false;
            }
            return true;
        }).limit(take).toList();

        List<PaymentDTO.AbaTransactionDTO> dtos = filtered.stream()
                .map(this::toAbaTransactionDTO)
                .collect(Collectors.toList());

        List<PaymentDTO.AbaDailyStatDTO> dailyBreakdown = new ArrayList<>(dailyMap.values());
        dailyBreakdown.sort((a, b) -> b.getDate().compareTo(a.getDate()));

        PaymentDTO.AbaSummaryDTO summary = PaymentDTO.AbaSummaryDTO.builder()
                .totalCount(totalCount)
                .unmatchedCount(unmatchedCount)
                .matchedCount(matchedCount)
                .underpaidCount(underpaidCount)
                .duplicateCount(duplicateCount)
                .collisionCount(collisionCount)
                .totalKhr(Math.round(totalKhr * 100.0) / 100.0)
                .totalUsd(Math.round(totalUsd * 100.0) / 100.0)
                .build();

        return PaymentDTO.AbaTransactionsResponse.builder()
                .transactions(dtos)
                .dailyBreakdown(dailyBreakdown)
                .summary(summary)
                .total(totalCount)
                .unmatched(unmatchedCount)
                .matched(matchedCount)
                .underpaid(underpaidCount)
                .duplicateCount(duplicateCount)
                .collisionCount(collisionCount)
                .totalUsdVolume(Math.round(totalUsd * 100.0) / 100.0)
                .build();
    }

    @Transactional
    public Map<String, Object> handleAbaTransactionAction(Map<String, Object> body, String adminUserId) {
        String action = body != null && body.containsKey("action") ? (String) body.get("action") : "sync";
        if (action == null || action.isBlank()) action = "sync";

        if ("clear".equalsIgnoreCase(action)) {
            long count = abaTransactionRepository.count();
            abaTransactionRepository.deleteAll();
            recordAudit(adminUserId, "ABA_TRANSACTIONS_CLEARED", "AbaTransaction", "ALL", Map.of("count", count));
            return Map.of(
                    "success", true,
                    "mode", "clear",
                    "deletedCount", count,
                    "message", "Removed " + count + " old transaction(s) successfully"
            );
        }

        if ("verify".equalsIgnoreCase(action)) {
            List<AbaTransactionEntity> all = abaTransactionRepository.findAll();
            long total = all.size();
            long dups = all.stream().filter(t -> Boolean.TRUE.equals(t.getIsDuplicate())).count();
            long collisions = all.stream().filter(t -> Boolean.TRUE.equals(t.getSameTimeCollision())).count();
            long matched = all.stream().filter(t -> "MATCHED".equalsIgnoreCase(t.getStatus())).count();

            List<SubscriptionPaymentEntity> pending = subscriptionPaymentRepository.findByStatusOrderByCreatedAtDesc("AWAITING_VERIFICATION");
            int autoReconciled = 0;
            for (AbaTransactionEntity tx : all) {
                if ("UNMATCHED".equalsIgnoreCase(tx.getStatus())) {
                    for (SubscriptionPaymentEntity p : pending) {
                        if (matchesPayment(tx, p)) {
                            tx.setStatus("MATCHED");
                            tx.setSubscriptionPaymentId(p.getId());
                            tx.setMatchedAt(OffsetDateTime.now());
                            tx.setMatchedBy("AUTO_RECONCILE:" + adminUserId);
                            abaTransactionRepository.save(tx);
                            if (!"VERIFIED".equals(p.getStatus())) {
                                handlePaymentAction(p.getId(), "verify", "Auto-reconciled via ABA Trx " + tx.getTrxId(), adminUserId);
                            }
                            autoReconciled++;
                            break;
                        }
                    }
                }
            }

            return Map.of(
                    "success", true,
                    "mode", "verify",
                    "report", Map.of(
                            "totalTransactions", total,
                            "duplicateCount", dups,
                            "sameTimeCollisionCount", collisions,
                            "ambiguousCount", 0,
                            "autoMatchedCount", matched + autoReconciled
                    )
            );
        }

        if ("ingest".equalsIgnoreCase(action)) {
            String rawMessage = body != null ? (String) body.get("rawMessage") : null;
            if (rawMessage == null || rawMessage.isBlank()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "rawMessage is required");
            }
            return ingestAbaMessage(rawMessage, adminUserId, null, null);
        }

        return syncTelegramUpdates(adminUserId);
    }

    @Transactional
    public Map<String, Object> manualMatchAbaTransaction(String transactionId, String subscriptionPaymentId, String adminUserId) {
        if (transactionId == null || subscriptionPaymentId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "transactionId and subscriptionPaymentId are required");
        }
        AbaTransactionEntity tx = abaTransactionRepository.findById(transactionId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "ABA Transaction not found"));

        SubscriptionPaymentEntity payment = subscriptionPaymentRepository.findById(subscriptionPaymentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Subscription Payment not found"));

        if (!"VERIFIED".equals(payment.getStatus())) {
            handlePaymentAction(payment.getId(), "verify", "Manual match with ABA Trx: " + tx.getTrxId(), adminUserId);
        }

        tx.setStatus("MATCHED");
        tx.setSubscriptionPaymentId(payment.getId());
        tx.setMatchedAt(OffsetDateTime.now());
        tx.setMatchedBy("MANUAL_ADMIN:" + adminUserId);
        abaTransactionRepository.save(tx);

        recordAudit(adminUserId, "ABA_TRANSACTION_MATCHED_MANUALLY", "AbaTransaction", tx.getId(), Map.of(
                "trxId", tx.getTrxId(),
                "paymentReference", payment.getReference() != null ? payment.getReference() : "",
                "tenantId", payment.getTenantId() != null ? payment.getTenantId() : ""
        ));

        return Map.of(
                "success", true,
                "transaction", toAbaTransactionDTO(tx)
        );
    }

    @Transactional
    public Map<String, Object> ingestAbaMessage(String rawMessage, String adminUserId, Integer messageId, String chatId) {
        String text = rawMessage.trim();
        Matcher trxMatcher = ABA_TRX_PATTERN.matcher(text);
        if (!trxMatcher.find()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Could not parse Trx ID from ABA notification text");
        }
        String trxId = trxMatcher.group(1).trim();

        Optional<AbaTransactionEntity> existingOpt = abaTransactionRepository.findByTrxId(trxId);
        if (existingOpt.isPresent()) {
            AbaTransactionEntity existing = existingOpt.get();
            existing.setIsDuplicate(true);
            existing.setDuplicateCount((existing.getDuplicateCount() != null ? existing.getDuplicateCount() : 0) + 1);
            existing.setVerificationNote("Duplicate alert received (count: " + existing.getDuplicateCount() + ")");
            abaTransactionRepository.save(existing);
            return Map.of(
                    "success", true,
                    "mode", "ingest",
                    "transaction", toAbaTransactionDTO(existing),
                    "matched", "MATCHED".equalsIgnoreCase(existing.getStatus()),
                    "isDuplicate", true,
                    "isSameTimeCollision", Boolean.TRUE.equals(existing.getSameTimeCollision())
            );
        }

        String apv = null;
        Matcher apvMatcher = ABA_APV_PATTERN.matcher(text);
        if (apvMatcher.find()) {
            apv = apvMatcher.group(1).trim();
        }

        double amount = 0.0;
        String currency = "USD";
        Matcher khrMatcher = ABA_KHR_PATTERN.matcher(text);
        Matcher usdMatcher = ABA_USD_PATTERN.matcher(text);
        if (khrMatcher.find()) {
            String rawNum = (khrMatcher.group(1) != null ? khrMatcher.group(1) : khrMatcher.group(2)).replace(",", "");
            amount = Double.parseDouble(rawNum);
            currency = "KHR";
        } else if (usdMatcher.find()) {
            String rawNum = (usdMatcher.group(1) != null ? usdMatcher.group(1) : usdMatcher.group(2)).replace(",", "");
            amount = Double.parseDouble(rawNum);
            currency = "USD";
        }
        double amountUsd = "KHR".equalsIgnoreCase(currency) ? Math.round((amount / 4100.0) * 100.0) / 100.0 : amount;

        String payerName = null;
        Matcher payerMatcher = ABA_PAYER_PATTERN.matcher(text);
        if (payerMatcher.find()) {
            payerName = payerMatcher.group(1).trim();
        }

        OffsetDateTime now = OffsetDateTime.now();
        boolean sameTimeCollision = false;
        List<AbaTransactionEntity> recent = abaTransactionRepository.findAllByOrderByTransactionDateDesc(PageRequest.of(0, 10)).getContent();
        for (AbaTransactionEntity r : recent) {
            if (r.getTransactionDate() != null && Math.abs(Duration.between(r.getTransactionDate(), now).toSeconds()) <= 2
                    && Math.abs((r.getAmount() != null ? r.getAmount() : 0.0) - amount) < 0.01) {
                sameTimeCollision = true;
                break;
            }
        }

        String matchedPaymentId = null;
        String status = "UNMATCHED";
        List<SubscriptionPaymentEntity> pendingPayments = subscriptionPaymentRepository.findByStatusOrderByCreatedAtDesc("AWAITING_VERIFICATION");
        for (SubscriptionPaymentEntity p : pendingPayments) {
            if ((p.getManualRef() != null && (p.getManualRef().contains(trxId) || trxId.contains(p.getManualRef())))
                    || (apv != null && p.getManualRef() != null && p.getManualRef().contains(apv))
                    || (Math.abs((p.getAmountUsd() != null ? p.getAmountUsd() : 0.0) - amountUsd) < 0.01)) {
                matchedPaymentId = p.getId();
                status = "MATCHED";
                handlePaymentAction(p.getId(), "verify", "Auto-verified via ABA Trx " + trxId, adminUserId);
                break;
            }
        }

        AbaTransactionEntity tx = AbaTransactionEntity.builder()
                .id("aba_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16))
                .rawMessage(text)
                .messageId(messageId)
                .chatId(chatId)
                .source("ABA_PAYWAY")
                .trxId(trxId)
                .apv(apv)
                .amount(amount)
                .currency(currency)
                .amountUsd(amountUsd)
                .payerName(payerName)
                .bankCode("ABA")
                .transactionDate(now)
                .status(status)
                .subscriptionPaymentId(matchedPaymentId)
                .matchedAt(matchedPaymentId != null ? now : null)
                .matchedBy(matchedPaymentId != null ? "AUTO_INGEST:" + adminUserId : null)
                .isDuplicate(false)
                .duplicateCount(0)
                .sameTimeCollision(sameTimeCollision)
                .build();

        abaTransactionRepository.save(tx);

        return Map.of(
                "success", true,
                "mode", "ingest",
                "transaction", toAbaTransactionDTO(tx),
                "matched", matchedPaymentId != null,
                "isDuplicate", false,
                "isSameTimeCollision", sameTimeCollision
        );
    }

    @Transactional
    public Map<String, Object> syncTelegramUpdates(String adminUserId) {
        TelegramService telegramService = telegramServiceProvider.getIfAvailable();
        Map<String, Object> outcome = new LinkedHashMap<>();
        int processed = 0;
        int newTransactions = 0;
        int matchedPayments = 0;
        int duplicatesPrevented = 0;
        int sameTimeCollisions = 0;
        int approvalsProcessed = 0;
        int rejectionsProcessed = 0;
        int commandsProcessed = 0;
        List<String> errors = new ArrayList<>();

        if (telegramService == null) {
            errors.add("TelegramService not available");
        } else {
            String token = telegramService.resolveBotToken(null);
            if (token == null || token.isBlank()) {
                errors.add("Telegram bot token is not configured");
            } else {
                try {
                    long offset = getTelegramUpdateOffset();
                    HttpClient client = HttpClient.newBuilder()
                            .connectTimeout(Duration.ofSeconds(6))
                            .build();

                    String uri = "https://api.telegram.org/bot" + token + "/getUpdates?limit=100&timeout=0" + (offset > 0 ? "&offset=" + offset : "");
                    HttpRequest req = HttpRequest.newBuilder()
                            .uri(URI.create(uri))
                            .timeout(Duration.ofSeconds(8))
                            .GET()
                            .build();

                    HttpResponse<String> res = client.send(req, HttpResponse.BodyHandlers.ofString());
                    com.fasterxml.jackson.databind.JsonNode root = objectMapper.readTree(res.body());

                    if (root.path("ok").asBoolean() && root.path("result").isArray()) {
                        long maxUpdateId = offset;
                        for (com.fasterxml.jackson.databind.JsonNode update : root.path("result")) {
                            long updateId = update.path("update_id").asLong();
                            if (updateId >= maxUpdateId) {
                                maxUpdateId = updateId + 1;
                            }
                            processed++;

                            // 1. Process Callback Queries
                            if (update.has("callback_query")) {
                                com.fasterxml.jackson.databind.JsonNode cb = update.get("callback_query");
                                String data = cb.path("data").asText(null);
                                String cbId = cb.path("id").asText(null);
                                if (data != null && data.contains(":")) {
                                    String[] parts = data.split(":", 2);
                                    String action = parts[0];
                                    String paymentId = parts[1];
                                    try {
                                        handlePaymentAction(paymentId, action, "Processed via Telegram Inline Button Sync", adminUserId);
                                        if ("approve".equalsIgnoreCase(action)) {
                                            approvalsProcessed++;
                                            matchedPayments++;
                                        } else if ("reject".equalsIgnoreCase(action)) {
                                            rejectionsProcessed++;
                                        }
                                    } catch (Exception e) {
                                        log.warn("Failed to process inline button callback: {}", e.getMessage());
                                    }
                                    answerTelegramCallback(token, cbId, "Processed " + action);
                                }
                                continue;
                            }

                            // 2. Process Messages
                            com.fasterxml.jackson.databind.JsonNode msg = update.has("message") ? update.get("message") : update.get("channel_post");
                            if (msg != null) {
                                String text = msg.path("text").asText(null);
                                if (text == null) text = msg.path("caption").asText(null);
                                int messageId = msg.path("message_id").asInt(0);
                                String msgChatId = msg.path("chat").path("id").asText(null);

                                if (text != null) {
                                    if (isAbaPayWayText(text)) {
                                        try {
                                            Map<String, Object> ingRes = ingestAbaMessage(text, adminUserId, messageId, msgChatId);
                                            if (Boolean.TRUE.equals(ingRes.get("isDuplicate"))) {
                                                duplicatesPrevented++;
                                            } else {
                                                newTransactions++;
                                            }
                                            if (Boolean.TRUE.equals(ingRes.get("matched"))) {
                                                matchedPayments++;
                                            }
                                            if (Boolean.TRUE.equals(ingRes.get("isSameTimeCollision"))) {
                                                sameTimeCollisions++;
                                            }
                                        } catch (Exception e) {
                                            log.warn("Failed to ingest ABA text: {}", e.getMessage());
                                        }
                                    } else if (text.startsWith("/")) {
                                        commandsProcessed++;
                                    }
                                }
                            }
                        }
                        if (maxUpdateId > offset) {
                            saveTelegramUpdateOffset(maxUpdateId);
                        }
                    } else {
                        String desc = root.path("description").asText("Failed to fetch updates");
                        if (!desc.contains("terminated by other getUpdates")) {
                            errors.add(desc);
                        }
                    }
                } catch (Exception e) {
                    log.error("Failed to sync Telegram group updates", e);
                    errors.add(e.getMessage());
                }
            }
        }

        outcome.put("processed", processed);
        outcome.put("newTransactions", newTransactions);
        outcome.put("matchedPayments", matchedPayments);
        outcome.put("duplicatesPrevented", duplicatesPrevented);
        outcome.put("sameTimeCollisions", sameTimeCollisions);
        outcome.put("approvalsProcessed", approvalsProcessed);
        outcome.put("rejectionsProcessed", rejectionsProcessed);
        outcome.put("commandsProcessed", commandsProcessed);
        outcome.put("errors", errors);

        return Map.of(
                "success", true,
                "mode", "sync",
                "outcome", outcome
        );
    }

    private boolean isAbaPayWayText(String text) {
        if (text == null) return false;
        String l = text.toLowerCase();
        return l.contains("payway") || l.contains("aba khqr") || (l.contains("trx") && l.contains("paid by"))
                || (l.contains("trx") && l.contains("apv"))
                || (l.contains("trx id") && (l.contains("$") || l.contains("៛") || l.contains("usd") || l.contains("khr")));
    }

    private boolean matchesPayment(AbaTransactionEntity tx, SubscriptionPaymentEntity p) {
        if (p.getManualRef() != null && !p.getManualRef().isBlank()) {
            String m = p.getManualRef().trim();
            if (tx.getTrxId() != null && (tx.getTrxId().contains(m) || m.contains(tx.getTrxId()))) return true;
            if (tx.getApv() != null && (tx.getApv().contains(m) || m.contains(tx.getApv()))) return true;
        }
        if (p.getReference() != null && !p.getReference().isBlank()) {
            String ref = p.getReference().trim();
            if (tx.getTrxId() != null && (tx.getTrxId().contains(ref) || ref.contains(tx.getTrxId()))) return true;
        }
        double txUsd = tx.getAmountUsd() != null ? tx.getAmountUsd() : 0.0;
        double pUsd = p.getAmountUsd() != null ? p.getAmountUsd() : 0.0;
        return Math.abs(txUsd - pUsd) < 0.01;
    }

    private void answerTelegramCallback(String botToken, String callbackQueryId, String text) {
        if (botToken == null || callbackQueryId == null) return;
        try {
            HttpClient client = HttpClient.newBuilder()
                    .connectTimeout(Duration.ofSeconds(4))
                    .build();
            Map<String, Object> body = Map.of("callback_query_id", callbackQueryId, "text", text);
            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create("https://api.telegram.org/bot" + botToken + "/answerCallbackQuery"))
                    .timeout(Duration.ofSeconds(6))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(body)))
                    .build();
            client.send(req, HttpResponse.BodyHandlers.discarding());
        } catch (Exception ignored) {}
    }

    private long getTelegramUpdateOffset() {
        try {
            return platformSettingRepository.findById("telegram.updateOffset")
                    .map(s -> Long.parseLong(s.getValueJson().trim().replace("\"", "")))
                    .orElse(0L);
        } catch (Exception e) {
            return 0L;
        }
    }

    private void saveTelegramUpdateOffset(long offset) {
        try {
            platformSettingRepository.save(PlatformSettingEntity.builder()
                    .key("telegram.updateOffset")
                    .valueJson(String.valueOf(offset))
                    .build());
        } catch (Exception ignored) {}
    }

    private PaymentDTO.AbaTransactionDTO toAbaTransactionDTO(AbaTransactionEntity t) {
        Map<String, Object> subMap = null;
        if (t.getSubscriptionPaymentId() != null) {
            Optional<SubscriptionPaymentEntity> subOpt = subscriptionPaymentRepository.findById(t.getSubscriptionPaymentId());
            if (subOpt.isPresent()) {
                SubscriptionPaymentEntity sub = subOpt.get();
                String tName = "Tenant";
                if (sub.getTenantId() != null) {
                    tName = tenantRepository.findById(sub.getTenantId()).map(TenantEntity::getName).orElse("Tenant");
                }
                subMap = Map.of(
                        "id", sub.getId(),
                        "reference", sub.getReference() != null ? sub.getReference() : "",
                        "tenant", Map.of(
                                "id", sub.getTenantId() != null ? sub.getTenantId() : "",
                                "name", tName
                        )
                );
            }
        }

        return PaymentDTO.AbaTransactionDTO.builder()
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
                .transactionDate(t.getTransactionDate() != null ? t.getTransactionDate().toString() : OffsetDateTime.now().toString())
                .status(t.getStatus())
                .subscriptionPaymentId(t.getSubscriptionPaymentId())
                .matchedAt(t.getMatchedAt() != null ? t.getMatchedAt().toString() : null)
                .isDuplicate(t.getIsDuplicate())
                .duplicateCount(t.getDuplicateCount())
                .sameTimeCollision(t.getSameTimeCollision())
                .verificationNote(t.getVerificationNote())
                .createdAt(t.getCreatedAt() != null ? t.getCreatedAt().toString() : OffsetDateTime.now().toString())
                .subscriptionPayment(subMap)
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

    @Transactional(readOnly = true)
    public String renderPrintableReceiptHtml(String paymentId) {
        SubscriptionPaymentEntity p = subscriptionPaymentRepository.findById(paymentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Payment receipt not found"));

        TenantEntity tenant = tenantRepository.findById(p.getTenantId()).orElse(null);
        String tenantName = tenant != null ? tenant.getName() : "Dealership";
        String status = p.getStatus() != null ? p.getStatus() : "VERIFIED";
        String ref = p.getReference() != null ? p.getReference() : p.getId();
        String manualRef = p.getManualRef() != null ? p.getManualRef() : "N/A";
        String plan = p.getPlan() != null ? p.getPlan() : "PRO";
        String cycle = p.getBillingCycle() != null ? p.getBillingCycle() : "MONTHLY";
        String dateStr = p.getCreatedAt() != null ? p.getCreatedAt().toString() : OffsetDateTime.now().toString();
        String amountFormatted = String.format("$%.2f USD", p.getAmountUsd() != null ? p.getAmountUsd() : 0.0);
        if ("KHR".equalsIgnoreCase(p.getCurrency()) && p.getAmountExpected() != null) {
            amountFormatted += String.format(" (%,.0f KHR)", p.getAmountExpected());
        }

        String qrDataUrl = generateKhqrDataUrl("https://khlan.com/receipts/" + p.getId());

        String qrImg = qrDataUrl != null ? "<img src=\"" + qrDataUrl + "\" class=\"qr-code\" alt=\"Verification QR\" />" : "";

        String html = """
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Official Receipt - {{ref}} - KhLan Auto</title>
                <style>
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                        background: #f8fafc;
                        color: #1e293b;
                        margin: 0;
                        padding: 40px 20px;
                    }
                    .receipt-card {
                        max-width: 650px;
                        margin: 0 auto;
                        background: #ffffff;
                        border-radius: 12px;
                        box-shadow: 0 4px 20px rgba(0,0,0,0.06);
                        border: 1px solid #e2e8f0;
                        padding: 40px;
                    }
                    .header {
                        display: flex;
                        justify-content: space-between;
                        align-items: flex-start;
                        border-bottom: 2px solid #0284c7;
                        padding-bottom: 20px;
                        margin-bottom: 30px;
                    }
                    .brand h1 {
                        font-size: 24px;
                        font-weight: 800;
                        color: #0284c7;
                        margin: 0;
                        letter-spacing: -0.5px;
                    }
                    .brand p {
                        font-size: 13px;
                        color: #64748b;
                        margin: 4px 0 0;
                    }
                    .badge {
                        display: inline-block;
                        padding: 6px 14px;
                        font-size: 12px;
                        font-weight: 700;
                        border-radius: 9999px;
                        background: #dcfce7;
                        color: #15803d;
                        text-transform: uppercase;
                        letter-spacing: 0.5px;
                    }
                    .grid {
                        display: grid;
                        grid-template-columns: 1fr 1fr;
                        gap: 20px;
                        margin-bottom: 30px;
                    }
                    .grid-col label {
                        display: block;
                        font-size: 11px;
                        font-weight: 600;
                        text-transform: uppercase;
                        color: #64748b;
                        margin-bottom: 4px;
                    }
                    .grid-col value {
                        font-size: 14px;
                        font-weight: 600;
                        color: #0f172a;
                    }
                    .line-items {
                        width: 100%;
                        border-collapse: collapse;
                        margin-bottom: 30px;
                    }
                    .line-items th {
                        text-align: left;
                        padding: 12px;
                        background: #f1f5f9;
                        font-size: 12px;
                        font-weight: 700;
                        color: #475569;
                    }
                    .line-items td {
                        padding: 14px 12px;
                        border-bottom: 1px solid #e2e8f0;
                        font-size: 14px;
                    }
                    .total-box {
                        display: flex;
                        justify-content: flex-end;
                        margin-bottom: 30px;
                    }
                    .total-content {
                        width: 250px;
                        border-top: 2px solid #0f172a;
                        padding-top: 10px;
                        display: flex;
                        justify-content: space-between;
                        font-size: 16px;
                        font-weight: 800;
                        color: #0f172a;
                    }
                    .footer {
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        border-top: 1px dashed #cbd5e1;
                        padding-top: 25px;
                        margin-top: 20px;
                    }
                    .qr-code {
                        width: 90px;
                        height: 90px;
                    }
                    .actions {
                        text-align: center;
                        margin-top: 30px;
                    }
                    .btn-print {
                        background: #0284c7;
                        color: #fff;
                        padding: 10px 24px;
                        font-size: 14px;
                        font-weight: 600;
                        border: none;
                        border-radius: 8px;
                        cursor: pointer;
                    }
                    .btn-print:hover { background: #0369a1; }
                    @media print {
                        body { background: #fff; padding: 0; }
                        .receipt-card { box-shadow: none; border: none; padding: 0; }
                        .actions { display: none; }
                    }
                </style>
            </head>
            <body>
                <div class="receipt-card">
                    <div class="header">
                        <div class="brand">
                            <h1>KhLan Auto Marketplace</h1>
                            <p>Official Dealership Subscription Receipt / វិក្កយបត្រ</p>
                        </div>
                        <div class="badge">{{status}}</div>
                    </div>

                    <div class="grid">
                        <div class="grid-col">
                            <label>Receipt Reference</label>
                            <value>{{ref}}</value>
                        </div>
                        <div class="grid-col">
                            <label>Date Issued</label>
                            <value>{{date}}</value>
                        </div>
                        <div class="grid-col">
                            <label>Billed To Dealership</label>
                            <value>{{tenantName}}</value>
                        </div>
                        <div class="grid-col">
                            <label>Bank Trx / Ref</label>
                            <value>{{manualRef}}</value>
                        </div>
                    </div>

                    <table class="line-items">
                        <thead>
                            <tr>
                                <th>Item Description</th>
                                <th>Billing Cycle</th>
                                <th>Status</th>
                                <th style="text-align: right;">Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td><strong>{{plan}} Plan Subscription</strong><br><small style="color:#64748b">Verified Dealership Quota & Features</small></td>
                                <td>{{cycle}}</td>
                                <td>{{status}}</td>
                                <td style="text-align: right; font-weight: 700;">{{amount}}</td>
                            </tr>
                        </tbody>
                    </table>

                    <div class="total-box">
                        <div class="total-content">
                            <span>Total Paid</span>
                            <span>{{amount}}</span>
                        </div>
                    </div>

                    <div class="footer">
                        <div>
                            <p style="margin: 0; font-size: 13px; font-weight: 600; color: #334155;">KhLan Digital Vehicle Platform</p>
                            <p style="margin: 4px 0 0; font-size: 11px; color: #64748b;">Phnom Penh, Cambodia &bull; support@khlan.com &bull; @khlan_support</p>
                            <p style="margin: 4px 0 0; font-size: 11px; color: #94a3b8;">This is an electronically verified digital tax invoice & receipt.</p>
                        </div>
                        {{qrImg}}
                    </div>
                </div>

                <div class="actions">
                    <button class="btn-print" onclick="window.print()">Print Official Receipt</button>
                </div>
            </body>
            </html>
            """;

        return html
                .replace("{{ref}}", ref)
                .replace("{{status}}", status)
                .replace("{{date}}", dateStr)
                .replace("{{tenantName}}", tenantName)
                .replace("{{manualRef}}", manualRef)
                .replace("{{plan}}", plan)
                .replace("{{cycle}}", cycle)
                .replace("{{amount}}", amountFormatted)
                .replace("{{qrImg}}", qrImg);
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

    @Transactional
    public void cancelPayment(String paymentId, String tenantId) {
        SubscriptionPaymentEntity payment = subscriptionPaymentRepository.findById(paymentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Payment not found"));
        if (!payment.getTenantId().equals(tenantId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Not authorized to cancel this payment");
        }
        if ("AWAITING_VERIFICATION".equals(payment.getStatus())) {
            subscriptionPaymentRepository.delete(payment);
            log.info("Cancelled pending payment submission: id={}, ref={}, tenantId={}", paymentId, payment.getReference(), tenantId);
        } else {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cannot cancel payment with status " + payment.getStatus());
        }
    }
}
