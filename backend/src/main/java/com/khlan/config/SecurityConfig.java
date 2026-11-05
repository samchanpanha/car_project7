package com.khlan.config;

import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.authorization.AuthorizationDecision;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.List;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final DualAuthFilter dualAuthFilter;
    private final RateLimitFilter rateLimitFilter;
    private final com.khlan.service.PasswordService passwordService;

    @Value("${cron.secret:}")
    private String cronSecret;

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                .csrf(AbstractHttpConfigurer::disable)
                .cors(cors -> cors.configurationSource(corsConfigurationSource()))
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .exceptionHandling(exceptions -> exceptions
                        .authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED))
                )
                .authorizeHttpRequests(auth -> auth
                        // Telegram setup restricted to ADMIN / SUPER_ADMIN
                        .requestMatchers("/api/telegram/setup").hasAnyRole("ADMIN", "SUPER_ADMIN")

                        // Cron automation endpoints require valid cron authentication (Bearer token)
                        .requestMatchers("/api/cron/**").access((authentication, context) -> {
                            String authHeader = context.getRequest().getHeader("Authorization");
                            return new AuthorizationDecision(isCronAuthorized(authHeader));
                        })

                        // Protected uploads (private documents and presigned download URLs)
                        .requestMatchers("/api/uploads/private", "/api/uploads/presigned").authenticated()

                        // Public endpoints whitelist (must not leak tenant/admin data)
                        .requestMatchers(
                                "/error",
                                "/api/health",
                                "/api/auth/**",
                                "/api/session",
                                "/api/session/**",
                                "/api/meta",
                                "/api/meta/**",
                                "/api/vehicles",
                                "/api/vehicles/**",
                                "/api/uploads/**",
                                "/api/sellers/**",
                                "/api/tg/**",
                                "/api/telegram/webhook",
                                "/api/telegram/public-config",
                                "/api/reports/**",
                                "/api/abuse-reports"
                        ).permitAll()

                        // Protected role endpoints
                        .requestMatchers("/api/admin/**").hasAnyRole("ADMIN", "SUPER_ADMIN")
                        .requestMatchers("/api/tenant/**", "/api/seller/**").hasAnyRole("SELLER", "DEALER", "ADMIN", "SUPER_ADMIN")
                        .requestMatchers("/api/realtime/**", "/api/conversations/**", "/api/account/**", "/api/favorites/**", "/api/purchases/**", "/api/events/**").authenticated()

                        // Swagger/actuator
                        .requestMatchers("/swagger-ui/**", "/swagger-ui.html", "/v3/api-docs/**").permitAll()
                        .requestMatchers("/actuator/health", "/actuator/prometheus").permitAll()
                        .requestMatchers("/actuator/**").hasAnyRole("ADMIN", "SUPER_ADMIN")

                        // Require authentication for all remaining requests
                        .anyRequest().authenticated()
                )
                .addFilterBefore(dualAuthFilter, UsernamePasswordAuthenticationFilter.class)
                .addFilterBefore(rateLimitFilter, DualAuthFilter.class);

        return http.build();
    }

    String getCronSecret() {
        if (cronSecret != null && !cronSecret.isBlank()) {
            return cronSecret;
        }
        String env = System.getenv("CRON_SECRET");
        if (env != null && !env.isBlank()) return env;
        return System.getProperty("cron.secret");
    }

    public boolean isCronAuthorized(String authHeader) {
        String secret = getCronSecret();
        return secret != null && !secret.isBlank()
                && authHeader != null
                && MessageDigest.isEqual(("Bearer " + secret).getBytes(StandardCharsets.UTF_8), authHeader.getBytes(StandardCharsets.UTF_8));
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return passwordService;
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        String origins = System.getenv().getOrDefault("CORS_ALLOWED_ORIGINS", "http://localhost:3000");
        configuration.setAllowedOrigins(List.of(origins.split(",")));
        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"));
        configuration.setAllowedHeaders(List.of("*"));
        configuration.setAllowCredentials(true);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }
}
