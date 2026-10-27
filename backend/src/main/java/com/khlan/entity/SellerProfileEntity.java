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

@Entity
@Table(name = "seller_profiles")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SellerProfileEntity {

    @Id
    @Column(length = 64)
    private String id;

    @Column(name = "user_id", nullable = false, unique = true, length = 64)
    private String userId;

    @Column(nullable = false, length = 32)
    @Builder.Default
    private String type = "PRIVATE";

    @Column(name = "shop_name", length = 128)
    private String shopName;

    @Column(columnDefinition = "TEXT")
    private String bio;

    @Column(name = "bio_km", columnDefinition = "TEXT")
    private String bioKm;

    @Column(nullable = false, length = 64)
    @Builder.Default
    private String city = "Phnom Penh";

    @Column(columnDefinition = "TEXT")
    private String address;

    @Column(nullable = false)
    @Builder.Default
    private Boolean verified = false;

    @Column(nullable = false, length = 32)
    @Builder.Default
    private String verification = "UNVERIFIED";

    @Column(name = "response_rate", nullable = false)
    @Builder.Default
    private Integer responseRate = 0;

    @Column(name = "rating_avg", nullable = false)
    @Builder.Default
    private Double ratingAvg = 0.0;

    @Column(name = "rating_count", nullable = false)
    @Builder.Default
    private Integer ratingCount = 0;

    @Column(name = "member_since", nullable = false)
    @Builder.Default
    private OffsetDateTime memberSince = OffsetDateTime.now();

    @Column(name = "logo_url")
    private String logoUrl;

    @Column(length = 32)
    private String phone;

    @Column(length = 64)
    private String telegram;

    @Column(name = "tg_mini_app_url")
    private String tgMiniAppUrl;

    @Column(name = "tg_channel_url")
    private String tgChannelUrl;

    @Column(name = "tg_group_url")
    private String tgGroupUrl;

    @Column(name = "tg_chat_id", length = 64)
    private String tgChatId;

    @Column(name = "invite_code", unique = true, length = 64)
    private String inviteCode;

    @Column(name = "tenant_id", length = 64)
    private String tenantId;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;
}
