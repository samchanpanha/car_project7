package com.khlan.service;

import org.bouncycastle.crypto.generators.SCrypt;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.HexFormat;

@Service
public class PasswordService implements PasswordEncoder {

    private final BCryptPasswordEncoder bCryptPasswordEncoder = new BCryptPasswordEncoder();
    private final SecureRandom secureRandom = new SecureRandom();

    /**
     * Standard SCrypt parameters matching Node.js crypto.scryptSync(password, salt, 64):
     * N = 16384 (cost parameter)
     * r = 8 (block size)
     * p = 1 (parallelization)
     * dkLen = 64 (output bytes)
     */
    private static final int SCRYPT_N = 16384;
    private static final int SCRYPT_R = 8;
    private static final int SCRYPT_P = 1;
    private static final int SCRYPT_DKLEN = 64;

    @Override
    public String encode(CharSequence rawPassword) {
        byte[] saltBytes = new byte[16];
        secureRandom.nextBytes(saltBytes);
        String saltHex = HexFormat.of().formatHex(saltBytes);

        byte[] derived = SCrypt.generate(
                rawPassword.toString().getBytes(StandardCharsets.UTF_8),
                saltHex.getBytes(StandardCharsets.UTF_8),
                SCRYPT_N, SCRYPT_R, SCRYPT_P, SCRYPT_DKLEN
        );
        String hashHex = HexFormat.of().formatHex(derived);
        return saltHex + ":" + hashHex;
    }

    @Override
    public boolean matches(CharSequence rawPassword, String encodedPassword) {
        if (encodedPassword == null || encodedPassword.isBlank()) {
            return false;
        }

        // 1. Check legacy salt:hash (SCrypt) format
        if (encodedPassword.contains(":")) {
            String[] parts = encodedPassword.split(":");
            if (parts.length != 2) {
                return false;
            }
            String saltHex = parts[0];
            String expectedHashHex = parts[1];

            try {
                byte[] derived = SCrypt.generate(
                        rawPassword.toString().getBytes(StandardCharsets.UTF_8),
                        saltHex.getBytes(StandardCharsets.UTF_8),
                        SCRYPT_N, SCRYPT_R, SCRYPT_P, SCRYPT_DKLEN
                );
                String derivedHex = HexFormat.of().formatHex(derived);
                return MessageDigest.isEqual(
                        derivedHex.getBytes(StandardCharsets.UTF_8),
                        expectedHashHex.getBytes(StandardCharsets.UTF_8)
                );
            } catch (Exception e) {
                return false;
            }
        }

        // 2. Check BCrypt format fallback
        if (encodedPassword.startsWith("$2a$") || encodedPassword.startsWith("$2b$") || encodedPassword.startsWith("$2y$")) {
            return bCryptPasswordEncoder.matches(rawPassword, encodedPassword);
        }

        return false;
    }
}
