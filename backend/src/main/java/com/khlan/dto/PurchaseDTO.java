package com.khlan.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

public class PurchaseDTO {

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class CreatePurchaseRequest {
        private String vehicleId;
        private String message;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class UpdatePurchaseStatusRequest {
        private String action; // accept, reject, complete, cancel
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class BuyerSummaryDTO {
        private String id;
        private String name;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class PurchaseRequestDTO {
        private String id;
        private String vehicleId;
        private PurchaseVehicleDTO vehicle;
        private String buyerId;
        private String buyerName;
        private BuyerSummaryDTO buyer;
        private String tenantId;
        private String sellerName;
        private String status;
        private String message;
        private double priceUsd;
        private String decisionNote;
        private String createdAt;
        private String updatedAt;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class PurchaseVehicleDTO {
        private String id;
        private String make;
        private String model;
        private int year;
        private String thumbnail;
    }
}
