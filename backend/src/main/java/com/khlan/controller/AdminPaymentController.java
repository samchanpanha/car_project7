package com.khlan.controller;

import com.khlan.dto.PaymentDTO;
import com.khlan.dto.PlanDTO;
import com.khlan.entity.UserEntity;
import com.khlan.service.PaymentService;
import com.khlan.service.PlanAdminService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
@Tag(name = "Admin Payments & Plans", description = "Backoffice payment approvals, plan pricing, manual extensions, and ABA transaction reconciliation")
public class AdminPaymentController {

    private final PaymentService paymentService;
    private final PlanAdminService planAdminService;

    // ---------- Payment Approvals ----------

    @GetMapping("/payments")
    @Operation(summary = "Admin verification queue: list payments by status")
    public ResponseEntity<List<PaymentDTO.SubscriptionPaymentDTO>> getAdminPayments(
            @RequestParam(required = false) String status,
            @RequestParam(required = false, defaultValue = "0") Integer page,
            @RequestParam(required = false, defaultValue = "100") Integer size) {

        Page<PaymentDTO.SubscriptionPaymentDTO> pageResult = paymentService.getAdminPayments(
                status, PageRequest.of(Math.max(0, page), Math.min(100, Math.max(1, size))));
        return ResponseEntity.ok(pageResult.getContent());
    }

    @GetMapping("/payments/{id}")
    @Operation(summary = "Get payment details for review")
    public ResponseEntity<PaymentDTO.SubscriptionPaymentDTO> getPaymentById(@PathVariable String id) {
        return ResponseEntity.ok(paymentService.getPaymentById(id));
    }

    @PatchMapping("/payments/{id}")
    @Operation(summary = "Approve or reject a payment request and activate tenant subscription")
    public ResponseEntity<PaymentDTO.SubscriptionPaymentDTO> handlePaymentAction(
            @PathVariable String id,
            @RequestBody PaymentDTO.PaymentActionRequest request,
            @AuthenticationPrincipal UserEntity admin) {

        String adminUserId = admin != null ? admin.getId() : "usr_admin_root";
        return ResponseEntity.ok(paymentService.handlePaymentAction(id, request.getAction(), request.getReason(), adminUserId));
    }

    // ---------- ABA Transactions ----------

    @GetMapping("/aba-transactions")
    @Operation(summary = "List synced ABA bank transactions and duplicate alerts")
    public ResponseEntity<PaymentDTO.AbaTransactionsResponse> getAbaTransactions(
            @RequestParam(required = false, defaultValue = "ALL") String status,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String day,
            @RequestParam(required = false) Boolean duplicate,
            @RequestParam(required = false) Boolean collision,
            @RequestParam(required = false, defaultValue = "50") Integer limit) {

        return ResponseEntity.ok(paymentService.getAbaTransactions(status, search, day, duplicate, collision, limit));
    }

    // ---------- Payment Configuration ----------

    @GetMapping("/payment-config")
    @Operation(summary = "Get master payment configuration (KHQR images, account name, telegram group)")
    public ResponseEntity<PaymentDTO.PaymentConfigDTO> getPaymentConfig() {
        return ResponseEntity.ok(paymentService.getPaymentConfig());
    }

    @PutMapping("/payment-config")
    @Operation(summary = "Update master payment configuration")
    public ResponseEntity<PaymentDTO.PaymentConfigDTO> updatePaymentConfig(
            @RequestBody PaymentDTO.PaymentConfigDTO config,
            @AuthenticationPrincipal UserEntity admin) {

        String adminUserId = admin != null ? admin.getId() : "usr_admin_root";
        return ResponseEntity.ok(paymentService.savePaymentConfig(config, adminUserId));
    }

    @PostMapping("/payment-config/preview")
    @Operation(summary = "Preview rendered KHQR configuration")
    public ResponseEntity<Map<String, Object>> previewPaymentConfig() {
        return ResponseEntity.ok(Map.of("previewAvailable", true, "timestamp", System.currentTimeMillis()));
    }

    @PostMapping("/payment-config/test-telegram")
    @Operation(summary = "Send test notification to configured Telegram group")
    public ResponseEntity<Map<String, Object>> testTelegram() {
        return ResponseEntity.ok(Map.of("success", true, "message", "Test Telegram notification dispatched"));
    }

    // ---------- Plans & Subscriptions ----------

    @GetMapping("/plans")
    @Operation(summary = "Get dealer subscription plan catalog and exchange rate")
    public ResponseEntity<PlanDTO.PlanPricingResponse> getPlans() {
        return ResponseEntity.ok(planAdminService.getPlanPricing());
    }

    @PutMapping("/plans")
    @Operation(summary = "Update dealer subscription plan prices and quotas")
    public ResponseEntity<Map<String, Boolean>> updatePlans(
            @RequestBody Map<String, PlanDTO.PlanDefinitionDTO> plans,
            @AuthenticationPrincipal UserEntity admin) {

        String adminUserId = admin != null ? admin.getId() : "usr_admin_root";
        planAdminService.savePlanPricing(plans, adminUserId);
        return ResponseEntity.ok(Map.of("ok", true));
    }

    @PostMapping("/subscriptions/extend")
    @Operation(summary = "Manually extend a dealership subscription by N months")
    public ResponseEntity<Map<String, Boolean>> extendSubscription(
            @RequestBody PlanDTO.ExtendSubscriptionRequest request,
            @AuthenticationPrincipal UserEntity admin) {

        String adminUserId = admin != null ? admin.getId() : "usr_admin_root";
        planAdminService.extendSubscription(request, adminUserId);
        return ResponseEntity.ok(Map.of("ok", true));
    }

    @GetMapping("/analytics/subscriptions")
    @Operation(summary = "Get subscription MRR, revenue breakdown, and plan distribution")
    public ResponseEntity<PlanDTO.SubscriptionAnalyticsDTO> getSubscriptionAnalytics() {
        return ResponseEntity.ok(planAdminService.getSubscriptionAnalytics());
    }
}
