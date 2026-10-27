package com.khlan.controller;

import com.khlan.dto.FavoriteDTO;
import com.khlan.entity.UserEntity;
import com.khlan.service.FavoriteService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/favorites")
@RequiredArgsConstructor
public class FavoriteController {

    private final FavoriteService favoriteService;

    @GetMapping
    public ResponseEntity<FavoriteDTO.FavoritesResponse> getFavorites(@AuthenticationPrincipal UserEntity user) {
        String userId = user != null ? user.getId() : "usr_demo_buyer";
        return ResponseEntity.ok(favoriteService.getFavorites(userId));
    }

    @PostMapping
    public ResponseEntity<Map<String, Object>> addFavorite(
            @AuthenticationPrincipal UserEntity user,
            @RequestBody FavoriteDTO.AddFavoriteRequest req
    ) {
        String userId = user != null ? user.getId() : null;
        boolean added = favoriteService.addFavorite(userId, req != null ? req.getVehicleId() : null);
        return ResponseEntity.ok(Map.of("ok", true, "favorited", added));
    }

    @DeleteMapping
    public ResponseEntity<Map<String, Object>> removeFavorite(
            @AuthenticationPrincipal UserEntity user,
            @RequestParam(name = "vehicleId", required = false) String paramVehicleId,
            @RequestBody(required = false) FavoriteDTO.AddFavoriteRequest bodyReq
    ) {
        String vehicleId = paramVehicleId != null && !paramVehicleId.isBlank()
                ? paramVehicleId
                : (bodyReq != null ? bodyReq.getVehicleId() : null);

        String userId = user != null ? user.getId() : null;
        favoriteService.removeFavorite(userId, vehicleId);
        return ResponseEntity.ok(Map.of("ok", true, "favorited", false));
    }
}
