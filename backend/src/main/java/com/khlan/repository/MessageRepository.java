package com.khlan.repository;

import com.khlan.entity.MessageEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface MessageRepository extends JpaRepository<MessageEntity, String> {

    List<MessageEntity> findByConversationIdOrderByCreatedAtAsc(String conversationId);

    Optional<MessageEntity> findFirstByConversationIdOrderByCreatedAtDesc(String conversationId);

    long countByConversationId(String conversationId);
}
