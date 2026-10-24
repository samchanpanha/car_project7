package com.khlan.repository;

import com.khlan.entity.VehicleEntity;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface VehicleRepository extends JpaRepository<VehicleEntity, String>, JpaSpecificationExecutor<VehicleEntity> {
    Page<VehicleEntity> findByStatus(String status, Pageable pageable);
    List<VehicleEntity> findBySellerId(String sellerId);
    List<VehicleEntity> findBySellerIdOrderByCreatedAtDesc(String sellerId);
    List<VehicleEntity> findByTenantId(String tenantId);
    long countBySellerIdAndStatus(String sellerId, String status);

    @org.springframework.data.jpa.repository.Query("SELECT DISTINCT v.make FROM VehicleEntity v WHERE v.status = 'PUBLISHED' ORDER BY v.make ASC")
    List<String> findDistinctMakes();

    @org.springframework.data.jpa.repository.Query("SELECT DISTINCT v.city FROM VehicleEntity v WHERE v.status = 'PUBLISHED' ORDER BY v.city ASC")
    List<String> findDistinctCities();

    @org.springframework.data.jpa.repository.Query("SELECT MIN(v.priceUsd), MAX(v.priceUsd) FROM VehicleEntity v WHERE v.status = 'PUBLISHED' AND v.priceUsd > 0")
    List<Object[]> findPriceMinMax();

    @org.springframework.data.jpa.repository.Query("SELECT MIN(v.year), MAX(v.year) FROM VehicleEntity v WHERE v.status = 'PUBLISHED'")
    List<Object[]> findYearMinMax();

    long countByTenantIdAndStatus(String tenantId, String status);
    long countByBranchId(String branchId);
    List<VehicleEntity> findByBranchId(String branchId);

    @org.springframework.data.jpa.repository.Query("SELECT COALESCE(SUM(v.views), 0) FROM VehicleEntity v WHERE v.tenantId = :tenantId")
    Long sumViewsByTenantId(@org.springframework.data.repository.query.Param("tenantId") String tenantId);

    List<VehicleEntity> findBySellerIdAndStatusInOrderByCreatedAtDesc(String sellerId, List<String> statuses);
}
