package com.khlan.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

public class AppointmentDTO {

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class BuyerAppointmentDTO {
        private String id;
        private VehicleSummaryDTO vehicle;
        private String sellerName;
        private String scheduledAt;
        private String status;
        private String notes;
        private String createdAt;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class TenantAppointmentDTO {
        private String id;
        private VehicleSummaryDTO vehicle;
        private BuyerSummaryDTO buyer;
        private String scheduledAt;
        private String status;
        private String notes;
        private String createdAt;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class VehicleSummaryDTO {
        private String id;
        private String make;
        private String model;
        private int year;
        private Double priceUsd;
        private String thumbnail;
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
    public static class CreateAppointmentRequest {
        private String vehicleId;
        private String scheduledAt;
        private String notes;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class UpdateStatusRequest {
        private String status;
    }
}
