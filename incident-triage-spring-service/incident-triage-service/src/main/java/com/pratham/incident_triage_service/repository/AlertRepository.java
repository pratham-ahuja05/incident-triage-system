package com.pratham.incident_triage_service.repository;

import com.pratham.incident_triage_service.entity.Alert;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface AlertRepository extends JpaRepository<Alert, Long> {

    Page<Alert> findByDeletedFalse(Pageable pageable);

    Optional<Alert> findByIdAndDeletedFalse(Long id);

    Optional<Alert> findByIdAndDeletedTrue(Long id);

    @Query("""
        SELECT DISTINCT a FROM Alert a
        LEFT JOIN FETCH a.duplicates
        WHERE a.id = :id AND a.deleted = false
    """)
    Optional<Alert> findByIdWithDuplicates(@Param("id") Long id);

    @Query("""
        SELECT a FROM Alert a
        WHERE a.deleted = false
        AND (:status IS NULL OR a.status = :status)
        AND (LOWER(a.source) LIKE LOWER(CONCAT('%', :query, '%'))
        OR LOWER(a.message) LIKE LOWER(CONCAT('%', :query, '%')))
    """)
    Page<Alert> searchActiveAlerts(@Param("query") String query, @Param("status") String status, Pageable pageable);
}