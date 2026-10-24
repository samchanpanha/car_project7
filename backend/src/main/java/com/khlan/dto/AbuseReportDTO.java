package com.khlan.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

public class AbuseReportDTO {

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class CreateAbuseReportRequest {
        private String vehicleId;
        private String reason; // SCAM, WRONG_INFO, DUPLICATE, OFFENSIVE, SOLD, OTHER
        private String details;
    }
}
