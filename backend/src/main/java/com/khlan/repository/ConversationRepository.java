package com.khlan.repository;

import com.khlan.entity.ConversationEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ConversationRepository extends JpaRepository<ConversationEntity, String> {

    List<ConversationEntity> findByBuyerIdOrderByUpdatedAtDesc(String buyerId);

    long countByBuyerId(String buyerId);

    @org.springframework.data.jpa.repository.Query("SELECT c FROM ConversationEntity c JOIN VehicleEntity v ON c.vehicleId = v.id WHERE v.sellerId = :sellerId ORDER BY c.updatedAt DESC")
    List<ConversationEntity> findBySellerIdOrderByUpdatedAtDesc(@org.springframework.data.repository.query.Param("sellerId") String sellerId);

    @org.springframework.data.jpa.repository.Query("SELECT c FROM ConversationEntity c JOIN VehicleEntity v ON c.vehicleId = v.id WHERE v.tenantId = :tenantId ORDER BY c.updatedAt DESC")
    List<ConversationEntity> findByTenantIdOrderByUpdatedAtDesc(@org.springframework.data.repository.query.Param("tenantId") String tenantId);

    @org.springframework.data.jpa.repository.Query("SELECT COUNT(c) FROM ConversationEntity c JOIN VehicleEntity v ON c.vehicleId = v.id WHERE v.tenantId = :tenantId")
    long countByTenantId(@org.springframework.data.repository.query.Param("tenantId") String tenantId);
}
