package com.khlan.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

public class AuthDTO {

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class LoginRequest {
        @NotBlank(message = "phone is required")
        private String phone;
        @NotBlank(message = "password is required")
        private String password;
        private String captchaToken;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class RegisterRequest {
        @NotBlank(message = "name is required")
        private String name;
        @NotBlank(message = "phone is required")
        private String phone;
        @NotBlank(message = "password is required")
        private String password;
        @Builder.Default
        private String role = "BUYER";
        @Builder.Default
        private String locale = "km";
        private String captchaToken;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class UserSummaryDTO {
        private String id;
        private String name;
        private String role;
        private String locale;
        private String avatarUrl;
        private String phone;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class AuthResponse {
        private boolean ok;
        private UserSummaryDTO user;
        private String sessionToken;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class CaptchaVerifyRequest {
        @NotBlank(message = "id is required")
        private String id;
        private String order;
        private String sequence;

        public String getEffectiveOrder() {
            if (sequence != null && !sequence.isBlank()) return sequence;
            return order;
        }
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class CaptchaVerifyResponse {
        private boolean ok;
        private String captchaToken;
    }
}
