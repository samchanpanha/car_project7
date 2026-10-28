package com.khlan.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.khlan.dto.RealtimeEventDTO;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

@Service
@Slf4j
@RequiredArgsConstructor
public class RealtimeService {

    private final ObjectMapper objectMapper;

    // Default SSE timeout: 30 minutes (30 * 60 * 1000 ms)
    private static final long SSE_TIMEOUT_MS = 30L * 60L * 1000L;

    private final ConcurrentHashMap<String, CopyOnWriteArrayList<SseEmitter>> userEmitters = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, CopyOnWriteArrayList<SseEmitter>> tenantEmitters = new ConcurrentHashMap<>();

    public SseEmitter subscribe(String userId, String tenantId) {
        SseEmitter emitter = new SseEmitter(SSE_TIMEOUT_MS);

        if (userId != null && !userId.isBlank()) {
            userEmitters.computeIfAbsent(userId, k -> new CopyOnWriteArrayList<>()).add(emitter);
        }
        if (tenantId != null && !tenantId.isBlank()) {
            tenantEmitters.computeIfAbsent(tenantId, k -> new CopyOnWriteArrayList<>()).add(emitter);
        }

        Runnable cleanup = () -> {
            if (userId != null) {
                List<SseEmitter> list = userEmitters.get(userId);
                if (list != null) {
                    list.remove(emitter);
                    if (list.isEmpty()) userEmitters.remove(userId);
                }
            }
            if (tenantId != null) {
                List<SseEmitter> list = tenantEmitters.get(tenantId);
                if (list != null) {
                    list.remove(emitter);
                    if (list.isEmpty()) tenantEmitters.remove(tenantId);
                }
            }
        };

        emitter.onCompletion(cleanup);
        emitter.onTimeout(cleanup);
        emitter.onError(e -> cleanup.run());

        // Send initial connected event
        try {
            RealtimeEventDTO initEvent = RealtimeEventDTO.builder()
                    .type("CONNECTED")
                    .title("Live Stream Connected")
                    .message("Connected to real-time sync service")
                    .timestamp(OffsetDateTime.now().toString())
                    .payload(Map.of("userId", userId != null ? userId : "", "tenantId", tenantId != null ? tenantId : ""))
                    .build();
            emitter.send(SseEmitter.event().name("message").data(objectMapper.writeValueAsString(initEvent)));
        } catch (Exception e) {
            log.warn("Failed to send initial SSE connected event to user {}: {}", userId, e.getMessage());
            emitter.complete();
        }

        return emitter;
    }

    public void emitToUser(String userId, RealtimeEventDTO event) {
        if (userId == null || userId.isBlank() || event == null) return;
        if (event.getTimestamp() == null) {
            event.setTimestamp(OffsetDateTime.now().toString());
        }

        List<SseEmitter> emitters = userEmitters.get(userId);
        if (emitters == null || emitters.isEmpty()) {
            log.debug("No active SSE connections for user {}", userId);
            return;
        }

        deliver(emitters, event, "user " + userId);
    }

    public void emitToTenant(String tenantId, RealtimeEventDTO event) {
        if (tenantId == null || tenantId.isBlank() || event == null) return;
        if (event.getTimestamp() == null) {
            event.setTimestamp(OffsetDateTime.now().toString());
        }

        List<SseEmitter> emitters = tenantEmitters.get(tenantId);
        if (emitters == null || emitters.isEmpty()) {
            log.debug("No active SSE connections for tenant {}", tenantId);
            return;
        }

        deliver(emitters, event, "tenant " + tenantId);
    }

    public void broadcast(RealtimeEventDTO event) {
        if (event == null) return;
        if (event.getTimestamp() == null) {
            event.setTimestamp(OffsetDateTime.now().toString());
        }

        userEmitters.values().forEach(list -> deliver(list, event, "broadcast"));
    }

    private void deliver(List<SseEmitter> emitters, RealtimeEventDTO event, String targetLabel) {
        String json;
        try {
            json = objectMapper.writeValueAsString(event);
        } catch (Exception e) {
            log.error("Failed to serialize realtime event: {}", e.getMessage());
            return;
        }

        List<SseEmitter> deadEmitters = new CopyOnWriteArrayList<>();
        for (SseEmitter emitter : emitters) {
            try {
                emitter.send(SseEmitter.event().name("message").data(json));
            } catch (IOException | IllegalStateException e) {
                deadEmitters.add(emitter);
            }
        }

        if (!deadEmitters.isEmpty()) {
            emitters.removeAll(deadEmitters);
            log.debug("Cleaned up {} dead SSE connections for {}", deadEmitters.size(), targetLabel);
        }
    }

    /**
     * Heartbeat ping every 25 seconds to keep HTTP connections alive through proxies & load balancers.
     */
    @Scheduled(fixedRate = 25000)
    public void sendHeartbeat() {
        if (userEmitters.isEmpty() && tenantEmitters.isEmpty()) return;

        RealtimeEventDTO ping = RealtimeEventDTO.builder()
                .type("PING")
                .timestamp(OffsetDateTime.now().toString())
                .build();

        String json;
        try {
            json = objectMapper.writeValueAsString(ping);
        } catch (Exception e) {
            return;
        }

        userEmitters.forEach((userId, list) -> {
            List<SseEmitter> dead = new CopyOnWriteArrayList<>();
            for (SseEmitter emitter : list) {
                try {
                    emitter.send(SseEmitter.event().name("ping").data(json));
                } catch (Exception e) {
                    dead.add(emitter);
                }
            }
            if (!dead.isEmpty()) list.removeAll(dead);
        });
    }

    public int getActiveConnectionCount() {
        return userEmitters.values().stream().mapToInt(List::size).sum();
    }
}

