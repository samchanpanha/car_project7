package com.khlan.repository;

import com.khlan.entity.TenantMemberEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface TenantMemberRepository extends JpaRepository<TenantMemberEntity, String> {
    Optional<TenantMemberEntity> findFirstByUserIdAndStatus(String userId, String status);
    Optional<TenantMemberEntity> findByUserId(String userId);
    List<TenantMemberEntity> findByTenantId(String tenantId);
    Optional<TenantMemberEntity> findByTenantIdAndUserId(String tenantId, String userId);
}
