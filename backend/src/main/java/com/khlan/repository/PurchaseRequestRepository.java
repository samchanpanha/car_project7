package com.khlan.repository;

import com.khlan.entity.PurchaseRequestEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface PurchaseRequestRepository extends JpaRepository<PurchaseRequestEntity, String> {

    List<PurchaseRequestEntity> findByBuyerIdOrderByCreatedAtDesc(String buyerId);

    List<PurchaseRequestEntity> findByTenantIdOrderByCreatedAtDesc(String tenantId);

    List<PurchaseRequestEntity> findBySellerUserIdOrderByCreatedAtDesc(String sellerUserId);

    Optional<PurchaseRequestEntity> findByVehicleIdAndBuyerIdAndStatusIn(String vehicleId, String buyerId, List<String> statuses);

    long countByBuyerId(String buyerId);
}
