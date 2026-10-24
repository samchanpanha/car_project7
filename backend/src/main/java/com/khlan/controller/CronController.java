package com.khlan.controller;

import com.khlan.service.CronSchedulerService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/cron")
@RequiredArgsConstructor
@Tag(name = "Cron Automation", description = "Scheduled background maintenance endpoints triggered externally or via internal JVM timer")
public class CronController {

    private final CronSchedulerService cronSchedulerService;

    @GetMapping("/aba-sync")
    @Operation(summary = "Trigger ABA PayWay bank reconciliation sweep")
    public ResponseEntity<Map<String, Object>> triggerAbaSync(
            @RequestHeader(value = "Authorization", required = false) String authHeader) {
        return ResponseEntity.ok(cronSchedulerService.triggerAbaSync(authHeader));
    }

    @GetMapping("/subscription-reminders")
    @Operation(summary = "Trigger subscription expiration sweep and send upcoming renewal reminders")
    public ResponseEntity<Map<String, Object>> triggerSubscriptionReminders(
            @RequestHeader(value = "Authorization", required = false) String authHeader) {
        return ResponseEntity.ok(cronSchedulerService.triggerSubscriptionReminders(authHeader));
    }
}
