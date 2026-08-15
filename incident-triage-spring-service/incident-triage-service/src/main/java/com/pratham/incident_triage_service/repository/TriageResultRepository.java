package com.pratham.incident_triage_service.repository;

import com.pratham.incident_triage_service.entity.TriageResult;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface TriageResultRepository extends JpaRepository<TriageResult, Long> {
}