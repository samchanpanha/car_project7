package com.khlan.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.Map;

public class TelegramDTO {

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class SellerTelegramStats {
        private long total;
        private Map<String, Long> byDest;
        private List<DailyCount> last14;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class DailyCount {
        private String date;
        private long count;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class SellerTelegramDTO {
        private String profileId;
        private String inviteCode;
        private String miniAppUrl;
        private String channelUrl;
        private String groupUrl;
        private String chatId;
        private String botUsername;
        private long inviteCount;
        private Map<String, String> links;
        private SellerTelegramStats stats;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class UpdateSellerTelegramRequest {
        private String miniAppUrl;
        private String channelUrl;
        private String groupUrl;
        private String chatId;
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

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class AdminTelegramConfigDTO {
        private String botUsername;
        private String botToken;
        private String chatId;
        private String miniAppUrl;
        private String channelUrl;
        private String groupUrl;
        private boolean tmaEnabled;
        private boolean autoAuthEnabled;
        private boolean leadAlertsEnabled;
        private boolean hasEnvToken;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class TelegramBotStatusDTO {
        private boolean connected;
        private Long botId;
        private String botName;
        private String botUsername;
        private Boolean canJoinGroups;
        private Boolean canReadAllGroupMessages;
        private Boolean supportsInlineQueries;
        private String error;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class TestBotRequest {
        private String botToken;
    }
}

