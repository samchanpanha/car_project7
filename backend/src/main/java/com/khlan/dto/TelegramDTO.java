package com.khlan.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Map;

public class TelegramDTO {

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class SellerTelegramDTO {
        private String profileId;
        private String inviteCode;
        private String miniAppUrl;
        private String channelUrl;
        private String groupUrl;
        private long inviteCount;
        private Map<String, String> links;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class UpdateSellerTelegramRequest {
        private String miniAppUrl;
        private String channelUrl;
        private String groupUrl;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class TelegramSetupResponse {
        private boolean ok;
        private String webhookUrl;
        private String message;
    }
}
