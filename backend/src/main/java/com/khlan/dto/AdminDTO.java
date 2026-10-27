package com.khlan.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.Map;

public class AdminDTO {

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class AdminOverviewDTO {
        private KpisDTO kpis;
        private Map<String, Long> listingsByStatus;
        private List<SignupTrendDTO> signupTrend;
        private List<TopTenantDTO> topTenants;
        private List<AuditEntryDTO> recentAudit;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class KpisDTO {
        private long users;
        private long tenants;
        private long listingsPublished;
        private long listingsPending;
        private long reportsGenerated;
        private long conversations;
        private long favorites;
        private long appointments;
        private double mrrUsd;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class SignupTrendDTO {
        private String label;
        private int users;
        private int listings;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class TopTenantDTO {
        private String id;
        private String name;
        private String plan;
        private int listings;
        private long views;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class AuditEntryDTO {
        private String id;
        private String action;
        private String entity;
        private String entityId;
        private String actorName;
        private String createdAt;
        private Map<String, Object> meta;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class AdminUserDTO {
        private String id;
        private String name;
        private String phone;
        private String role;
        private String locale;
        private boolean phoneVerified;
        private String createdAt;
        private long listingCount;
        private long favoriteCount;
        private String tenantName;
        private boolean isBlacklisted;
        private String blacklistReason;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class AdminTenantDTO {
        private String id;
        private String name;
        private String slug;
        private String city;
        private String verification;
        private String status;
        private int memberCount;
        private int listingCount;
        private String plan;
        private String subscriptionStatus;
        private double mrrUsd;
        private String createdAt;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class AiStatsDTO {
        private long totalReports;
        private long completeReports;
        private int avgConfidence;
        private Map<String, Long> statusBreakdown;
        private List<RecentReportSummaryDTO> recent;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class RecentReportSummaryDTO {
        private String id;
        private String vehicleLabel;
        private int confidence;
        private String createdAt;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class PlatformSettingsDTO {
        private boolean freeTrialEnabled;
        private int freeTrialDays;
        private boolean maintenanceMode;
        private boolean demoModeEnabled;
        private boolean adminOnlyLogin;
        private double commissionPct;
        private double featuredListingPriceUsd;
        private boolean autoApproveListings;
        private List<TenantDTO.PlanDTO> plans;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class PlatformSettingsUpdateRequest {
        private Boolean freeTrialEnabled;
        private Integer freeTrialDays;
        private Boolean maintenanceMode;
        private Boolean demoModeEnabled;
        private Boolean adminOnlyLogin;
        private Double commissionPct;
        private Double featuredListingPriceUsd;
        private Boolean autoApproveListings;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class UpdateUserRequest {
        private String role;
        private Boolean blacklisted;
        private String blacklistReason;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class UpdateTenantRequest {
        private String status;
        private String verification;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class StorageStatusDTO {
        private boolean connected;
        private String provider;
        private String bucket;
        private String endpoint;
        private String message;
    }
    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class PagedUsersDTO {
        private List<AdminUserDTO> items;
        private int page;
        private int size;
        private long total;
    }
}
