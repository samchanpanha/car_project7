package com.khlan.config;

import com.khlan.repository.UserRepository;
import com.khlan.service.SessionTokenService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;
import java.util.Set;

@Slf4j
@Component
@RequiredArgsConstructor
public class DualAuthFilter extends OncePerRequestFilter {

    private final SessionTokenService sessionTokenService;
    private final UserRepository userRepository;

    /** Resolved once — {@code APP_DEMO_MODE} is a process-level constant. */
    private volatile Boolean demoModeEnabledCache;

    public static final String AUTH_COOKIE = "khlan_auth";
    public static final String PERSONA_COOKIE = "khlan_persona";
    public static final String SESSION_HEADER = "x-khlan-session";
    public static final String PERSONA_HEADER = "x-khlan-persona";

    public static final String DEMO_BUYER_ID = "usr_demo_buyer";

    public static final Set<String> ALLOWED_PERSONA_IDS = Set.of(
            "usr_demo_buyer",
            "usr_dealer_sokha",
            "usr_staff_chan",
            "usr_staff_sophea",
            "usr_dealer_ppauto",
            "usr_priv_vireak",
            "usr_priv_sopheak",
            "usr_admin"
    );

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {

        String resolvedUserId = resolveUserId(request);

        if (resolvedUserId != null) {
            userRepository.findById(resolvedUserId).ifPresent(user -> {
                String role = "ROLE_" + user.getRole();
                UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(
                        user,
                        null,
                        List.of(new SimpleGrantedAuthority(role))
                );
                SecurityContextHolder.getContext().setAuthentication(auth);
            });
        }

        filterChain.doFilter(request, response);
    }

    public String resolveUserId(HttpServletRequest request) {
        // 1. Try real auth cookie (khlan_auth)
        Cookie[] cookies = request.getCookies();
        if (cookies != null) {
            for (Cookie c : cookies) {
                if (AUTH_COOKIE.equals(c.getName())) {
                    String uid = sessionTokenService.verifySessionToken(c.getValue());
                    if (uid != null) return uid;
                }
            }
        }

        // 2. Try x-khlan-session header
        String sessionHeader = request.getHeader(SESSION_HEADER);
        if (sessionHeader != null && !sessionHeader.isBlank()) {
            String uid = sessionTokenService.verifySessionToken(sessionHeader);
            if (uid != null) return uid;
        }

        // 3. Try Authorization: Bearer <token>
        String authHeader = request.getHeader("Authorization");
        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            String token = authHeader.substring(7).trim();
            // Try as JWT
            String uid = sessionTokenService.verifyJwt(token);
            if (uid != null) return uid;
            // Try as HMAC session token
            uid = sessionTokenService.verifySessionToken(token);
            if (uid != null) return uid;
        }

        // 4. Try persona cookie (khlan_persona)
        if (cookies != null) {
            for (Cookie c : cookies) {
                if (isDemoModeEnabled() && PERSONA_COOKIE.equals(c.getName()) && ALLOWED_PERSONA_IDS.contains(c.getValue())) {
                    return c.getValue();
                }
            }
        }

        // 5. Try x-khlan-persona header
        String personaHeader = request.getHeader(PERSONA_HEADER);
        if (isDemoModeEnabled() && personaHeader != null && ALLOWED_PERSONA_IDS.contains(personaHeader.trim())) {
            return personaHeader.trim();
        }

        return null;
    }

    /**
     * Demo personas (`khlan_persona` cookie / `x-khlan-persona` header) let a
     * caller become any of {@link #ALLOWED_PERSONA_IDS} — including
     * {@code usr_admin} — with no credential at all.
     *
     * This therefore FAILS CLOSED: when {@code APP_DEMO_MODE} is not set
     * explicitly, demo persona authentication is DISABLED. It previously
     * defaulted to {@code true}, and because docker-compose did not pass
     * {@code APP_DEMO_MODE} to the backend container, every containerized
     * deployment silently shipped an unauthenticated admin bypass (send
     * {@code x-khlan-persona: usr_admin} on any request).
     *
     * Set {@code APP_DEMO_MODE=true} deliberately for local/demo environments.
     */
    private boolean isDemoModeEnabled() {
        Boolean cached = demoModeEnabledCache;
        if (cached != null) return cached;

        String value = System.getenv("APP_DEMO_MODE");
        if (value == null) value = System.getProperty("app.demo.mode");

        boolean enabled;
        if (value == null || value.isBlank()) {
            enabled = false; // fail closed — never infer "demo" from absence of config
            log.warn("[Security] APP_DEMO_MODE is not set — demo persona authentication is DISABLED. "
                    + "Set APP_DEMO_MODE=true explicitly for local/demo environments.");
        } else {
            enabled = Boolean.parseBoolean(value.trim());
            if (enabled) {
                log.warn("[Security] APP_DEMO_MODE=true — demo persona authentication is ENABLED. "
                        + "Any request may impersonate {} via the '{}' header/cookie. "
                        + "NEVER enable this in production.", ALLOWED_PERSONA_IDS, PERSONA_HEADER);
            }
        }

        demoModeEnabledCache = enabled;
        return enabled;
    }
}
