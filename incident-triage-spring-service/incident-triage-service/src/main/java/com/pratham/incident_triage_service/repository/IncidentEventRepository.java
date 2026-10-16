package com.pratham.incident_triage_service.repository;

import com.pratham.incident_triage_service.entity.IncidentEvent;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface IncidentEventRepository extends JpaRepository<IncidentEvent, Long> {

    List<IncidentEvent> findByAlertIdOrderByCreatedAtAsc(Long alertId);

    // Newest events of incidents that are not deleted (filtering after a LIMIT would come back empty
    // when the newest events all belong to deleted incidents)
    @Query("SELECT e FROM IncidentEvent e WHERE e.alertId IN (SELECT a.id FROM Alert a WHERE a.deleted = false) ORDER BY e.createdAt DESC")
    List<IncidentEvent> findRecentForActiveAlerts(Pageable page);

    @Query("SELECT e.alertId, COUNT(e) FROM IncidentEvent e WHERE e.type = 'COMMENT' GROUP BY e.alertId")
    List<Object[]> countCommentsByAlert();
}
