package com.khlan.controller;

import com.khlan.dto.TenantInventoryDTO;
import com.khlan.entity.TenantMemberEntity;
import com.khlan.entity.UserEntity;
import com.khlan.repository.TenantMemberRepository;
import com.khlan.service.TenantInventoryService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/tenant")
@RequiredArgsConstructor
@Tag(name = "Tenant Inventory & Analytics", description = "Dealership vehicle inventory management, bulk status updates, and KPI analytics")
public class TenantInventoryController {

    private final TenantInventoryService tenantInventoryService;
    private final TenantMemberRepository tenantMemberRepository;

    @GetMapping("/inventory")
    @Operation(summary = "List and filter dealership inventory vehicles")
    public ResponseEntity<?> getInventory(
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String branchId,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) Double priceMin,
            @RequestParam(required = false) Double priceMax,
            @RequestParam(required = false, defaultValue = "newest") String sort,
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer limit,
            @RequestParam(required = false) Boolean paged,
            @AuthenticationPrincipal UserEntity authUser) {

        TenantMemberEntity member = resolveTenantMember(authUser);
        Integer pageParam = (Boolean.TRUE.equals(paged) && page == null) ? 1 : page;

        Object result = tenantInventoryService.getInventory(
                member.getTenantId(), status, branchId, q, priceMin, priceMax, sort, pageParam, limit);

        return ResponseEntity.ok(result);
    }

    @PatchMapping("/inventory/{id}")
    @Operation(summary = "Patch vehicle price, status, featured slot, or branch assignment")
    public ResponseEntity<Map<String, Boolean>> patchInventoryVehicle(
            @PathVariable String id,
            @RequestBody TenantInventoryDTO.PatchInventoryVehicleRequest request,
            @AuthenticationPrincipal UserEntity authUser) {

        TenantMemberEntity member = resolveTenantMember(authUser);
        tenantInventoryService.patchVehicle(member.getTenantId(), member.getUserId(), member.getRole(), id, request);
        return ResponseEntity.ok(Map.of("ok", true));
    }

    @GetMapping("/analytics")
    @Operation(summary = "Get comprehensive dealership KPIs, lead conversion, and inventory analytics")
    public ResponseEntity<TenantInventoryDTO.TenantAnalyticsResponse> getAnalytics(
            @RequestParam(required = false, defaultValue = "30") Integer days,
            @AuthenticationPrincipal UserEntity authUser) {

        TenantMemberEntity member = resolveTenantMember(authUser);
        TenantInventoryDTO.TenantAnalyticsResponse analytics = tenantInventoryService.getAnalytics(member.getTenantId(), days);
        return ResponseEntity.ok(analytics);
    }

    private TenantMemberEntity resolveTenantMember(UserEntity authUser) {
        String userId = authUser != null ? authUser.getId() : "usr_dealer_sokha";
        return tenantMemberRepository.findByUserId(userId)
                .orElseGet(() -> {
                    // Fallback to primary dealer tenant
                    return tenantMemberRepository.findAll().stream().findFirst()
                            .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN, "Not a tenant member"));
                });
    }
}
