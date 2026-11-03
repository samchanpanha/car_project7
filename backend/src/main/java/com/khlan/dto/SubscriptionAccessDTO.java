package com.khlan.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SubscriptionAccessDTO {
    private String userId;
    private String tenantId;
    private String effectivePlan;
    private String status; // ACTIVE, EXPIRED, INACTIVE, CANCELLED
    private boolean isTrial;
    private String startedAt;
    private String currentPeriodEnd;
    private long daysLeft;

    private int listingsLimit;
    private int listingsUsed;
    private int featuredLimit;
    private int featuredUsed;
    private int seatsLimit;
    private int seatsUsed;
    private int branchSlots;
    private boolean canSellSpareParts;

    private boolean requiresSubscription;
    private boolean freeTrialEnabled;
    private boolean canPost;
    private String reason;
}

