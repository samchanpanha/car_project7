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
                        // Public endpoints (must not leak tenant/admin data)
                        .requestMatchers(
                                "/error",
                                "/api/health",
                                "/api/auth/**",
                                "/api/session",
                                "/api/meta",
                                "/api/meta/**",
                                "/api/vehicles",
                                "/api/vehicles/**",
                                "/api/uploads/**",
                                "/api/sellers/**",
                                "/api/tg/**",
                                "/api/telegram/public-config",
                                "/api/reports/**"
                        ).permitAll()
                        // Protected role endpoints
                        .requestMatchers("/api/admin/**").hasAnyRole("ADMIN", "SUPER_ADMIN")
                        .requestMatchers("/api/tenant/**", "/api/seller/**").hasAnyRole("SELLER", "DEALER", "ADMIN", "SUPER_ADMIN")
                        .requestMatchers("/api/realtime/**", "/api/conversations/**", "/api/account/**", "/api/favorites/**", "/api/purchases/**").authenticated()
                        // Swagger/actuator only for non-production admin can be added via profile
                        .requestMatchers("/swagger-ui/**", "/swagger-ui.html", "/v3/api-docs/**").permitAll()
                        .requestMatchers("/actuator/health", "/actuator/prometheus").permitAll()
                        .requestMatchers("/actuator/**").hasAnyRole("ADMIN", "SUPER_ADMIN")
                        .anyRequest().permitAll()
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
