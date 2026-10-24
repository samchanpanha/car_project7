package com.khlan.repository;

import com.khlan.entity.TelegramInviteEventEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface TelegramInviteEventRepository extends JpaRepository<TelegramInviteEventEntity, String> {

    long countByProfileId(String profileId);

    List<TelegramInviteEventEntity> findByProfileIdOrderByCreatedAtDesc(String profileId);
}
