package com.khlan.repository;

import com.khlan.entity.FavoriteEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface FavoriteRepository extends JpaRepository<FavoriteEntity, String> {

    List<FavoriteEntity> findByUserIdOrderByCreatedAtDesc(String userId);

    Optional<FavoriteEntity> findByUserIdAndVehicleId(String userId, String vehicleId);

    void deleteByUserIdAndVehicleId(String userId, String vehicleId);

    long countByUserId(String userId);

    boolean existsByUserIdAndVehicleId(String userId, String vehicleId);

    @org.springframework.data.jpa.repository.Query("SELECT COUNT(f) FROM FavoriteEntity f JOIN VehicleEntity v ON f.vehicleId = v.id WHERE v.tenantId = :tenantId")
    long countByTenantId(@org.springframework.data.repository.query.Param("tenantId") String tenantId);
}
