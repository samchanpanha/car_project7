package com.khlan.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MetaDTO {

    private List<String> makes;
    private List<String> cities;
    private List<String> bodyTypes;
    private List<String> fuelTypes;
    private List<String> transmissions;
    private double priceMin;
    private double priceMax;
    private int yearMin;
    private int yearMax;
    private List<SellerMetaDTO> sellers;

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class SellerMetaDTO {
        private String id;
        private String name;
        private String shopName;
        private String type; // "DEALER" | "PRIVATE"
        private boolean verified;
        private long count;
    }
}
