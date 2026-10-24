package com.khlan.repository;

import com.khlan.entity.AuditLogEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface AuditLogRepository extends JpaRepository<AuditLogEntity, String> {

    List<AuditLogEntity> findByActorIdOrderByCreatedAtDesc(String actorId);

    List<AuditLogEntity> findByEntityAndEntityIdOrderByCreatedAtDesc(String entity, String entityId);
}
