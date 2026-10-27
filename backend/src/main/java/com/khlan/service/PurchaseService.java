package com.khlan.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.khlan.dto.PurchaseDTO;
import com.khlan.entity.*;
import com.khlan.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.OffsetDateTime;
import java.util.*;

@Slf4j
@Service
@RequiredArgsConstructor
public class PurchaseService {

    private final PurchaseRequestRepository purchaseRequestRepository;
    private final VehicleRepository vehicleRepository;
    private final UserRepository userRepository;
    private final TenantRepository tenantRepository;
    private final TenantMemberRepository tenantMemberRepository;
    private final AuditLogRepository auditLogRepository;
    private final ObjectMapper objectMapper;

    @Transactional
    public String submitPurchaseRequest(String userId, PurchaseDTO.CreatePurchaseRequest req) {
        if (userId == null || userId.isBlank()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Login required to request a purchase");
        }
        if (req == null || req.getVehicleId() == null || req.getVehicleId().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "vehicleId is required");
        }

        VehicleEntity vehicle = vehicleRepository.findById(req.getVehicleId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Vehicle not found"));

        if (!"PUBLISHED".equals(vehicle.getStatus())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This listing is not open for purchase requests");
        }
        if (userId.equals(vehicle.getSellerId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "You cannot buy your own listing");
        }

        Optional<PurchaseRequestEntity> existing = purchaseRequestRepository.findByVehicleIdAndBuyerIdAndStatusIn(
                vehicle.getId(), userId, List.of("PENDING", "ACCEPTED")
        );
        if (existing.isPresent()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "You already have an active request for this vehicle");
        }

        String purchaseId = "prq_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16);
        PurchaseRequestEntity pr = PurchaseRequestEntity.builder()
                .id(purchaseId)
                .vehicleId(vehicle.getId())
                .buyerId(userId)
                .tenantId(vehicle.getTenantId())
                .sellerUserId(vehicle.getSellerId())
                .priceUsd(vehicle.getPriceUsd())
                .message(req.getMessage())
                .status("PENDING")
                .createdAt(OffsetDateTime.now())
                .updatedAt(OffsetDateTime.now())
                .build();

        purchaseRequestRepository.save(pr);

        // Audit Log
        try {
            String auditId = "aud_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16);
            AuditLogEntity audit = AuditLogEntity.builder()
                    .id(auditId)
                    .actorId(userId)
                    .action("PURCHASE_REQUESTED")
                    .entity("PurchaseRequest")
                    .entityId(purchaseId)
                    .metaJson(objectMapper.writeValueAsString(Map.of(
                            "vehicleId", vehicle.getId(),
                            "priceUsd", vehicle.getPriceUsd(),
                            "tenantId", vehicle.getTenantId() != null ? vehicle.getTenantId() : ""
                    )))
                    .createdAt(OffsetDateTime.now())
                    .build();
            auditLogRepository.save(audit);
        } catch (Exception ignored) {}

        return purchaseId;
    }

    @Transactional(readOnly = true)
    public List<PurchaseDTO.PurchaseRequestDTO> getBuyerPurchases(String userId) {
        if (userId == null || userId.isBlank()) return List.of();

        List<PurchaseRequestEntity> rows = purchaseRequestRepository.findByBuyerIdOrderByCreatedAtDesc(userId);
        List<PurchaseDTO.PurchaseRequestDTO> result = new ArrayList<>();

        for (PurchaseRequestEntity r : rows) {
            Optional<VehicleEntity> vOpt = vehicleRepository.findById(r.getVehicleId());
            if (vOpt.isEmpty()) continue;
            VehicleEntity v = vOpt.get();

            String sellerName = "Seller";
            if (r.getTenantId() != null) {
                sellerName = tenantRepository.findById(r.getTenantId()).map(TenantEntity::getName).orElse("Dealership");
            } else {
                sellerName = userRepository.findById(r.getSellerUserId()).map(UserEntity::getName).orElse("Seller");
            }

            String thumb = (v.getImages() != null && !v.getImages().isEmpty()) ? v.getImages().get(0).getUrl() : null;

            result.add(PurchaseDTO.PurchaseRequestDTO.builder()
                    .id(r.getId())
                    .vehicleId(r.getVehicleId())
                    .vehicle(PurchaseDTO.PurchaseVehicleDTO.builder()
                            .id(v.getId())
                            .make(v.getMake())
                            .model(v.getModel())
                            .year(v.getYear())
                            .thumbnail(thumb)
                            .build())
                    .buyerId(r.getBuyerId())
                    .buyerName(userRepository.findById(r.getBuyerId()).map(UserEntity::getName).orElse("Buyer"))
                    .tenantId(r.getTenantId())
                    .sellerName(sellerName)
                    .status(r.getStatus())
                    .message(r.getMessage())
                    .priceUsd(r.getPriceUsd())
                    .createdAt(r.getCreatedAt() != null ? r.getCreatedAt().toString() : null)
                    .updatedAt(r.getUpdatedAt() != null ? r.getUpdatedAt().toString() : null)
                    .build());
        }

        return result;
    }

    @Transactional(readOnly = true)
    public List<PurchaseDTO.PurchaseRequestDTO> getTenantPurchases(String userId) {
        TenantMemberEntity member = tenantMemberRepository.findFirstByUserIdAndStatus(userId, "ACTIVE")
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN, "Forbidden"));

        List<PurchaseRequestEntity> rows = purchaseRequestRepository.findByTenantIdOrderByCreatedAtDesc(member.getTenantId());
        TenantEntity tenant = tenantRepository.findById(member.getTenantId()).orElse(null);
        String tenantName = tenant != null ? tenant.getName() : "Dealership";

        List<PurchaseDTO.PurchaseRequestDTO> result = new ArrayList<>();
        for (PurchaseRequestEntity r : rows) {
            Optional<VehicleEntity> vOpt = vehicleRepository.findById(r.getVehicleId());
            if (vOpt.isEmpty()) continue;
            VehicleEntity v = vOpt.get();

            String thumb = (v.getImages() != null && !v.getImages().isEmpty()) ? v.getImages().get(0).getUrl() : null;
            String buyerName = userRepository.findById(r.getBuyerId()).map(UserEntity::getName).orElse("Buyer");

            result.add(PurchaseDTO.PurchaseRequestDTO.builder()
                    .id(r.getId())
                    .vehicleId(r.getVehicleId())
                    .vehicle(PurchaseDTO.PurchaseVehicleDTO.builder()
                            .id(v.getId())
                            .make(v.getMake())
                            .model(v.getModel())
                            .year(v.getYear())
                            .thumbnail(thumb)
                            .build())
                    .buyerId(r.getBuyerId())
                    .buyerName(buyerName)
                    .tenantId(r.getTenantId())
                    .sellerName(tenantName)
                    .status(r.getStatus())
                    .message(r.getMessage())
                    .priceUsd(r.getPriceUsd())
                    .createdAt(r.getCreatedAt() != null ? r.getCreatedAt().toString() : null)
                    .updatedAt(r.getUpdatedAt() != null ? r.getUpdatedAt().toString() : null)
                    .build());
        }

        return result;
    }

    @Transactional
    public String transitionPurchase(String userId, String id, String action) {
        TenantMemberEntity member = tenantMemberRepository.findFirstByUserIdAndStatus(userId, "ACTIVE")
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN, "Forbidden"));

        PurchaseRequestEntity pr = purchaseRequestRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Purchase request not found"));

        if (!member.getTenantId().equals(pr.getTenantId())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Purchase request not found in your dealership");
        }

        String nextStatus = switch (action.toLowerCase()) {
            case "accept" -> "ACCEPTED";
            case "reject" -> "REJECTED";
            case "complete" -> "COMPLETED";
            case "cancel" -> "CANCELLED";
            default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown action: " + action);
        };

        pr.setStatus(nextStatus);
        pr.setDecidedById(userId);
        pr.setDecidedAt(OffsetDateTime.now());
        pr.setUpdatedAt(OffsetDateTime.now());
        purchaseRequestRepository.save(pr);

        if ("COMPLETED".equals(nextStatus)) {
            vehicleRepository.findById(pr.getVehicleId()).ifPresent(v -> {
                v.setStatus("SOLD");
                vehicleRepository.save(v);
            });
        }

        return nextStatus;
    }

    @Transactional
    public void cancelBuyerPurchase(String buyerId, String id) {
        PurchaseRequestEntity pr = purchaseRequestRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Purchase request not found"));

        if (!pr.getBuyerId().equals(buyerId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Purchase request not found");
        }

        if (!"PENDING".equals(pr.getStatus())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "A " + pr.getStatus().toLowerCase() + " request can no longer be cancelled by the buyer");
        }

        pr.setStatus("CANCELLED");
        pr.setDecidedById(buyerId);
        pr.setDecidedAt(OffsetDateTime.now());
        pr.setUpdatedAt(OffsetDateTime.now());
        purchaseRequestRepository.save(pr);
    }
}
