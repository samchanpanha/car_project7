package com.khlan.repository;

import com.khlan.entity.VehicleHistoryReportEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface VehicleHistoryReportRepository extends JpaRepository<VehicleHistoryReportEntity, String> {
    Optional<VehicleHistoryReportEntity> findFirstByVehicleIdAndStatusOrderByCreatedAtDesc(String vehicleId, String status);
    Optional<VehicleHistoryReportEntity> findFirstByVehicleIdOrderByCreatedAtDesc(String vehicleId);
    boolean existsByVehicleIdAndStatus(String vehicleId, String status);
    long countByRequestedBy(String requestedBy);
    java.util.List<VehicleHistoryReportEntity> findByRequestedByOrderByCreatedAtDesc(String requestedBy);
}
