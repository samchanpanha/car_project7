package com.khlan.repository;

import com.khlan.entity.SavedSearchEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface SavedSearchRepository extends JpaRepository<SavedSearchEntity, String> {

    List<SavedSearchEntity> findByUserIdOrderByCreatedAtDesc(String userId);

    Optional<SavedSearchEntity> findByIdAndUserId(String id, String userId);

    long countByUserId(String userId);
}
