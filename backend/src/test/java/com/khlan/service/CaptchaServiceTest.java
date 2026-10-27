package com.khlan.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class CaptchaServiceTest {

    private CaptchaService captchaService;

    @BeforeEach
    void setUp() {
        captchaService = new CaptchaService("test-secret");
    }

    @Test
    @DisplayName("creates a 4-letter challenge")
    void createsChallenge() {
        CaptchaService.CaptchaChallengeDTO ch = captchaService.createChallenge();
        assertNotNull(ch);
        assertNotNull(ch.getId());
        assertEquals(ch.getWord().length(), ch.getTokens().size());
        assertTrue(ch.getExpiresInSeconds() > 0);
    }

    @Test
    @DisplayName("verifyOrder returns a token only for correct order")
    void verifyOrderSuccess() {
        CaptchaService.CaptchaChallengeDTO ch = captchaService.createChallenge();
        String ok = captchaService.verifyOrder(ch.getId(), ch.getWord());
        assertNotNull(ok);
        assertTrue(captchaService.consumeToken(ok));

        CaptchaService.CaptchaChallengeDTO ch2 = captchaService.createChallenge();
        String bad = captchaService.verifyOrder(ch2.getId(), "ZZZZ");
        assertNull(bad);
    }

    @Test
    @DisplayName("captcha tokens are single-use")
    void singleUseToken() {
        CaptchaService.CaptchaChallengeDTO ch = captchaService.createChallenge();
        String token = captchaService.verifyOrder(ch.getId(), ch.getWord());
        assertNotNull(token);
        assertTrue(captchaService.consumeToken(token));
        assertFalse(captchaService.consumeToken(token));
    }

    @Test
    @DisplayName("rejects malformed or expired tokens")
    void malformedTokens() {
        assertFalse(captchaService.consumeToken(null));
        assertFalse(captchaService.consumeToken(""));
        assertFalse(captchaService.consumeToken("not.a.token"));
        assertFalse(captchaService.consumeToken("ct_abc.123.bad-sig"));
    }
}