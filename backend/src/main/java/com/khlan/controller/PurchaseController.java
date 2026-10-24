package com.khlan.controller;

import com.khlan.dto.PurchaseDTO;
import com.khlan.entity.UserEntity;
import com.khlan.service.PurchaseService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;

@RestController
@RequiredArgsConstructor
public class PurchaseController {

    private final PurchaseService purchaseService;

    private String requireUserId(UserEntity user) {
        if (user == null || user.getId() == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Login required");
        }
        return user.getId();
    }

    @PostMapping("/api/purchases")
    public ResponseEntity<Map<String, Object>> submitPurchase(
            @AuthenticationPrincipal UserEntity user,
            @RequestBody PurchaseDTO.CreatePurchaseRequest req
    ) {
        String id = purchaseService.submitPurchaseRequest(requireUserId(user), req);
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("ok", true, "id", id));
    }

    @GetMapping("/api/account/purchases")
    public ResponseEntity<List<PurchaseDTO.PurchaseRequestDTO>> getBuyerPurchases(@AuthenticationPrincipal UserEntity user) {
        String userId = user != null ? user.getId() : null;
        return ResponseEntity.ok(purchaseService.getBuyerPurchases(userId));
    }

    @GetMapping({"/api/tenant/purchase-requests", "/api/seller/purchase-requests"})
    public ResponseEntity<List<PurchaseDTO.PurchaseRequestDTO>> getTenantPurchases(@AuthenticationPrincipal UserEntity user) {
        return ResponseEntity.ok(purchaseService.getTenantPurchases(requireUserId(user)));
    }

    @PatchMapping({"/api/tenant/purchase-requests/{id}", "/api/seller/purchase-requests/{id}"})
    public ResponseEntity<Map<String, Object>> updatePurchaseStatus(
            @AuthenticationPrincipal UserEntity user,
            @PathVariable("id") String id,
            @RequestBody PurchaseDTO.UpdatePurchaseStatusRequest req
    ) {
        String action = req != null && req.getAction() != null ? req.getAction() : "accept";
        String status = purchaseService.transitionPurchase(requireUserId(user), id, action);
        return ResponseEntity.ok(Map.of("ok", true, "status", status));
    }
}
