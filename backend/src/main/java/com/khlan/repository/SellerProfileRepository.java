package com.khlan.repository;

import com.khlan.entity.SellerProfileEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface SellerProfileRepository extends JpaRepository<SellerProfileEntity, String> {
    Optional<SellerProfileEntity> findByUserId(String userId);
    Optional<SellerProfileEntity> findByInviteCode(String inviteCode);
    boolean existsByUserId(String userId);
}
