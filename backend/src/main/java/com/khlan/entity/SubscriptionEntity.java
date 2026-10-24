package com.khlan.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import lombok.Builder;
import org.hibernate.annotations.CreationTimestamp;

import java.time.OffsetDateTime;

@Entity
@Table(name = "subscriptions")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SubscriptionEntity {

    @Id
    @Column(length = 64)
    private String id;

    @Column(name = "tenant_id", nullable = false, unique = true, length = 64)
    private String tenantId;

    @Column(nullable = false, length = 32)
    @Builder.Default
    private String plan = "FREE";

    @Column(nullable = false, length = 32)
    @Builder.Default
    private String status = "ACTIVE";

    @Column(name = "billing_cycle", nullable = false, length = 32)
    @Builder.Default
    private String billingCycle = "MONTHLY";

    @Column(name = "price_usd", nullable = false)
    @Builder.Default
    private Double priceUsd = 0.0;

    @Column(name = "listings_limit", nullable = false)
    @Builder.Default
    private Integer listingsLimit = 3;

    @Column(name = "featured_limit", nullable = false)
    @Builder.Default
    private Integer featuredLimit = 0;

    @Column(nullable = false)
    @Builder.Default
    private Integer seats = 1;

    @CreationTimestamp
    @Column(name = "started_at", nullable = false, updatable = false)
    private OffsetDateTime startedAt;

    @Column(name = "current_period_end", nullable = false)
    private OffsetDateTime currentPeriodEnd;
}
