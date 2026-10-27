package com.khlan.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

@Slf4j
@Service
public class SseEmitterService {

    /** 0 = no timeout; Spring will keep the connection open. */
    private static final long DEFAULT_TIMEOUT_MS = 0L;

    private final Map<String, CopyOnWriteArrayList<SseEmitter>> emittersByChannel =
            new ConcurrentHashMap<>();

    public SseEmitter subscribe(String channel) {
        String key = (channel == null || channel.isBlank()) ? "global" : channel.trim();
        SseEmitter emitter = new SseEmitter(DEFAULT_TIMEOUT_MS);

        emittersByChannel
                .computeIfAbsent(key, k -> new CopyOnWriteArrayList<>())
                .add(emitter);

        emitter.onCompletion(() -> removeEmitter(key, emitter));
        emitter.onTimeout(() -> removeEmitter(key, emitter));
        emitter.onError(e -> removeEmitter(key, emitter));

        try {
            emitter.send(SseEmitter.event().name("connected").data(Map.of(
                    "channel", key,
                    "message", "Server-Sent Events connection established")));
        } catch (IOException e) {
            removeEmitter(key, emitter);
        }
        return emitter;
    }

    public void send(String channel, String eventName, Object data) {
        String key = (channel == null || channel.isBlank()) ? "global" : channel.trim();
        List<SseEmitter> list = emittersByChannel.get(key);
        if (list == null || list.isEmpty()) return;

        SseEmitter.SseEventBuilder builder = SseEmitter.event().name(eventName).data(data);
        for (SseEmitter emitter : list) {
            try {
                emitter.send(builder);
            } catch (Exception e) {
                removeEmitter(key, emitter);
            }
        }
    }

    public void broadcast(String eventName, Object data) {
        for (String key : emittersByChannel.keySet()) {
            send(key, eventName, data);
        }
    }

    private void removeEmitter(String key, SseEmitter emitter) {
        CopyOnWriteArrayList<SseEmitter> list = emittersByChannel.get(key);
        if (list != null) {
            list.remove(emitter);
            if (list.isEmpty()) emittersByChannel.remove(key);
        }
    }
}
