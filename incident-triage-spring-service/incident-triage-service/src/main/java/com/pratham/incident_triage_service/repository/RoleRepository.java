package com.pratham.incident_triage_service.repository;

import com.pratham.incident_triage_service.model.Role;
import com.pratham.incident_triage_service.model.RoleType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.Optional;

@Repository
public interface RoleRepository extends JpaRepository<Role, Long> {
    Optional<Role> findByName(RoleType name);
}