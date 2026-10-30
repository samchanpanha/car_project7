package com.khlan.service;

import com.khlan.dto.VehicleDTO;
import com.khlan.entity.AbaTransactionEntity;
import com.khlan.entity.AppointmentEntity;
import com.khlan.entity.AuditLogEntity;
import com.khlan.entity.PurchaseRequestEntity;
import com.khlan.entity.SavedSearchEntity;
import com.khlan.entity.SubscriptionEntity;
import com.khlan.entity.SubscriptionPaymentEntity;
import com.khlan.repository.AbaTransactionRepository;
import com.khlan.repository.AppointmentRepository;
import com.khlan.repository.AuditLogRepository;
import com.khlan.repository.PurchaseRequestRepository;
import com.khlan.repository.SavedSearchRepository;
import com.khlan.repository.SubscriptionPaymentRepository;
import com.khlan.repository.SubscriptionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.*;

@Slf4j
@Service
@RequiredArgsConstructor
public class CronSchedulerService {

    private final SubscriptionRepository subscriptionRepository;
    private final SubscriptionPaymentRepository subscriptionPaymentRepository;
    private final AbaTransactionRepository abaTransactionRepository;
    private final PaymentService paymentService;

    private final SavedSearchRepository savedSearchRepository;
    private final AppointmentRepository appointmentRepository;
    private final PurchaseRequestRepository purchaseRequestRepository;
    private final AuditLogRepository auditLogRepository;
    private final AccountService accountService;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private RealtimeService realtimeService;

    @Value("${cron.secret:}")
    private String cronSecret;

    /**
     * Periodic background ABA bank transaction synchronization (every 5 minutes).
     */
    @Scheduled(fixedDelay = 300000, initialDelay = 60000)
    public void scheduledAbaSync() {
        log.info("[Scheduler] Running automatic ABA PayWay background sync...");
        try {
            paymentService.syncTelegramUpdates("sys_cron_aba");
            reconcileAbaTransactions();
        } catch (Exception e) {
            log.error("[Scheduler] Error running automatic ABA sync", e);
        }
    }

    /**
     * Daily background subscription expiration and reminder sweep (daily at 08:00).
     */
    @Scheduled(cron = "0 0 8 * * *")
    public void scheduledSubscriptionReminders() {
        log.info("[Scheduler] Running daily subscription reminder and expiration sweep...");
        try {
            sweepSubscriptionExpirations();
        } catch (Exception e) {
            log.error("[Scheduler] Error in subscription expiration sweep", e);
        }
    }

    /**
     * External trigger execution for ABA sync (/api/cron/aba-sync).
     */
    public Map<String, Object> triggerAbaSync(String authHeader) {
        validateCronAuth(authHeader);
        int matched = reconcileAbaTransactions();
        return Map.of(
                "success", true,
                "timestamp", OffsetDateTime.now().toString(),
                "outcome", Map.of("matched", matched, "status", "SUCCESS")
        );
    }

    /**
     * External trigger execution for subscription reminders (/api/cron/subscription-reminders).
     */
    public Map<String, Object> triggerSubscriptionReminders(String authHeader) {
        validateCronAuth(authHeader);
        Map<String, Object> outcome = sweepSubscriptionExpirations();
        return Map.of(
                "success", true,
                "timestamp", OffsetDateTime.now().toString(),
                "outcome", outcome
        );
    }

    @Transactional
    public int reconcileAbaTransactions() {
        List<AbaTransactionEntity> unmatched = abaTransactionRepository.findByStatusOrderByTransactionDateDesc("UNMATCHED");
        List<SubscriptionPaymentEntity> pendingPayments = subscriptionPaymentRepository.findByStatusOrderByCreatedAtDesc("AWAITING_VERIFICATION");

        int matchCount = 0;
        for (AbaTransactionEntity trx : unmatched) {
            for (SubscriptionPaymentEntity payment : pendingPayments) {
                if (payment.getManualRefKey() != null && payment.getManualRefKey().equalsIgnoreCase(trx.getTrxId())) {
                    // Match found!
                    trx.setStatus("MATCHED");
                    trx.setSubscriptionPaymentId(payment.getId());
                    trx.setMatchedAt(OffsetDateTime.now());
                    trx.setMatchedBy("AUTO_CRON_SYNC");
                    abaTransactionRepository.save(trx);

                    // Auto-verify payment
                    paymentService.handlePaymentAction(payment.getId(), "verify", "Auto-matched with ABA Trx " + trx.getTrxId(), "sys_cron_aba");
                    matchCount++;
                    log.info("Auto-reconciled ABA transaction {} with payment {}", trx.getTrxId(), payment.getId());
                    break;
                }
            }
        }
        return matchCount;
    }

    @Transactional
    public Map<String, Object> sweepSubscriptionExpirations() {
        OffsetDateTime now = OffsetDateTime.now();

        // 1. Auto-expire overdue subscriptions
        List<SubscriptionEntity> overdue = subscriptionRepository.findAll().stream()
                .filter(s -> "ACTIVE".equals(s.getStatus()) && s.getCurrentPeriodEnd() != null && s.getCurrentPeriodEnd().isBefore(now))
                .toList();

        int expiredCount = 0;
        for (SubscriptionEntity sub : overdue) {
            sub.setStatus("EXPIRED");
            subscriptionRepository.save(sub);
            expiredCount++;
            log.info("Subscription {} for tenant {} marked as EXPIRED", sub.getId(), sub.getTenantId());
        }

        // 2. Identify expiring soon (within 7 days)
        OffsetDateTime in7Days = now.plusDays(7);
        List<SubscriptionEntity> expiringSoon = subscriptionRepository.findAll().stream()
                .filter(s -> "ACTIVE".equals(s.getStatus()) && !"FREE".equalsIgnoreCase(s.getPlan())
                        && s.getCurrentPeriodEnd() != null && s.getCurrentPeriodEnd().isAfter(now)
                        && s.getCurrentPeriodEnd().isBefore(in7Days))
                .toList();

        return Map.of(
                "expiredCount", expiredCount,
                "expiringSoonCount", expiringSoon.size()
        );
    }

    /**
     * Saved-search alerting sweep (every 15 minutes): sends an in-app realtime
     * alert when a recently published vehicle matches a user's enabled saved
     * search. Deduplication is handled through audit logs.
     */
    @Scheduled(fixedDelay = 900000, initialDelay = 120000)
    @Transactional
    public void scheduledSavedSearchAlerts() {
        log.info("[Scheduler] Running saved-search alert sweep...");
        try {
            int alerted = 0;
            List<SavedSearchEntity> searches = savedSearchRepository.findAll();
            for (SavedSearchEntity search : searches) {
                if (!Boolean.TRUE.equals(search.getAlertsEnabled())) continue;

                List<VehicleDTO.VehicleCardDTO> matches;
                try {
                    matches = accountService.runSavedSearch(search.getUserId(), search.getId()).getVehicles();
                } catch (Exception e) {
                    log.debug("Saved-search run failed for {}: {}", search.getId(), e.getMessage());
                    continue;
                }
                if (matches == null || matches.isEmpty()) continue;

                for (VehicleDTO.VehicleCardDTO vehicle : matches) {
                    if (vehicle == null || vehicle.getId() == null) continue;
                    if (!isRecent(vehicle.getCreatedAt(), 48)) continue;
                    if (alreadyAlerted(search.getId(), vehicle.getId())) continue;

                    recordAlert(search.getId(), search.getUserId(), vehicle.getId());
                    alerted++;

                    if (realtimeService != null) {
                        realtimeService.emitToUser(search.getUserId(), com.khlan.dto.RealtimeEventDTO.builder()
                                .type("SAVED_SEARCH_MATCH")
                                .title("New vehicle matches your saved search")
                                .message(search.getName() + ": " + vehicle.getMake() + " " + vehicle.getModel() + " (" + vehicle.getYear() + ")")
                                .payload(Map.of(
                                        "savedSearchId", search.getId(),
                                        "vehicleId", vehicle.getId(),
                                        "make", vehicle.getMake() != null ? vehicle.getMake() : "",
                                        "model", vehicle.getModel() != null ? vehicle.getModel() : "",
                                        "year", vehicle.getYear(),
                                        "priceUsd", vehicle.getPriceUsd()
                                ))
                                .build());
                    }
                }
            }
            log.info("[Scheduler] Saved-search alert sweep complete (sent={})", alerted);
        } catch (Exception e) {
            log.error("[Scheduler] Error in saved-search alert sweep", e);
        }
    }

    /**
     * Lead follow-up sweep (every 6 hours): notifies sellers about purchase
     * requests/appointments that remain pending after 24 hours.
     */
    @Scheduled(fixedDelay = 21600000, initialDelay = 300000)
    @Transactional
    public void scheduledLeadFollowUps() {
        log.info("[Scheduler] Running lead follow-up sweep...");
        try {
            OffsetDateTime cutoff = OffsetDateTime.now().minusHours(24);
            int notified = 0;

            for (PurchaseRequestEntity req : purchaseRequestRepository.findAll()) {
                if (!"PENDING".equalsIgnoreCase(req.getStatus())) continue;
                if (req.getCreatedAt() == null || req.getCreatedAt().isAfter(cutoff)) continue;
                if (alreadyFollowedUp("PurchaseRequest", req.getId())) continue;

                recordFollowUp("PurchaseRequest", req.getId(), req.getSellerUserId());
                notified++;
                if (realtimeService != null && req.getSellerUserId() != null) {
                    realtimeService.emitToUser(req.getSellerUserId(), com.khlan.dto.RealtimeEventDTO.builder()
                            .type("LEAD_FOLLOWUP")
                            .title("Pending purchase request needs follow-up")
                            .message("A buyer purchase request has been waiting over 24 hours.")
                            .payload(Map.of("requestId", req.getId(), "vehicleId", req.getVehicleId()))
                            .build());
                }
            }

            for (AppointmentEntity appt : appointmentRepository.findAll()) {
                if (!"REQUESTED".equalsIgnoreCase(appt.getStatus())) continue;
                if (appt.getCreatedAt() == null || appt.getCreatedAt().isAfter(cutoff)) continue;
                if (alreadyFollowedUp("Appointment", appt.getId())) continue;

                recordFollowUp("Appointment", appt.getId(), appt.getSellerId());
                notified++;
                if (realtimeService != null && appt.getSellerId() != null) {
                    realtimeService.emitToUser(appt.getSellerId(), com.khlan.dto.RealtimeEventDTO.builder()
                            .type("LEAD_FOLLOWUP")
                            .title("Test-drive appointment needs confirmation")
                            .message("A buyer appointment request has been waiting over 24 hours.")
                            .payload(Map.of("appointmentId", appt.getId(), "vehicleId", appt.getVehicleId()))
                            .build());
                }
            }

            log.info("[Scheduler] Lead follow-up sweep complete (notified={})", notified);
        } catch (Exception e) {
            log.error("[Scheduler] Error in lead follow-up sweep", e);
        }
    }

    private boolean isRecent(String createdAtRaw, int hours) {
        if (createdAtRaw == null || createdAtRaw.isBlank()) return false;
        try {
            OffsetDateTime created = OffsetDateTime.parse(createdAtRaw);
            return !created.isBefore(OffsetDateTime.now().minusHours(hours));
        } catch (DateTimeParseException e) {
            return false;
        }
    }

    private boolean alreadyAlerted(String searchId, String vehicleId) {
        List<AuditLogEntity> logs = auditLogRepository.findByEntityAndEntityIdOrderByCreatedAtDesc("Vehicle", vehicleId);
        return logs.stream().anyMatch(log -> log.getAction().equals("SAVED_SEARCH_ALERT")
                && log.getMetaJson() != null
                && log.getMetaJson().contains(searchId));
    }

    private void recordAlert(String searchId, String userId, String vehicleId) {
        long count = System.currentTimeMillis();
        auditLogRepository.save(AuditLogEntity.builder()
                .id("audit_" + count + "_" + searchId.substring(0, Math.min(8, searchId.length())))
                .actorId(userId)
                .action("SAVED_SEARCH_ALERT")
                .entity("Vehicle")
                .entityId(vehicleId)
                .metaJson("{\"savedSearchId\":\"" + searchId + "\",\"vehicleId\":\"" + vehicleId + "\"}")
                .createdAt(OffsetDateTime.now())
                .build());
    }

    private boolean alreadyFollowedUp(String entityType, String entityId) {
        List<AuditLogEntity> logs = auditLogRepository.findByEntityAndEntityIdOrderByCreatedAtDesc(entityType, entityId);
        return logs.stream().anyMatch(log -> "LEAD_FOLLOWUP".equals(log.getAction()));
    }

    private void recordFollowUp(String entityType, String entityId, String actorId) {
        long count = System.currentTimeMillis();
        auditLogRepository.save(AuditLogEntity.builder()
                .id("audit_" + count + "_" + Math.abs(entityId.hashCode()))
                .actorId(actorId)
                .action("LEAD_FOLLOWUP")
                .entity(entityType)
                .entityId(entityId)
                .createdAt(OffsetDateTime.now())
                .build());
    }

    /**
     * Authorize an externally-triggered maintenance sweep.
     *
     * FAILS CLOSED: if no {@code cron.secret} is configured the endpoint is
     * rejected rather than left open. Previously a blank secret skipped the
     * check entirely, and because {@code cron.secret} had no default in
     * application.yml, {@code /api/cron/**} — which SecurityConfig also leaves
     * public — could be triggered by anyone to force ABA bank reconciliation or
     * fire subscription-expiry/reminder sweeps.
     */
    private void validateCronAuth(String authHeader) {
        if (cronSecret == null || cronSecret.isBlank()) {
            log.error("[Cron] cron.secret is not configured — rejecting external trigger. "
                    + "Set CRON_SECRET and send 'Authorization: Bearer <secret>'.");
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.UNAUTHORIZED, "Cron triggers are not configured");
        }

        String expected = "Bearer " + cronSecret;
        boolean ok = authHeader != null && java.security.MessageDigest.isEqual(
                expected.getBytes(java.nio.charset.StandardCharsets.UTF_8),
                authHeader.getBytes(java.nio.charset.StandardCharsets.UTF_8));

        if (!ok) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.UNAUTHORIZED, "Unauthorized cron trigger");
        }
    }
}
