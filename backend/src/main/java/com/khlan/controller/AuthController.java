package com.khlan.controller;

import com.khlan.dto.AuthDTO;
import com.khlan.dto.TelegramAuthDTO;
import com.khlan.service.AuthService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
@Tag(name = "Authentication", description = "User registration, login, logout, and Cloudflare Turnstile verification")
public class AuthController {

    private final AuthService authService;

    @PostMapping("/login")
    @Operation(summary = "Login with Cambodian phone number, password, and captcha token")
    public ResponseEntity<AuthDTO.AuthResponse> login(
            @Valid @RequestBody AuthDTO.LoginRequest req,
            HttpServletRequest request,
            HttpServletResponse response
    ) {
        String clientIp = extractClientIp(request);
        return ResponseEntity.ok(authService.login(req, response, clientIp));
    }

    @PostMapping("/register")
    @Operation(summary = "Register new account (BUYER, SELLER, DEALER)")
    public ResponseEntity<AuthDTO.AuthResponse> register(
            @Valid @RequestBody AuthDTO.RegisterRequest req,
            HttpServletRequest request,
            HttpServletResponse response
    ) {
        String clientIp = extractClientIp(request);
        return ResponseEntity.ok(authService.register(req, response, clientIp));
    }

    @PostMapping("/logout")
    @Operation(summary = "Clear auth and persona session cookies")
    public ResponseEntity<Map<String, Boolean>> logout(HttpServletResponse response) {
        authService.logout(response);
        return ResponseEntity.ok(Map.of("ok", true));
    }

    @PostMapping("/telegram")
    @Operation(summary = "Authenticate or register via Telegram Mini App initData")
    public ResponseEntity<TelegramAuthDTO.TelegramLoginResponse> loginTelegram(
            @Valid @RequestBody TelegramAuthDTO.TelegramLoginRequest req,
            HttpServletResponse response
    ) {
        return ResponseEntity.ok(authService.loginTelegram(req, response));
    }

    private String extractClientIp(HttpServletRequest request) {
        if (request == null) return null;
        String cf = request.getHeader("CF-Connecting-IP");
        if (cf != null && !cf.isBlank()) return cf.trim();
        String xff = request.getHeader("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) {
            int idx = xff.indexOf(',');
            return idx > 0 ? xff.substring(0, idx).trim() : xff.trim();
        }
        return request.getRemoteAddr();
    }
}
