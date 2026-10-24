package com.khlan.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.OffsetDateTime;
import java.util.Map;

@Tag(name = "Health", description = "System and service status checks")
@RestController
@RequestMapping("/api/health")
public class HealthController {

    @Operation(summary = "Check backend service health")
    @GetMapping
    public ResponseEntity<Map<String, Object>> checkHealth() {
        return ResponseEntity.ok(Map.of(
                "status", "UP",
                "service", "khlan-backend",
                "timestamp", OffsetDateTime.now().toString(),
                "javaVersion", System.getProperty("java.version"),
                "virtualThreads", Thread.currentThread().isVirtual()
        ));
    }
}
