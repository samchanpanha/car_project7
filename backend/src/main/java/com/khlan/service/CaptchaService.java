package com.khlan.service;

import lombok.Builder;
import lombok.Getter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class CaptchaService {

    private final String authSecret;
    private final SecureRandom random = new SecureRandom();

    private static final long CHALLENGE_TTL_MS = 3L * 60 * 1000; // 3 minutes
    private static final long TOKEN_TTL_MS = 5L * 60 * 1000;     // 5 minutes

    private static final List<String> WORDS = List.of(
            "CARS", "DRIVE", "SEDAN", "TURBO", "GEARS", "PLATE", "KHMER", "LEXUS",
            "PRADO", "ROADS", "BRAKE", "TYRES", "SPARK", "BUMPER", "CABIN", "PEDAL",
            "VALET", "HATCH", "WAGON", "COUPE"
    );

    @Getter
    @Builder
    public static class CaptchaTokenDTO {
        private String letter;
        private double x;
        private double y;
        private int rot;
    }

    @Getter
    @Builder
    public static class CaptchaChallengeDTO {
        private String id;
        private String word;
        private List<CaptchaTokenDTO> tokens;
        private int expiresInSeconds;
    }

    private record StoredChallenge(String word, long expiresAt) {}

    private final Map<String, StoredChallenge> challenges = new ConcurrentHashMap<>();
    private final Set<String> consumedNonces = Collections.newSetFromMap(new ConcurrentHashMap<>());

    public CaptchaService(@Value("${jwt.secret:khlan-dev-secret-change-me}") String authSecret) {
        String envSecret = System.getenv("AUTH_SECRET");
        this.authSecret = (envSecret != null && !envSecret.isBlank()) ? envSecret : authSecret;
    }

    public CaptchaChallengeDTO createChallenge() {
        pruneExpired();

        String word = WORDS.get(random.nextInt(WORDS.size()));
        String challengeId = "ch_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16);

        int cols = 4;
        int rows = 3;
        List<Integer> slots = new ArrayList<>();
        for (int i = 0; i < cols * rows; i++) slots.add(i);
        Collections.shuffle(slots, random);

        List<CaptchaTokenDTO> tokens = new ArrayList<>();
        for (int i = 0; i < word.length(); i++) {
            int slot = slots.get(i);
            int col = slot % cols;
            int row = slot / cols;

            // Slot cell bounds in percent
            double cellW = 100.0 / cols;
            double cellH = 100.0 / rows;

            // Add inner jitter
            double jitterX = (random.nextDouble() - 0.5) * (cellW * 0.4);
            double jitterY = (random.nextDouble() - 0.5) * (cellH * 0.4);

            double x = Math.round((col * cellW + cellW / 2.0 + jitterX) * 10.0) / 10.0;
            double y = Math.round((row * cellH + cellH / 2.0 + jitterY) * 10.0) / 10.0;
            int rot = (int) Math.round((random.nextDouble() - 0.5) * 84); // -42..42 degrees

            tokens.add(CaptchaTokenDTO.builder()
                    .letter(String.valueOf(word.charAt(i)))
                    .x(x)
                    .y(y)
                    .rot(rot)
                    .build());
        }

        // Shuffle tokens so array order does not leak spelling order
        Collections.shuffle(tokens, random);

        challenges.put(challengeId, new StoredChallenge(word, System.currentTimeMillis() + CHALLENGE_TTL_MS));

        return CaptchaChallengeDTO.builder()
                .id(challengeId)
                .word(word)
                .tokens(tokens)
                .expiresInSeconds((int) (CHALLENGE_TTL_MS / 1000))
                .build();
    }

    public String verifyOrder(String challengeId, String order) {
        if (challengeId == null || order == null) return null;

        StoredChallenge ch = challenges.remove(challengeId);
        if (ch == null || ch.expiresAt() <= System.currentTimeMillis()) {
            return null;
        }

        if (!ch.word().equalsIgnoreCase(order.trim())) {
            return null;
        }

        // Mint single-use token: nonce.exp.sig
        String nonce = "ct_" + UUID.randomUUID().toString().replace("-", "");
        long exp = System.currentTimeMillis() + TOKEN_TTL_MS;
        String payload = nonce + "." + exp;
        String sig = signPayload(payload);
        return payload + "." + sig;
    }

    public boolean consumeToken(String token) {
        if (token == null || token.isBlank()) return false;

        String[] parts = token.split("\\.");
        if (parts.length != 3) return false;

        String nonce = parts[0];
        String expRaw = parts[1];
        String sig = parts[2];

        try {
            long exp = Long.parseLong(expRaw);
            if (exp < System.currentTimeMillis()) return false;

            String expected = signPayload(nonce + "." + expRaw);
            if (!MessageDigest.isEqual(sig.getBytes(StandardCharsets.UTF_8), expected.getBytes(StandardCharsets.UTF_8))) {
                return false;
            }

            // Single use enforcement
            return consumedNonces.add(nonce);
        } catch (Exception e) {
            return false;
        }
    }

    private void pruneExpired() {
        long now = System.currentTimeMillis();
        challenges.entrySet().removeIf(entry -> entry.getValue().expiresAt() <= now);
        if (consumedNonces.size() > 5000) {
            consumedNonces.clear();
        }
    }

    private String signPayload(String payload) {
        try {
            Mac hmac = Mac.getInstance("HmacSHA256");
            SecretKeySpec secretKey = new SecretKeySpec(authSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
            hmac.init(secretKey);
            byte[] raw = hmac.doFinal(payload.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(raw);
        } catch (Exception e) {
            throw new RuntimeException("HMAC failure", e);
        }
    }
}
