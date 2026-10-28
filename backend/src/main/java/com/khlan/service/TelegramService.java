package com.khlan.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.khlan.dto.TelegramDTO;
import com.khlan.entity.*;
import com.khlan.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
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
    private final PlatformSettingRepository platformSettingRepository;
    private final AuditLogRepository auditLogRepository;
    private final ObjectMapper objectMapper;

    @Value("${telegram.bot-token:}")
    private String defaultBotToken;

    @Value("${telegram.group-chat-id:}")
    private String defaultGroupChatId;

    @Value("${telegram.webhook-url:}")
    private String configuredWebhookUrl;

    @Value("${telegram.local-polling:false}")
    private boolean localPollingEnabled;

    private volatile long nextUpdateOffset = 0;

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

        List<TelegramInviteEventEntity> events = telegramInviteEventRepository.findByProfileIdOrderByCreatedAtDesc(profile.getId());
        long inviteCount = events.size();
        String code = profile.getInviteCode();

        Map<String, String> links = new LinkedHashMap<>();
        links.put("MINIAPP", "/api/tg/" + code + "?d=MINIAPP");
        links.put("CHANNEL", "/api/tg/" + code + "?d=CHANNEL");
        links.put("GROUP", "/api/tg/" + code + "?d=GROUP");
        links.put("UNIVERSAL", "/api/tg/" + code);

        Map<String, Long> byDest = new LinkedHashMap<>();
        byDest.put("MINIAPP", 0L);
        byDest.put("CHANNEL", 0L);
        byDest.put("GROUP", 0L);

        Map<String, Long> dailyMap = new HashMap<>();
        for (TelegramInviteEventEntity e : events) {
            if (e.getDest() != null) {
                String d = e.getDest().toUpperCase();
                if ("MINIAPP".equals(d) || "UNIVERSAL".equals(d)) {
                    byDest.put("MINIAPP", byDest.get("MINIAPP") + 1);
                } else if (byDest.containsKey(d)) {
                    byDest.put(d, byDest.get(d) + 1);
                }
            }
            if (e.getCreatedAt() != null) {
                String dayKey = e.getCreatedAt().toLocalDate().toString();
                dailyMap.put(dayKey, dailyMap.getOrDefault(dayKey, 0L) + 1);
            }
        }

        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        List<TelegramDTO.DailyCount> last14 = new ArrayList<>();
        for (int i = 13; i >= 0; i--) {
            String day = today.minusDays(i).toString();
            last14.add(TelegramDTO.DailyCount.builder()
                    .date(day)
                    .count(dailyMap.getOrDefault(day, 0L))
                    .build());
        }

        TelegramDTO.SellerTelegramStats stats = TelegramDTO.SellerTelegramStats.builder()
                .total(inviteCount)
                .byDest(byDest)
                .last14(last14)
                .build();

        return TelegramDTO.SellerTelegramDTO.builder()
                .profileId(profile.getId())
                .inviteCode(code)
                .miniAppUrl(profile.getTgMiniAppUrl())
                .channelUrl(profile.getTgChannelUrl())
                .groupUrl(profile.getTgGroupUrl())
                .chatId(profile.getTgChatId())
                .botUsername(getEffectiveBotUsername())
                .inviteCount(inviteCount)
                .links(links)
                .stats(stats)
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
        if (req.getChatId() != null) {
            profile.setTgChatId(req.getChatId().isBlank() ? null : req.getChatId().trim());
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

    @EventListener(ApplicationReadyEvent.class)
    public void autoRegisterWebhookOnStartup() {
        String url = (configuredWebhookUrl != null && !configuredWebhookUrl.isBlank())
                ? configuredWebhookUrl
                : System.getenv("TELEGRAM_WEBHOOK_URL");
        if (url != null && !url.isBlank()) {
            localPollingEnabled = false;
            Map<String, Object> res = setupWebhook(url.trim());
            log.info("Telegram auto webhook registration result: {}", res);
        } else {
            // When no static webhook is configured, clear any stale webhook and enable active long-polling
            log.info("No static TELEGRAM_WEBHOOK_URL configured. Clearing webhook and enabling long-polling.");
            clearWebhook();
            localPollingEnabled = true;
        }
    }

    @Scheduled(fixedDelay = 2000, initialDelay = 3000)
    public void pollTelegramUpdatesForLocalTesting() {
        if (!localPollingEnabled) return;
        String token = resolveBotToken(null);
        if (token == null || token.isBlank()) return;

        try {
            String endpoint = "https://api.telegram.org/bot" + token + "/getUpdates?timeout=2";
            if (nextUpdateOffset > 0) endpoint += "&offset=" + nextUpdateOffset;

            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(endpoint))
                    .timeout(Duration.ofSeconds(8))
                    .GET()
                    .build();
            HttpResponse<String> res = HttpClient.newHttpClient().send(req, HttpResponse.BodyHandlers.ofString());
            JsonNode data = objectMapper.readTree(res.body());
            if (!data.path("ok").asBoolean()) {
                String desc = data.path("description").asText("");
                if (desc.contains("webhook is active")) {
                    log.info("Detected active webhook conflict while polling. Clearing webhook to allow getUpdates.");
                    clearWebhook();
                }
                return;
            }

            for (JsonNode upd : data.path("result")) {
                long updateId = upd.path("update_id").asLong(0);
                if (updateId > 0) nextUpdateOffset = updateId + 1;

                try {
                    Map<String, Object> updateMap = objectMapper.convertValue(upd, new TypeReference<Map<String, Object>>() {});
                    handleWebhookUpdate(updateMap);
                } catch (Exception e) {
                    log.error("Could not process polled update {}: {}", updateId, e.getMessage());
                }
            }
        } catch (Exception e) {
            log.debug("Telegram polling error: {}", e.getMessage());
        }
    }

    @Transactional
    @SuppressWarnings("unchecked")
    public Map<String, Object> handleWebhookUpdate(Map<String, Object> update) {
        log.info("Received Telegram webhook update: keys={}", update.keySet());

        // 1. Check callback query (inline button clicks e.g., approve:<id> or reject:<id>)
        if (update.containsKey("callback_query")) {
            Map<String, Object> cb = (Map<String, Object>) update.get("callback_query");
            String cbId = (String) cb.get("id");
            String data = (String) cb.get("data");
            if (data != null && data.contains(":")) {
                String[] parts = data.split(":", 2);
                String action = parts[0];
                String paymentId = parts[1];

                try {
                    log.info("Processing Telegram inline button click: action={}, paymentId={}", action, paymentId);
                    paymentService.handlePaymentAction(paymentId, action, "Processed via Telegram Inline Button", "usr_admin_bot");

                    String token = resolveBotToken(null);
                    String resultText = "approve".equalsIgnoreCase(action) ? "✅ Approved" : "❌ Rejected";
                    answerCallbackQuery(token, cbId, resultText, false);

                    Map<String, Object> msg = cb.get("message") instanceof Map ? (Map<String, Object>) cb.get("message") : null;
                    if (msg != null) {
                        Object chatId = ((Map<String, Object>) msg.get("chat")).get("id");
                        Object messageId = msg.get("message_id");
                        String oldText = (String) msg.get("text");
                        if (chatId != null && messageId != null) {
                            String newText;
                            if (oldText != null && oldText.contains("Status")) {
                                String newStatus = "approve".equalsIgnoreCase(action) ? "VERIFIED" : "REJECTED";
                                newText = oldText
                                        .replaceFirst("🔔 <b>New Subscription Payment Submitted</b>", "🔔 <b>Subscription Payment " + ("approve".equalsIgnoreCase(action) ? "Approved" : "Rejected") + "</b>")
                                        .replaceFirst("• <b>Status</b>: <code>[^<]*</code>", "• <b>Status</b>: <code>" + newStatus + "</code>\n• <b>Decision</b>: " + resultText + " by Admin");
                            } else {
                                newText = resultText + " — payment " + paymentId;
                            }
                            editMessageText(token, chatId, messageId, newText);
                        }
                    }

                    return Map.of("ok", true, "action", action, "paymentId", paymentId);
                } catch (Exception e) {
                    log.error("Failed to handle telegram callback action", e);
                    String token = resolveBotToken(null);
                    answerCallbackQuery(token, cbId, "⚠️ Failed: " + e.getMessage(), true);
                    return Map.of("ok", false, "error", e.getMessage());
                }
            }
        }

        // 2. Check message (e.g. ABA PayWay bank receipt alert posted to group or seller bot commands)
        if (update.containsKey("message")) {
            Map<String, Object> msg = (Map<String, Object>) update.get("message");
            String text = (String) msg.get("text");
            if (text == null) text = (String) msg.get("caption");

            Object chatObj = msg.get("chat");
            String chatId = chatObj instanceof Map ? String.valueOf(((Map<?, ?>) chatObj).get("id")) : null;

            if (text != null && text.trim().startsWith("/start")) {
                handleStartCommand(chatId, text.trim());
                return Map.of("ok", true, "type", "START_COMMAND_HANDLED");
            }

            if (text != null && (text.equalsIgnoreCase("/id") || text.equalsIgnoreCase("/chatid") || text.equalsIgnoreCase("/whoami"))) {
                sendDirectMessage(chatId, "👋 <b>Your Telegram Chat ID:</b> <code>" + chatId + "</code>\n\nEnter this ID in your KhLan Seller Dashboard under the Telegram tab to receive buyer notifications.");
                return Map.of("ok", true, "type", "CHAT_ID_REPLIED");
            }

            if (text != null && text.contains("ABA") && text.contains("Trx")) {
                parseAndRecordAbaMessage(msg, text);
                return Map.of("ok", true, "type", "ABA_TRANSACTION_RECORDED");
            }
        }

        return Map.of("ok", true, "processed", true);
    }

    private void answerCallbackQuery(String token, String callbackQueryId, String text, boolean showAlert) {
        if (token == null || callbackQueryId == null) return;
        try {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("callback_query_id", callbackQueryId);
            body.put("text", text);
            body.put("show_alert", showAlert);

            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create("https://api.telegram.org/bot" + token + "/answerCallbackQuery"))
                    .timeout(Duration.ofSeconds(6))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(body)))
                    .build();
            HttpResponse<String> res = HttpClient.newHttpClient().send(req, HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() != 200) {
                log.warn("Telegram answerCallbackQuery response: HTTP {} - {}", res.statusCode(), res.body());
            }
        } catch (Exception e) {
            log.debug("Could not answer callback query {}: {}", callbackQueryId, e.getMessage());
        }
    }

    private void editMessageText(String token, Object chatId, Object messageId, String text) {
        if (token == null || chatId == null || messageId == null) return;
        try {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("chat_id", chatId);
            body.put("message_id", messageId);
            body.put("text", text);
            body.put("parse_mode", "HTML");

            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create("https://api.telegram.org/bot" + token + "/editMessageText"))
                    .timeout(Duration.ofSeconds(6))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(body)))
                    .build();
            HttpResponse<String> res = HttpClient.newHttpClient().send(req, HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() != 200) {
                log.warn("Telegram editMessageText HTML failed (HTTP {} - {}). Retrying without parse_mode.", res.statusCode(), res.body());
                // Fallback without parse_mode if formatting had an unescaped character
                body.remove("parse_mode");
                HttpRequest fallbackReq = HttpRequest.newBuilder()
                        .uri(URI.create("https://api.telegram.org/bot" + token + "/editMessageText"))
                        .timeout(Duration.ofSeconds(6))
                        .header("Content-Type", "application/json")
                        .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(body)))
                        .build();
                HttpClient.newHttpClient().send(fallbackReq, HttpResponse.BodyHandlers.discarding());
            }
        } catch (Exception e) {
            log.debug("Could not edit telegram message: {}", e.getMessage());
        }
    }

    public Map<String, Object> clearWebhook() {
        String token = resolveBotToken(null);
        if (token == null) return Map.of("ok", false, "error", "No bot token configured");
        try {
            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create("https://api.telegram.org/bot" + token + "/deleteWebhook"))
                    .timeout(Duration.ofSeconds(6))
                    .GET()
                    .build();
            HttpResponse<String> res = HttpClient.newHttpClient().send(req, HttpResponse.BodyHandlers.ofString());
            JsonNode data = objectMapper.readTree(res.body());
            return Map.of("ok", data.path("ok").asBoolean(), "description", data.path("description").asText());
        } catch (Exception e) {
            log.error("Failed to clear Telegram webhook", e);
            return Map.of("ok", false, "error", e.getMessage());
        }
    }

    public Map<String, Object> setupWebhook(String webhookUrl) {
        String token = resolveBotToken(null);
        if (token == null) return Map.of("ok", false, "error", "No bot token configured");
        if (webhookUrl == null || webhookUrl.isBlank()) {
            return Map.of("ok", false, "error", "webhookUrl is required");
        }

        String effectiveUrl = webhookUrl.trim();
        if (!effectiveUrl.endsWith("/api/telegram/webhook")) {
            effectiveUrl = effectiveUrl.replaceAll("/+$", "") + "/api/telegram/webhook";
        }

        try {
            String secret = null;
            try { secret = System.getenv("TELEGRAM_WEBHOOK_SECRET"); } catch (Exception ignored) {}
            if (secret == null || secret.isBlank()) secret = "khlan_webhook_secret_2026";

            Map<String, Object> body = new LinkedHashMap<>();
            body.put("url", effectiveUrl);
            body.put("secret_token", secret);
            body.put("allowed_updates", List.of("message", "callback_query"));

            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create("https://api.telegram.org/bot" + token + "/setWebhook"))
                    .timeout(Duration.ofSeconds(8))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(body)))
                    .build();
            HttpResponse<String> res = HttpClient.newHttpClient().send(req, HttpResponse.BodyHandlers.ofString());
            JsonNode data = objectMapper.readTree(res.body());
            return Map.of("ok", data.path("ok").asBoolean(), "description", data.path("description").asText());
        } catch (Exception e) {
            log.error("Failed to set Telegram webhook", e);
            return Map.of("ok", false, "error", e.getMessage());
        }
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

        String direct = null;
        if ("GROUP".equalsIgnoreCase(dest)) direct = g != null ? g : (c != null ? c : m);
        else if ("CHANNEL".equalsIgnoreCase(dest)) direct = c != null ? c : (g != null ? g : m);
        else if ("MINIAPP".equalsIgnoreCase(dest)) direct = m != null ? m : (c != null ? c : g);
        else direct = m != null ? m : (c != null ? c : g);

        if (direct != null && !direct.isBlank()) {
            return direct.trim();
        }

        // Seller has not configured custom links -> fall back to official platform Telegram links with seller referral tag
        TelegramDTO.AdminTelegramConfigDTO platform = getPlatformConfig();
        String code = profile.getInviteCode();

        if ("GROUP".equalsIgnoreCase(dest)) {
            if (platform.getGroupUrl() != null && !platform.getGroupUrl().isBlank()) {
                return platform.getGroupUrl().trim();
            }
            return "https://t.me/KhLanGroup";
        }

        if ("CHANNEL".equalsIgnoreCase(dest)) {
            if (platform.getChannelUrl() != null && !platform.getChannelUrl().isBlank()) {
                return platform.getChannelUrl().trim();
            }
            return "https://t.me/KhLanOfficial";
        }

        // MINIAPP or UNIVERSAL
        String baseMiniApp = platform.getMiniAppUrl();
        if (baseMiniApp == null || baseMiniApp.isBlank()) {
            String botUser = platform.getBotUsername() != null && !platform.getBotUsername().isBlank()
                    ? platform.getBotUsername().trim()
                    : "KhmerSmartRestaurantBot";
            baseMiniApp = "https://t.me/" + botUser + "/app";
        }

        if (code != null && !code.isBlank()) {
            String sep = baseMiniApp.contains("?") ? "&" : "?";
            return baseMiniApp + sep + "startapp=ref_" + code;
        }
        return baseMiniApp;
    }

    private String mintCode() {
        StringBuilder sb = new StringBuilder(8);
        for (int i = 0; i < 8; i++) {
            sb.append(CODE_ALPHABET.charAt(RANDOM.nextInt(CODE_ALPHABET.length())));
        }
        return sb.toString();
    }

    private boolean isValidTokenCandidate(String t) {
        if (t == null || t.isBlank()) return false;
        String s = t.trim().toUpperCase();
        if (s.contains("SECRET_") || s.contains("DUMMY") || s.contains("MOCK")) return false;
        return t.contains(":");
    }

    private boolean isValidChatIdCandidate(String c) {
        if (c == null || c.isBlank()) return false;
        String s = c.trim().toUpperCase();
        return !s.contains("SECRET_") && !s.contains("DUMMY") && !s.contains("MOCK");
    }

    public String resolveBotToken(String explicitToken) {
        if (isValidTokenCandidate(explicitToken)) {
            return explicitToken.trim();
        }
        for (String key : List.of("telegram.platformConfig", "payment_config", "payment.config", "payments.manualConfig")) {
            try {
                Optional<PlatformSettingEntity> s = platformSettingRepository.findById(key);
                if (s.isPresent() && s.get().getValueJson() != null) {
                    JsonNode n = objectMapper.readTree(s.get().getValueJson());
                    String t = n.path("botToken").asText(null);
                    if (!isValidTokenCandidate(t)) {
                        t = n.path("telegramBotToken").asText(null);
                    }
                    if (!isValidTokenCandidate(t)) {
                        t = n.path("manual").path("telegramBotToken").asText(null);
                    }
                    if (isValidTokenCandidate(t)) return t.trim();
                }
            } catch (Exception ignored) {}
        }

        if (isValidTokenCandidate(defaultBotToken)) {
            return defaultBotToken.trim();
        }
        String env = System.getenv("TELEGRAM_BOT_TOKEN");
        if (isValidTokenCandidate(env)) {
            return env.trim();
        }
        return null;
    }

    public String resolveGroupChatId(String explicitChatId) {
        if (isValidChatIdCandidate(explicitChatId)) {
            return explicitChatId.trim();
        }
        for (String key : List.of("telegram.platformConfig", "payment_config", "payment.config", "payments.manualConfig")) {
            try {
                Optional<PlatformSettingEntity> s = platformSettingRepository.findById(key);
                if (s.isPresent() && s.get().getValueJson() != null) {
                    JsonNode n = objectMapper.readTree(s.get().getValueJson());
                    String c = n.path("chatId").asText(null);
                    if (!isValidChatIdCandidate(c)) {
                        c = n.path("telegramChatId").asText(null);
                    }
                    if (!isValidChatIdCandidate(c)) {
                        c = n.path("manual").path("telegramChatId").asText(null);
                    }
                    if (isValidChatIdCandidate(c)) return c.trim();
                }
            } catch (Exception ignored) {}
        }

        if (isValidChatIdCandidate(defaultGroupChatId)) {
            return defaultGroupChatId.trim();
        }
        String env = System.getenv("TELEGRAM_GROUP_CHAT_ID");
        if (isValidChatIdCandidate(env)) {
            return env.trim();
        }
        return null;
    }

    public TelegramDTO.TelegramBotStatusDTO testBotConnection(String token) {
        String effectiveToken = resolveBotToken(token);
        if (effectiveToken == null || effectiveToken.isBlank()) {
            return TelegramDTO.TelegramBotStatusDTO.builder()
                    .connected(false)
                    .error("No Telegram bot token configured. Set one in Admin Settings or .env.")
                    .build();
        }

        try {
            HttpClient client = HttpClient.newBuilder()
                    .connectTimeout(Duration.ofSeconds(6))
                    .build();

            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create("https://api.telegram.org/bot" + effectiveToken + "/getMe"))
                    .timeout(Duration.ofSeconds(8))
                    .header("Accept", "application/json")
                    .GET()
                    .build();

            HttpResponse<String> res = client.send(req, HttpResponse.BodyHandlers.ofString());
            JsonNode data = objectMapper.readTree(res.body());

            if (res.statusCode() == 200 && data.path("ok").asBoolean()) {
                JsonNode result = data.path("result");
                return TelegramDTO.TelegramBotStatusDTO.builder()
                        .connected(true)
                        .botId(result.path("id").asLong())
                        .botName(result.path("first_name").asText())
                        .botUsername(result.has("username") ? result.path("username").asText() : null)
                        .canJoinGroups(result.has("can_join_groups") ? result.path("can_join_groups").asBoolean() : null)
                        .canReadAllGroupMessages(result.has("can_read_all_group_messages") ? result.path("can_read_all_group_messages").asBoolean() : null)
                        .supportsInlineQueries(result.has("supports_inline_queries") ? result.path("supports_inline_queries").asBoolean() : null)
                        .build();
            } else {
                String error = data.has("description") ? data.path("description").asText() : "Telegram API returned HTTP " + res.statusCode();
                return TelegramDTO.TelegramBotStatusDTO.builder()
                        .connected(false)
                        .error(error)
                        .build();
            }
        } catch (Exception e) {
            log.error("Failed to test Telegram bot connection", e);
            return TelegramDTO.TelegramBotStatusDTO.builder()
                    .connected(false)
                    .error(e.getMessage() != null ? e.getMessage() : "Failed to connect to api.telegram.org")
                    .build();
        }
    }

    public Map<String, Object> sendTestNotification(String explicitToken, String explicitChatId) {
        String token = resolveBotToken(explicitToken);
        String chatId = resolveGroupChatId(explicitChatId);

        if (token == null || token.isBlank() || chatId == null || chatId.isBlank()) {
            return Map.of(
                    "ok", false,
                    "success", false,
                    "error", "Telegram bot token or chat ID is not configured. Please set them in Payment Config, Telegram Settings, or .env"
            );
        }

        try {
            HttpClient client = HttpClient.newBuilder()
                    .connectTimeout(Duration.ofSeconds(6))
                    .build();

            Map<String, Object> body = new LinkedHashMap<>();
            body.put("chat_id", chatId);
            body.put("text", "🚗 *KhLan Auto Marketplace*\n\n✅ *Telegram Payment Bot Connected Successfully!*\n• Mode: Best-effort instant verification\n• Channel / Group: `" + chatId + "`\n• Status: Online & operational\n• Server Time: " + OffsetDateTime.now());
            body.put("parse_mode", "Markdown");

            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create("https://api.telegram.org/bot" + token + "/sendMessage"))
                    .timeout(Duration.ofSeconds(8))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(body)))
                    .build();

            HttpResponse<String> res = client.send(req, HttpResponse.BodyHandlers.ofString());
            JsonNode data = objectMapper.readTree(res.body());

            if (res.statusCode() == 200 && data.path("ok").asBoolean()) {
                long messageId = data.path("result").path("message_id").asLong(0);
                Map<String, Object> ret = new LinkedHashMap<>();
                ret.put("ok", true);
                ret.put("success", true);
                ret.put("message", "Test message sent — check your Telegram");
                ret.put("chatId", chatId);
                ret.put("messageId", messageId);
                return ret;
            } else {
                String error = data.has("description") ? data.path("description").asText() : "Telegram API HTTP " + res.statusCode();
                return Map.of(
                        "ok", false,
                        "success", false,
                        "error", error
                );
            }
        } catch (Exception e) {
            log.error("Failed to send Telegram test message", e);
            return Map.of(
                    "ok", false,
                    "success", false,
                    "error", e.getMessage() != null ? e.getMessage() : "Failed to connect to api.telegram.org"
            );
        }
    }

    public Map<String, Object> sendSellerTestNotification(String userId, String explicitChatId) {
        String chatId = explicitChatId;
        if (chatId == null || chatId.isBlank()) {
            SellerProfileEntity profile = sellerProfileRepository.findByUserId(userId).orElse(null);
            if (profile != null) {
                chatId = profile.getTgChatId();
            }
        }
        if (chatId == null || chatId.isBlank()) {
            return Map.of("ok", false, "error", "Please configure and save your Telegram Chat ID / Group ID first.");
        }
        String token = resolveBotToken(null);
        if (token == null || token.isBlank()) {
            return Map.of("ok", false, "error", "Telegram bot token is not configured on the platform.");
        }

        try {
            HttpClient client = HttpClient.newBuilder()
                    .connectTimeout(Duration.ofSeconds(6))
                    .build();

            Map<String, Object> body = new LinkedHashMap<>();
            body.put("chat_id", chatId);
            body.put("text", "🚗 <b>KhLan Auto Marketplace</b>\n\n✅ <b>Seller Lead Alerts Connected!</b>\n• Chat ID: <code>" + escapeHtml(chatId) + "</code>\n• Shared System Bot: Online\n• You will receive buyer inquiries and test-drive alerts here.\n• Time: " + OffsetDateTime.now());
            body.put("parse_mode", "HTML");

            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create("https://api.telegram.org/bot" + token + "/sendMessage"))
                    .timeout(Duration.ofSeconds(8))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(body)))
                    .build();

            HttpResponse<String> res = client.send(req, HttpResponse.BodyHandlers.ofString());
            JsonNode data = objectMapper.readTree(res.body());

            if (res.statusCode() == 200 && data.path("ok").asBoolean()) {
                long messageId = data.path("result").path("message_id").asLong(0);
                return Map.of("ok", true, "success", true, "message", "Test alert dispatched to Telegram chat " + chatId, "messageId", messageId);
            } else {
                String desc = data.path("description").asText("Telegram API HTTP " + res.statusCode());
                return Map.of("ok", false, "success", false, "error", desc, "message", desc);
            }
        } catch (Exception e) {
            log.error("Failed to send seller test notification", e);
            String err = e.getMessage() != null ? e.getMessage() : "Failed to connect to api.telegram.org";
            return Map.of("ok", false, "success", false, "error", err, "message", err);
        }
    }

    public void sendSellerLeadNotification(String sellerId, String vehicleTitle, String buyerName, String scheduledAt, String notes) {
        String token = resolveBotToken(null);
        if (token == null || token.isBlank()) return;

        String sellerChatId = null;
        if (sellerId != null && !sellerId.isBlank()) {
            Optional<SellerProfileEntity> profile = sellerProfileRepository.findByUserId(sellerId);
            if (profile.isPresent() && profile.get().getTgChatId() != null && !profile.get().getTgChatId().isBlank()) {
                sellerChatId = profile.get().getTgChatId().trim();
            }
        }

        String groupChatId = resolveGroupChatId(null);
        if ((sellerChatId == null || sellerChatId.isBlank()) && (groupChatId == null || groupChatId.isBlank())) {
            return;
        }

        StringBuilder sb = new StringBuilder();
        sb.append("🚗 <b>New Buyer Test-Drive Appointment Requested!</b>\n\n");
        sb.append("• <b>Vehicle</b>: ").append(escapeHtml(vehicleTitle != null ? vehicleTitle : "Vehicle")).append("\n");
        sb.append("• <b>Buyer</b>: ").append(escapeHtml(buyerName != null ? buyerName : "Interested Buyer")).append("\n");
        sb.append("• <b>Scheduled At</b>: <code>").append(escapeHtml(scheduledAt != null ? scheduledAt : "Pending")).append("</code>\n");
        if (notes != null && !notes.isBlank()) {
            sb.append("• <b>Notes</b>: ").append(escapeHtml(notes)).append("\n");
        }
        sb.append("• <b>Time</b>: ").append(OffsetDateTime.now().format(DateTimeFormatter.ofPattern("dd MMM yyyy, HH:mm"))).append("\n");

        String baseText = sb.toString();

        // 1. Dispatch directly to seller personal chat if linked
        if (sellerChatId != null && !sellerChatId.isBlank()) {
            sendDirectMessage(sellerChatId, baseText);
            log.info("Dispatched seller lead alert directly to seller Telegram chat {}", sellerChatId);
        }

        // 2. Dual Dispatch: also copy to central admin group so operations can monitor
        if (groupChatId != null && !groupChatId.isBlank() && !groupChatId.equals(sellerChatId)) {
            String groupCopyText = baseText + (sellerChatId != null
                    ? "\n<i>(Copied from seller direct alert)</i>"
                    : "\n<i>(Notice: Seller has not linked personal Telegram yet)</i>");
            sendDirectMessage(groupChatId, groupCopyText);
            log.info("Dispatched seller lead alert to Telegram group {}", groupChatId);
        }
    }

    private void handleStartCommand(String chatId, String text) {
        if (chatId == null || chatId.isBlank()) return;

        if (text.startsWith("/start link_")) {
            String userId = text.substring("/start link_".length()).trim();
            if (!userId.isBlank()) {
                Optional<SellerProfileEntity> profileOpt = sellerProfileRepository.findByUserId(userId);
                SellerProfileEntity profile;
                if (profileOpt.isPresent()) {
                    profile = profileOpt.get();
                    profile.setTgChatId(chatId);
                    sellerProfileRepository.save(profile);
                } else {
                    profile = SellerProfileEntity.builder()
                            .id("sp_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16))
                            .userId(userId)
                            .tgChatId(chatId)
                            .inviteCode(mintCode())
                            .build();
                    sellerProfileRepository.save(profile);
                }

                String reply = "🎉 <b>Telegram Connected Successfully!</b>\n\n"
                        + "Your KhLan seller account is now linked to this chat.\n"
                        + "• <b>Chat ID:</b> <code>" + chatId + "</code>\n"
                        + "• <b>Notifications:</b> Real-time test-drive appointments and buyer inquiries will be sent here directly.\n\n"
                        + "You can return to your browser dashboard now.";
                sendDirectMessage(chatId, reply);
                log.info("Auto-linked Telegram chatId {} to seller userId {}", chatId, userId);
                return;
            }
        }

        String welcome = "👋 <b>Welcome to KhLan Auto Marketplace Bot!</b>\n\n"
                + "Your Telegram Chat ID is: <code>" + chatId + "</code>\n\n"
                + "To receive real-time notifications for your listings and test-drive appointments, enter this Chat ID in your <b>KhLan Seller Dashboard</b> under the <b>Telegram</b> tab.";
        sendDirectMessage(chatId, welcome);
    }

    public void sendDirectMessage(String chatId, String htmlText) {
        if (chatId == null || chatId.isBlank() || htmlText == null) return;
        String token = resolveBotToken(null);
        if (token == null || token.isBlank()) return;

        try {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("chat_id", chatId);
            body.put("text", htmlText);
            body.put("parse_mode", "HTML");

            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create("https://api.telegram.org/bot" + token + "/sendMessage"))
                    .timeout(Duration.ofSeconds(6))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(body)))
                    .build();
            HttpClient.newHttpClient().send(req, HttpResponse.BodyHandlers.discarding());
        } catch (Exception e) {
            log.warn("Failed to send direct telegram message to {}: {}", chatId, e.getMessage());
        }
    }

    public String getEffectiveBotUsername() {
        try {
            TelegramDTO.AdminTelegramConfigDTO cfg = getPlatformConfig();
            if (cfg != null && cfg.getBotUsername() != null && !cfg.getBotUsername().isBlank()) {
                return cfg.getBotUsername().trim().replaceFirst("^@", "");
            }
        } catch (Exception ignored) {}
        return "KhmerSmartRestaurantBot";
    }

    public TelegramDTO.AdminTelegramConfigDTO getPlatformConfig() {
        boolean hasEnv = (defaultBotToken != null && !defaultBotToken.isBlank())
                || (System.getenv("TELEGRAM_BOT_TOKEN") != null && !System.getenv("TELEGRAM_BOT_TOKEN").isBlank());

        try {
            Optional<PlatformSettingEntity> s = platformSettingRepository.findById("telegram.platformConfig");
            if (s.isPresent() && s.get().getValueJson() != null) {
                TelegramDTO.AdminTelegramConfigDTO cfg = objectMapper.readValue(s.get().getValueJson(), TelegramDTO.AdminTelegramConfigDTO.class);
                if (cfg.getBotToken() == null || cfg.getBotToken().isBlank()) {
                    cfg.setBotToken(resolveBotToken(null));
                }
                if (cfg.getChatId() == null || cfg.getChatId().isBlank()) {
                    cfg.setChatId(resolveGroupChatId(null));
                }
                cfg.setHasEnvToken(hasEnv);
                return cfg;
            }
        } catch (Exception e) {
            log.error("Failed to read telegram platform config", e);
        }

        String effectiveToken = resolveBotToken(null);
        String effectiveChatId = resolveGroupChatId(null);

        return TelegramDTO.AdminTelegramConfigDTO.builder()
                .botUsername("KhmerSmartRestaurantBot")
                .botToken(effectiveToken)
                .chatId(effectiveChatId != null ? effectiveChatId : "-1004489863210")
                .miniAppUrl("https://t.me/KhmerSmartRestaurantBot/app")
                .channelUrl("https://t.me/KhLanOfficial")
                .groupUrl("https://t.me/KhLanGroup")
                .tmaEnabled(true)
                .autoAuthEnabled(true)
                .leadAlertsEnabled(true)
                .hasEnvToken(hasEnv)
                .build();
    }

    @Transactional
    public TelegramDTO.AdminTelegramConfigDTO updatePlatformConfig(TelegramDTO.AdminTelegramConfigDTO req, String adminUserId) {
        String botUsername = req.getBotUsername() != null ? req.getBotUsername().trim().replaceFirst("^@", "") : null;
        req.setBotUsername(botUsername);

        try {
            String json = objectMapper.writeValueAsString(req);
            PlatformSettingEntity entity = PlatformSettingEntity.builder()
                    .key("telegram.platformConfig")
                    .valueJson(json)
                    .build();
            platformSettingRepository.save(entity);

            recordAudit(adminUserId, "TELEGRAM_CONFIG_UPDATED", "PlatformSetting", "telegram.platformConfig", Map.of("botUsername", botUsername != null ? botUsername : ""));
        } catch (Exception e) {
            log.error("Failed to save telegram platform config", e);
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to save Telegram configuration");
        }

        boolean hasEnv = (defaultBotToken != null && !defaultBotToken.isBlank())
                || (System.getenv("TELEGRAM_BOT_TOKEN") != null && !System.getenv("TELEGRAM_BOT_TOKEN").isBlank());
        req.setHasEnvToken(hasEnv);
        return req;
    }

    public void sendPaymentNotification(SubscriptionPaymentEntity payment, String tenantName, String evidenceUrl) {
        String token = resolveBotToken(null);
        String chatId = resolveGroupChatId(null);
        if (token == null || token.isBlank() || chatId == null || chatId.isBlank()) {
            return;
        }

        try {
            HttpClient client = HttpClient.newBuilder()
                    .connectTimeout(Duration.ofSeconds(6))
                    .build();

            String effectiveUrl = (evidenceUrl != null && !evidenceUrl.isBlank()) ? evidenceUrl : payment.getEvidenceUrl();

            StringBuilder sb = new StringBuilder();
            sb.append("🔔 <b>New Subscription Payment Submitted</b>\n\n");
            sb.append("• <b>Dealership</b>: ").append(escapeHtml(tenantName != null ? tenantName : "Unknown Tenant")).append("\n");
            sb.append("• <b>Plan</b>: ").append(escapeHtml(payment.getPlan())).append(" (").append(escapeHtml(payment.getBillingCycle())).append(")\n");
            sb.append(String.format(Locale.US, "• <b>Amount</b>: $%.2f USD (%s %.0f)\n",
                    payment.getAmountUsd() != null ? payment.getAmountUsd() : 0.0,
                    escapeHtml(payment.getCurrency() != null ? payment.getCurrency() : "USD"),
                    payment.getAmountExpected() != null ? payment.getAmountExpected() : 0.0));
            sb.append("• <b>Reference</b>: <code>").append(escapeHtml(payment.getReference())).append("</code>\n");
            sb.append("• <b>Manual Ref</b>: <code>").append(escapeHtml(payment.getManualRef() != null ? payment.getManualRef() : "N/A")).append("</code>\n");
            sb.append("• <b>Status</b>: <code>").append(escapeHtml(payment.getStatus())).append("</code>\n");
            if (payment.getNote() != null && !payment.getNote().isBlank()) {
                sb.append("• <b>Note</b>: ").append(escapeHtml(payment.getNote())).append("\n");
            }
            if (effectiveUrl != null && !effectiveUrl.isBlank()) {
                sb.append("• <b>Receipt Slip</b>: <a href=\"").append(escapeHtml(effectiveUrl)).append("\">View Image</a>\n");
            }
            sb.append("• <b>Time</b>: ").append(OffsetDateTime.now());

            List<Map<String, Object>> row1 = List.of(
                    Map.of("text", "✅ Approve", "callback_data", "approve:" + payment.getId()),
                    Map.of("text", "❌ Reject", "callback_data", "reject:" + payment.getId())
            );

            List<List<Map<String, Object>>> keyboard = new ArrayList<>();
            keyboard.add(row1);

            Map<String, Object> inlineKeyboard = Map.of("inline_keyboard", keyboard);

            Map<String, Object> body = new LinkedHashMap<>();
            body.put("chat_id", chatId);
            body.put("text", sb.toString());
            body.put("parse_mode", "HTML");
            body.put("reply_markup", inlineKeyboard);

            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create("https://api.telegram.org/bot" + token + "/sendMessage"))
                    .timeout(Duration.ofSeconds(8))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(body)))
                    .build();

            HttpResponse<String> res = client.send(req, HttpResponse.BodyHandlers.ofString());
            JsonNode data = objectMapper.readTree(res.body());
            if (res.statusCode() == 200 && data.path("ok").asBoolean()) {
                payment.setTelegramSentAt(OffsetDateTime.now());
                payment.setTelegramGroupId(chatId);
                payment.setTelegramMessageId(data.path("result").path("message_id").asInt());
                payment.setTelegramError(null);
                log.info("Telegram review notification dispatched successfully for payment {}", payment.getId());
            } else {
                String err = data.path("description").asText("HTTP " + res.statusCode());
                payment.setTelegramError(err);
                log.warn("Telegram API error delivering review notification: {}", err);
            }
        } catch (Exception e) {
            log.error("Failed to deliver Telegram payment notification", e);
            payment.setTelegramError(e.getMessage());
        }
    }

    private String escapeHtml(String text) {
        if (text == null) return "";
        return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
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

