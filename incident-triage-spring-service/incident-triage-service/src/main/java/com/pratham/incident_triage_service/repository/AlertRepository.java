package com.pratham.incident_triage_service.repository;

import com.pratham.incident_triage_service.entity.Alert;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface AlertRepository extends JpaRepository<Alert, Long> {
}