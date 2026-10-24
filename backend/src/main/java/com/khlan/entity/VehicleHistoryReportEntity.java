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
@Table(name = "vehicle_history_reports")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class VehicleHistoryReportEntity {

    @Id
    @Column(length = 64)
    private String id;

    @Column(name = "vehicle_id", nullable = false, length = 64)
    private String vehicleId;

    @Column(name = "checks_json", nullable = false, columnDefinition = "TEXT")
    private String checksJson;

    @Column(name = "overall_confidence", nullable = false)
    @Builder.Default
    private Double overallConfidence = 0.0;

    @Column(name = "summary_en", columnDefinition = "TEXT")
    private String summaryEn;

    @Column(name = "summary_km", columnDefinition = "TEXT")
    private String summaryKm;

    @Column(name = "limitations_json", columnDefinition = "TEXT")
    private String limitationsJson;

    @Column(nullable = false, length = 32)
    @Builder.Default
    private String status = "COMPLETE";

    @Column(name = "requested_by", length = 64)
    private String requestedBy;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;
}
