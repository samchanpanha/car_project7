package com.khlan.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

public class FavoriteDTO {

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class FavoritesResponse {
        private List<String> vehicleIds;
        private List<FavoriteItem> favorites;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class FavoriteItem {
        private String vehicleId;
        private String addedAt;
        private VehicleDTO.VehicleCardDTO vehicle;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class AddFavoriteRequest {
        private String vehicleId;
    }
}
