package com.khlan.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import lombok.Builder;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "vehicles")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class VehicleEntity {

    @Id
    @Column(length = 64)
    private String id;

    @Column(name = "seller_id", nullable = false, length = 64)
    private String sellerId;

    @Column(name = "created_by_id", length = 64)
    private String createdById;

    @Column(nullable = false, length = 64)
    private String make;

    @Column(nullable = false, length = 64)
    private String model;

    @Column(length = 64)
    private String variant;

    @Column(nullable = false)
    private Integer year;

    @Column(name = "price_usd", nullable = false)
    private Double priceUsd;

    @Column(name = "price_masked", nullable = false)
    @Builder.Default
    private Boolean priceMasked = false;

    @Column(name = "mileage_km", nullable = false)
    private Integer mileageKm;

    @Column
    private Integer seats;

    @Column(name = "interior_color", length = 32)
    private String interiorColor;

    @Column(name = "fuel_economy", length = 64)
    private String fuelEconomy;

    @Column(nullable = false, length = 32)
    private String transmission;

    @Column(nullable = false, length = 32)
    private String fuel;

    @Column(name = "engine_cc")
    private Integer engineCc;

    @Column(length = 32)
    private String drivetrain;

    @Column(name = "body_type", nullable = false, length = 32)
    private String bodyType;

    @Column(name = "exterior_color", length = 32)
    private String exteriorColor;

    @Column(nullable = false, length = 32)
    @Builder.Default
    private String condition = "USED";

    @Column(nullable = false, length = 64)
    @Builder.Default
    private String city = "Phnom Penh";

    @Column(length = 64)
    private String district;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Column(name = "description_km", columnDefinition = "TEXT")
    private String descriptionKm;

    @Column(nullable = false, length = 32)
    @Builder.Default
    private String status = "PUBLISHED";

    @Column(nullable = false)
    @Builder.Default
    private Boolean featured = false;

    @Column(nullable = false)
    @Builder.Default
    private Integer views = 0;

    @Column(name = "vin_last6", length = 16)
    private String vinLast6;

    @Column(name = "plate_no", length = 32)
    private String plateNo;

    @Column(name = "ownership_count")
    private Integer ownershipCount;

    @Column(name = "accident_declared", nullable = false, length = 32)
    @Builder.Default
    private String accidentDeclared = "UNKNOWN";

    @Column(name = "import_origin", length = 32)
    private String importOrigin;

    @Column(name = "listing_category", nullable = false, length = 32)
    @Builder.Default
    private String listingCategory = "CAR";

    @Column(name = "part_category", length = 64)
    private String partCategory;

    @Column(name = "part_target", length = 32)
    private String partTarget;

    @Column(name = "part_condition", length = 32)
    private String partCondition;

    @Column(name = "compatible_models", columnDefinition = "TEXT")
    private String compatibleModels;

    @Column(name = "part_number", length = 64)
    private String partNumber;

    @Column(name = "tenant_id", length = 64)
    private String tenantId;

    @Column(name = "branch_id", length = 64)
    private String branchId;

    @OneToMany(mappedBy = "vehicle", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.EAGER)
    @Builder.Default
    private List<VehicleImageEntity> images = new ArrayList<>();

    @OneToMany(mappedBy = "vehicle", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @Builder.Default
    private List<VehicleDocumentEntity> documents = new ArrayList<>();

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;
}
