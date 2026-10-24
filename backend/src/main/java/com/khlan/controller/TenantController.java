package com.khlan.controller;

import com.khlan.dto.TenantDTO;
import com.khlan.entity.UserEntity;
import com.khlan.service.TenantService;
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
public class TenantController {

    private final TenantService tenantService;

    private String requireUserId(UserEntity user) {
        if (user == null || user.getId() == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Login required");
        }
        return user.getId();
    }

    @GetMapping("/api/tenant/me")
    public ResponseEntity<TenantDTO.TenantDashboardDTO> getDashboard(@AuthenticationPrincipal UserEntity user) {
        return ResponseEntity.ok(tenantService.getDashboard(requireUserId(user)));
    }

    @PatchMapping("/api/tenant/profile")
    public ResponseEntity<Map<String, Object>> patchProfile(
            @AuthenticationPrincipal UserEntity user,
            @RequestBody TenantDTO.UpdateTenantProfileRequest req
    ) {
        tenantService.updateProfile(requireUserId(user), req);
        return ResponseEntity.ok(Map.of("ok", true));
    }

    @PutMapping("/api/tenant/profile")
    public ResponseEntity<Map<String, Object>> putProfile(
            @AuthenticationPrincipal UserEntity user,
            @RequestBody TenantDTO.UpdateTenantProfileRequest req
    ) {
        tenantService.updateProfile(requireUserId(user), req);
        return ResponseEntity.ok(Map.of("ok", true));
    }

    @GetMapping("/api/tenant/branches")
    public ResponseEntity<Map<String, Object>> getBranches(@AuthenticationPrincipal UserEntity user) {
        return ResponseEntity.ok(tenantService.getBranches(requireUserId(user)));
    }

    @PostMapping("/api/tenant/branches")
    public ResponseEntity<Map<String, Object>> createBranch(
            @AuthenticationPrincipal UserEntity user,
            @RequestBody TenantDTO.CreateBranchRequest req
    ) {
        TenantDTO.TenantBranchDTO created = tenantService.createBranch(requireUserId(user), req);
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("branch", created));
    }

    @DeleteMapping("/api/tenant/branches/{id}")
    public ResponseEntity<Map<String, Object>> deleteBranch(
            @AuthenticationPrincipal UserEntity user,
            @PathVariable("id") String id
    ) {
        tenantService.deleteBranch(requireUserId(user), id);
        return ResponseEntity.ok(Map.of("ok", true));
    }

    @GetMapping("/api/tenant/staff")
    public ResponseEntity<List<TenantDTO.TenantMemberDTO>> getStaff(@AuthenticationPrincipal UserEntity user) {
        return ResponseEntity.ok(tenantService.getStaff(requireUserId(user)));
    }

    @PostMapping("/api/tenant/staff")
    public ResponseEntity<TenantDTO.TenantMemberDTO> inviteStaff(
            @AuthenticationPrincipal UserEntity user,
            @RequestBody TenantDTO.InviteStaffRequest req
    ) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(tenantService.inviteStaff(requireUserId(user), req));
    }

    @GetMapping("/api/tenant/leads")
    public ResponseEntity<List<TenantDTO.TenantLeadDTO>> getLeads(@AuthenticationPrincipal UserEntity user) {
        return ResponseEntity.ok(tenantService.getLeads(requireUserId(user)));
    }

    @GetMapping({"/api/tenant/subscription", "/api/seller/subscription"})
    public ResponseEntity<TenantDTO.TenantSubscriptionDTO> getSubscription(@AuthenticationPrincipal UserEntity user) {
        TenantDTO.TenantDashboardDTO dashboard = tenantService.getDashboard(requireUserId(user));
        return ResponseEntity.ok(dashboard.getSubscription());
    }

    @GetMapping("/api/sellers/{id}")
    public ResponseEntity<TenantDTO.PublicSellerDTO> getPublicSeller(@PathVariable("id") String id) {
        return ResponseEntity.ok(tenantService.getPublicSeller(id));
    }
}
