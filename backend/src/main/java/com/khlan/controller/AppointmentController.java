package com.khlan.controller;

import com.khlan.dto.AppointmentDTO;
import com.khlan.entity.UserEntity;
import com.khlan.service.AppointmentService;
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
public class AppointmentController {

    private final AppointmentService appointmentService;

    private String requireUserId(UserEntity user) {
        if (user == null || user.getId() == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Login required");
        }
        return user.getId();
    }

    @GetMapping("/api/account/appointments")
    public ResponseEntity<List<AppointmentDTO.BuyerAppointmentDTO>> getBuyerAppointments(@AuthenticationPrincipal UserEntity user) {
        String userId = user != null ? user.getId() : "usr_demo_buyer";
        return ResponseEntity.ok(appointmentService.getBuyerAppointments(userId));
    }

    @PostMapping("/api/account/appointments")
    public ResponseEntity<AppointmentDTO.BuyerAppointmentDTO> createAppointment(
            @AuthenticationPrincipal UserEntity user,
            @RequestBody AppointmentDTO.CreateAppointmentRequest req
    ) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(appointmentService.createAppointment(requireUserId(user), req));
    }

    @PatchMapping("/api/account/appointments/{id}")
    public ResponseEntity<Map<String, Object>> cancelAppointment(
            @AuthenticationPrincipal UserEntity user,
            @PathVariable("id") String id
    ) {
        appointmentService.cancelBuyerAppointment(requireUserId(user), id);
        return ResponseEntity.ok(Map.of("ok", true));
    }

    @GetMapping("/api/tenant/appointments")
    public ResponseEntity<List<AppointmentDTO.TenantAppointmentDTO>> getTenantAppointments(@AuthenticationPrincipal UserEntity user) {
        return ResponseEntity.ok(appointmentService.getTenantAppointments(requireUserId(user)));
    }

    @PatchMapping("/api/tenant/appointments/{id}")
    public ResponseEntity<Map<String, Object>> updateTenantAppointment(
            @AuthenticationPrincipal UserEntity user,
            @PathVariable("id") String id,
            @RequestBody AppointmentDTO.UpdateStatusRequest req
    ) {
        String newStatus = req != null && req.getStatus() != null ? req.getStatus().toUpperCase() : "CONFIRMED";
        appointmentService.updateTenantAppointmentStatus(requireUserId(user), id, newStatus);
        return ResponseEntity.ok(Map.of("ok", true));
    }
}
