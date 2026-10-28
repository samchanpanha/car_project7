package com.khlan.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Map;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RealtimeEventDTO {
    /**
     * Event types:
     * - SUBSCRIPTION_ACTIVATED
     * - TELEGRAM_LINKED
     * - LEAD_RECEIVED
     * - APPOINTMENT_CREATED
     * - APPOINTMENT_UPDATED
     * - PAYMENT_SUBMITTED
     * - STAFF_UPDATED
     * - PING
     */
    private String type;
    private String title;
    private String message;
    private String timestamp;
    private Map<String, Object> payload;
}

