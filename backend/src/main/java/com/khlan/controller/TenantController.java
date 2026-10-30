package com.khlan.controller;

import com.khlan.dto.AdminDTO;
import com.khlan.dto.PlanDTO;
import com.khlan.dto.TenantDTO;
import com.khlan.entity.UserEntity;
import com.khlan.repository.UserRepository;
import com.khlan.service.AdminService;
import com.khlan.service.PlanAdminService;
import com.khlan.service.TenantService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequiredArgsConstructor
public class TenantController {

    private final TenantService tenantService;
    private final PlanAdminService planAdminService;
    private final AdminService adminService;
    private final UserRepository userRepository;

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

    @GetMapping("/api/tenant/dashboard")
    public ResponseEntity<TenantDTO.TenantDashboardDTO> getDashboardAlt(@AuthenticationPrincipal UserEntity user) {
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

    @RequestMapping(value = "/api/tenant/branches/{id}", method = {RequestMethod.PUT, RequestMethod.PATCH})
    public ResponseEntity<Map<String, Object>> updateBranch(
            @AuthenticationPrincipal UserEntity user,
            @PathVariable("id") String id,
            @RequestBody TenantDTO.UpdateBranchRequest req
    ) {
        TenantDTO.TenantBranchDTO updated = tenantService.updateBranch(requireUserId(user), id, req);
        return ResponseEntity.ok(Map.of("ok", true, "branch", updated));
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
    public ResponseEntity<TenantDTO.TenantStaffResponseDTO> getStaff(@AuthenticationPrincipal UserEntity user) {
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

    @PatchMapping("/api/tenant/staff/{id}")
    public ResponseEntity<Map<String, Object>> updateStaff(
            @AuthenticationPrincipal UserEntity user,
            @PathVariable("id") String id,
            @RequestBody TenantDTO.UpdateStaffRequest req
    ) {
        TenantDTO.TenantMemberDTO updated = tenantService.updateStaff(requireUserId(user), id, req);
        return ResponseEntity.ok(Map.of("ok", true, "member", updated));
    }

    @DeleteMapping("/api/tenant/staff/{id}")
    public ResponseEntity<Map<String, Object>> deleteStaff(
            @AuthenticationPrincipal UserEntity user,
            @PathVariable("id") String id
    ) {
        tenantService.removeStaff(requireUserId(user), id);
        return ResponseEntity.ok(Map.of("ok", true));
    }

    @GetMapping("/api/tenant/leads")
    public ResponseEntity<List<TenantDTO.TenantLeadDTO>> getLeads(@AuthenticationPrincipal UserEntity user) {
        return ResponseEntity.ok(tenantService.getLeads(requireUserId(user)));
    }

    @GetMapping("/api/tenant/subscription")
    public ResponseEntity<Map<String, Object>> getTenantSubscription(@AuthenticationPrincipal UserEntity user) {
        String userId = requireUserId(user);
        TenantDTO.TenantDashboardDTO dashboard = tenantService.getDashboard(userId);
        PlanDTO.PlanPricingResponse pricing = planAdminService.getPlanPricing();
        List<Object> plansList = new ArrayList<>();
        if (pricing != null && pricing.getPlans() != null) {
            pricing.getPlans().forEach((planKey, planDef) -> {
                Map<String, Object> p = new LinkedHashMap<>();
                p.put("plan", planKey);
                p.put("name", planDef.getName() != null ? planDef.getName() : planKey);
                p.put("priceUsdMonthly", planDef.getPriceUsdMonthly() != null ? planDef.getPriceUsdMonthly() : 0.0);
                p.put("priceUsdYearly", planDef.getPriceUsdYearly() != null ? planDef.getPriceUsdYearly() : 0.0);
                p.put("priceKhrMonthly", planDef.getPriceKhrMonthly() != null ? planDef.getPriceKhrMonthly() : 0.0);
                p.put("priceKhrYearly", planDef.getPriceKhrYearly() != null ? planDef.getPriceKhrYearly() : 0.0);
                p.put("listingsLimit", planDef.getListingsLimit() != null ? planDef.getListingsLimit() : 10);
                p.put("featuredLimit", planDef.getFeaturedLimit() != null ? planDef.getFeaturedLimit() : 0);
                p.put("seats", planDef.getSeats() != null ? planDef.getSeats() : 1);
                p.put("highlight", "PRO".equalsIgnoreCase(planKey));
                p.put("features", planDef.getFeatures() != null ? planDef.getFeatures() : List.of());
                plansList.add(p);
            });
        }
        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("subscription", dashboard.getSubscription());
        resp.put("plans", plansList);
        resp.put("freePlanEnabled", true);
        resp.put("paymentsEnabled", true);
        return ResponseEntity.ok(resp);
    }

    @PostMapping("/api/tenant/subscription")
    public ResponseEntity<Map<String, Object>> changeSubscription(
            @AuthenticationPrincipal UserEntity user,
            @RequestBody Map<String, Object> req
    ) {
        String userId = requireUserId(user);
        tenantService.downgradeOrSetFreeSubscription(userId);
        TenantDTO.TenantDashboardDTO dashboard = tenantService.getDashboard(userId);
        return ResponseEntity.ok(Map.of("subscription", dashboard.getSubscription() != null ? dashboard.getSubscription() : Map.of()));
    }

    @GetMapping("/api/seller/subscription")
    public ResponseEntity<Map<String, Object>> getSellerSubscription(@AuthenticationPrincipal UserEntity user) {
        String userId = user != null ? user.getId() : "usr_demo_buyer";

        // If the user owns an active paid tenant subscription, prefer it over the
        // (possibly expired) account-level free trial so paid customers never
        // see a stale "expired free trial" card after renewing/upgrading.
        try {
            TenantDTO.TenantDashboardDTO dashboard = tenantService.getDashboard(userId);
            TenantDTO.TenantSubscriptionDTO paidSub = dashboard != null ? dashboard.getSubscription() : null;
            if (paidSub != null && "ACTIVE".equalsIgnoreCase(paidSub.getStatus())
                    && paidSub.getPlan() != null && !"FREE".equalsIgnoreCase(paidSub.getPlan())) {
                OffsetDateTime paidPeriodEnd;
                try { paidPeriodEnd = OffsetDateTime.parse(paidSub.getCurrentPeriodEnd()); }
                catch (Exception ignored) { paidPeriodEnd = OffsetDateTime.now().plusDays(30); }
                long paidDaysLeft = Math.max(0, java.time.temporal.ChronoUnit.DAYS.between(OffsetDateTime.now(), paidPeriodEnd));
                return ResponseEntity.ok(Map.of(
                        "plan", paidSub.getPlan(),
                        "status", "ACTIVE",
                        "startedAt", OffsetDateTime.now().toString(),
                        "currentPeriodEnd", paidPeriodEnd.toString(),
                        "daysLeft", paidDaysLeft,
                        "freeTrialDays", 0,
                        "freeTrialEnabled", false
                ));
            }
        } catch (Exception ignored) {
            // fall back to virtual free-trial below
        }

        AdminDTO.PlatformSettingsDTO settings = adminService.getPlatformSettings();
        int freeTrialDays = settings.getFreeTrialDays() > 0 ? settings.getFreeTrialDays() : 30;
        boolean freeTrialEnabled = settings.isFreeTrialEnabled();

        UserEntity u = userRepository.findById(userId).orElse(null);
        OffsetDateTime startedAt = u != null && u.getCreatedAt() != null ? u.getCreatedAt() : OffsetDateTime.now().minusDays(1);
        OffsetDateTime periodEnd = startedAt.plusDays(freeTrialDays);
        long daysLeft = Math.max(0, java.time.temporal.ChronoUnit.DAYS.between(OffsetDateTime.now(), periodEnd));
        boolean active = freeTrialEnabled && daysLeft > 0;

        return ResponseEntity.ok(Map.of(
                "plan", "FREE_TRIAL",
                "status", active ? "ACTIVE" : "EXPIRED",
                "startedAt", startedAt.toString(),
                "currentPeriodEnd", periodEnd.toString(),
                "daysLeft", daysLeft,
                "freeTrialDays", freeTrialDays,
                "freeTrialEnabled", freeTrialEnabled
        ));
    }

    @GetMapping("/api/sellers/{id}")
    public ResponseEntity<TenantDTO.PublicSellerDTO> getPublicSeller(@PathVariable("id") String id) {
        return ResponseEntity.ok(tenantService.getPublicSeller(id));
    }
}
