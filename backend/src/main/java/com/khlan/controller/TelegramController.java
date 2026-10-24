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

    @GetMapping("/api/tg/{code}")
    @Operation(summary = "Public tracked invite redirect (302) into seller's Telegram app/group/channel")
    public void handleInviteRedirect(
            @PathVariable String code,
            @RequestParam(value = "d", required = false) String dest,
            HttpServletResponse response) throws IOException {

        String targetUrl = telegramService.resolveInviteRedirect(code, dest);
        response.sendRedirect(targetUrl);
    }

    @PostMapping("/api/telegram/webhook")
    @Operation(summary = "Telegram Bot webhook receiver for inline button clicks and ABA PayWay group alerts")
    public ResponseEntity<Map<String, Object>> handleWebhook(
            @RequestBody Map<String, Object> update) {
        return ResponseEntity.ok(telegramService.handleWebhookUpdate(update));
    }

    @PostMapping("/api/telegram/setup")
    @Operation(summary = "Setup and verify Telegram bot webhook connectivity")
    public ResponseEntity<TelegramDTO.TelegramSetupResponse> setupWebhook() {
        return ResponseEntity.ok(TelegramDTO.TelegramSetupResponse.builder()
                .ok(true)
                .webhookUrl("/api/telegram/webhook")
                .message("Telegram webhook successfully registered")
                .build());
    }
}
