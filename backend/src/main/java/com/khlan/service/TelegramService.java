package com.khlan.service;

import com.khlan.dto.TelegramDTO;
import com.khlan.entity.AbaTransactionEntity;
import com.khlan.entity.SellerProfileEntity;
import com.khlan.entity.TelegramInviteEventEntity;
import com.khlan.repository.AbaTransactionRepository;
import com.khlan.repository.SellerProfileRepository;
import com.khlan.repository.TelegramInviteEventRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.security.SecureRandom;
import java.time.OffsetDateTime;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Slf4j
@Service
@RequiredArgsConstructor
public class TelegramService {

    private final SellerProfileRepository sellerProfileRepository;
    private final TelegramInviteEventRepository telegramInviteEventRepository;
    private final AbaTransactionRepository abaTransactionRepository;
    private final PaymentService paymentService;

    private static final String CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Pattern ABA_TRX_PATTERN = Pattern.compile("(?i)(?:Trx\\s*ID|Transaction\\s*ID)[:\\s]*([A-Za-z0-9]{8,24})");
    private static final Pattern ABA_AMOUNT_PATTERN = Pattern.compile("(?i)(?:USD|\\$|KHR|៛)\\s*([0-9]+(?:\\.[0-9]{2})?)");

    @Transactional
    public TelegramDTO.SellerTelegramDTO getSellerTelegram(String userId) {
        SellerProfileEntity profile = sellerProfileRepository.findByUserId(userId)
                .orElseGet(() -> {
                    SellerProfileEntity newProfile = SellerProfileEntity.builder()
                            .id("sp_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16))
                            .userId(userId)
                            .type("PRIVATE")
                            .inviteCode(mintCode())
                            .build();
                    return sellerProfileRepository.save(newProfile);
                });

        if (profile.getInviteCode() == null || profile.getInviteCode().isBlank()) {
            profile.setInviteCode(mintCode());
            sellerProfileRepository.save(profile);
        }

        long inviteCount = telegramInviteEventRepository.countByProfileId(profile.getId());
        String code = profile.getInviteCode();

        Map<String, String> links = new LinkedHashMap<>();
        links.put("MINIAPP", "/api/tg/" + code + "?d=MINIAPP");
        links.put("CHANNEL", "/api/tg/" + code + "?d=CHANNEL");
        links.put("GROUP", "/api/tg/" + code + "?d=GROUP");
        links.put("UNIVERSAL", "/api/tg/" + code);

        return TelegramDTO.SellerTelegramDTO.builder()
                .profileId(profile.getId())
                .inviteCode(code)
                .miniAppUrl(profile.getTgMiniAppUrl())
                .channelUrl(profile.getTgChannelUrl())
                .groupUrl(profile.getTgGroupUrl())
                .inviteCount(inviteCount)
                .links(links)
                .build();
    }

    @Transactional
    public TelegramDTO.SellerTelegramDTO updateSellerTelegram(String userId, TelegramDTO.UpdateSellerTelegramRequest req) {
        SellerProfileEntity profile = sellerProfileRepository.findByUserId(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Seller profile not found"));

        if (req.getMiniAppUrl() != null) {
            profile.setTgMiniAppUrl(req.getMiniAppUrl().isBlank() ? null : req.getMiniAppUrl().trim());
        }
        if (req.getChannelUrl() != null) {
            profile.setTgChannelUrl(req.getChannelUrl().isBlank() ? null : req.getChannelUrl().trim());
        }
        if (req.getGroupUrl() != null) {
            profile.setTgGroupUrl(req.getGroupUrl().isBlank() ? null : req.getGroupUrl().trim());
        }

        sellerProfileRepository.save(profile);
        return getSellerTelegram(userId);
    }

    @Transactional
    public String resolveInviteRedirect(String code, String requestedDest) {
        Optional<SellerProfileEntity> profileOpt = sellerProfileRepository.findByInviteCode(code);
        if (profileOpt.isEmpty()) {
            return "/";
        }

        SellerProfileEntity profile = profileOpt.get();
        String dest = (requestedDest != null && !requestedDest.isBlank()) ? requestedDest.toUpperCase() : "UNIVERSAL";

        String target = pickDestination(profile, dest);
        if (target == null || !target.toLowerCase().startsWith("http")) {
            return "/";
        }

        // Record invite event asynchronously / cleanly
        try {
            TelegramInviteEventEntity event = TelegramInviteEventEntity.builder()
                    .id("evt_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16))
                    .profileId(profile.getId())
                    .code(code)
                    .dest(dest)
                    .build();
            telegramInviteEventRepository.save(event);
        } catch (Exception e) {
            log.error("Failed to record telegram invite event", e);
        }

        return target;
    }

    @Transactional
    @SuppressWarnings("unchecked")
    public Map<String, Object> handleWebhookUpdate(Map<String, Object> update) {
        log.info("Received Telegram webhook update: keys={}", update.keySet());

        // 1. Check callback query (inline button clicks e.g., approve:<id> or reject:<id>)
        if (update.containsKey("callback_query")) {
            Map<String, Object> cb = (Map<String, Object>) update.get("callback_query");
            String data = (String) cb.get("data");
            if (data != null && data.contains(":")) {
                String[] parts = data.split(":", 2);
                String action = parts[0];
                String paymentId = parts[1];

                try {
                    paymentService.handlePaymentAction(paymentId, action, "Processed via Telegram Inline Button", "usr_admin_bot");
                    return Map.of("ok", true, "action", action, "paymentId", paymentId);
                } catch (Exception e) {
                    log.error("Failed to handle telegram callback action", e);
                    return Map.of("ok", false, "error", e.getMessage());
                }
            }
        }

        // 2. Check message (e.g. ABA PayWay bank receipt alert posted to group)
        if (update.containsKey("message")) {
            Map<String, Object> msg = (Map<String, Object>) update.get("message");
            String text = (String) msg.get("text");
            if (text == null) text = (String) msg.get("caption");

            if (text != null && text.contains("ABA") && text.contains("Trx")) {
                parseAndRecordAbaMessage(msg, text);
                return Map.of("ok", true, "type", "ABA_TRANSACTION_RECORDED");
            }
        }

        return Map.of("ok", true, "processed", true);
    }

    private void parseAndRecordAbaMessage(Map<String, Object> msg, String text) {
        try {
            Matcher trxMatcher = ABA_TRX_PATTERN.matcher(text);
            String trxId = trxMatcher.find() ? trxMatcher.group(1) : "ABA" + System.currentTimeMillis();

            if (abaTransactionRepository.findByTrxId(trxId).isPresent()) {
                log.info("ABA transaction {} already recorded", trxId);
                return;
            }

            Matcher amtMatcher = ABA_AMOUNT_PATTERN.matcher(text);
            double amount = amtMatcher.find() ? Double.parseDouble(amtMatcher.group(1)) : 0.0;
            String currency = text.contains("KHR") || text.contains("៛") ? "KHR" : "USD";
            double amountUsd = "KHR".equals(currency) ? amount / 4100.0 : amount;

            AbaTransactionEntity entity = AbaTransactionEntity.builder()
                    .id("aba_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16))
                    .rawMessage(text)
                    .trxId(trxId)
                    .amount(amount)
                    .currency(currency)
                    .amountUsd(amountUsd)
                    .bankCode("ABA")
                    .status("UNMATCHED")
                    .transactionDate(OffsetDateTime.now())
                    .build();

            abaTransactionRepository.save(entity);
            log.info("Recorded new ABA transaction: trxId={}, amountUsd={}", trxId, amountUsd);
        } catch (Exception e) {
            log.error("Failed to parse and record ABA message", e);
        }
    }

    private String pickDestination(SellerProfileEntity profile, String dest) {
        String g = profile.getTgGroupUrl();
        String c = profile.getTgChannelUrl();
        String m = profile.getTgMiniAppUrl();

        if ("GROUP".equalsIgnoreCase(dest)) return g != null ? g : (c != null ? c : m);
        if ("CHANNEL".equalsIgnoreCase(dest)) return c != null ? c : (g != null ? g : m);
        if ("MINIAPP".equalsIgnoreCase(dest)) return m != null ? m : (c != null ? c : g);
        return g != null ? g : (c != null ? c : m);
    }

    private String mintCode() {
        StringBuilder sb = new StringBuilder(8);
        for (int i = 0; i < 8; i++) {
            sb.append(CODE_ALPHABET.charAt(RANDOM.nextInt(CODE_ALPHABET.length())));
        }
        return sb.toString();
    }
}
