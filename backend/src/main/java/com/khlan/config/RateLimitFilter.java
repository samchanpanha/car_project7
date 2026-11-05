package com.khlan.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Lightweight in-memory sliding-window rate limiter for abuse-prone endpoints
 * (auth, OCR, abuse reports, uploads). Limits are per client IP (respecting
 * X-Forwarded-For behind nginx) per URI. Tuned generously so legitimate flows
 * are unaffected; protects against brute-force/hammering.
 */
@Component
public class RateLimitFilter extends OncePerRequestFilter {

    private static final class Rule {
        final int maxRequests;
        final long windowMs;

        Rule(int maxRequests, long windowMs) {
            this.maxRequests = maxRequests;
            this.windowMs = windowMs;
        }
    }

    private final ConcurrentHashMap<String, Deque<Long>> hits = new ConcurrentHashMap<>();

    private static final Rule AUTH_RULE = new Rule(20, 60_000L);
    private static final Rule OCR_RULE = new Rule(30, 60_000L);
    private static final Rule ABUSE_RULE = new Rule(15, 60_000L);
    private static final Rule UPLOAD_RULE = new Rule(60, 60_000L);

    @Value("${security.rate-limit.enabled:true}")
    private boolean enabled;

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        if (!enabled || !"POST".equalsIgnoreCase(request.getMethod())) {
            chain.doFilter(request, response);
            return;
        }

        Rule rule = ruleFor(request.getRequestURI());
        if (rule == null) {
            chain.doFilter(request, response);
            return;
        }

        String key = remoteIp(request) + "|" + request.getRequestURI();
        long now = System.currentTimeMillis();
        Deque<Long> q = hits.computeIfAbsent(key, k -> new ArrayDeque<>());

        synchronized (q) {
            while (!q.isEmpty() && q.peekFirst() < now - rule.windowMs) {
                q.pollFirst();
            }
            if (q.size() >= rule.maxRequests) {
                response.setStatus(429);
                response.setContentType("application/json");
                response.getWriter().write("{\"error\":\"Too many requests. Please wait a moment and try again.\"}");
                return;
            }
            q.addLast(now);
        }

        chain.doFilter(request, response);
    }

    private static Rule ruleFor(String uri) {
        if (uri.startsWith("/api/auth/")) return AUTH_RULE;
        if (uri.startsWith("/api/tenant/payments/ocr")) return OCR_RULE;
        if (uri.equals("/api/reports/abuse") || uri.startsWith("/api/abuse-reports")) return ABUSE_RULE;
        if (uri.startsWith("/api/uploads/")) return UPLOAD_RULE;
        return null;
    }

    private static String remoteIp(HttpServletRequest request) {
        String fwd = request.getHeader("X-Forwarded-For");
        if (fwd != null && !fwd.isBlank()) {
            int comma = fwd.indexOf(',');
            return (comma > 0 ? fwd.substring(0, comma) : fwd).trim();
        }
        String ip = request.getRemoteAddr();
        return ip != null ? ip : "unknown";
    }
}
