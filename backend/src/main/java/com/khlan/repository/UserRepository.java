package com.khlan.repository;

import com.khlan.entity.UserEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface UserRepository extends JpaRepository<UserEntity, String> {
    Optional<UserEntity> findByPhone(String phone);
    Optional<UserEntity> findByEmail(String email);
    Optional<UserEntity> findByTelegramId(String telegramId);
    boolean existsByPhone(String phone);
}
