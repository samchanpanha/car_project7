package com.khlan.service;

import com.khlan.dto.FavoriteDTO;
import com.khlan.entity.FavoriteEntity;
import com.khlan.entity.VehicleEntity;
import com.khlan.repository.FavoriteRepository;
import com.khlan.repository.VehicleRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class FavoriteService {

    private final FavoriteRepository favoriteRepository;
    private final VehicleRepository vehicleRepository;
    private final VehicleService vehicleService;

    @Transactional(readOnly = true)
    public FavoriteDTO.FavoritesResponse getFavorites(String userId) {
        if (userId == null || userId.isBlank()) {
            return FavoriteDTO.FavoritesResponse.builder()
                    .vehicleIds(List.of())
                    .favorites(List.of())
                    .build();
        }

        List<FavoriteEntity> rows = favoriteRepository.findByUserIdOrderByCreatedAtDesc(userId);
        List<String> vehicleIds = new ArrayList<>();
        List<FavoriteDTO.FavoriteItem> favorites = new ArrayList<>();

        for (FavoriteEntity row : rows) {
            vehicleIds.add(row.getVehicleId());
            VehicleEntity vehicle = row.getVehicle();
            if (vehicle != null) {
                favorites.add(FavoriteDTO.FavoriteItem.builder()
                        .vehicleId(row.getVehicleId())
                        .addedAt(row.getCreatedAt() != null ? row.getCreatedAt().toString() : OffsetDateTime.now().toString())
                        .vehicle(vehicleService.toCardDTO(vehicle))
                        .build());
            }
        }

        return FavoriteDTO.FavoritesResponse.builder()
                .vehicleIds(vehicleIds)
                .favorites(favorites)
                .build();
    }

    @Transactional
    public boolean addFavorite(String userId, String vehicleId) {
        if (userId == null || userId.isBlank()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Login required to save favorites");
        }
        if (vehicleId == null || vehicleId.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "vehicleId is required");
        }

        VehicleEntity vehicle = vehicleRepository.findById(vehicleId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Vehicle not found"));

        if (!favoriteRepository.existsByUserIdAndVehicleId(userId, vehicle.getId())) {
            String favId = "fav_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16);
            FavoriteEntity fav = FavoriteEntity.builder()
                    .id(favId)
                    .userId(userId)
                    .vehicleId(vehicle.getId())
                    .createdAt(OffsetDateTime.now())
                    .build();
            favoriteRepository.save(fav);
        }

        return true;
    }

    @Transactional
    public boolean removeFavorite(String userId, String vehicleId) {
        if (userId == null || userId.isBlank()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Login required");
        }
        if (vehicleId == null || vehicleId.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "vehicleId query param is required");
        }

        favoriteRepository.deleteByUserIdAndVehicleId(userId, vehicleId);
        return true;
    }
}
