package com.khlan.repository;

import com.khlan.entity.AbaTransactionEntity;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface AbaTransactionRepository extends JpaRepository<AbaTransactionEntity, String> {

    Optional<AbaTransactionEntity> findByTrxId(String trxId);

    Optional<AbaTransactionEntity> findByApv(String apv);

    List<AbaTransactionEntity> findByStatusOrderByTransactionDateDesc(String status);

    Page<AbaTransactionEntity> findAllByOrderByTransactionDateDesc(Pageable pageable);

    long countByStatus(String status);
}
