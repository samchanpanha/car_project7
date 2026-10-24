package com.khlan.service;

import com.khlan.config.DualAuthFilter;
import com.khlan.dto.AuthDTO;
import com.khlan.dto.SessionDTO;
import com.khlan.entity.*;
import com.khlan.repository.*;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.*;

@Slf4j
@Service
@RequiredArgsConstructor
public class SessionService {

    private final UserRepository userRepository;
    private final SellerProfileRepository sellerProfileRepository;
    private final TenantRepository tenantRepository;
    private final TenantMemberRepository tenantMemberRepository;
    private final SubscriptionRepository subscriptionRepository;
    private final DualAuthFilter dualAuthFilter;
    private final SessionTokenService sessionTokenService;

    public static final String DEMO_BUYER_ID = "usr_demo_buyer";

    private record PersonaMeta(Map<String, String> labels, String tag) {}

    private static final Map<String, PersonaMeta> PERSONA_META = Map.of(
            "usr_demo_buyer", new PersonaMeta(Map.of(
                    "en", "Buyer — Dara", "km", "អ្នកទិញ — ដារា", "zh", "买家 — Dara", "vi", "Người mua — Dara"
            ), "buyer"),
            "usr_dealer_sokha", new PersonaMeta(Map.of(
                    "en", "Dealer Owner — Sokha", "km", "ម្ចាស់ក្សេត្រ — សុខា", "zh", "经销商老板 — Sokha", "vi", "Chủ đại lý — Sokha"
            ), "dealer-owner"),
            "usr_staff_chan", new PersonaMeta(Map.of(
                    "en", "Sales Staff — Chan", "km", "បុគ្គលិកលក់ — ចាន់", "zh", "销售人员 — Chan", "vi", "Nhân viên bán hàng — Chan"
            ), "sales-staff"),
            "usr_staff_sophea", new PersonaMeta(Map.of(
                    "en", "Inventory Manager — Sophea", "km", "អ្នកគ្រប់គ្រងការផ្ទុក — សុភា", "zh", "库存经理 — Sophea", "vi", "Quản lý kho xe — Sophea"
            ), "inventory-manager"),
            "usr_dealer_ppauto", new PersonaMeta(Map.of(
                    "en", "Dealer Owner — PP Auto", "km", "ម្ចាស់ក្សេត្រ — ភីភី អូតូ", "zh", "经销商老板 — PP Auto", "vi", "Chủ đại lý — PP Auto"
            ), "dealer-owner"),
            "usr_priv_vireak", new PersonaMeta(Map.of(
                    "en", "Private Seller — Vireak", "km", "អ្នកលក់ឯកជន — វីរៈ", "zh", "个人卖家 — Vireak", "vi", "Người bán cá nhân — Vireak"
            ), "private-seller"),
            "usr_priv_sopheak", new PersonaMeta(Map.of(
                    "en", "Private Seller — Sopheak", "km", "អ្នកលក់ឯកជន — សុភ័ក្ត្រ", "zh", "个人卖家 — Sopheak", "vi", "Người bán cá nhân — Sopheak"
            ), "private-seller"),
            "usr_admin", new PersonaMeta(Map.of(
                    "en", "Super Admin — Nita", "km", "អ្នកគ្រប់គ្រងកំពូល — នីតា", "zh", "超级管理员 — Nita", "vi", "Quản trị viên cấp cao — Nita"
            ), "admin")
    );

    @Transactional(readOnly = true)
    public SessionDTO getSession(HttpServletRequest request) {
        String activeUserId = dualAuthFilter.resolveUserId(request);
        boolean isAuthed = false;

        // Check if user has explicit auth token
        Cookie[] cookies = request.getCookies();
        if (cookies != null) {
            for (Cookie c : cookies) {
                if (DualAuthFilter.AUTH_COOKIE.equals(c.getName())) {
                    if (sessionTokenService.verifySessionToken(c.getValue()) != null) {
                        isAuthed = true;
                    }
                }
            }
        }
        if (!isAuthed && request.getHeader(DualAuthFilter.SESSION_HEADER) != null) {
            if (sessionTokenService.verifySessionToken(request.getHeader(DualAuthFilter.SESSION_HEADER)) != null) {
                isAuthed = true;
            }
        }

        // Fallback to demo buyer if none resolved
        if (activeUserId == null) {
            activeUserId = DEMO_BUYER_ID;
        }

        UserEntity user = userRepository.findById(activeUserId)
                .or(() -> userRepository.findById(DEMO_BUYER_ID))
                .orElse(null);

        // Build Personas list
        List<SessionDTO.PersonaDTO> personas = new ArrayList<>();
        List<UserEntity> personaUsers = userRepository.findAllById(DualAuthFilter.ALLOWED_PERSONA_IDS);
        Map<String, UserEntity> personaUserMap = new HashMap<>();
        for (UserEntity u : personaUsers) {
            personaUserMap.put(u.getId(), u);
        }

        for (String pid : DualAuthFilter.ALLOWED_PERSONA_IDS) {
            UserEntity pu = personaUserMap.get(pid);
            PersonaMeta meta = PERSONA_META.get(pid);
            if (pu != null && meta != null) {
                personas.add(SessionDTO.PersonaDTO.builder()
                        .id(pu.getId())
                        .name(pu.getName())
                        .role(pu.getRole())
                        .label(meta.labels())
                        .tag(meta.tag())
                        .build());
            }
        }

        if (user == null) {
            return SessionDTO.builder()
                    .user(AuthDTO.UserSummaryDTO.builder().id("").name("").role("BUYER").locale("km").avatarUrl(null).phone("").build())
                    .sellerType(null)
                    .tenant(null)
                    .authed(false)
                    .telegramLinked(false)
                    .phoneVerified(false)
                    .personas(personas)
                    .subscription(null)
                    .build();
        }

        // Seller Profile & Type
        Optional<SellerProfileEntity> sellerProfile = sellerProfileRepository.findByUserId(user.getId());
        String sellerType = sellerProfile.map(sp -> "DEALER".equals(sp.getType()) ? "DEALER" : "PRIVATE").orElse(null);

        // Tenant & Subscription
        SessionDTO.TenantSummary tenantSummary = null;
        SessionDTO.SubscriptionSummary subSummary = null;

        Optional<TenantMemberEntity> membership = tenantMemberRepository.findFirstByUserIdAndStatus(user.getId(), "ACTIVE");
        if (membership.isPresent()) {
            TenantMemberEntity tm = membership.get();
            Optional<TenantEntity> tenantOpt = tenantRepository.findById(tm.getTenantId());
            if (tenantOpt.isPresent()) {
                TenantEntity t = tenantOpt.get();
                tenantSummary = SessionDTO.TenantSummary.builder()
                        .id(t.getId())
                        .name(t.getName())
                        .slug(t.getSlug())
                        .logoUrl(t.getLogoUrl())
                        .myRole(tm.getRole())
                        .build();

                Optional<SubscriptionEntity> subOpt = subscriptionRepository.findByTenantId(t.getId());
                if (subOpt.isPresent()) {
                    SubscriptionEntity s = subOpt.get();
                    subSummary = SessionDTO.SubscriptionSummary.builder()
                            .plan(s.getPlan())
                            .status(s.getStatus())
                            .isTrial(false)
                            .currentPeriodEnd(s.getCurrentPeriodEnd() != null ? s.getCurrentPeriodEnd().toString() : OffsetDateTime.now().plusDays(30).toString())
                            .build();
                }
            }
        }

        if (subSummary == null && ("SELLER".equals(user.getRole()) || "DEALER".equals(user.getRole()))) {
            subSummary = SessionDTO.SubscriptionSummary.builder()
                    .plan("FREE_TRIAL")
                    .status("ACTIVE")
                    .isTrial(true)
                    .currentPeriodEnd(OffsetDateTime.now().plusDays(30).toString())
                    .build();
        }

        return SessionDTO.builder()
                .user(AuthService.toUserSummary(user))
                .sellerType(sellerType)
                .tenant(tenantSummary)
                .authed(isAuthed)
                .telegramLinked(user.getTelegramId() != null && !user.getTelegramId().isBlank())
                .phoneVerified(Boolean.TRUE.equals(user.getPhoneVerified()))
                .personas(personas)
                .subscription(subSummary)
                .build();
    }

    public void switchPersona(String userId, HttpServletResponse response) {
        if (!DualAuthFilter.ALLOWED_PERSONA_IDS.contains(userId)) {
            throw new IllegalArgumentException("Unknown persona: " + userId);
        }
        Cookie cookie = new Cookie(DualAuthFilter.PERSONA_COOKIE, userId);
        cookie.setPath("/");
        cookie.setMaxAge(30 * 24 * 60 * 60);
        cookie.setHttpOnly(false);
        response.addCookie(cookie);
    }
}
