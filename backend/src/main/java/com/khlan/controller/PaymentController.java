package com.khlan.controller;

import com.khlan.dto.PaymentDTO;
import com.khlan.entity.TenantMemberEntity;
import com.khlan.entity.UserEntity;
import com.khlan.repository.TenantMemberRepository;
import com.khlan.service.PaymentService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/tenant/payments")
@RequiredArgsConstructor
@Tag(name = "Tenant Payments & Subscriptions", description = "Bakong KHQR payment submissions, reference checks, and receipt slip uploads")
public class PaymentController {

    private final PaymentService paymentService;
    private final TenantMemberRepository tenantMemberRepository;

    @GetMapping
    @Operation(summary = "Get payment history for the current tenant")
    public ResponseEntity<List<PaymentDTO.SubscriptionPaymentDTO>> getTenantPayments(
            @AuthenticationPrincipal UserEntity authUser) {
        String tenantId = resolveTenantId(authUser);
        return ResponseEntity.ok(paymentService.getTenantPayments(tenantId));
    }

    @PostMapping
    @Operation(summary = "Create a subscription payment intent or submit manual bank reference")
    public ResponseEntity<Map<String, Object>> createPayment(
            @RequestBody PaymentDTO.CreatePaymentRequest request,
            @AuthenticationPrincipal UserEntity authUser) {
        String tenantId = resolveTenantId(authUser);
        PaymentDTO.SubscriptionPaymentDTO payment = paymentService.createPayment(tenantId, request);
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of(
                "payment", payment,
                "waitMinutes", 15
        ));
    }

    @GetMapping("/config")
    @Operation(summary = "Get active payment configuration (KHQR data, exchange rate, bank instructions)")
    public ResponseEntity<PaymentDTO.PaymentConfigDTO> getPaymentConfig() {
        return ResponseEntity.ok(paymentService.getPaymentConfig());
    }

    @GetMapping("/check-ref")
    @Operation(summary = "Check transaction reference format and uniqueness via query param")
    public ResponseEntity<PaymentDTO.CheckRefResponse> checkReferenceGet(
            @RequestParam("ref") String ref,
            @RequestParam(value = "plan", required = false) String plan,
            @RequestParam(value = "cycle", required = false) String cycle,
            @RequestParam(value = "currency", required = false) String currency,
            @RequestParam(value = "ocrRef", required = false) String ocrRef,
            @RequestParam(value = "bank", required = false) String bank,
            @RequestParam(value = "payerAccount", required = false) String payerAccount,
            @RequestParam(value = "payerName", required = false) String payerName,
            @RequestParam(value = "paymentDate", required = false) String paymentDate) {
        PaymentDTO.CheckRefRequest req = PaymentDTO.CheckRefRequest.builder()
                .ref(ref)
                .plan(plan)
                .billingCycle(cycle)
                .build();
        return ResponseEntity.ok(paymentService.checkReference(req));
    }

    @PostMapping("/check-ref")
    @Operation(summary = "Check transaction reference format and uniqueness")
    public ResponseEntity<PaymentDTO.CheckRefResponse> checkReference(
            @RequestBody PaymentDTO.CheckRefRequest request) {
        return ResponseEntity.ok(paymentService.checkReference(request));
    }

    @PostMapping(value = "/ocr", consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(summary = "Perform receipt verification on bank slip via JSON Base64 data URL")
    public ResponseEntity<PaymentDTO.OcrResponseDTO> verifyReceiptOcrJson(
            @RequestBody PaymentDTO.OcrRequestDTO request) {
        return ResponseEntity.ok(paymentService.verifyReceiptOcrJson(request));
    }

    @PostMapping(value = "/ocr", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(summary = "Perform receipt verification on multipart file upload")
    public ResponseEntity<PaymentDTO.OcrResponseDTO> verifyReceiptOcrMultipart(
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "manualRef", required = false) String manualRef,
            @RequestParam(value = "plan", required = false, defaultValue = "PRO") String plan,
            @RequestParam(value = "billingCycle", required = false, defaultValue = "MONTHLY") String cycle) {
        return ResponseEntity.ok(paymentService.verifyReceiptOcrMultipart(file, manualRef, plan, cycle));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get details of a specific payment submission")
    public ResponseEntity<PaymentDTO.SubscriptionPaymentDTO> getPaymentById(
            @PathVariable String id) {
        return ResponseEntity.ok(paymentService.getPaymentById(id));
    }

    @PostMapping(value = "/{id}/receipt", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(summary = "Upload proof of payment receipt image")
    public ResponseEntity<PaymentDTO.SubscriptionPaymentDTO> uploadReceipt(
            @PathVariable String id,
            @RequestParam("file") MultipartFile file) {
        return ResponseEntity.ok(paymentService.uploadReceipt(id, file));
    }

    private String resolveTenantId(UserEntity authUser) {
        String userId = authUser != null ? authUser.getId() : "usr_dealer_sokha";
        return tenantMemberRepository.findByUserId(userId)
                .map(TenantMemberEntity::getTenantId)
                .orElseGet(() -> {
                    return tenantMemberRepository.findAll().stream().findFirst()
                            .map(TenantMemberEntity::getTenantId)
                            .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN, "Tenant not found"));
                });
    }
}
