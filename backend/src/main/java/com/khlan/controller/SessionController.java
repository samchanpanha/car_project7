package com.khlan.controller;

import com.khlan.dto.SessionDTO;
import com.khlan.service.SessionService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/session")
@RequiredArgsConstructor
@Tag(name = "Session", description = "Current authenticated session and demo persona switcher")
public class SessionController {

    private final SessionService sessionService;

    @GetMapping
    @Operation(summary = "Get current authenticated session, tenant membership, and available demo personas")
    public ResponseEntity<SessionDTO> getSession(HttpServletRequest request) {
        return ResponseEntity.ok(sessionService.getSession(request));
    }

    @PostMapping
    @Operation(summary = "Switch active demo persona by userId")
    public ResponseEntity<Map<String, Object>> switchPersona(
            @RequestBody SessionDTO.SwitchPersonaRequest req,
            HttpServletResponse response
    ) {
        if (req.getUserId() == null || req.getUserId().isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "userId is required"));
        }
        try {
            sessionService.switchPersona(req.getUserId(), response);
            return ResponseEntity.ok(Map.of("ok", true, "activePersonaId", req.getUserId()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }
}
