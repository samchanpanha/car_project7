package com.khlan.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.Map;

public class PlanDTO {

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class PlanDefinitionDTO {
        private String plan;
        private String name;
        private Double priceUsdMonthly;
        private Double priceUsdYearly;
        private Double priceKhrMonthly;
        private Double priceKhrYearly;
        private Integer listingsLimit;
        private Integer featuredLimit;
        private Integer seats;
        private Boolean enabled;
        private List<FeatureDTO> features;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class FeatureDTO {
        private String en;
        private String km;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class PlanPricingResponse {
        private Map<String, PlanDefinitionDTO> plans;
        private Double khrExchangeRate;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ExtendSubscriptionRequest {
        private String tenantId;
        private String plan;
        private Integer months;
        private String note;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class SubscriptionAnalyticsDTO {
        private Double totalRevenue;
        private Double monthlyRevenue;
        private Double yearlyRevenue;
        private Double mrr;
        private Integer pendingCount;
        private Map<String, Long> planCounts;
        private List<Map<String, Object>> recent;
    }
}
