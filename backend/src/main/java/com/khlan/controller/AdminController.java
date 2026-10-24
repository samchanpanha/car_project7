package com.khlan.controller;

import com.khlan.dto.AdminDTO;
import com.khlan.entity.UserEntity;
import com.khlan.service.AdminService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequiredArgsConstructor
public class AdminController {

    private final AdminService adminService;

    @GetMapping("/api/admin/overview")
    public ResponseEntity<AdminDTO.AdminOverviewDTO> getOverview(@AuthenticationPrincipal UserEntity user) {
        adminService.requireAdmin(user);
        return ResponseEntity.ok(adminService.getOverview());
    }

    @GetMapping("/api/admin/users")
    public ResponseEntity<List<AdminDTO.AdminUserDTO>> listUsers(@AuthenticationPrincipal UserEntity user) {
        adminService.requireAdmin(user);
        return ResponseEntity.ok(adminService.listUsers());
    }

    @GetMapping("/api/admin/vehicles")
    public ResponseEntity<List<Map<String, Object>>> listVehicles(
            @AuthenticationPrincipal UserEntity user,
            @RequestParam(name = "status", required = false) String status,
            @RequestParam(name = "q", required = false) String q
    ) {
        adminService.requireAdmin(user);
        return ResponseEntity.ok(adminService.listVehicles(status, q));
    }

    @PatchMapping("/api/admin/vehicles/{id}")
    public ResponseEntity<Map<String, Object>> updateVehicle(
            @AuthenticationPrincipal UserEntity user,
            @PathVariable("id") String id,
            @RequestBody Map<String, Object> req
    ) {
        adminService.requireAdmin(user);
        adminService.updateVehicleStatusOrFeatured(user.getId(), id, req);
        return ResponseEntity.ok(Map.of("ok", true));
    }

    @GetMapping("/api/admin/tenants")
    public ResponseEntity<List<AdminDTO.AdminTenantDTO>> listTenants(@AuthenticationPrincipal UserEntity user) {
        adminService.requireAdmin(user);
        return ResponseEntity.ok(adminService.listTenants());
    }

    @GetMapping("/api/admin/audit")
    public ResponseEntity<List<AdminDTO.AuditEntryDTO>> getAudit(
            @AuthenticationPrincipal UserEntity user,
            @RequestParam(name = "limit", defaultValue = "50") int limit
    ) {
        adminService.requireAdmin(user);
        return ResponseEntity.ok(adminService.getAuditLogs(limit));
    }

    @GetMapping("/api/admin/ai")
    public ResponseEntity<AdminDTO.AiStatsDTO> getAiStats(@AuthenticationPrincipal UserEntity user) {
        adminService.requireAdmin(user);
        return ResponseEntity.ok(adminService.getAiStats());
    }

    @GetMapping({"/api/admin/settings", "/api/platform-settings"})
    public ResponseEntity<AdminDTO.PlatformSettingsDTO> getSettings() {
        return ResponseEntity.ok(adminService.getPlatformSettings());
    }
}
