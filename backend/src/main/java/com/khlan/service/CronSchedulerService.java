package com.khlan.service;

import com.khlan.entity.AbaTransactionEntity;
import com.khlan.entity.SubscriptionEntity;
import com.khlan.entity.SubscriptionPaymentEntity;
import com.khlan.repository.AbaTransactionRepository;
import com.khlan.repository.SubscriptionPaymentRepository;
import com.khlan.repository.SubscriptionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.*;

@Slf4j
@Service
@RequiredArgsConstructor
public class CronSchedulerService {

    private final SubscriptionRepository subscriptionRepository;
    private final SubscriptionPaymentRepository subscriptionPaymentRepository;
    private final AbaTransactionRepository abaTransactionRepository;
    private final PaymentService paymentService;

    @Value("${cron.secret:}")
    private String cronSecret;

    /**
     * Periodic background ABA bank transaction synchronization (every 5 minutes).
     */
    @Scheduled(fixedDelay = 300000, initialDelay = 60000)
    public void scheduledAbaSync() {
        log.info("[Scheduler] Running automatic ABA PayWay background sync...");
        try {
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

    private void validateCronAuth(String authHeader) {
        if (cronSecret != null && !cronSecret.isBlank()) {
            if (authHeader == null || !authHeader.equals("Bearer " + cronSecret)) {
                throw new org.springframework.web.server.ResponseStatusException(
                        org.springframework.http.HttpStatus.UNAUTHORIZED, "Unauthorized cron trigger");
            }
        }
    }
}
