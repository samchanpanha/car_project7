package com.khlan.repository;

import com.khlan.entity.ReportedContentEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ReportedContentRepository extends JpaRepository<ReportedContentEntity, String> {

    List<ReportedContentEntity> findByVehicleIdOrderByCreatedAtDesc(String vehicleId);

    List<ReportedContentEntity> findByStatusOrderByCreatedAtDesc(String status);
}
