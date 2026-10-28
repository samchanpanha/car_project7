package com.khlan.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.khlan.dto.RealtimeEventDTO;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.connection.MessageListener;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.listener.ChannelTopic;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;
import org.springframework.data.redis.connection.Message;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

@Service
@Slf4j
@RequiredArgsConstructor
public class RealtimeService implements MessageListener {

    private static final long SSE_TIMEOUT_MS = 30L * 60L * 1000L;
    private static final String REDIS_CHANNEL = "khlan:realtime:events";

    private final ObjectMapper objectMapper;

    @Autowired(required = false)
    private StringRedisTemplate redisTemplate;

    @Autowired(required = false)
    private MeterRegistry meterRegistry;

    private RedisMessageListenerContainer redisContainer;
    private volatile boolean redisAvailable = false;

    private final ConcurrentHashMap<String, CopyOnWriteArrayList<SseEmitter>> userEmitters = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, CopyOnWriteArrayList<SseEmitter>> tenantEmitters = new ConcurrentHashMap<>();

    @PostConstruct
    void initRedisBridge() {
        if (redisTemplate == null) {
            log.info("Realtime running in single-node mode (no Redis StringRedisTemplate available)");
            return;
        }
        try {
            redisContainer = new RedisMessageListenerContainer();
            redisContainer.setConnectionFactory(redisTemplate.getConnectionFactory());
            redisContainer.addMessageListener(this, new ChannelTopic(REDIS_CHANNEL));
            redisContainer.afterPropertiesSet();
            redisContainer.start();
            redisAvailable = true;
            log.info("Realtime Redis bridge enabled on channel {}", REDIS_CHANNEL);
        } catch (Exception e) {
            log.warn("Realtime Redis bridge unavailable; falling back to single-node mode: {}", e.getMessage());
            redisTemplate = null;
            redisContainer = null;
        }
    }

    @PreDestroy
    void shutdownRedisBridge() {
        if (redisContainer != null) {
            try {
                redisContainer.stop();
            } catch (Exception e) {
                log.debug("Realtime Redis bridge stop notice: {}", e.getMessage());
            }
        }
    }

    @Override
    public void onMessage(Message message, byte[] pattern) {
        try {
            String payload = new String(message.getBody(), StandardCharsets.UTF_8);
            JsonNode wrapper = objectMapper.readTree(payload);
            String targetType = wrapper.path("targetType").asText("");
            String targetId = wrapper.path("targetId").asText("");
            String eventJson = wrapper.path("eventJson").asText("");
            if (eventJson.isBlank()) return;

            RealtimeEventDTO event = objectMapper.readValue(eventJson, RealtimeEventDTO.class);
            switch (targetType) {
                case "USER" -> deliverToUserLocal(targetId, event);
                case "TENANT" -> deliverToTenantLocal(targetId, event);
                case "ALL" -> broadcastLocal(event);
                default -> log.debug("Unknown realtime target type: {}", targetType);
            }
            if (meterRegistry != null) meterRegistry.counter("khlan.realtime.consume", "result", "success").increment();
        } catch (Exception e) {
            log.warn("Failed to process distributed realtime message: {}", e.getMessage());
        }
    }

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
        if (event.getTimestamp() == null) event.setTimestamp(OffsetDateTime.now().toString());

        if (redisTemplate != null && redisAvailable) {
            if (publish("USER", userId, event)) return;
        }
        deliverToUserLocal(userId, event);
    }

    public void emitToTenant(String tenantId, RealtimeEventDTO event) {
        if (tenantId == null || tenantId.isBlank() || event == null) return;
        if (event.getTimestamp() == null) event.setTimestamp(OffsetDateTime.now().toString());

        if (redisTemplate != null && redisAvailable) {
            if (publish("TENANT", tenantId, event)) return;
        }
        deliverToTenantLocal(tenantId, event);
    }

    public void broadcast(RealtimeEventDTO event) {
        if (event == null) return;
        if (event.getTimestamp() == null) event.setTimestamp(OffsetDateTime.now().toString());

        if (redisTemplate != null && redisAvailable) {
            if (publish("ALL", "", event)) return;
        }
        broadcastLocal(event);
    }

    private boolean publish(String targetType, String targetId, RealtimeEventDTO event) {
        try {
            String eventJson = objectMapper.writeValueAsString(event);
            Map<String, String> wrapper = Map.of(
                    "targetType", targetType,
                    "targetId", targetId != null ? targetId : "",
                    "eventJson", eventJson
            );
            redisTemplate.convertAndSend(REDIS_CHANNEL, objectMapper.writeValueAsString(wrapper));
            if (meterRegistry != null) meterRegistry.counter("khlan.realtime.publish", "result", "success").increment();
            return true;
        } catch (Exception e) {
            log.debug("Redis realtime publish failed, delivering locally: {}", e.getMessage());
            redisAvailable = false;
            if (meterRegistry != null) meterRegistry.counter("khlan.realtime.publish", "result", "failure").increment();
            return false;
        }
    }

    private void deliverToUserLocal(String userId, RealtimeEventDTO event) {
        List<SseEmitter> emitters = userEmitters.get(userId);
        if (emitters == null || emitters.isEmpty()) {
            log.debug("No active SSE connections for user {}", userId);
            return;
        }
        deliver(emitters, event, "user " + userId);
    }

    private void deliverToTenantLocal(String tenantId, RealtimeEventDTO event) {
        List<SseEmitter> emitters = tenantEmitters.get(tenantId);
        if (emitters == null || emitters.isEmpty()) {
            log.debug("No active SSE connections for tenant {}", tenantId);
            return;
        }
        deliver(emitters, event, "tenant " + tenantId);
    }

    private void broadcastLocal(RealtimeEventDTO event) {
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