package com.khlan.controller;

import com.khlan.dto.AdminDTO;
import com.khlan.dto.TelegramDTO;
import com.khlan.entity.UserEntity;
import com.khlan.service.AdminService;
import com.khlan.service.TelegramService;
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
    private final TelegramService telegramService;

    @GetMapping("/api/admin/overview")
    public ResponseEntity<AdminDTO.AdminOverviewDTO> getOverview(@AuthenticationPrincipal UserEntity user) {
        adminService.requireAdmin(user);
        return ResponseEntity.ok(adminService.getOverview());
    }

    @GetMapping("/api/admin/users")
    public ResponseEntity<AdminDTO.PagedUsersDTO> listUsers(
            @AuthenticationPrincipal UserEntity user,
            @RequestParam(name = "page", defaultValue = "0") int page,
            @RequestParam(name = "size", defaultValue = "20") int size
    ) {
        adminService.requireAdmin(user);
        return ResponseEntity.ok(adminService.listUsers(page, size));
    }

    @GetMapping("/api/admin/users/{id}")
    public ResponseEntity<AdminDTO.AdminUserDTO> getUser(
            @AuthenticationPrincipal UserEntity user,
            @PathVariable("id") String id
    ) {
        adminService.requireAdmin(user);
        List<AdminDTO.AdminUserDTO> all = adminService.listUsers();
        return all.stream().filter(u -> u.getId().equals(id)).findFirst()
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PatchMapping("/api/admin/users/{id}")
    public ResponseEntity<AdminDTO.AdminUserDTO> updateUser(
            @AuthenticationPrincipal UserEntity user,
            @PathVariable("id") String id,
            @RequestBody AdminDTO.UpdateUserRequest req
    ) {
        adminService.requireAdmin(user);
        return ResponseEntity.ok(adminService.updateUser(user.getId(), id, req));
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

    @GetMapping("/api/admin/tenants/{id}")
    public ResponseEntity<AdminDTO.AdminTenantDTO> getTenant(
            @AuthenticationPrincipal UserEntity user,
            @PathVariable("id") String id
    ) {
        adminService.requireAdmin(user);
        return adminService.listTenants().stream().filter(t -> t.getId().equals(id)).findFirst()
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PatchMapping("/api/admin/tenants/{id}")
    public ResponseEntity<AdminDTO.AdminTenantDTO> updateTenant(
            @AuthenticationPrincipal UserEntity user,
            @PathVariable("id") String id,
            @RequestBody AdminDTO.UpdateTenantRequest req
    ) {
        adminService.requireAdmin(user);
        return ResponseEntity.ok(adminService.updateTenant(user.getId(), id, req));
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

    // ── Platform Settings ──────────────────────────────────────────────────────

    @GetMapping({"/api/admin/settings", "/api/platform-settings"})
    public ResponseEntity<AdminDTO.PlatformSettingsDTO> getSettings() {
        return ResponseEntity.ok(adminService.getPlatformSettings());
    }

    @PutMapping({"/api/admin/settings", "/api/platform-settings"})
    public ResponseEntity<AdminDTO.PlatformSettingsDTO> updateSettings(
            @AuthenticationPrincipal UserEntity user,
            @RequestBody AdminDTO.PlatformSettingsUpdateRequest req
    ) {
        adminService.requireAdmin(user);
        return ResponseEntity.ok(adminService.updatePlatformSettings(user.getId(), req));
    }

    @PatchMapping("/api/admin/settings")
    public ResponseEntity<AdminDTO.PlatformSettingsDTO> patchSettings(
            @AuthenticationPrincipal UserEntity user,
            @RequestBody AdminDTO.PlatformSettingsUpdateRequest req
    ) {
        adminService.requireAdmin(user);
        return ResponseEntity.ok(adminService.updatePlatformSettings(user.getId(), req));
    }

    // ── Storage ────────────────────────────────────────────────────────────────

    @GetMapping("/api/admin/storage/status")
    public ResponseEntity<Map<String, Object>> getStorageStatus(@AuthenticationPrincipal UserEntity user) {
        adminService.requireAdmin(user);
        return ResponseEntity.ok(adminService.getStorageStatus());
    }

    @PostMapping("/api/admin/storage/test-connection")
    public ResponseEntity<Map<String, Object>> testStorageConnection(@AuthenticationPrincipal UserEntity user) {
        adminService.requireAdmin(user);
        return ResponseEntity.ok(adminService.testStorageConnection());
    }

    @PostMapping("/api/admin/storage/sync-r2")
    public ResponseEntity<Map<String, Object>> syncR2(@AuthenticationPrincipal UserEntity user) {
        adminService.requireAdmin(user);
        return ResponseEntity.ok(adminService.syncR2Storage());
    }

    // ── Nacos ──────────────────────────────────────────────────────────────────

    @GetMapping("/api/admin/nacos/status")
    public ResponseEntity<Map<String, Object>> getNacosStatus(@AuthenticationPrincipal UserEntity user) {
        adminService.requireAdmin(user);
        return ResponseEntity.ok(adminService.getNacosStatus());
    }

    @PostMapping("/api/admin/nacos/sync")
    public ResponseEntity<Map<String, Object>> syncNacos(@AuthenticationPrincipal UserEntity user) {
        adminService.requireAdmin(user);
        return ResponseEntity.ok(adminService.syncNacosConfigs());
    }

    // ── Admin Telegram ─────────────────────────────────────────────────────────

    @GetMapping("/api/admin/telegram")
    public ResponseEntity<TelegramDTO.AdminTelegramConfigDTO> getAdminTelegram(@AuthenticationPrincipal UserEntity user) {
        adminService.requireAdmin(user);
        return ResponseEntity.ok(telegramService.getPlatformConfig());
    }

    @PutMapping("/api/admin/telegram")
    public ResponseEntity<TelegramDTO.AdminTelegramConfigDTO> updateAdminTelegram(
            @RequestBody TelegramDTO.AdminTelegramConfigDTO req,
            @AuthenticationPrincipal UserEntity user) {
        adminService.requireAdmin(user);
        String adminUserId = user != null ? user.getId() : "usr_admin_root";
        return ResponseEntity.ok(telegramService.updatePlatformConfig(req, adminUserId));
    }

    @PostMapping("/api/admin/telegram/test")
    public ResponseEntity<TelegramDTO.TelegramBotStatusDTO> testAdminTelegram(
            @RequestBody(required = false) TelegramDTO.TestBotRequest req,
            @AuthenticationPrincipal UserEntity user) {
        adminService.requireAdmin(user);
        String token = req != null ? req.getBotToken() : null;
        return ResponseEntity.ok(telegramService.testBotConnection(token));
    }
}

