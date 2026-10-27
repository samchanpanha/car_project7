package com.khlan.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.Map;

public class AccountDTO {

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class UpdateProfileRequest {
        private String name;
        private String locale;
        private String avatarUrl;
        private String phone;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ChangePasswordRequest {
        private String currentPassword;
        private String newPassword;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class AccountOverviewDTO {
        private long favorites;
        private long savedSearches;
        private long appointments;
        private long reportsGenerated;
        private long messagesCount;
        private List<RecentReportDTO> recentReports;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class RecentReportDTO {
        private String id;
        private String vehicleId;
        private String vehicleLabel;
        private int confidence;
        private String createdAt;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class SavedSearchDTO {
        private String id;
        private String name;
        private Map<String, Object> query;
        private boolean alertsEnabled;
        private String createdAt;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class CreateSavedSearchRequest {
        private String name;
        private Map<String, Object> query;
        private Boolean alertsEnabled;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class RunSavedSearchResponse {
        private long total;
        private List<VehicleDTO.VehicleCardDTO> vehicles;
        private List<VehicleDTO.VehicleCardDTO> items;
    }
}
