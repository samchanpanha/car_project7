package com.khlan.service;

import com.khlan.dto.MetaDTO;
import com.khlan.entity.SellerProfileEntity;
import com.khlan.entity.UserEntity;
import com.khlan.repository.SellerProfileRepository;
import com.khlan.repository.UserRepository;
import com.khlan.repository.VehicleRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

@Slf4j
@Service
@RequiredArgsConstructor
public class MetaService {

    private final VehicleRepository vehicleRepository;
    private final UserRepository userRepository;
    private final SellerProfileRepository sellerProfileRepository;

    @Transactional(readOnly = true)
    public MetaDTO getMetadata() {
        List<String> makes = vehicleRepository.findDistinctMakes();
        List<String> cities = vehicleRepository.findDistinctCities();

        List<Object[]> priceAgg = vehicleRepository.findPriceMinMax();
        double priceMin = 1000.0;
        double priceMax = 100000.0;
        if (!priceAgg.isEmpty() && priceAgg.get(0) != null) {
            Object[] row = priceAgg.get(0);
            if (row[0] instanceof Number min) priceMin = min.doubleValue();
            if (row[1] instanceof Number max) priceMax = max.doubleValue();
        }

        List<Object[]> yearAgg = vehicleRepository.findYearMinMax();
        int yearMin = 2000;
        int yearMax = 2026;
        if (!yearAgg.isEmpty() && yearAgg.get(0) != null) {
            Object[] row = yearAgg.get(0);
            if (row[0] instanceof Number min) yearMin = min.intValue();
            if (row[1] instanceof Number max) yearMax = max.intValue();
        }

        // Active sellers
        List<UserEntity> users = userRepository.findAll();
        List<MetaDTO.SellerMetaDTO> sellers = new ArrayList<>();

        for (UserEntity u : users) {
            long count = vehicleRepository.countBySellerIdAndStatus(u.getId(), "PUBLISHED");
            if (count > 0) {
                Optional<SellerProfileEntity> profile = sellerProfileRepository.findByUserId(u.getId());
                sellers.add(MetaDTO.SellerMetaDTO.builder()
                        .id(u.getId())
                        .name(u.getName())
                        .shopName(profile.map(SellerProfileEntity::getShopName).orElse(null))
                        .type(profile.map(p -> "DEALER".equals(p.getType()) ? "DEALER" : "PRIVATE").orElse("PRIVATE"))
                        .verified(profile.map(p -> Boolean.TRUE.equals(p.getVerified())).orElse(false))
                        .count(count)
                        .build());
            }
        }

        sellers.sort((a, b) -> Long.compare(b.getCount(), a.getCount()));

        return MetaDTO.builder()
                .makes(makes != null ? makes : List.of())
                .cities(cities != null && !cities.isEmpty() ? cities : List.of("Phnom Penh", "Siem Reap", "Battambang", "Sihanoukville"))
                .bodyTypes(List.of("SUV", "SEDAN", "PICKUP", "HATCHBACK", "VAN", "COUPE"))
                .fuelTypes(List.of("PETROL", "DIESEL", "HYBRID", "ELECTRIC"))
                .transmissions(List.of("AUTOMATIC", "MANUAL"))
                .priceMin(priceMin)
                .priceMax(priceMax)
                .yearMin(yearMin)
                .yearMax(yearMax)
                .sellers(sellers)
                .build();
    }
}
