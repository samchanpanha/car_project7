package com.khlan.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.Map;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ReportDTO {

    private String id;
    private String vehicleId;
    private String status;
    private double overallConfidence;
    private String summaryEn;
    private String summaryKm;
    private List<ReportCheckDTO> checks;
    private List<Map<String, String>> limitations;
    private String createdAt;

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    @com.fasterxml.jackson.annotation.JsonIgnoreProperties(ignoreUnknown = true)
    public static class ReportCheckDTO {
        private String area;
        private String title;
        private String titleKm;
        private String status;
        private String detail;
        private String detailKm;
        private String source;
        private Double confidence;

        private String id;
        private String category;
        private String name;
        private Boolean passed;
        private Double score;
        private String detailsEn;
        private String detailsKm;
    }
}
