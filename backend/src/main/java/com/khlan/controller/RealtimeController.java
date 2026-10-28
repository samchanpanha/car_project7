package com.khlan.controller;

import com.khlan.dto.RealtimeEventDTO;
import com.khlan.entity.TenantMemberEntity;
import com.khlan.entity.UserEntity;
import com.khlan.repository.TenantMemberRepository;
import com.khlan.service.RealtimeService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.time.OffsetDateTime;
import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/api/realtime")
@RequiredArgsConstructor
@Slf4j
@Tag(name = "Realtime Events", description = "Server-Sent Events (SSE) stream for live subscription, Telegram linking, and CRM lead alerts")
public class RealtimeController {

    private final RealtimeService realtimeService;
    private final TenantMemberRepository tenantMemberRepository;

    @GetMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @Operation(summary = "Subscribe to live real-time event stream (SSE)")
    public SseEmitter subscribe(
            @AuthenticationPrincipal UserEntity user,
            HttpServletResponse response
    ) {
        if (user == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Login required to subscribe to real-time events");
        }

        // Prevent response buffering in reverse proxies (e.g. Nginx, Cloudflare)
        response.setHeader("Cache-Control", "no-cache, no-transform");
        response.setHeader("X-Accel-Buffering", "no");
        response.setHeader("Connection", "keep-alive");

        String userId = user.getId();
        Optional<TenantMemberEntity> memberOpt = tenantMemberRepository.findFirstByUserIdAndStatus(userId, "ACTIVE");
        String tenantId = memberOpt.map(TenantMemberEntity::getTenantId).orElse(null);

        log.debug("User {} (tenant: {}) connected to SSE stream", userId, tenantId);
        return realtimeService.subscribe(userId, tenantId);
    }

    @GetMapping("/sync")
    @Operation(summary = "Fetch current real-time connection status and server timestamp")
    public ResponseEntity<Map<String, Object>> getSyncStatus(@AuthenticationPrincipal UserEntity user) {
        String userId = user != null ? user.getId() : null;
        return ResponseEntity.ok(Map.of(
                "ok", true,
                "authenticated", user != null,
                "userId", userId != null ? userId : "",
                "serverTime", OffsetDateTime.now().toString(),
                "activeConnections", realtimeService.getActiveConnectionCount()
        ));
    }

    @PostMapping("/test")
    @Operation(summary = "Send test event to the authenticated user's active SSE connection")
    public ResponseEntity<Map<String, Object>> sendTestEvent(@AuthenticationPrincipal UserEntity user) {
        if (user == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Login required");
        }

        RealtimeEventDTO testEvent = RealtimeEventDTO.builder()
                .type("TEST_NOTIFICATION")
                .title("🔔 Real-Time Sync Test")
                .message("Your browser is receiving live events from KhLan server successfully!")
                .timestamp(OffsetDateTime.now().toString())
                .payload(Map.of("sender", "System", "userId", user.getId()))
                .build();

        realtimeService.emitToUser(user.getId(), testEvent);
        return ResponseEntity.ok(Map.of("ok", true, "message", "Test event emitted to user " + user.getId()));
    }
}

