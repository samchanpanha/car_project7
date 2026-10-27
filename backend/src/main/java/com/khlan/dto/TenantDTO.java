package com.khlan.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

public class TenantDTO {

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class TenantDashboardDTO {
        private TenantInfoDTO tenant;
        private String myRole;
        private TenantSubscriptionDTO subscription;
        private List<TenantMemberDTO> members;
        private List<PlanDTO> plans;
        private TenantStatsDTO stats;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class TenantInfoDTO {
        private String id;
        private String name;
        private String slug;
        private String logoUrl;
        private String bio;
        private String bioKm;
        private String city;
        private String address;
        private String phone;
        private String telegram;
        private String verification;
        private String status;
        private String memberSince;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class TenantSubscriptionDTO {
        private String plan;
        private String status;
        private String currentPeriodEnd;
        private int featuredLimit;
        private int branchLimit;
        private boolean unlimitedInventory;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class PlanDTO {
        private String id;
        private String plan;
        private String name;
        private double priceUsd;
        private Double priceUsdMonthly;
        private Double priceUsdYearly;
        private Double priceKhrMonthly;
        private Double priceKhrYearly;
        private int featuredSlots;
        private int branchSlots;
        private Integer listingsLimit;
        private Integer featuredLimit;
        private Integer seats;
        private Boolean enabled;
        private List<String> features;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class TenantStatsDTO {
        private long published;
        private long pending;
        private long sold;
        private long draft;
        private long totalViews;
        private long totalLeads;
        private long activeFavorites;
        private long appointmentsRequested;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class TenantMemberDTO {
        private String id;
        private String userId;
        private String name;
        private String phone;
        private String role;
        private String status;
        private String createdAt;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class TenantBranchDTO {
        private String id;
        private String tenantId;
        private String name;
        private String nameKm;
        private String city;
        private String district;
        private String address;
        private String phone;
        private String telegram;
        private boolean isMain;
        private String status;
        private String openingHours;
        private String imageUrl;
        private int vehicleCount;
        private String createdAt;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class CreateBranchRequest {
        private String name;
        private String nameKm;
        private String city;
        private String district;
        private String address;
        private String phone;
        private String telegram;
        private Boolean isMain;
        private String status;
        private String openingHours;
        private String imageUrl;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class UpdateBranchRequest {
        private String name;
        private String nameKm;
        private String city;
        private String district;
        private String address;
        private String phone;
        private String telegram;
        private Boolean isMain;
        private String status;
        private String openingHours;
        private String imageUrl;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class InviteStaffRequest {
        private String name;
        private String phone;
        private String role;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class UpdateStaffRequest {
        private String role;
        private String status;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class UpdateTenantProfileRequest {
        private String name;
        private String bio;
        private String bioKm;
        private String city;
        private String address;
        private String phone;
        private String telegram;
        private String logoUrl;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class TenantLeadDTO {
        private String conversationId;
        private LeadVehicleDTO vehicle;
        private LeadBuyerDTO buyer;
        private LeadMessageDTO lastMessage;
        private long messageCount;
        private String updatedAt;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class LeadVehicleDTO {
        private String id;
        private String make;
        private String model;
        private int year;
        private double priceUsd;
        private String thumbnail;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class LeadBuyerDTO {
        private String id;
        private String name;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class LeadMessageDTO {
        private String body;
        private String createdAt;
        private boolean isMine;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class PublicSellerDTO {
        private VehicleDTO.SellerFullDTO seller;
        private List<VehicleDTO.VehicleCardDTO> listings;
    }
}
