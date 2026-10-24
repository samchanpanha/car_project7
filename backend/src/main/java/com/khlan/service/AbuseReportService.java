package com.khlan.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.khlan.dto.AbuseReportDTO;
import com.khlan.entity.AuditLogEntity;
import com.khlan.entity.ReportedContentEntity;
import com.khlan.entity.VehicleEntity;
import com.khlan.repository.AuditLogRepository;
import com.khlan.repository.ReportedContentRepository;
import com.khlan.repository.VehicleRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.OffsetDateTime;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class AbuseReportService {

    private final ReportedContentRepository reportedContentRepository;
    private final VehicleRepository vehicleRepository;
    private final AuditLogRepository auditLogRepository;
    private final ObjectMapper objectMapper;

    private static final Set<String> VALID_REASONS = Set.of(
            "SCAM", "WRONG_INFO", "DUPLICATE", "OFFENSIVE", "SOLD", "OTHER"
    );

    @Transactional
    public void submitReport(String actorId, AbuseReportDTO.CreateAbuseReportRequest req) {
        if (req == null || req.getVehicleId() == null || req.getVehicleId().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "vehicleId is required");
        }
        if (req.getReason() == null || !VALID_REASONS.contains(req.getReason().toUpperCase())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "reason must be one of: " + VALID_REASONS);
        }

        VehicleEntity vehicle = vehicleRepository.findById(req.getVehicleId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Vehicle not found"));

        String reportId = "rep_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16);
        ReportedContentEntity reportedContent = ReportedContentEntity.builder()
                .id(reportId)
                .vehicleId(vehicle.getId())
                .reason(req.getReason().toUpperCase())
                .details(req.getDetails())
                .status("OPEN")
                .createdAt(OffsetDateTime.now())
                .build();

        reportedContentRepository.save(reportedContent);

        // Audit Log
        try {
            String auditId = "aud_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16);
            AuditLogEntity audit = AuditLogEntity.builder()
                    .id(auditId)
                    .actorId(actorId)
                    .action("CONTENT_REPORTED")
                    .entity("Vehicle")
                    .entityId(vehicle.getId())
                    .metaJson(objectMapper.writeValueAsString(Map.of(
                            "reason", req.getReason(),
                            "details", req.getDetails() != null ? req.getDetails() : ""
                    )))
                    .createdAt(OffsetDateTime.now())
                    .build();
            auditLogRepository.save(audit);
        } catch (Exception e) {
            log.warn("Failed to write audit log for abuse report: {}", e.getMessage());
        }
    }
}
