package com.khlan.controller;

import com.khlan.dto.TelegramDTO;
import com.khlan.entity.UserEntity;
import com.khlan.service.TelegramService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.util.Map;

@Slf4j
@RestController
@RequiredArgsConstructor
@Tag(name = "Telegram Hub & Webhooks", description = "Seller Telegram mini app/channel tracking, 302 invite routing, and bot webhook callbacks")
public class TelegramController {

    private final TelegramService telegramService;

    @GetMapping("/api/seller/telegram")
    @Operation(summary = "Get seller's Telegram integration status, channels, and invite metrics")
    public ResponseEntity<TelegramDTO.SellerTelegramDTO> getSellerTelegram(
            @AuthenticationPrincipal UserEntity authUser) {
        String userId = authUser != null ? authUser.getId() : "usr_dealer_sokha";
        return ResponseEntity.ok(telegramService.getSellerTelegram(userId));
    }

    @PutMapping("/api/seller/telegram")
    @Operation(summary = "Update seller's Telegram destination links")
    public ResponseEntity<TelegramDTO.SellerTelegramDTO> updateSellerTelegram(
            @RequestBody TelegramDTO.UpdateSellerTelegramRequest request,
            @AuthenticationPrincipal UserEntity authUser) {
        String userId = authUser != null ? authUser.getId() : "usr_dealer_sokha";
        return ResponseEntity.ok(telegramService.updateSellerTelegram(userId, request));
    }

    @PostMapping("/api/seller/telegram/test")
    @Operation(summary = "Test seller's telegram chat ID notification using the shared bot")
    public ResponseEntity<Map<String, Object>> testSellerTelegram(
            @RequestBody(required = false) Map<String, String> body,
            @AuthenticationPrincipal UserEntity authUser) {
        String userId = authUser != null ? authUser.getId() : "usr_dealer_sokha";
        String explicitChatId = body != null ? body.get("chatId") : null;
        return ResponseEntity.ok(telegramService.sendSellerTestNotification(userId, explicitChatId));
    }

    @GetMapping("/api/tg/{code}")
    @Operation(summary = "Public tracked invite redirect (302) into seller's Telegram app/group/channel")
    public void handleInviteRedirect(
            @PathVariable String code,
            @RequestParam(value = "d", required = false) String dest,
            HttpServletResponse response) throws IOException {

        String targetUrl = telegramService.resolveInviteRedirect(code, dest);
        response.setStatus(HttpServletResponse.SC_FOUND);
        if (targetUrl != null && (targetUrl.startsWith("http://") || targetUrl.startsWith("https://"))) {
            response.setHeader("Location", targetUrl);
        } else {
            response.setHeader("Location", (targetUrl != null && targetUrl.startsWith("/")) ? targetUrl : "/");
        }
    }

    @PostMapping("/api/telegram/webhook")
    @Operation(summary = "Telegram Bot webhook receiver for inline button clicks and ABA PayWay group alerts")
    public ResponseEntity<Map<String, Object>> handleWebhook(
            @RequestBody Map<String, Object> update) {
        return ResponseEntity.ok(telegramService.handleWebhookUpdate(update));
    }

    @PostMapping("/api/telegram/setup")
    @Operation(summary = "Setup and verify Telegram bot webhook connectivity")
    public ResponseEntity<Map<String, Object>> setupWebhook(@RequestParam(required = false) String url) {
        return ResponseEntity.ok(telegramService.setupWebhook(url));
    }

    @GetMapping("/api/telegram/public-config")
    @Operation(summary = "Get public Telegram bot configuration for mini app and channel links")
    public ResponseEntity<Map<String, Object>> getPublicConfig() {
        String botUsername = System.getenv().getOrDefault("TELEGRAM_BOT_USERNAME", "KhLanBot");
        return ResponseEntity.ok(Map.of(
                "botUsername", botUsername,
                "miniAppUrl", "https://t.me/" + botUsername + "/app",
                "channelUrl", "https://t.me/KhLanOfficial",
                "groupUrl", "https://t.me/KhLanGroup",
                "tmaEnabled", true
        ));
    }
}
