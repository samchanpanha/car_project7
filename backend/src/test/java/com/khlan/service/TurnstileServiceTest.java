package com.khlan.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

class TurnstileServiceTest {

    private RestClient.Builder restClientBuilder;
    private MockRestServiceServer mockServer;
    private TurnstileService turnstileService;

    private static final String VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
    private static final String SECRET_KEY = "1x0000000000000000000000000000000AA";

    @BeforeEach
    void setUp() {
        restClientBuilder = RestClient.builder();
        mockServer = MockRestServiceServer.bindTo(restClientBuilder).build();
        RestClient restClient = restClientBuilder.build();
        turnstileService = new TurnstileService(SECRET_KEY, VERIFY_URL, restClient);
    }

    @Test
    @DisplayName("rejects null or blank tokens immediately without HTTP call")
    void rejectsEmptyTokens() {
        assertFalse(turnstileService.verify(null));
        assertFalse(turnstileService.verify(""));
        assertFalse(turnstileService.verify("   "));
        mockServer.verify();
    }

    @Test
    @DisplayName("returns true when Cloudflare responds with success: true")
    void verifySuccess() {
        mockServer.expect(requestTo(VERIFY_URL))
                .andExpect(method(HttpMethod.POST))
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.secret").value(SECRET_KEY))
                .andExpect(jsonPath("$.response").value("valid-turnstile-token"))
                .andExpect(jsonPath("$.remoteip").value("127.0.0.1"))
                .andRespond(withSuccess("""
                        {
                            "success": true,
                            "challenge_ts": "2026-11-02T15:00:00.000Z",
                            "hostname": "khlan.app",
                            "error-codes": []
                        }
                        """, MediaType.APPLICATION_JSON));

        boolean result = turnstileService.verify("valid-turnstile-token", "127.0.0.1");
        assertTrue(result);
        mockServer.verify();
    }

    @Test
    @DisplayName("returns false when Cloudflare responds with success: false")
    void verifyFailure() {
        mockServer.expect(requestTo(VERIFY_URL))
                .andExpect(method(HttpMethod.POST))
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.secret").value(SECRET_KEY))
                .andExpect(jsonPath("$.response").value("invalid-token"))
                .andRespond(withSuccess("""
                        {
                            "success": false,
                            "error-codes": ["invalid-input-response"]
                        }
                        """, MediaType.APPLICATION_JSON));

        boolean result = turnstileService.verify("invalid-token");
        assertFalse(result);
        mockServer.verify();
    }

    @Test
    @DisplayName("returns false gracefully on network or HTTP 5xx error")
    void handlesHttpErrorGracefully() {
        mockServer.expect(requestTo(VERIFY_URL))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withServerError());

        boolean result = turnstileService.verify("any-token");
        assertFalse(result);
        mockServer.verify();
    }
}

