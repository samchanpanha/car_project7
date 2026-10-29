package com.khlan.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.khlan.dto.PaymentDTO;
import com.khlan.dto.RealtimeEventDTO;
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
import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.ReentrantLock;

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
    private final RealtimeService realtimeService;
    private final TenantMemberRepository tenantMemberRepository;

    @Value("${telegram.bot-token:}")
    private String defaultBotToken;

    @Value("${telegram.group-chat-id:}")
    private String defaultGroupChatId;

    @Value("${telegram.webhook-url:}")
    private String configuredWebhookUrl;

    @Value("${telegram.local-polling:false}")
    private boolean localPollingEnabled;

    private volatile long nextUpdateOffset = 0;
    private volatile boolean offsetLoaded = false;
    private final ReentrantLock pollLock = new ReentrantLock();
    private volatile boolean isPolling = false;
    private volatile OffsetDateTime lastPollAt = null;
    private volatile OffsetDateTime lastSuccessAt = null;
    private volatile long totalUpdatesProcessed = 0;
    private volatile String lastError = null;
    private volatile Boolean botPrivacyDisabled = null;
    private volatile OffsetDateTime lastBotCheckAt = null;
    private volatile String detectedBotUsername = null;

    private static final String CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    private static final SecureRandom RANDOM = new SecureRandom();

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
        loadPersistedOffset();

        String url = (configuredWebhookUrl != null && !configuredWebhookUrl.isBlank())
                ? configuredWebhookUrl
                : System.getenv("TELEGRAM_WEBHOOK_URL");
        if (url != null && !url.isBlank()) {
            localPollingEnabled = false;
            Map<String, Object> res = setupWebhook(url.trim());
            log.info("Telegram auto webhook registration result: {}", res);
        } else if (localPollingEnabled) {
            // No static webhook configured and polling explicitly enabled: clear any stale
            // webhook, otherwise Telegram returns "webhook is active" and getUpdates fails.
            log.info("No static TELEGRAM_WEBHOOK_URL configured. Clearing webhook and enabling 24/7 background polling.");
            clearWebhook();
        } else {
            // TELEGRAM_LOCAL_POLLING=false: an external poller (e.g. `pnpm tg:daemon`) owns
            // getUpdates. Never clear its webhook or flip polling on behind the operator's back.
            log.info("Telegram local polling disabled by configuration (TELEGRAM_LOCAL_POLLING=false); leaving webhook/polling state untouched.");
        }

        checkBotPrivacyStatus();
    }

    private void loadPersistedOffset() {
        try {
            platformSettingRepository.findById("telegram.updateOffset")
                    .ifPresent(s -> {
                        try {
                            long val = Long.parseLong(s.getValueJson().trim().replace("\"", ""));
                            if (val > nextUpdateOffset) {
                                nextUpdateOffset = val;
                                log.info("Loaded Telegram update offset: {}", nextUpdateOffset);
                            }
                        } catch (Exception ignored) {}
                    });
        } catch (Exception e) {
            log.warn("Could not load persisted Telegram update offset: {}", e.getMessage());
        } finally {
            offsetLoaded = true;
        }
    }

    private void savePersistedOffset(long offset) {
        try {
            platformSettingRepository.save(PlatformSettingEntity.builder()
                    .key("telegram.updateOffset")
                    .valueJson(String.valueOf(offset))
                    .build());
        } catch (Exception e) {
            log.warn("Could not save persisted Telegram update offset: {}", e.getMessage());
        }
    }

    public Boolean checkBotPrivacyStatus() {
        try {
            TelegramDTO.TelegramBotStatusDTO status = testBotConnection(null);
            if (status.isConnected()) {
                this.botPrivacyDisabled = Boolean.TRUE.equals(status.getCanReadAllGroupMessages());
                this.lastBotCheckAt = OffsetDateTime.now();
                if (status.getBotUsername() != null && !status.getBotUsername().isBlank()) {
                    this.detectedBotUsername = status.getBotUsername().trim().replaceFirst("^@", "");
                }
                if (Boolean.FALSE.equals(this.botPrivacyDisabled)) {
                    log.warn("[Telegram 24/7 Daemon] ATTENTION: Bot privacy mode is ENABLED in @BotFather for @{}. Telegram drops unmentioned group messages! Send /setprivacy -> Disable in @BotFather to receive automated PayWay alerts.", status.getBotUsername());
                } else {
                    log.info("[Telegram 24/7 Daemon] Bot @{} has privacy mode DISABLED. Can read all group PayWay alerts automatically.", status.getBotUsername());
                }
                return this.botPrivacyDisabled;
            }
        } catch (Exception e) {
            log.warn("Could not verify bot privacy mode: {}", e.getMessage());
        }
        return this.botPrivacyDisabled;
    }

    public Map<String, Object> getDaemonStatus() {
        String token = resolveBotToken(null);
        boolean botTokenConfigured = token != null && !token.isBlank();
        String groupChatId = resolveGroupChatId(null);
        boolean groupChatConfigured = groupChatId != null && !groupChatId.isBlank();
        boolean active = localPollingEnabled && botTokenConfigured;

        String status;
        if (!localPollingEnabled) {
            status = "DISABLED";
        } else if (!botTokenConfigured) {
            status = "ERROR";
            if (lastError == null) {
                lastError = "Telegram bot token is not configured. Set it in Admin Settings / Payment Config or TELEGRAM_BOT_TOKEN.";
            }
        } else if (isPolling) {
            status = "POLLING";
        } else if (lastError != null) {
            status = "ERROR";
        } else {
            status = "ACTIVE";
        }

        if (botPrivacyDisabled == null && active) {
            checkBotPrivacyStatus();
        }

        Map<String, Object> map = new LinkedHashMap<>();
        map.put("active", active);
        map.put("pollingEnabled", localPollingEnabled);
        map.put("mode", !localPollingEnabled ? "DISABLED" : "POLLING");
        map.put("status", status);
        map.put("botTokenConfigured", botTokenConfigured);
        map.put("groupChatConfigured", groupChatConfigured);
        map.put("lastPollAt", lastPollAt != null ? lastPollAt.toString() : null);
        map.put("lastSuccessAt", lastSuccessAt != null ? lastSuccessAt.toString() : null);
        map.put("totalUpdatesProcessed", totalUpdatesProcessed);
        map.put("nextUpdateOffset", nextUpdateOffset);
        map.put("lastError", lastError);
        map.put("canReadAllGroupMessages", Boolean.TRUE.equals(botPrivacyDisabled));
        map.put("botUsername", getEffectiveBotUsername());
        map.put("targetChatId", groupChatId);
        return map;
    }

    @Scheduled(fixedDelay = 2000, initialDelay = 3000)
    public void pollTelegramUpdatesForLocalTesting() {
        if (!localPollingEnabled) return;
        syncUpdates("sys_247_daemon", false);
    }

    public Map<String, Object> syncUpdates(String triggeredBy, boolean forceSync) {
        return syncUpdates(triggeredBy, forceSync, false);
    }

    /**
     * Re-fetches every update Telegram still retains (unconfirmed, max ~24h).
     * Used by the admin "Rescan" action to recover alerts that were never ingested.
     */
    public Map<String, Object> rescanUnconfirmedUpdates(String triggeredBy) {
        long previousOffset = nextUpdateOffset;
        Map<String, Object> result = syncUpdates(triggeredBy, true, true);
        Map<String, Object> merged = new LinkedHashMap<>(result);
        merged.put("previousOffset", previousOffset);
        merged.put("rescan", true);
        merged.put("note", "Only updates still retained by Telegram (max ~24h) can be re-fetched.");
        return merged;
    }

    public Map<String, Object> syncUpdates(String triggeredBy, boolean forceSync, boolean rescan) {
        String token = resolveBotToken(null);
        if (token == null || token.isBlank()) {
            this.lastPollAt = OffsetDateTime.now();
            this.lastError = "Telegram bot token is not configured. Set it in Admin Settings / Payment Config or TELEGRAM_BOT_TOKEN.";
            log.warn("[Telegram Ingest] Cannot sync: no bot token configured (triggered by {}).", triggeredBy);
            return Map.of(
                    "success", false,
                    "mode", "sync",
                    "outcome", Map.of(
                            "processed", 0,
                            "newTransactions", 0,
                            "matchedPayments", 0,
                            "duplicatesPrevented", 0,
                            "sameTimeCollisions", 0,
                            "errors", List.of("Telegram bot token is not configured")
                    )
            );
        }

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

        boolean acquired = false;
        try {
            acquired = pollLock.tryLock(forceSync ? 10 : 0, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }

        if (!acquired) {
            if (forceSync) {
                return Map.of(
                        "success", true,
                        "mode", "sync",
                        "outcome", Map.of(
                                "processed", 0,
                                "newTransactions", 0,
                                "matchedPayments", 0,
                                "duplicatesPrevented", 0,
                                "sameTimeCollisions", 0,
                                "errors", List.of("Sync is currently executing in background")
                        )
                );
            }
            return Map.of("skipped", true, "reason", "Concurrent poll in progress");
        }

        try {
            this.isPolling = true;
            this.lastPollAt = OffsetDateTime.now();

            if (rescan) {
                // Deliberately rewind so Telegram re-delivers every update it still holds.
                // Ingest is idempotent (trxId dedupe), so previously processed alerts are safe.
                log.info("[Telegram Ingest] Rescan requested by {}: resetting offset from {} to 0", triggeredBy, nextUpdateOffset);
                nextUpdateOffset = 0;
                offsetLoaded = true;
                savePersistedOffset(0);
            }

            if (!offsetLoaded) {
                loadPersistedOffset();
            }

            if (lastBotCheckAt == null || Duration.between(lastBotCheckAt, OffsetDateTime.now()).toMinutes() >= 5) {
                checkBotPrivacyStatus();
            }

            String endpoint = "https://api.telegram.org/bot" + token + "/getUpdates?limit=100&timeout=" + (forceSync ? "0" : "2");
            if (nextUpdateOffset > 0) {
                endpoint += "&offset=" + nextUpdateOffset;
            }

            HttpClient client = HttpClient.newBuilder()
                    .connectTimeout(Duration.ofSeconds(6))
                    .build();

            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(endpoint))
                    .timeout(Duration.ofSeconds(8))
                    .GET()
                    .build();

            HttpResponse<String> res = client.send(req, HttpResponse.BodyHandlers.ofString());
            JsonNode data = objectMapper.readTree(res.body());

            if (!data.path("ok").asBoolean()) {
                String desc = data.path("description").asText("");
                if (desc.contains("webhook is active")) {
                    clearWebhook();
                }
                this.lastError = desc;
                if (desc.contains("terminated by other getUpdates")) {
                    errors.add("Another process is polling this Telegram bot (409 Conflict). Stop the extra poller or set TELEGRAM_LOCAL_POLLING=false.");
                } else {
                    errors.add(desc);
                }
            } else {
                this.lastSuccessAt = OffsetDateTime.now();
                this.lastError = null;

                long maxUpdateId = nextUpdateOffset;
                JsonNode results = data.path("result");

                if (results.isArray()) {
                    boolean haltBatch = false;
                    for (JsonNode upd : results) {
                        long updateId = upd.path("update_id").asLong(0);
                        if (haltBatch) {
                            log.warn("[Telegram Ingest] Halting batch before update #{}; offset stays at {} so Telegram re-delivers the failed alert.", updateId, maxUpdateId);
                            break;
                        }
                        processed++;
                        // When an ABA alert cannot be persisted we must NOT confirm its update,
                        // otherwise Telegram permanently deletes it and the payment is lost.
                        boolean retryRequired = false;
                        log.info("[Telegram Ingest] Received Telegram update #{}: {}", updateId, upd);

                        // 1. Process Callback Queries (Buttons clicked in Telegram group)
                        if (upd.has("callback_query")) {
                            JsonNode cb = upd.get("callback_query");
                            String cbId = cb.path("id").asText(null);
                            String cbData = cb.path("data").asText(null);
                            if (cbData != null && cbData.contains(":")) {
                                String[] parts = cbData.split(":", 2);
                                String action = parts[0];
                                String paymentId = parts[1];
                                try {
                                    paymentService.handlePaymentAction(paymentId, action, "Processed via Telegram Inline Button (" + triggeredBy + ")", "usr_admin_bot");
                                    if ("approve".equalsIgnoreCase(action)) {
                                        approvalsProcessed++;
                                        matchedPayments++;
                                    } else if ("reject".equalsIgnoreCase(action)) {
                                        rejectionsProcessed++;
                                    }
                                    answerCallbackQuery(token, cbId, "✅ " + action.toUpperCase() + " processed", false);

                                    JsonNode cbMsg = cb.path("message");
                                    if (!cbMsg.isMissingNode()) {
                                        Object chatId = cbMsg.path("chat").path("id").asText();
                                        Object msgId = cbMsg.path("message_id").asInt();
                                        String oldText = cbMsg.path("text").asText("");
                                        String decisionText = "approve".equalsIgnoreCase(action) ? "✅ Approved" : "❌ Rejected";
                                        String newText = oldText.isEmpty() ? decisionText : oldText + "\n\n• <b>Decision</b>: " + decisionText + " by Admin";
                                        editMessageText(token, chatId, msgId, newText);
                                    }
                                } catch (Exception e) {
                                    log.error("Failed to process inline button callback {}: {}", cbId, e.getMessage());
                                    answerCallbackQuery(token, cbId, "⚠️ Failed: " + e.getMessage(), true);
                                }
                            }
                            maxUpdateId = Math.max(maxUpdateId, updateId + 1);
                            continue;
                        }

                        // 2. Process Messages & Channel Posts
                        JsonNode msg = upd.has("message") ? upd.get("message") : upd.get("channel_post");
                        if (msg != null && !msg.isMissingNode()) {
                            String text = msg.path("text").asText(null);
                            if (text == null) text = msg.path("caption").asText(null);
                            int messageId = msg.path("message_id").asInt(0);
                            String chatId = msg.path("chat").path("id").asText(null);

                            if (text != null && !text.isBlank()) {
                                String trimmed = text.trim();
                                if (trimmed.startsWith("/start")) {
                                    handleStartCommand(chatId, trimmed);
                                    commandsProcessed++;
                                } else if (trimmed.equalsIgnoreCase("/id") || trimmed.equalsIgnoreCase("/chatid") || trimmed.equalsIgnoreCase("/whoami")) {
                                    sendDirectMessage(chatId, "👋 <b>Your Telegram Chat ID:</b> <code>" + chatId + "</code>");
                                    commandsProcessed++;
                                } else if (trimmed.startsWith("/pending")) {
                                    handlePendingCommand(chatId);
                                    commandsProcessed++;
                                } else if (isAbaPayWayMessage(trimmed)) {
                                    log.info("[Telegram Ingest] Matched ABA PayWay pattern in chat {} (msg #{}): '{}'", chatId, messageId, trimmed);
                                    try {
                                        Map<String, Object> ingRes = paymentService.ingestAbaMessage(trimmed, triggeredBy, messageId, chatId);
                                        log.info("[Telegram Ingest] Ingest outcome: {}", ingRes);
                                        if (Boolean.TRUE.equals(ingRes.get("isDuplicate"))) {
                                            duplicatesPrevented++;
                                        } else {
                                            newTransactions++;
                                        }
                                        if (Boolean.TRUE.equals(ingRes.get("matched"))) {
                                            matchedPayments++;
                                            notifyPaymentAutoMatched(chatId, messageId, ingRes);
                                        }
                                        if (Boolean.TRUE.equals(ingRes.get("isSameTimeCollision"))) {
                                            sameTimeCollisions++;
                                        }
                                    } catch (Exception e) {
                                        log.warn("Failed to ingest ABA message: {}", e.getMessage());
                                        errors.add("Failed to parse message #" + messageId + ": " + e.getMessage());
                                        retryRequired = true;
                                    }
                                } else {
                                    log.info("[Telegram Ingest] Received non-PayWay message in chat {} (msg #{}): '{}'", chatId, messageId, trimmed);
                                    if (trimmed.startsWith("/")) {
                                        commandsProcessed++;
                                    }
                                }
                            }
                        }

                        if (retryRequired) {
                            haltBatch = true;
                            log.warn("[Telegram Ingest] ABA ingest failed for update #{}; offset will not advance so the alert can be retried.", updateId);
                        } else {
                            maxUpdateId = Math.max(maxUpdateId, updateId + 1);
                        }
                    }
                }

                if (maxUpdateId > nextUpdateOffset) {
                    nextUpdateOffset = maxUpdateId;
                    savePersistedOffset(nextUpdateOffset);
                }

                this.totalUpdatesProcessed += processed;
            }
        } catch (Exception e) {
            this.lastError = e.getMessage();
            log.error("Error during Telegram sync ({}): {}", triggeredBy, e.getMessage());
            errors.add(e.getMessage());
        } finally {
            this.isPolling = false;
            pollLock.unlock();
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

    public boolean isAbaPayWayMessage(String text) {
        if (text == null || text.isBlank()) return false;
        String l = text.toLowerCase();
        if (l.startsWith("/aba") || l.startsWith("/payway") || l.contains("@khlanofficialbot")) {
            return true;
        }
        return l.contains("payway")
                || l.contains("aba khqr")
                || l.contains("khqr")
                || (l.contains("trx") && l.contains("apv"))
                || (l.contains("trx") && (l.contains("paid by") || l.contains("aba") || l.contains("៛") || l.contains("$") || l.contains("khr") || l.contains("usd")))
                || (l.contains("apv") && (l.contains("paid by") || l.contains("aba") || l.contains("៛") || l.contains("$") || l.contains("khr") || l.contains("usd")))
                || ((l.contains("trx. id") || l.contains("trx id") || l.contains("transaction id") || l.contains("trxid") || l.contains("txn id") || l.contains("txn"))
                    && (l.contains("paid by") || l.contains("៛") || l.contains("$") || l.contains("khr") || l.contains("usd") || l.contains("aba")));
    }

    private void handlePendingCommand(String chatId) {
        if (chatId == null || chatId.isBlank()) return;
        try {
            List<SubscriptionPaymentEntity> pending = paymentService.getPendingVerificationPayments();
            if (pending.isEmpty()) {
                sendDirectMessage(chatId, "✅ <b>KhLan Payment Queue</b>\n\nNo pending subscription payments awaiting verification.");
                return;
            }
            sendDirectMessage(chatId, "📋 <b>KhLan Pending Payments (" + pending.size() + ")</b>\nReviewing awaiting dealer subscriptions:");
            for (SubscriptionPaymentEntity p : pending) {
                sendPaymentNotification(p, null, p.getEvidenceUrl());
            }
        } catch (Exception e) {
            log.error("Failed to handle /pending command", e);
        }
    }

    private void notifyPaymentAutoMatched(String chatId, int messageId, Map<String, Object> ingRes) {
        if (chatId == null || chatId.isBlank()) return;
        String token = resolveBotToken(null);
        if (token == null) return;
        try {
            Object txObj = ingRes.get("transaction");
            String trxId = "N/A";
            String amountStr = "";
            if (txObj instanceof PaymentDTO.AbaTransactionDTO tx) {
                trxId = tx.getTrxId() != null ? tx.getTrxId() : "";
                if (tx.getAmountUsd() != null) amountStr = " ($" + tx.getAmountUsd() + ")";
            }
            String msg = "✅ <b>Subscription Auto-Activated!</b>\n"
                    + "• Trx ID: <code>" + trxId + "</code>" + amountStr + "\n"
                    + "• Reconciled & Verified automatically by KhLan 24/7 Syncer.";

            Map<String, Object> body = new LinkedHashMap<>();
            body.put("chat_id", chatId);
            body.put("text", msg);
            body.put("parse_mode", "HTML");
            if (messageId > 0) {
                body.put("reply_to_message_id", messageId);
            }
            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create("https://api.telegram.org/bot" + token + "/sendMessage"))
                    .timeout(Duration.ofSeconds(6))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(body)))
                    .build();
            HttpClient.newHttpClient().send(req, HttpResponse.BodyHandlers.discarding());
        } catch (Exception e) {
            log.debug("Could not send auto-matched confirmation: {}", e.getMessage());
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

        // 2. Check message / channel post (ABA PayWay bank receipt alerts, seller bot commands)
        Map<String, Object> msg = null;
        if (update.get("message") instanceof Map<?, ?> m) {
            @SuppressWarnings("unchecked")
            Map<String, Object> cast = (Map<String, Object>) m;
            msg = cast;
        } else if (update.get("channel_post") instanceof Map<?, ?> cp) {
            @SuppressWarnings("unchecked")
            Map<String, Object> cast = (Map<String, Object>) cp;
            msg = cast;
        }
        if (msg != null) {
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

            if (text != null && text.trim().toLowerCase().startsWith("/pending")) {
                handlePendingCommand(chatId);
                return Map.of("ok", true, "type", "PENDING_COMMAND_HANDLED");
            }

            if (text != null && isAbaPayWayMessage(text.trim())) {
                int messageId = msg.get("message_id") instanceof Number n ? n.intValue() : 0;
                try {
                    Map<String, Object> ing = paymentService.ingestAbaMessage(text.trim(), "telegram_webhook", messageId, chatId);
                    return Map.of(
                            "ok", true,
                            "type", "ABA_TRANSACTION_RECORDED",
                            "matched", Boolean.TRUE.equals(ing.get("matched")),
                            "isDuplicate", Boolean.TRUE.equals(ing.get("isDuplicate"))
                    );
                } catch (Exception e) {
                    log.warn("Failed to ingest ABA message from webhook: {}", e.getMessage());
                    return Map.of("ok", false, "type", "ABA_INGEST_FAILED",
                            "error", e.getMessage() != null ? e.getMessage() : "Failed to ingest ABA message");
                }
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

            Map<String, Object> body = new LinkedHashMap<>();
            body.put("url", effectiveUrl);
            if (secret != null && !secret.isBlank()) body.put("secret_token", secret.trim());
            body.put("allowed_updates", List.of("message", "channel_post", "callback_query"));

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
                    : "KhLanOfficialBot";
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

                if (realtimeService != null) {
                    RealtimeEventDTO event = RealtimeEventDTO.builder()
                            .type("TELEGRAM_LINKED")
                            .title("🎉 Telegram Connected!")
                            .message("Your Telegram account is now connected and receiving instant alerts.")
                            .payload(Map.of("chatId", chatId, "userId", userId))
                            .build();
                    realtimeService.emitToUser(userId, event);

                    Optional<TenantMemberEntity> memberOpt = tenantMemberRepository.findFirstByUserIdAndStatus(userId, "ACTIVE");
                    if (memberOpt.isPresent()) {
                        realtimeService.emitToTenant(memberOpt.get().getTenantId(), event);
                    }
                }
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
        if (detectedBotUsername != null && !detectedBotUsername.isBlank()) {
            return detectedBotUsername;
        }
        return "KhLanOfficialBot";
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
        String fallbackBotUsername = (detectedBotUsername != null && !detectedBotUsername.isBlank())
                ? detectedBotUsername
                : "KhLanOfficialBot";

        return TelegramDTO.AdminTelegramConfigDTO.builder()
                .botUsername(fallbackBotUsername)
                .botToken(effectiveToken)
                .chatId(effectiveChatId != null ? effectiveChatId : "-1004489863210")
                .miniAppUrl("https://t.me/" + fallbackBotUsername + "/app")
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

