package com.khlan.repository;

import com.khlan.entity.SubscriptionPaymentEntity;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface SubscriptionPaymentRepository extends JpaRepository<SubscriptionPaymentEntity, String> {

    List<SubscriptionPaymentEntity> findByTenantIdOrderByCreatedAtDesc(String tenantId);

    Page<SubscriptionPaymentEntity> findByTenantIdOrderByCreatedAtDesc(String tenantId, Pageable pageable);

    Optional<SubscriptionPaymentEntity> findByReference(String reference);

    Optional<SubscriptionPaymentEntity> findByManualRef(String manualRef);

    Optional<SubscriptionPaymentEntity> findByManualRefKey(String manualRefKey);

    Optional<SubscriptionPaymentEntity> findByEvidenceHash(String evidenceHash);

    boolean existsByEvidenceHash(String evidenceHash);

    boolean existsByReference(String reference);

    long countByStatus(String status);

    long countByTenantIdAndStatus(String tenantId, String status);

    List<SubscriptionPaymentEntity> findByStatusOrderByCreatedAtDesc(String status);

    @Query("SELECT p FROM SubscriptionPaymentEntity p WHERE " +
           "p.manualRef = :rawRef OR " +
           "p.manualRef = :trxKey OR " +
           "p.manualRefKey = :rawRef OR " +
           "p.manualRefKey = :trxKey OR " +
           "p.ocrRef = :rawRef OR " +
           "p.ocrRef = :trxKey OR " +
           "p.reference = :rawRef")
    List<SubscriptionPaymentEntity> findDuplicatesByAnyRef(
            @Param("rawRef") String rawRef,
            @Param("trxKey") String trxKey
    );

    @Query("SELECT p FROM SubscriptionPaymentEntity p WHERE (:status IS NULL OR p.status = :status) ORDER BY p.createdAt DESC")
    Page<SubscriptionPaymentEntity> findPaymentsFiltered(@Param("status") String status, Pageable pageable);
}
