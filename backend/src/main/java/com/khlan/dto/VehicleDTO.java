package com.khlan.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

public class VehicleDTO {

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class SellerSummaryDTO {
        private String id;
        private String name;
        private String shopName;
        private String type;
        private boolean verified;
        private String verification;
        private double ratingAvg;
        private int ratingCount;
        private String city;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class SellerFullDTO {
        private String id;
        private String name;
        private String shopName;
        private String type;
        private boolean verified;
        private String verification;
        private double ratingAvg;
        private int ratingCount;
        private String city;
        private String bio;
        private String bioKm;
        private String memberSince;
        private String phone;
        private String telegram;
        private int responseRate;
        private String logoUrl;
        private String tgMiniAppUrl;
        private String tgChannelUrl;
        private String tgGroupUrl;
        private String inviteCode;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class TrustDTO {
        private int docsProvided;
        private boolean reportAvailable;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class DocumentDTO {
        private String id;
        private String type;
        private String status;
        private String notes;
        private String fileUrl;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class VehicleCardDTO {
        private String id;
        private String make;
        private String model;
        private String variant;
        private int year;
        private double priceUsd;
        private int mileageKm;
        private String transmission;
        private String fuel;
        private String bodyType;
        private String city;
        private String district;
        private String condition;
        private String status;
        private boolean featured;
        private int views;
        private String createdAt;
        private SellerSummaryDTO seller;
        private List<String> images;
        private TrustDTO trust;
        private String branchId;
        private String branchName;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class VehicleDetailDTO {
        private String id;
        private String make;
        private String model;
        private String variant;
        private int year;
        private double priceUsd;
        private int mileageKm;
        private String transmission;
        private String fuel;
        private String bodyType;
        private String city;
        private String district;
        private String condition;
        private String status;
        private boolean featured;
        private int views;
        private String createdAt;
        private SellerSummaryDTO seller;
        private List<String> images;
        private TrustDTO trust;
        private String branchId;
        private String branchName;

        // Extra details
        private Integer engineCc;
        private String drivetrain;
        private String exteriorColor;
        private String vinLast6;
        private String plateNo;
        private Integer ownershipCount;
        private String accidentDeclared;
        private String importOrigin;
        private String description;
        private String descriptionKm;
        private String branchAddress;
        private String branchPhone;
        private String updatedAt;
        private List<DocumentDTO> documents;
        private SellerFullDTO sellerFull;
        private ReportDTO report;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class CreateVehicleRequest {
        @NotBlank(message = "make is required")
        private String make;
        @NotBlank(message = "model is required")
        private String model;
        private String variant;
        @NotNull(message = "year is required")
        @Min(1990)
        private Integer year;
        @NotNull(message = "priceUsd is required")
        @Positive
        private Double priceUsd;
        @NotNull(message = "mileageKm is required")
        @Min(0)
        private Integer mileageKm;
        @NotBlank(message = "transmission is required")
        private String transmission;
        @NotBlank(message = "fuel is required")
        private String fuel;
        private Integer engineCc;
        private String drivetrain;
        @NotBlank(message = "bodyType is required")
        private String bodyType;
        @Builder.Default
        private String condition = "USED";
        private String exteriorColor;
        @Builder.Default
        private String city = "Phnom Penh";
        private String district;
        private String description;
        private String descriptionKm;
        private String vinLast6;
        private String plateNo;
        private Integer ownershipCount;
        @Builder.Default
        private String accidentDeclared = "UNKNOWN";
        private String importOrigin;
        private String branchId;
        private List<String> images;
        private List<DocumentDTO> documents;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class UpdateVehicleRequest {
        private String make;
        private String model;
        private String variant;
        private Integer year;
        private Double priceUsd;
        private Integer mileageKm;
        private String transmission;
        private String fuel;
        private Integer engineCc;
        private String drivetrain;
        private String bodyType;
        private String exteriorColor;
        private String city;
        private String district;
        private String description;
        private String descriptionKm;
        private String vinLast6;
        private String plateNo;
        private Integer ownershipCount;
        private String accidentDeclared;
        private String importOrigin;
        private String status;
        private String branchId;
        private List<String> images;
        private List<DocumentDTO> documents;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class PagedVehiclesResponseDTO {
        /** Array of vehicle cards matching Next.js VehiclesResponseDTO { items } */
        private List<VehicleCardDTO> items;
        /** Alias for items for backward compatibility */
        private List<VehicleCardDTO> vehicles;
        private long total;
        private int page;
        private int pageSize;
        private int limit;
        private int pageCount;
        private String nextCursor;
        private boolean hasMore;
    }
}
