package com.khlan.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

public class TelegramAuthDTO {

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class TelegramLoginRequest {
        @NotBlank(message = "initData is required")
        private String initData;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class TelegramLoginResponse {
        private boolean ok;
        private String mode; // "validated" or "demo"
        private AuthDTO.UserSummaryDTO user;
        private boolean isNew;
        private String sessionToken;
    }
}
