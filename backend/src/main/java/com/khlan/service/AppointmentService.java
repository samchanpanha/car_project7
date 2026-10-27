package com.khlan.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.khlan.dto.AppointmentDTO;
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
public class AppointmentService {

    private final AppointmentRepository appointmentRepository;
    private final VehicleRepository vehicleRepository;
    private final UserRepository userRepository;
    private final TenantMemberRepository tenantMemberRepository;
    private final AuditLogRepository auditLogRepository;
    private final ObjectMapper objectMapper;
    private final org.springframework.beans.factory.ObjectProvider<TelegramService> telegramServiceProvider;

    @Transactional(readOnly = true)
    public List<AppointmentDTO.BuyerAppointmentDTO> getBuyerAppointments(String userId) {
        if (userId == null || userId.isBlank()) return List.of();

        List<AppointmentEntity> rows = appointmentRepository.findByBuyerIdOrderByScheduledAtDesc(userId);
        List<AppointmentDTO.BuyerAppointmentDTO> result = new ArrayList<>();

        for (AppointmentEntity a : rows) {
            Optional<VehicleEntity> vOpt = vehicleRepository.findById(a.getVehicleId());
            if (vOpt.isEmpty()) continue;
            VehicleEntity v = vOpt.get();

            String sellerName = userRepository.findById(a.getSellerId()).map(UserEntity::getName).orElse("Seller");
            String thumb = (v.getImages() != null && !v.getImages().isEmpty()) ? v.getImages().get(0).getUrl() : null;

            result.add(AppointmentDTO.BuyerAppointmentDTO.builder()
                    .id(a.getId())
                    .vehicle(AppointmentDTO.VehicleSummaryDTO.builder()
                            .id(v.getId())
                            .make(v.getMake())
                            .model(v.getModel())
                            .year(v.getYear())
                            .priceUsd(v.getPriceUsd())
                            .thumbnail(thumb)
                            .build())
                    .sellerName(sellerName)
                    .scheduledAt(a.getScheduledAt().toString())
                    .status(a.getStatus())
                    .notes(a.getNotes())
                    .createdAt(a.getCreatedAt() != null ? a.getCreatedAt().toString() : null)
                    .build());
        }

        return result;
    }

    @Transactional
    public AppointmentDTO.BuyerAppointmentDTO createAppointment(String userId, AppointmentDTO.CreateAppointmentRequest req) {
        if (userId == null || userId.isBlank()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Login required to book a test drive");
        }
        if (req.getVehicleId() == null || req.getVehicleId().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "vehicleId is required");
        }
        if (req.getScheduledAt() == null || req.getScheduledAt().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "scheduledAt is required");
        }

        OffsetDateTime scheduledAt;
        try {
            scheduledAt = OffsetDateTime.parse(req.getScheduledAt());
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "scheduledAt must be an ISO datetime");
        }

        if (scheduledAt.isBefore(OffsetDateTime.now())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "scheduledAt must be in the future");
        }

        VehicleEntity vehicle = vehicleRepository.findById(req.getVehicleId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Vehicle not found"));

        if (!"PUBLISHED".equals(vehicle.getStatus())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Vehicle is not available for appointments");
        }

        // Check duplicate
        List<AppointmentEntity> existing = appointmentRepository.findByBuyerIdOrderByScheduledAtDesc(userId);
        boolean duplicate = existing.stream()
                .anyMatch(a -> a.getVehicleId().equals(vehicle.getId()) &&
                        ("REQUESTED".equals(a.getStatus()) || "CONFIRMED".equals(a.getStatus())));
        if (duplicate) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "You already have an active appointment for this vehicle");
        }

        String apptId = "apt_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16);
        AppointmentEntity appt = AppointmentEntity.builder()
                .id(apptId)
                .vehicleId(vehicle.getId())
                .buyerId(userId)
                .tenantId(vehicle.getTenantId())
                .sellerId(vehicle.getSellerId())
                .scheduledAt(scheduledAt)
                .status("REQUESTED")
                .notes(req.getNotes())
                .createdAt(OffsetDateTime.now())
                .updatedAt(OffsetDateTime.now())
                .build();

        appointmentRepository.save(appt);

        String sellerName = userRepository.findById(vehicle.getSellerId()).map(UserEntity::getName).orElse("Seller");
        String buyerName = userRepository.findById(userId).map(UserEntity::getName).orElse("Interested Buyer");
        String thumb = (vehicle.getImages() != null && !vehicle.getImages().isEmpty()) ? vehicle.getImages().get(0).getUrl() : null;

        try {
            TelegramService tg = telegramServiceProvider.getIfAvailable();
            if (tg != null) {
                String vTitle = vehicle.getYear() + " " + vehicle.getMake() + " " + vehicle.getModel() + " ($" + vehicle.getPriceUsd() + ")";
                tg.sendSellerLeadNotification(vehicle.getSellerId(), vTitle, buyerName, appt.getScheduledAt().toString(), appt.getNotes());
            }
        } catch (Exception e) {
            log.warn("Failed to notify seller on Telegram: {}", e.getMessage());
        }

        return AppointmentDTO.BuyerAppointmentDTO.builder()
                .id(appt.getId())
                .vehicle(AppointmentDTO.VehicleSummaryDTO.builder()
                        .id(vehicle.getId())
                        .make(vehicle.getMake())
                        .model(vehicle.getModel())
                        .year(vehicle.getYear())
                        .priceUsd(vehicle.getPriceUsd())
                        .thumbnail(thumb)
                        .build())
                .sellerName(sellerName)
                .scheduledAt(appt.getScheduledAt().toString())
                .status(appt.getStatus())
                .notes(appt.getNotes())
                .createdAt(appt.getCreatedAt().toString())
                .build();
    }

    @Transactional
    public void cancelBuyerAppointment(String userId, String appointmentId) {
        AppointmentEntity appt = appointmentRepository.findById(appointmentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Appointment not found"));

        if (!appt.getBuyerId().equals(userId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Appointment not found");
        }

        appt.setStatus("CANCELLED");
        appt.setUpdatedAt(OffsetDateTime.now());
        appointmentRepository.save(appt);
    }

    @Transactional(readOnly = true)
    public List<AppointmentDTO.TenantAppointmentDTO> getTenantAppointments(String userId) {
        TenantMemberEntity member = tenantMemberRepository.findFirstByUserIdAndStatus(userId, "ACTIVE")
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN, "Forbidden"));

        List<AppointmentEntity> rows = appointmentRepository.findByTenantIdOrderByScheduledAtDesc(member.getTenantId());
        List<AppointmentDTO.TenantAppointmentDTO> result = new ArrayList<>();

        for (AppointmentEntity a : rows) {
            Optional<VehicleEntity> vOpt = vehicleRepository.findById(a.getVehicleId());
            if (vOpt.isEmpty()) continue;
            VehicleEntity v = vOpt.get();

            Optional<UserEntity> bOpt = userRepository.findById(a.getBuyerId());
            String buyerName = bOpt.map(UserEntity::getName).orElse("Buyer");

            result.add(AppointmentDTO.TenantAppointmentDTO.builder()
                    .id(a.getId())
                    .vehicle(AppointmentDTO.VehicleSummaryDTO.builder()
                            .id(v.getId())
                            .make(v.getMake())
                            .model(v.getModel())
                            .year(v.getYear())
                            .build())
                    .buyer(AppointmentDTO.BuyerSummaryDTO.builder()
                            .id(a.getBuyerId())
                            .name(buyerName)
                            .build())
                    .scheduledAt(a.getScheduledAt().toString())
                    .status(a.getStatus())
                    .notes(a.getNotes())
                    .createdAt(a.getCreatedAt() != null ? a.getCreatedAt().toString() : null)
                    .build());
        }

        return result;
    }

    @Transactional
    public void updateTenantAppointmentStatus(String userId, String appointmentId, String newStatus) {
        TenantMemberEntity member = tenantMemberRepository.findFirstByUserIdAndStatus(userId, "ACTIVE")
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN, "Forbidden"));

        AppointmentEntity appt = appointmentRepository.findById(appointmentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Appointment not found"));

        if (!member.getTenantId().equals(appt.getTenantId())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Appointment not found");
        }

        String oldStatus = appt.getStatus();
        appt.setStatus(newStatus);
        appt.setUpdatedAt(OffsetDateTime.now());
        appointmentRepository.save(appt);

        // Audit Log
        try {
            String auditId = "aud_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16);
            AuditLogEntity audit = AuditLogEntity.builder()
                    .id(auditId)
                    .actorId(userId)
                    .action("APPOINTMENT_STATUS_CHANGED")
                    .entity("Appointment")
                    .entityId(appointmentId)
                    .metaJson(objectMapper.writeValueAsString(Map.of("from", oldStatus, "to", newStatus)))
                    .createdAt(OffsetDateTime.now())
                    .build();
            auditLogRepository.save(audit);
        } catch (Exception ignored) {}
    }
}
