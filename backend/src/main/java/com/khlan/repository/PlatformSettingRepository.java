package com.khlan.repository;

import com.khlan.entity.PlatformSettingEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface PlatformSettingRepository extends JpaRepository<PlatformSettingEntity, String> {
}
