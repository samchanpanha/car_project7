package com.khlan.service;

import com.khlan.dto.AuthDTO;
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

import java.time.OffsetDateTime;
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

    public static final String AUTH_COOKIE = "khlan_auth";
    public static final String PERSONA_COOKIE = "khlan_persona";

    @Transactional
    public AuthDTO.AuthResponse login(AuthDTO.LoginRequest req, HttpServletResponse response) {
        String phone = normalizeKhmerPhone(req.getPhone());
        if (phone == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "phone: must be a Cambodian number like +85512345678");
        }

        if (!captchaService.consumeToken(req.getCaptchaToken())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Captcha verification failed or expired — please complete the security verification again");
        }

        UserEntity user = userRepository.findByPhone(phone)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Incorrect phone number or password"));

        if (!passwordService.matches(req.getPassword(), user.getPasswordHash())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Incorrect phone number or password");
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

        if (!captchaService.consumeToken(req.getCaptchaToken())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Captcha verification failed or expired — please complete the security verification again");
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
