package com.khlan.repository;

import com.khlan.entity.VehicleDocumentEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface VehicleDocumentRepository extends JpaRepository<VehicleDocumentEntity, String> {
    List<VehicleDocumentEntity> findByVehicleId(String vehicleId);
    void deleteByVehicleId(String vehicleId);
}
