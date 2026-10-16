package com.pratham.incident_triage_service.repository;

import com.pratham.incident_triage_service.entity.IncidentEvent;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface IncidentEventRepository extends JpaRepository<IncidentEvent, Long> {

    List<IncidentEvent> findByAlertIdOrderByCreatedAtAsc(Long alertId);

    @Query("SELECT e.alertId, COUNT(e) FROM IncidentEvent e WHERE e.type = 'COMMENT' GROUP BY e.alertId")
    List<Object[]> countCommentsByAlert();
}
