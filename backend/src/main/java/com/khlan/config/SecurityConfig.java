package com.khlan.config;

import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.http.HttpMethod;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final DualAuthFilter dualAuthFilter;
    private final com.khlan.service.PasswordService passwordService;

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                .csrf(AbstractHttpConfigurer::disable)
                .cors(cors -> cors.configurationSource(corsConfigurationSource()))
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        // ── Public endpoints (must not leak tenant/admin data) ──
                        .requestMatchers(
                                "/error",
                                "/api/health",
                                "/api/auth/**",
                                "/api/session",
                                "/api/meta",
                                "/api/meta/**",
                                "/api/sellers/**",
                                "/api/tg/**",
                                "/api/reports/**",
                                "/api/abuse-reports"
                        ).permitAll()

                        // Browsing the catalogue is public; creating / editing /
                        // archiving a listing is not. Matching every verb with
                        // permitAll let anonymous POST|PUT|PATCH|DELETE requests reach
                        // VehicleService, which then had to be the only line of defence.
                        .requestMatchers(HttpMethod.GET, "/api/vehicles", "/api/vehicles/**").permitAll()
                        .requestMatchers("/api/vehicles", "/api/vehicles/**").authenticated()

                        // Telegram: the inbound webhook is called by Telegram's own
                        // servers (verified via TELEGRAM_WEBHOOK_SECRET) and the
                        // public-config endpoint feeds the Mini App / channel links.
                        .requestMatchers("/api/telegram/webhook", "/api/telegram/public-config").permitAll()

                        // Registering/re-pointing the bot webhook is an administrative
                        // action: left public it allowed ANY anonymous caller to
                        // redirect every bot update (including payment receipt photos
                        // and inline approve/reject callbacks) to an attacker's URL.
                        .requestMatchers("/api/telegram/setup").hasAnyRole("ADMIN", "SUPER_ADMIN")
                        .requestMatchers("/api/telegram/**").authenticated()

                        // Serving stored media stays public (images render for anonymous
                        // browsers); uploading requires a real session so the object
                        // store cannot be used as anonymous free hosting.
                        .requestMatchers(HttpMethod.GET, "/api/uploads/**").permitAll()
                        .requestMatchers("/api/uploads/**").authenticated()

                        // Platform settings: the login screen reads `demoModeEnabled` /
                        // `adminOnlyLogin` before any session exists, so GET is public;
                        // every mutating verb is admin-only.
                        .requestMatchers(HttpMethod.GET, "/api/platform-settings").permitAll()
                        .requestMatchers("/api/platform-settings").hasAnyRole("ADMIN", "SUPER_ADMIN")

                        // External schedulers authenticate with `Authorization: Bearer
                        // <cron.secret>`, which is not a user session — the secret check
                        // lives in CronSchedulerService.validateCronAuth (now fail-closed).
                        .requestMatchers("/api/cron/**").permitAll()

                        // ── Protected role endpoints ──
                        .requestMatchers("/api/admin/**").hasAnyRole("ADMIN", "SUPER_ADMIN")
                        .requestMatchers("/api/tenant/**", "/api/seller/**").hasAnyRole("SELLER", "DEALER", "ADMIN", "SUPER_ADMIN")
                        .requestMatchers("/api/realtime/**", "/api/conversations/**", "/api/account/**", "/api/favorites/**", "/api/purchases/**").authenticated()

                        // Swagger/actuator only for non-production admin can be added via profile
                        .requestMatchers("/swagger-ui/**", "/swagger-ui.html", "/v3/api-docs/**").permitAll()
                        .requestMatchers("/actuator/health", "/actuator/prometheus").permitAll()
                        .requestMatchers("/actuator/**").hasAnyRole("ADMIN", "SUPER_ADMIN")

                        // Fail CLOSED. This used to be `.permitAll()`, which silently
                        // exposed every current and future endpoint that was not listed
                        // above (that is how /api/cron/** and /api/telegram/setup ended
                        // up world-reachable).
                        .anyRequest().authenticated()
                )
                .addFilterBefore(dualAuthFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return passwordService;
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();

        // Behind the docker-compose NGINX gateway the browser origin is the
        // gateway itself (http://localhost on port 80), not the Next.js dev
        // port, so both are allowed by default. Set CORS_ALLOWED_ORIGINS to the
        // real public origin(s) in any deployed environment.
        String origins = System.getenv().getOrDefault(
                "CORS_ALLOWED_ORIGINS",
                "http://localhost:3000,http://localhost,http://127.0.0.1:3000,http://127.0.0.1");

        // Trim each entry: a list written as "https://a.com, https://b.com" would
        // otherwise register " https://b.com", which can never match an Origin
        // header and silently breaks credentialed requests for that origin.
        List<String> allowedOrigins = java.util.Arrays.stream(origins.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .toList();

        configuration.setAllowedOrigins(allowedOrigins);
        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"));
        configuration.setAllowedHeaders(List.of("*"));
        configuration.setAllowCredentials(true);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }
}
