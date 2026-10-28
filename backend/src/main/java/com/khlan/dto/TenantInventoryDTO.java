package com.khlan.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

public class TenantInventoryDTO {

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class PagedInventoryResponse {
        private List<VehicleDTO.VehicleCardDTO> items;
        private long total;
        private int page;
        private int limit;
        private int pageCount;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class PatchInventoryVehicleRequest {
        private String status;
        private Double priceUsd;
        private Boolean featured;
        private String branchId;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class TenantAnalyticsResponse {
        private AnalyticsSummary summary;
        private List<TimelineEntry> timeline;
        private List<StatusCount> statusBreakdown;
        private List<BodyTypeCount> bodyTypeBreakdown;
        private List<BranchBreakdownEntry> branchBreakdown;
        private List<StaleLeadDetail> staleLeadDetails;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class AnalyticsSummary {
        private Double totalInventoryValue;
        private Double avgPrice;
        private long totalListings;
        private long totalViews;
        private long totalLeads;
        private Double conversionRate;
        private long appointmentCount;
        private long pendingAppointments;
        private long staleLeads;
        private Double avgResponseHours;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class TimelineEntry {
        private String date;
        private long views;
        private long leads;
        private long appointments;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class StatusCount {
        private String status;
        private long count;
        private Double value;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class BodyTypeCount {
        private String type;
        private long count;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class StaleLeadDetail {
        private String type;
        private String id;
        private String vehicleId;
        private long hoursPending;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class BranchBreakdownEntry {
        private String branchId;
        private String name;
        private long count;
        private long views;
        private long leads;
    }
}
