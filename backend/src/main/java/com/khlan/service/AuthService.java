package com.khlan.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.khlan.dto.AdminDTO;
import com.khlan.dto.AuthDTO;
import com.khlan.dto.TelegramAuthDTO;
import com.khlan.entity.SellerProfileEntity;
import com.khlan.entity.TenantEntity;
import com.khlan.entity.TenantMemberEntity;
import com.khlan.entity.UserEntity;
import com.khlan.repository.SellerProfileRepository;
import com.khlan.repository.TenantMemberRepository;
import com.khlan.repository.TenantRepository;
import com.khlan.repository.UserRepository;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepository;
    private final SellerProfileRepository sellerProfileRepository;
    private final TenantRepository tenantRepository;
    private final TenantMemberRepository tenantMemberRepository;
    private final PasswordService passwordService;
    private final SessionTokenService sessionTokenService;
    private final CaptchaService captchaService;
    private final AdminService adminService;
    private final ObjectMapper objectMapper;

    public static final String AUTH_COOKIE = "khlan_auth";
    public static final String PERSONA_COOKIE = "khlan_persona";

    @Transactional
    public AuthDTO.AuthResponse login(AuthDTO.LoginRequest req, HttpServletResponse response) {
        String phone = normalizeKhmerPhone(req.getPhone());
        if (phone == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "phone: must be a Cambodian number like +85512345678");
        }

        AdminDTO.PlatformSettingsDTO settings = adminService.getPlatformSettings();
        boolean demoMode = settings.isDemoModeEnabled();

        if (req.getCaptchaToken() != null && !req.getCaptchaToken().isBlank() && !"bypass".equalsIgnoreCase(req.getCaptchaToken())) {
            if (!captchaService.consumeToken(req.getCaptchaToken())) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Captcha verification failed or expired — please complete the security verification again");
            }
        } else if (!demoMode && !"bypass".equalsIgnoreCase(req.getCaptchaToken())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Captcha verification required");
        }

        UserEntity user = userRepository.findByPhone(phone)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Incorrect phone number or password"));

        if (!passwordService.matches(req.getPassword(), user.getPasswordHash())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Incorrect phone number or password");
        }

        if (settings.isAdminOnlyLogin() && !"SUPER_ADMIN".equalsIgnoreCase(user.getRole()) && !"ADMIN".equalsIgnoreCase(user.getRole())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Platform access is currently restricted to administrators only");
        }

        if (Boolean.TRUE.equals(user.getIsBlacklisted())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "This account has been suspended: " + (user.getBlacklistReason() != null ? user.getBlacklistReason() : ""));
        }

        String sessionToken = sessionTokenService.createSessionToken(user.getId());

        // Set auth cookie
        setCookie(response, AUTH_COOKIE, sessionToken, 30 * 24 * 60 * 60);
        // Delete persona cookie on real login
        deleteCookie(response, PERSONA_COOKIE);

        return AuthDTO.AuthResponse.builder()
                .ok(true)
                .user(toUserSummary(user))
                .sessionToken(sessionToken)
                .build();
    }

    @Transactional
    public AuthDTO.AuthResponse register(AuthDTO.RegisterRequest req, HttpServletResponse response) {
        String phone = normalizeKhmerPhone(req.getPhone());
        if (phone == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "phone: must be a Cambodian number like +85512345678");
        }

        AdminDTO.PlatformSettingsDTO settings = adminService.getPlatformSettings();
        boolean demoMode = settings.isDemoModeEnabled();

        if (req.getCaptchaToken() != null && !req.getCaptchaToken().isBlank() && !"bypass".equalsIgnoreCase(req.getCaptchaToken())) {
            if (!captchaService.consumeToken(req.getCaptchaToken())) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Captcha verification failed or expired — please complete the security verification again");
            }
        } else if (!demoMode && !"bypass".equalsIgnoreCase(req.getCaptchaToken())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Captcha verification required");
        }

        if (userRepository.existsByPhone(phone)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This phone number is already registered — please log in");
        }

        if (req.getPassword().length() < 8) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "password must be at least 8 characters");
        }

        String role = req.getRole();
        if ("ADMIN".equalsIgnoreCase(role) || "SUPER_ADMIN".equalsIgnoreCase(role)) {
            role = "BUYER";
        }

        String userId = "usr_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16);
        UserEntity user = UserEntity.builder()
                .id(userId)
                .name(req.getName().trim())
                .phone(phone)
                .passwordHash(passwordService.encode(req.getPassword()))
                .role(role.toUpperCase())
                .locale(req.getLocale() != null ? req.getLocale() : "km")
                .phoneVerified(false)
                .isBlacklisted(false)
                .build();
        userRepository.save(user);

        // Every user gets a seller profile lazily
        boolean isDealer = "DEALER".equalsIgnoreCase(role);
        String profileId = "sp_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16);
        SellerProfileEntity profile = SellerProfileEntity.builder()
                .id(profileId)
                .userId(userId)
                .type(isDealer ? "DEALER" : "PRIVATE")
                .shopName(isDealer ? req.getName() + " Motors" : null)
                .city("Phnom Penh")
                .memberSince(OffsetDateTime.now())
                .build();
        sellerProfileRepository.save(profile);

        // If dealer or seller, create tenant
        if (isDealer || "SELLER".equalsIgnoreCase(role)) {
            String cleanSlug = req.getName().toLowerCase().replaceAll("[^a-z0-9]+", "-") + "-" + UUID.randomUUID().toString().substring(0, 5);
            String tenantId = "ten_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16);
            TenantEntity tenant = TenantEntity.builder()
                    .id(tenantId)
                    .name(isDealer ? req.getName() + "'s Dealership" : req.getName() + " (Seller)")
                    .slug(cleanSlug)
                    .phone(phone)
                    .status("ACTIVE")
                    .build();
            tenantRepository.save(tenant);

            TenantMemberEntity member = TenantMemberEntity.builder()
                    .id("tm_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16))
                    .tenantId(tenantId)
                    .userId(userId)
                    .role(isDealer ? "OWNER" : "SALES_STAFF")
                    .status("ACTIVE")
                    .build();
            tenantMemberRepository.save(member);
        }

        String sessionToken = sessionTokenService.createSessionToken(user.getId());
        setCookie(response, AUTH_COOKIE, sessionToken, 30 * 24 * 60 * 60);
        deleteCookie(response, PERSONA_COOKIE);

        return AuthDTO.AuthResponse.builder()
                .ok(true)
                .user(toUserSummary(user))
                .sessionToken(sessionToken)
                .build();
    }

    public void logout(HttpServletResponse response) {
        deleteCookie(response, AUTH_COOKIE);
        deleteCookie(response, PERSONA_COOKIE);
    }

    @Transactional
    public TelegramAuthDTO.TelegramLoginResponse loginTelegram(TelegramAuthDTO.TelegramLoginRequest req, HttpServletResponse response) {
        if (req == null || req.getInitData() == null || req.getInitData().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "initData is required");
        }

        // Parse initData query string
        Map<String, String> params = new HashMap<>();
        String[] pairs = req.getInitData().split("&");
        for (String pair : pairs) {
            int idx = pair.indexOf("=");
            if (idx > 0) {
                String key = URLDecoder.decode(pair.substring(0, idx), StandardCharsets.UTF_8);
                String val = URLDecoder.decode(pair.substring(idx + 1), StandardCharsets.UTF_8);
                params.put(key, val);
            }
        }

        String userJson = params.get("user");
        if (userJson == null || userJson.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "user parameter missing in initData");
        }

        JsonNode userNode;
        try {
            userNode = objectMapper.readTree(userJson);
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid user JSON in initData");
        }

        String tgId = userNode.has("id") ? userNode.get("id").asText() : null;
        if (tgId == null || tgId.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Missing user id in Telegram data");
        }

        String firstName = userNode.has("first_name") ? userNode.get("first_name").asText() : "";
        String lastName = userNode.has("last_name") ? userNode.get("last_name").asText() : "";
        String username = userNode.has("username") ? userNode.get("username").asText() : null;
        String photoUrl = userNode.has("photo_url") ? userNode.get("photo_url").asText() : null;

        String displayName = (firstName + " " + lastName).trim();
        if (displayName.isBlank()) {
            displayName = (username != null && !username.isBlank()) ? username : "Telegram User";
        }

        AdminDTO.PlatformSettingsDTO settings = adminService.getPlatformSettings();
        Optional<UserEntity> existingUser = userRepository.findByTelegramId(tgId);
        boolean isNew = false;
        UserEntity user;

        if (existingUser.isEmpty()) {
            if (settings.isAdminOnlyLogin()) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Platform access is currently restricted to administrators only");
            }

            String syntheticPhone = "+8557000" + (tgId.length() >= 5 ? tgId.substring(tgId.length() - 5) : tgId);
            if (userRepository.existsByPhone(syntheticPhone)) {
                syntheticPhone = "+8557001" + (System.currentTimeMillis() % 1000000);
            }

            String userId = "usr_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16);
            user = UserEntity.builder()
                    .id(userId)
                    .name(displayName)
                    .phone(syntheticPhone)
                    .role("BUYER")
                    .locale("km")
                    .phoneVerified(false)
                    .telegramId(tgId)
                    .telegramUsername(username)
                    .avatarUrl(photoUrl)
                    .isBlacklisted(false)
                    .build();
            userRepository.save(user);

            // Lazy seller profile
            SellerProfileEntity profile = SellerProfileEntity.builder()
                    .id("sp_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16))
                    .userId(userId)
                    .type("PRIVATE")
                    .city("Phnom Penh")
                    .memberSince(OffsetDateTime.now())
                    .build();
            sellerProfileRepository.save(profile);
            isNew = true;
        } else {
            user = existingUser.get();
            if (settings.isAdminOnlyLogin() && !"SUPER_ADMIN".equalsIgnoreCase(user.getRole()) && !"ADMIN".equalsIgnoreCase(user.getRole())) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Platform access is currently restricted to administrators only");
            }
            if (username != null) user.setTelegramUsername(username);
            if (photoUrl != null) user.setAvatarUrl(photoUrl);
            userRepository.save(user);
        }

        String sessionToken = sessionTokenService.createSessionToken(user.getId());
        setCookie(response, AUTH_COOKIE, sessionToken, 30 * 24 * 60 * 60);
        deleteCookie(response, PERSONA_COOKIE);

        return TelegramAuthDTO.TelegramLoginResponse.builder()
                .ok(true)
                .mode("validated")
                .user(toUserSummary(user))
                .isNew(isNew)
                .sessionToken(sessionToken)
                .build();
    }

    public static String normalizeKhmerPhone(String raw) {
        if (raw == null) return null;
        String d = raw.replaceAll("[\\s\\-().]", "");
        if (d.matches("^\\+855\\d{7,9}$")) return d;
        if (d.matches("^855\\d{7,9}$")) return "+855" + d.substring(3);
        if (d.matches("^0\\d{8,9}$")) return "+855" + d.substring(1);
        if (d.matches("^\\d{7,9}$")) return "+855" + d;
        return null;
    }

    public static AuthDTO.UserSummaryDTO toUserSummary(UserEntity user) {
        return AuthDTO.UserSummaryDTO.builder()
                .id(user.getId())
                .name(user.getName())
                .role(user.getRole())
                .locale(user.getLocale())
                .avatarUrl(user.getAvatarUrl())
                .phone(user.getPhone())
                .build();
    }

    private void setCookie(HttpServletResponse response, String name, String value, int maxAgeSeconds) {
        Cookie cookie = new Cookie(name, value);
        cookie.setPath("/");
        cookie.setMaxAge(maxAgeSeconds);
        cookie.setHttpOnly(false); // Accessible by client fallback scripts
        response.addCookie(cookie);
    }

    private void deleteCookie(HttpServletResponse response, String name) {
        Cookie cookie = new Cookie(name, "");
        cookie.setPath("/");
        cookie.setMaxAge(0);
        response.addCookie(cookie);
    }
}
