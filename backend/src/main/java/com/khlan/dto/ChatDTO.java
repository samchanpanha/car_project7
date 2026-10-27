package com.khlan.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

public class ChatDTO {

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class ConversationListItemDTO {
        private String id;
        private ConversationVehicleDTO vehicle;
        private String sellerName;
        private String contactName;
        private String role;
        private String myRole;
        private MessageItemDTO lastMessage;
        private String updatedAt;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class ConversationVehicleDTO {
        private String id;
        private String make;
        private String model;
        private int year;
        private double priceUsd;
        private String thumbnail;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class MessageItemDTO {
        private String id;
        private String body;
        private boolean isMine;
        private boolean isSystem;
        private String createdAt;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class BuyerSummaryDTO {
        private String id;
        private String name;
        private String avatarUrl;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class ConversationDetailDTO {
        private String id;
        private ConversationVehicleDTO vehicle;
        private VehicleDTO.SellerSummaryDTO seller;
        private BuyerSummaryDTO buyer;
        private String myRole;
        private String contactName;
        private List<MessageItemDTO> messages;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class StartConversationRequest {
        private String vehicleId;
        private String message;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class SendMessageRequest {
        private String body;
    }
}
