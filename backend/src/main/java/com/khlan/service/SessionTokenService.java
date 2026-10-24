package com.khlan.service;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Date;
import java.util.HexFormat;

@Service
public class SessionTokenService {

    private final String authSecret;
    private static final long SESSION_TTL_MS = 30L * 24 * 60 * 60 * 1000; // 30 days

    public SessionTokenService(@Value("${jwt.secret:khlan-dev-secret-change-me}") String authSecret) {
        // Fallback to Next.js default secret if standard jwt.secret is present or check AUTH_SECRET env
        String envSecret = System.getenv("AUTH_SECRET");
        this.authSecret = (envSecret != null && !envSecret.isBlank()) ? envSecret : authSecret;
    }

    /**
     * Create HMAC-SHA256 signed session token matching Next.js createSessionToken(userId):
     * Format: userId.exp.signatureHex
     */
    public String createSessionToken(String userId) {
        long exp = System.currentTimeMillis() + SESSION_TTL_MS;
        String payload = userId + "." + exp;
        String sig = signPayload(payload);
        return payload + "." + sig;
    }

    /**
     * Verify HMAC-SHA256 signed session token matching Next.js verifySessionToken(token).
     * Returns userId if valid, or null if invalid or expired.
     */
    public String verifySessionToken(String token) {
        if (token == null || token.isBlank()) {
            return null;
        }

        String[] parts = token.split("\\.");
        if (parts.length != 3) {
            return null;
        }

        String userId = parts[0];
        String expRaw = parts[1];
        String sig = parts[2];

        try {
            long exp = Long.parseLong(expRaw);
            if (exp < System.currentTimeMillis()) {
                return null;
            }

            String expectedSig = signPayload(userId + "." + expRaw);
            if (!MessageDigest.isEqual(sig.getBytes(StandardCharsets.UTF_8), expectedSig.getBytes(StandardCharsets.UTF_8))) {
                return null;
            }

            return userId;
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * Also support standard JWT Bearer tokens
     */
    public String createJwt(String userId, String role) {
        SecretKey key = Keys.hmacShaKeyFor(padKey(authSecret));
        return Jwts.builder()
                .subject(userId)
                .claim("role", role)
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + SESSION_TTL_MS))
                .signWith(key)
                .compact();
    }

    public String verifyJwt(String jwt) {
        try {
            SecretKey key = Keys.hmacShaKeyFor(padKey(authSecret));
            Claims claims = Jwts.parser()
                    .verifyWith(key)
                    .build()
                    .parseSignedClaims(jwt)
                    .getPayload();
            return claims.getSubject();
        } catch (Exception e) {
            return null;
        }
    }

    private String signPayload(String payload) {
        try {
            Mac hmac = Mac.getInstance("HmacSHA256");
            SecretKeySpec secretKey = new SecretKeySpec(authSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
            hmac.init(secretKey);
            byte[] rawHmac = hmac.doFinal(payload.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(rawHmac);
        } catch (Exception e) {
            throw new RuntimeException("HMAC signing failure", e);
        }
    }

    private byte[] padKey(String secret) {
        byte[] bytes = secret.getBytes(StandardCharsets.UTF_8);
        if (bytes.length >= 32) return bytes;
        byte[] padded = new byte[32];
        System.arraycopy(bytes, 0, padded, 0, bytes.length);
        return padded;
    }
}
