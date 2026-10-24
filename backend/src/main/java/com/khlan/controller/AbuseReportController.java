package com.khlan.controller;

import com.khlan.dto.AbuseReportDTO;
import com.khlan.entity.UserEntity;
import com.khlan.service.AbuseReportService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequiredArgsConstructor
public class AbuseReportController {

    private final AbuseReportService abuseReportService;

    @PostMapping({"/api/reports/abuse", "/api/abuse-reports"})
    public ResponseEntity<Map<String, Object>> submitAbuseReport(
            @AuthenticationPrincipal UserEntity user,
            @RequestBody AbuseReportDTO.CreateAbuseReportRequest req
    ) {
        String actorId = user != null ? user.getId() : "usr_anonymous";
        abuseReportService.submitReport(actorId, req);
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("ok", true));
    }
}
