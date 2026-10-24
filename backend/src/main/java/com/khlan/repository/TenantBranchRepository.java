package com.khlan.repository;

import com.khlan.entity.TenantBranchEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface TenantBranchRepository extends JpaRepository<TenantBranchEntity, String> {
    List<TenantBranchEntity> findByTenantId(String tenantId);
    List<TenantBranchEntity> findByTenantIdAndStatus(String tenantId, String status);
    List<TenantBranchEntity> findByTenantIdOrderByCreatedAtAsc(String tenantId);
}
