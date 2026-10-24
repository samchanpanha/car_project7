package com.khlan.repository;

import com.khlan.entity.AppointmentEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface AppointmentRepository extends JpaRepository<AppointmentEntity, String> {

    List<AppointmentEntity> findByBuyerIdOrderByScheduledAtDesc(String buyerId);

    List<AppointmentEntity> findBySellerIdOrderByScheduledAtDesc(String sellerId);

    List<AppointmentEntity> findByTenantIdOrderByScheduledAtDesc(String tenantId);
    List<AppointmentEntity> findByTenantIdOrderByCreatedAtDesc(String tenantId);

    long countByBuyerIdAndStatusNot(String buyerId, String status);

    long countByTenantIdAndStatusNot(String tenantId, String status);
}
