package com.khlan.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class PasswordServiceTest {

    private PasswordService passwordService;

    @BeforeEach
    void setUp() {
        passwordService = new PasswordService();
    }

    @Test
    @DisplayName("Should encode raw password using SCrypt format (salt:hash) and verify matches")
    void testEncodeAndMatchSCrypt() {
        String rawPassword = "KhLanSecurePassword2026!";
        String encoded = passwordService.encode(rawPassword);

        assertNotNull(encoded);
        assertTrue(encoded.contains(":"), "Encoded password must contain salt:hash delimiter");

        String[] parts = encoded.split(":");
        assertEquals(2, parts.length);
        assertEquals(32, parts[0].length(), "Salt should be 16 bytes (32 hex characters)");
        assertEquals(128, parts[1].length(), "Derived key should be 64 bytes (128 hex characters)");

        assertTrue(passwordService.matches(rawPassword, encoded), "Password must match derived hash");
        assertFalse(passwordService.matches("WrongPassword", encoded), "Incorrect password must be rejected");
    }

    @Test
    @DisplayName("Should safely reject null, empty, or malformed encoded strings")
    void testRejectMalformedHashes() {
        assertFalse(passwordService.matches("password", null));
        assertFalse(passwordService.matches("password", ""));
        assertFalse(passwordService.matches("password", "   "));
        assertFalse(passwordService.matches("password", "invalid_no_colon"));
        assertFalse(passwordService.matches("password", "toomany:colons:in:hash"));
    }

    @Test
    @DisplayName("Should produce different salts for identical passwords")
    void testSaltsAreUnique() {
        String pass = "IdenticalPass123";
        String hash1 = passwordService.encode(pass);
        String hash2 = passwordService.encode(pass);

        assertNotEquals(hash1, hash2, "Salts must be randomly generated and unique per hash");
        assertTrue(passwordService.matches(pass, hash1));
        assertTrue(passwordService.matches(pass, hash2));
    }
}
