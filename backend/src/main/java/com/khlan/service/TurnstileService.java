package com.khlan.service;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.util.List;
import java.util.Map;

/**
 * Cloudflare Turnstile CAPTCHA verification service.
 * Verifies turnstile response tokens directly with Cloudflare siteverify endpoint.
 */
@Slf4j
@Service
public class TurnstileService {

    private final String secretKey;
    private final String verifyUrl;
    private final RestClient restClient;

    public record TurnstileResponse(
            boolean success,
            @JsonProperty("error-codes") List<String> errorCodes,
            @JsonProperty("challenge_ts") String challengeTs,
            String hostname,
            String action,
            String cdata
    ) {}

    @Autowired
    public TurnstileService(
            @Value("${cloudflare.turnstile.secret-key:1x0000000000000000000000000000000AA}") String secretKey,
            @Value("${cloudflare.turnstile.verify-url:https://challenges.cloudflare.com/turnstile/v0/siteverify}") String verifyUrl
    ) {
        this.secretKey = secretKey;
        this.verifyUrl = verifyUrl;

        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(Duration.ofSeconds(4));
        requestFactory.setReadTimeout(Duration.ofSeconds(4));

        this.restClient = RestClient.builder()
                .requestFactory(requestFactory)
                .build();
    }

    public TurnstileService(String secretKey, String verifyUrl, RestClient restClient) {
        this.secretKey = secretKey;
        this.verifyUrl = verifyUrl;
        this.restClient = restClient;
    }

    public boolean verify(String token) {
        return verify(token, null);
    }

    public boolean verify(String token, String remoteIp) {
        if (token == null || token.isBlank()) {
            return false;
        }

        try {
            Map<String, String> payload;
            if (remoteIp != null && !remoteIp.isBlank()) {
                payload = Map.of(
                        "secret", secretKey,
                        "response", token.trim(),
                        "remoteip", remoteIp.trim()
                );
            } else {
                payload = Map.of(
                        "secret", secretKey,
                        "response", token.trim()
                );
            }

            TurnstileResponse resp = restClient.post()
                    .uri(verifyUrl)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(payload)
                    .retrieve()
                    .body(TurnstileResponse.class);

            if (resp != null && resp.success()) {
                return true;
            }

            log.warn("Cloudflare Turnstile verification rejected: {}", resp != null ? resp.errorCodes() : "empty response");
            return false;
        } catch (Exception e) {
            log.error("Cloudflare Turnstile verification request failed: {}", e.getMessage());
            return false;
        }
    }
}

