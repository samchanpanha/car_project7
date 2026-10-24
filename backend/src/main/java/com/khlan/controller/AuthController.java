package com.khlan.controller;

import com.khlan.dto.AuthDTO;
import com.khlan.service.AuthService;
import com.khlan.service.CaptchaService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
@Tag(name = "Authentication", description = "User registration, login, logout, and security captcha verification")
public class AuthController {

    private final AuthService authService;
    private final CaptchaService captchaService;

    @PostMapping("/login")
    @Operation(summary = "Login with Cambodian phone number, password, and captcha token")
    public ResponseEntity<AuthDTO.AuthResponse> login(@Valid @RequestBody AuthDTO.LoginRequest req, HttpServletResponse response) {
        return ResponseEntity.ok(authService.login(req, response));
    }

    @PostMapping("/register")
    @Operation(summary = "Register new account (BUYER, SELLER, DEALER)")
    public ResponseEntity<AuthDTO.AuthResponse> register(@Valid @RequestBody AuthDTO.RegisterRequest req, HttpServletResponse response) {
        return ResponseEntity.ok(authService.register(req, response));
    }

    @PostMapping("/logout")
    @Operation(summary = "Clear auth and persona session cookies")
    public ResponseEntity<Map<String, Boolean>> logout(HttpServletResponse response) {
        authService.logout(response);
        return ResponseEntity.ok(Map.of("ok", true));
    }

    @GetMapping("/captcha")
    @Operation(summary = "Issue a new Security Verification click-in-order letter challenge")
    public ResponseEntity<CaptchaService.CaptchaChallengeDTO> getCaptcha() {
        return ResponseEntity.ok(captchaService.createChallenge());
    }

    @PostMapping("/captcha/verify")
    @Operation(summary = "Verify clicked letters order and mint single-use captchaToken")
    public ResponseEntity<?> verifyCaptcha(@Valid @RequestBody AuthDTO.CaptchaVerifyRequest req) {
        String token = captchaService.verifyOrder(req.getId(), req.getOrder());
        if (token == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "Incorrect sequence or challenge expired"));
        }
        return ResponseEntity.ok(AuthDTO.CaptchaVerifyResponse.builder().ok(true).captchaToken(token).build());
    }
}
