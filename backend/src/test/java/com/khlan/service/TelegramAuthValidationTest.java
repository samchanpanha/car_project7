package com.khlan.service;

import org.junit.jupiter.api.Test;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Guards the Telegram WebApp initData HMAC validation in AuthService:
 * forged `hash` values must be rejected, and a genuinely signed initData
 * (same algorithm as Telegram's reference implementation) must be accepted.
 */
class TelegramAuthValidationTest {

    private static final String BOT_TOKEN = "123456:TEST-BOT-TOKEN-abcdef";

    private static boolean verify(Map<String, String> params, String token) throws Exception {
        Method m = AuthService.class.getDeclaredMethod("verifyInitDataHash", Map.class, String.class);
        m.setAccessible(true);
        return (Boolean) m.invoke(null, params, token);
    }

    private static String sign(Map<String, String> params, String token) throws Exception {
        StringBuilder sb = new StringBuilder();
        params.keySet().stream().sorted().forEach(k -> {
            if (sb.length() > 0) sb.append("\n");
            sb.append(k).append("=").append(params.get(k));
        });
        byte[] secretKey = hmac(token.getBytes(StandardCharsets.UTF_8), "WebAppData".getBytes(StandardCharsets.UTF_8));
        byte[] sig = hmac(secretKey, sb.toString().getBytes(StandardCharsets.UTF_8));
        StringBuilder hex = new StringBuilder();
        for (byte b : sig) {
            hex.append(String.format("%02x", b & 0xff));
        }
        return hex.toString();
    }

    private static byte[] hmac(byte[] key, byte[] data) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(key, "HmacSHA256"));
        return mac.doFinal(data);
    }

    @Test
    void rejectsForgedHash() throws Exception {
        Map<String, String> params = new HashMap<>();
        params.put("user", "{\"id\":123,\"first_name\":\"Eve\"}");
        params.put("auth_date", "1700000000");
        params.put("hash", "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef");
        assertFalse(verify(params, BOT_TOKEN));
    }

    @Test
    void rejectsMissingHash() throws Exception {
        Map<String, String> params = new HashMap<>();
        params.put("user", "{\"id\":123}");
        assertFalse(verify(params, BOT_TOKEN));
    }

    @Test
    void acceptsValidSignature() throws Exception {
        Map<String, String> params = new HashMap<>();
        params.put("user", "{\"id\":123,\"first_name\":\"Alice\"}");
        params.put("auth_date", "1700000000");
        params.put("hash", sign(params, BOT_TOKEN));
        assertTrue(verify(params, BOT_TOKEN));
    }

    @Test
    void rejectsTamperedUserWithValidHashForOtherData() throws Exception {
        Map<String, String> params = new HashMap<>();
        params.put("user", "{\"id\":123,\"first_name\":\"Alice\"}");
        params.put("auth_date", "1700000000");
        String goodHash = sign(params, BOT_TOKEN);
        // Tamper with the user field while keeping the old (now invalid) hash.
        params.put("user", "{\"id\":999,\"first_name\":\"Mallory\"}");
        params.put("hash", goodHash);
        assertFalse(verify(params, BOT_TOKEN));
    }
}
